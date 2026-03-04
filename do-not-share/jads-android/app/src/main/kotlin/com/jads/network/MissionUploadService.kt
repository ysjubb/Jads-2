package com.jads.network

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.jads.storage.JadsDatabase
import com.jads.storage.TelemetryRecordEntity
import com.jads.storage.ViolationEntity
import com.jads.ui.viewmodel.MissionState
import com.jads.ui.viewmodel.UploadStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

// ─────────────────────────────────────────────────────────────────────────────
// MissionUploadService — uploads a completed mission from SQLCipher to backend.
//
// Protocol: POST /api/drone/missions
//   Body: application/json — matches backend droneRoutes.ts schema
//   Auth: Bearer token for the operator (currently operatorId passed as-is;
//         in production: JWT issued by login endpoint)
//
// Retry strategy:
//   - 3 attempts, exponential backoff (1s, 2s, 4s)
//   - 202 Accepted (duplicate) → UploadStatus.AlreadyUploaded
//   - 4xx (client error) → UploadStatus.Failed(retryable=false)
//   - 5xx / network error → UploadStatus.Failed(retryable=true)
//
// Record batch size:
//   Records are sent in a single JSON body. For missions with > 5000 records
//   (5+ hour flights), chunked upload will be needed. Documented as TODO.
//
// SECURITY NOTES:
//   • HTTPS is enforced by Android's network_security_config.
//   • JWT tokens would be added here when login endpoint is active.
//   • The backend independently re-verifies the hash chain on receipt.
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "MissionUploadService"

data class UploadConfig(
    val backendUrl:  String = "https://jads.internal/api",   // Override in BuildConfig for demo
    val maxAttempts: Int    = 3
    // authToken removed from config — passed dynamically at upload time.
    // This prevents stale tokens when sessions are refreshed between mission
    // completion and upload (e.g. long offline missions).
)

class MissionUploadService(
    private val db:     JadsDatabase,
    private val config: UploadConfig = UploadConfig()
) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)    // Long missions = large payloads
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json".toMediaType()

    // ── Public entry point ────────────────────────────────────────────────────

    suspend fun uploadMission(
        missionDbId: Long,
        authToken:   String = MissionState.jwtToken.value
    ): UploadStatus = withContext(Dispatchers.IO) {
        MissionState.setUploadStatus(UploadStatus.Uploading)

        val mission = db.missionDao().getById(missionDbId)
        if (mission == null) {
            val status = UploadStatus.Failed("Mission $missionDbId not found in local database", retryable = false)
            MissionState.setUploadStatus(status)
            return@withContext status
        }

        // Already uploaded — idempotency check
        if (mission.uploadedAt != null) {
            val status = UploadStatus.AlreadyUploaded
            MissionState.setUploadStatus(status)
            return@withContext status
        }

        val records    = db.telemetryRecordDao().getAllForMission(missionDbId)
        val violations = db.violationDao().getAllForMission(missionDbId)

        val body = buildRequestBody(mission, records, violations)
        val json = gson.toJson(body)

        var lastStatus: UploadStatus = UploadStatus.Failed("No attempts made", retryable = true)
        var delayMs = 1000L

        for (attempt in 1..config.maxAttempts) {
            Log.d(TAG, "Upload attempt $attempt/${config.maxAttempts} for mission $missionDbId")

            lastStatus = try {
                executeUpload(json, missionDbId, authToken)
            } catch (e: IOException) {
                Log.w(TAG, "Network error on attempt $attempt", e)
                UploadStatus.Failed("Network error: ${e.message}", retryable = true)
            }

            when (lastStatus) {
                is UploadStatus.Success,
                is UploadStatus.AlreadyUploaded,
                is UploadStatus.Failed -> {
                    if (lastStatus is UploadStatus.Failed && !lastStatus.retryable) break
                    if (lastStatus is UploadStatus.Success || lastStatus is UploadStatus.AlreadyUploaded) break
                }
                else -> { /* continue */ }
            }

            if (attempt < config.maxAttempts) {
                kotlinx.coroutines.delay(delayMs)
                delayMs *= 2
            }
        }

        MissionState.setUploadStatus(lastStatus)
        lastStatus
    }

    // ── HTTP execution ────────────────────────────────────────────────────────

    private fun executeUpload(jsonBody: String, missionDbId: Long, authToken: String): UploadStatus {
        val request = Request.Builder()
            .url("${config.backendUrl}/drone/missions")
            .post(jsonBody.toRequestBody(JSON))
            .addHeader("Authorization", "Bearer $authToken")
            .addHeader("X-JADS-Client", "android-v5.0")
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: ""

        return when (response.code) {
            201, 200 -> {
                // Parse server-assigned mission ID from response
                val serverId = try {
                    val obj = gson.fromJson(responseBody, JsonObject::class.java)
                    obj.getAsJsonObject("data")?.get("id")?.asString
                        ?: obj.get("id")?.asString
                        ?: "unknown"
                } catch (e: Exception) { "unknown" }

                // Mark as uploaded in local DB
                db.missionDao().markUploaded(missionDbId, System.currentTimeMillis())

                Log.i(TAG, "Mission $missionDbId uploaded successfully. Server ID: $serverId")
                UploadStatus.Success(serverId)
            }

            202 -> {
                // Backend returned "DUPLICATE" — already exists on server
                db.missionDao().markUploaded(missionDbId, System.currentTimeMillis())
                Log.i(TAG, "Mission $missionDbId already on server (202 DUPLICATE)")
                UploadStatus.AlreadyUploaded
            }

            400, 401, 403, 422 -> {
                Log.e(TAG, "Client error ${response.code}: $responseBody")
                UploadStatus.Failed(
                    "Server rejected upload (${response.code}): ${extractError(responseBody)}",
                    retryable = false
                )
            }

            429 -> {
                Log.w(TAG, "Rate limited — will retry")
                UploadStatus.Failed("Rate limited by server", retryable = true)
            }

            else -> {
                Log.w(TAG, "Server error ${response.code}: $responseBody")
                UploadStatus.Failed(
                    "Server error (${response.code}) — will retry",
                    retryable = true
                )
            }
        }
    }

    // ── Payload construction ──────────────────────────────────────────────────
    // Matches the schema expected by backend droneRoutes.ts / MissionService.ts

    private fun buildRequestBody(
        mission:    com.jads.storage.MissionEntity,
        records:    List<TelemetryRecordEntity>,
        violations: List<ViolationEntity>
    ): Map<String, Any?> {

        val operatorId   = MissionState.operatorId.value.ifBlank { "UNKNOWN" }
        val operatorType = MissionState.operatorRole.value

        return mapOf(
            "missionId"              to mission.missionId.toString(),
            "operatorId"             to operatorId,
            "operatorType"           to operatorType,
            "deviceId"               to android.os.Build.ID,
            "deviceModel"            to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
            "npntClassification"     to mission.npntClassification,
            "permissionArtefactId"   to mission.npntPermissionToken,
            "missionStartUtcMs"      to mission.missionStartUtcMs.toString(),
            "missionEndUtcMs"        to mission.missionEndUtcMs?.toString(),
            "ntpSyncStatus"          to "SYNCED",
            "ntpOffsetMs"            to MissionState.ntpOffsetMs.value.toInt(),
            "certValidAtStart"       to false,
            "strongboxBacked"        to mission.strongboxBacked,
            "secureBootVerified"     to mission.secureBootVerified,
            "androidVersionAtUpload" to mission.androidVersion?.toString(),
            "rootHashHex"            to mission.rootHashHex,
            "archivedCrlBase64"      to mission.archivedCrlBase64,
            "records"                to records.map { r ->
                mapOf(
                    "sequence"          to r.sequence,
                    "timestampUtcMs"    to r.timestampUtcMs,
                    "canonicalHex"      to r.canonicalHex,
                    "chainHashHex"      to r.recordHashHex,
                    "prevHashHex"       to r.prevHashHex,
                    "signatureHex"      to r.signatureHex,
                    "gnssStatus"        to "GOOD",
                    "sensorHealthFlags" to 1  // FLAG_GPS_OK
                )
            },
            "violations" to violations.map { v ->
                mapOf(
                    "sequence"       to v.sequence,
                    "violationType"  to v.violationType,
                    "severity"       to v.severity,
                    "timestampUtcMs" to v.timestampUtcMs,
                    "detailJson"     to v.detailJson
                )
            }
        )
    }

    private fun extractError(body: String): String {
        return try {
            val obj = gson.fromJson(body, JsonObject::class.java)
            obj.get("error")?.asString ?: obj.get("message")?.asString ?: body.take(100)
        } catch (e: Exception) {
            body.take(100)
        }
    }
}

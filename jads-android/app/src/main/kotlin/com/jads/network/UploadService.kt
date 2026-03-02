package com.jads.network

import com.google.gson.Gson
import com.jads.storage.JadsDatabase
import com.jads.storage.MissionEntity
import com.jads.storage.TelemetryRecordEntity
import com.jads.storage.ViolationEntity

// UploadService — assembles and dispatches the mission upload payload.
//
// Called by MissionUploadWorker (WorkManager) after mission finalization.
// Also called directly by MissionCompleteScreen "Retry Upload" button.
//
// Payload structure mirrors the backend schema exactly (Step 5 endpoint).
// Field names are SNAKE_CASE in JSON to match Prisma column names.

class UploadService(
    private val api: JadsApiClient,
    private val db:  JadsDatabase
) {

    private val gson = Gson()

    // Returns true if upload was accepted or already uploaded (idempotent).
    fun uploadMission(missionDbId: Long): UploadResult {
        val mission  = db.missionDao().getById(missionDbId)
            ?: return UploadResult.Failure("Mission $missionDbId not found in local DB")

        if (mission.uploadedAt != null) return UploadResult.AlreadyUploaded

        val records    = db.telemetryRecordDao().getAllForMission(missionDbId)
        val violations = db.violationDao().getAllForMission(missionDbId)
        val payload    = buildPayload(mission, records, violations)
        val payloadJson = gson.toJson(payload)

        return when (val result = api.uploadMission(payloadJson)) {
            is ApiResult.Success -> {
                db.missionDao().markUploaded(missionDbId, System.currentTimeMillis())
                UploadResult.Accepted(result.data.missionDbId)
            }
            is ApiResult.Error -> when (result.code) {
                202 -> {
                    // 202 DUPLICATE — server already has this mission. Mark uploaded locally.
                    db.missionDao().markUploaded(missionDbId, System.currentTimeMillis())
                    UploadResult.AlreadyUploaded
                }
                401 -> UploadResult.AuthExpired
                else -> UploadResult.Failure("HTTP ${result.code}: ${result.message}")
            }
            is ApiResult.NetworkError -> UploadResult.NetworkFailure(result.message)
        }
    }

    private fun buildPayload(
        mission:    MissionEntity,
        records:    List<TelemetryRecordEntity>,
        violations: List<ViolationEntity>
    ): Map<String, Any?> = mapOf(
        "missionId"              to mission.missionId.toString(),
        "operatorId"             to mission.idempotencyKey,  // operatorId stored at mission start
        "deviceId"               to "ANDROID_DEVICE",        // TODO: use Android ID in prod
        "deviceModel"            to android.os.Build.MODEL,
        "npntClassification"     to mission.npntClassification,
        "permissionArtefactId"   to mission.npntPermissionToken,
        "missionStartUtcMs"      to mission.missionStartUtcMs.toString(),
        "missionEndUtcMs"        to mission.missionEndUtcMs?.toString(),
        "ntpSyncStatus"          to "SYNCED",
        "certValidAtStart"       to false,
        "strongboxBacked"        to mission.strongboxBacked,
        "secureBootVerified"     to mission.secureBootVerified,
        "androidVersionAtUpload" to mission.androidVersion?.toString(),
        "archivedCrlBase64"      to mission.archivedCrlBase64,
        "records"                to records.map { r -> mapOf(
            "sequence"           to r.sequence,
            "timestampUtcMs"     to r.timestampUtcMs.toString(),
            "canonicalPayloadHex" to r.canonicalHex,
            "signatureHex"       to r.signatureHex,
            "chainHashHex"       to r.recordHashHex,
            "prevHashHex"        to r.prevHashHex
        )},
        "violations"             to violations.map { v -> mapOf(
            "violationType"      to v.violationType,
            "severity"           to v.severity,
            "timestampUtcMs"     to v.timestampUtcMs.toString(),
            "latitudeMicrodeg"   to v.latitudeMicrodeg,
            "longitudeMicrodeg"  to v.longitudeMicrodeg,
            "altitudeCm"         to v.altitudeCm,
            "detailJson"         to v.detailJson
        )}
    )
}

sealed class UploadResult {
    data class Accepted(val serverMissionId: String?) : UploadResult()
    object AlreadyUploaded                            : UploadResult()
    object AuthExpired                                : UploadResult()
    data class Failure(val reason: String)            : UploadResult()
    data class NetworkFailure(val reason: String)     : UploadResult()
}

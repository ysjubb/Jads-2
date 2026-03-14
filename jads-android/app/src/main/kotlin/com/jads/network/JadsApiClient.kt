package com.jads.network

import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

// JadsApiClient — OkHttp wrapper for all backend API calls.
//
// Timeout policy:
//   Connect: 10s — backend should be reachable within this window
//   Read:    60s — mission upload (large payload) may take up to 60s on slow networks
//   Write:   60s — same reason
//
// All calls are synchronous (run on IO dispatcher by callers).
// Returns sealed Result — callers handle error states, never catch exceptions here.

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val code: Int, val message: String, val body: String = "") : ApiResult<Nothing>()
    data class NetworkError(val message: String) : ApiResult<Nothing>()
}

data class LoginResponse(
    val token:        String,
    val operatorId:   String,
    val operatorType: String,      // "CIVILIAN" or "SPECIAL"
    val expiresIn:    Long = 3600
)

class JadsApiClient(
    private var baseUrl: String,
    private var jwtToken: String? = null
) {

    private val gson   = Gson()
    private val JSON   = "application/json; charset=utf-8".toMediaType()

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60,    TimeUnit.SECONDS)
        .writeTimeout(60,   TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("X-JADS-Version", "4.0")
                    .build()
            )
        }
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC  // HEADERS in debug builds
        })
        .build()

    fun updateAuth(token: String) { jwtToken = token }
    fun updateBaseUrl(url: String) { baseUrl = url.trimEnd('/') }

    // ── Auth ────────────────────────────────────────────────────────────────

    fun loginCivilian(username: String, password: String): ApiResult<LoginResponse> {
        val body = """{"username":"$username","password":"$password"}"""
        return post("/api/auth/civilian/login", body, authenticated = false) { json ->
            LoginResponse(
                token        = json.get("accessToken")?.asString ?: return@post null,
                operatorId   = json.get("operatorId")?.asString ?: return@post null,
                operatorType = "CIVILIAN"
            )
        }
    }

    fun loginSpecial(username: String, password: String): ApiResult<LoginResponse> {
        val body = """{"username":"$username","password":"$password"}"""
        return post("/api/auth/special/login", body, authenticated = false) { json ->
            LoginResponse(
                token        = json.get("accessToken")?.asString ?: return@post null,
                operatorId   = json.get("operatorId")?.asString ?: return@post null,
                operatorType = "SPECIAL"
            )
        }
    }

    // DS-14: Drone operator login via UIN — single-step, no OTP
    fun loginWithUIN(uinNumber: String): ApiResult<LoginResponse> {
        val body = """{"uinNumber":"$uinNumber"}"""
        return post("/api/auth/drone/login", body, authenticated = false) { json ->
            LoginResponse(
                token        = json.get("accessToken")?.asString ?: return@post null,
                operatorId   = json.get("operatorId")?.asString ?: "",
                operatorType = "DRONE"
            )
        }
    }

    // ── Mission upload ───────────────────────────────────────────────────────

    fun uploadMission(payloadJson: String): ApiResult<UploadAck> {
        return post("/api/drone/missions", payloadJson, authenticated = true) { json ->
            UploadAck(
                status      = json.get("status")?.asString ?: "UNKNOWN",
                missionDbId = json.get("missionId")?.asString,
                message     = json.get("message")?.asString
            )
        }
    }

    // ── Airspace zone check ─────────────────────────────────────────────────

    fun checkAirspaceZone(
        polygon: List<ZoneCheckLatLng>,
        altitudeM: Int
    ): ApiResult<ZoneClassificationResult> {
        val body = gson.toJson(mapOf("polygon" to polygon, "altitudeM" to altitudeM))
        return post("/api/drone/zone-check", body, authenticated = true) { json ->
            val reasons = json.getAsJsonArray("reasons")?.map { it.asString } ?: emptyList()
            ZoneClassificationResult(
                zone         = json.get("zone")?.asString ?: "GREEN",
                reasons      = reasons,
                atcAuthority = json.get("atcAuthority")?.asString
            )
        }
    }

    // ── Flight plan validation ───────────────────────────────────────────────

    fun validateFlightPlan(payloadJson: String): ApiResult<ValidationResult> {
        return post("/api/drone/validate-flight-plan", payloadJson, authenticated = true) { json ->
            val checksArray = json.getAsJsonArray("checks") ?: return@post null
            val checks = checksArray.map { elem ->
                val obj = elem.asJsonObject
                ValidationCheck(
                    code        = obj.get("code")?.asString ?: "",
                    severity    = obj.get("severity")?.asString ?: "INFO",
                    name        = obj.get("name")?.asString ?: "",
                    description = obj.get("description")?.asString ?: "",
                    passed      = obj.get("passed")?.asBoolean ?: false,
                    field       = obj.get("field")?.asString,
                    remediation = obj.get("remediation")?.asString
                )
            }
            ValidationResult(
                ready  = json.get("ready")?.asBoolean ?: false,
                checks = checks
            )
        }
    }

    // ── Notifications ─────────────────────────────────────────────────────

    fun getNotifications(
        category:  String? = null,
        unreadOnly: Boolean = false,
        limit:     Int     = 20
    ): ApiResult<NotificationsResponse> {
        return get("/api/drone/notifications", mapOf(
            "limit"    to limit.toString(),
            "unread"   to if (unreadOnly) "true" else "false",
            "category" to (category ?: "")
        )) { json ->
            val notifs = json.getAsJsonArray("notifications")?.map { elem ->
                val obj = elem.asJsonObject
                val type = obj.get("type")?.asString ?: ""
                val createdAt = obj.get("createdAt")?.asString ?: ""
                NotificationDto(
                    id        = obj.get("id")?.asString ?: "",
                    type      = type,
                    title     = obj.get("title")?.asString ?: "",
                    body      = obj.get("body")?.asString ?: "",
                    read      = obj.get("read")?.asBoolean ?: false,
                    createdAt = createdAt
                )
            } ?: emptyList()
            NotificationsResponse(
                notifications = notifs,
                total         = json.get("total")?.asInt ?: 0,
                unreadCount   = json.get("unreadCount")?.asInt ?: 0
            )
        }
    }

    fun markNotificationRead(notificationId: String): ApiResult<Unit> {
        return post("/api/drone/notifications/$notificationId/read", "{}", authenticated = true) {
            Unit
        }
    }

    fun markAllNotificationsRead(): ApiResult<Unit> {
        return post("/api/drone/notifications/read-all", "{}", authenticated = true) {
            Unit
        }
    }

    // ── Pre-flight compliance check (DS-15) ────────────────────────────────

    fun preFlightCheck(
        uinNumber: String,
        paId: String? = null,
        polygon: List<ZoneCheckLatLng>? = null,
        altitudeM: Int? = null,
        flightTime: String? = null
    ): ApiResult<PreFlightReport> {
        val params = mutableMapOf<String, Any>("uinNumber" to uinNumber)
        if (paId != null) params["paId"] = paId
        if (polygon != null) params["polygon"] = polygon
        if (altitudeM != null) params["altitudeM"] = altitudeM
        if (flightTime != null) params["flightTime"] = flightTime
        val body = gson.toJson(params)
        return post("/api/drone/pre-flight-check", body, authenticated = true) { json ->
            val verdict = json.get("verdict")?.asString ?: return@post null
            val checksArray = json.getAsJsonArray("checks") ?: return@post null
            val checks = checksArray.map { elem ->
                val obj = elem.asJsonObject
                ComplianceCheck(
                    code        = obj.get("code")?.asString ?: "",
                    name        = obj.get("name")?.asString ?: "",
                    status      = obj.get("status")?.asString ?: "",
                    detail      = obj.get("detail")?.asString ?: "",
                    remediation = obj.get("remediation")?.asString
                )
            }
            PreFlightReport(
                verdict   = verdict,
                checks    = checks,
                uinNumber = json.get("uinNumber")?.asString ?: uinNumber,
                paId      = json.get("paId")?.asString,
                checkedAt = json.get("checkedAt")?.asString ?: ""
            )
        }
    }

    // ── Attestation nonce ──────────────────────────────────────────────────

    /**
     * Fetch a one-use attestation nonce from the server.
     * Must be called BEFORE generating a StrongBox/TEE key pair.
     * The nonce is used as the attestation challenge to prevent replay attacks.
     */
    fun fetchAttestationNonce(deviceId: String): ApiResult<String> {
        return get("/api/drone/devices/$deviceId/attestation-nonce") { json ->
            json.get("nonce")?.asString
        }
    }

    // ── Generic helpers ─────────────────────────────────────────────────────

    private fun <T : Any> get(
        path:          String,
        params:        Map<String, String> = emptyMap(),
        parse:         (JsonObject) -> T?
    ): ApiResult<T> {
        return try {
            val urlBuilder = StringBuilder("$baseUrl$path")
            if (params.isNotEmpty()) {
                urlBuilder.append("?")
                urlBuilder.append(params.filter { it.value.isNotBlank() }
                    .entries.joinToString("&") { "${it.key}=${it.value}" })
            }
            val reqBuilder = Request.Builder().url(urlBuilder.toString()).get()
            if (jwtToken != null) {
                reqBuilder.header("Authorization", "Bearer $jwtToken")
            }
            val response = http.newCall(reqBuilder.build()).execute()
            val rawBody  = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                return ApiResult.Error(response.code, response.message, rawBody)
            }
            val json   = gson.fromJson(rawBody, JsonObject::class.java)
            val parsed = parse(json)
            if (parsed == null) ApiResult.Error(-1, "Parse failed", rawBody)
            else ApiResult.Success(parsed)
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "Unknown network error")
        }
    }

    private fun <T : Any> post(
        path:          String,
        bodyJson:      String,
        authenticated: Boolean,
        parse:         (JsonObject) -> T?
    ): ApiResult<T> {
        return try {
            val reqBuilder = Request.Builder()
                .url("$baseUrl$path")
                .post(bodyJson.toRequestBody(JSON))
            if (authenticated && jwtToken != null) {
                reqBuilder.header("Authorization", "Bearer $jwtToken")
            }
            val response = http.newCall(reqBuilder.build()).execute()
            val rawBody  = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                return ApiResult.Error(response.code, response.message, rawBody)
            }
            val json   = gson.fromJson(rawBody, JsonObject::class.java)
            val parsed = parse(json)
            if (parsed == null) ApiResult.Error(-1, "Parse failed", rawBody)
            else ApiResult.Success(parsed)
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "Unknown network error")
        }
    }
}

data class UploadAck(
    val status:      String,       // ACCEPTED | DUPLICATE | CHAIN_INVALID
    val missionDbId: String?,
    val message:     String?
)

data class ZoneCheckLatLng(
    val latitude:  Double,
    val longitude: Double
)

data class ZoneClassificationResult(
    val zone:         String,    // "GREEN" | "YELLOW" | "RED"
    val reasons:      List<String>,
    val atcAuthority: String?
)

data class ValidationCheck(
    val code:        String,     // e.g. "NPNT_PA_VALID", "PILOT_LICENCE_EXPIRY"
    val severity:    String,     // "REQUIRED" | "ADVISORY" | "INFO"
    val name:        String,     // human-readable check name
    val description: String,     // what the check verifies
    val passed:      Boolean,    // true = passed, false = failed
    val field:       String?,    // optional field reference
    val remediation: String?     // hint for fixing failures
)

data class ValidationResult(
    val ready:  Boolean,         // true = all REQUIRED checks passed
    val checks: List<ValidationCheck>
)

data class NotificationDto(
    val id:        String,
    val type:      String,
    val title:     String,
    val body:      String,
    val read:      Boolean,
    val createdAt: String
)

data class NotificationsResponse(
    val notifications: List<NotificationDto>,
    val total:         Int,
    val unreadCount:   Int
)

// DS-15: Pre-flight compliance check types
data class ComplianceCheck(
    val code:        String,     // e.g. "UIN_VERIFIED", "UAOP_VALID", "PA_SIGNATURE"
    val name:        String,     // human-readable check name
    val status:      String,     // "PASS" | "FAIL" | "WARN" | "SKIP"
    val detail:      String,     // what the check found
    val remediation: String?     // hint for fixing failures
)

data class PreFlightReport(
    val verdict:   String,       // "GO" | "NO_GO" | "ADVISORY"
    val checks:    List<ComplianceCheck>,
    val uinNumber: String,
    val paId:      String?,
    val checkedAt: String
)

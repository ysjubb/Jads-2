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
                token        = json.get("token")?.asString ?: return@post null,
                operatorId   = json.get("operatorId")?.asString ?: return@post null,
                operatorType = "CIVILIAN"
            )
        }
    }

    fun loginSpecial(username: String, password: String): ApiResult<LoginResponse> {
        val body = """{"username":"$username","password":"$password"}"""
        return post("/api/auth/special/login", body, authenticated = false) { json ->
            LoginResponse(
                token        = json.get("token")?.asString ?: return@post null,
                operatorId   = json.get("operatorId")?.asString ?: return@post null,
                operatorType = "SPECIAL"
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
        return post("/api/drone-plans/zone-check", body, authenticated = true) { json ->
            val reasons = json.getAsJsonArray("reasons")?.map { it.asString } ?: emptyList()
            ZoneClassificationResult(
                zone         = json.get("zone")?.asString ?: "GREEN",
                reasons      = reasons,
                atcAuthority = json.get("atcAuthority")?.asString
            )
        }
    }

    // ── Generic helpers ─────────────────────────────────────────────────────

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

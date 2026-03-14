package com.jads.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

// ─────────────────────────────────────────────────────────────────────────────
// EgcaRepository — clean-architecture repository for eGCA API interactions.
//
// Responsibilities:
//   1. Expose suspend functions returning Result<T> for all eGCA operations
//   2. Cache JWT in EncryptedSharedPreferences (dedicated eGCA token store)
//   3. Auto re-authenticate on 401 (token expiry) — one retry per call
//   4. Map HTTP / network errors into typed Result.failure
//   5. Log errors for diagnostics WITHOUT exposing raw JWT values
//
// Thread safety:
//   - All network calls dispatch on Dispatchers.IO
//   - Token refresh is serialised via Mutex to prevent concurrent re-auth storms
//
// SECURITY:
//   - JWT is stored in a dedicated EncryptedSharedPreferences file
//     (AES-256-GCM value encryption, AES-256-SIV key encryption)
//   - Raw token values are NEVER logged — only redacted indicators
//   - Token expiry timestamp is stored to enable proactive refresh
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "EgcaRepository"

/** Refresh the token 5 minutes before it expires. */
private const val TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1_000L

class EgcaRepository(
    private val api:        EgcaApi,
    private val tokenStore: EgcaTokenStore
) {

    private val authMutex = Mutex()

    // ── Cached credentials (set externally or via authenticate()) ──────────
    // In-memory only — persisted copy lives in EncryptedSharedPreferences.
    @Volatile private var cachedToken: String? = null
    @Volatile private var expiresAtMs: Long    = 0L

    // Credentials for auto-refresh on 401. Set once via setCredentials().
    @Volatile private var email:    String? = null
    @Volatile private var password: String? = null

    /**
     * Store eGCA login credentials in memory (not persisted).
     * Called by the login flow before the first authenticate() call.
     * Enables automatic token re-acquisition on 401.
     */
    fun setCredentials(email: String, password: String) {
        this.email    = email
        this.password = password
    }

    // ── Authentication ──────────────────────────────────────────────────────

    /**
     * Authenticate with the eGCA identity provider.
     * On success, the JWT is cached in EncryptedSharedPreferences and in memory.
     */
    suspend fun authenticate(
        email: String,
        password: String
    ): Result<EgcaAuthResponse> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Authenticating with eGCA (email=***)")

        val result = safeApiCall { api.authenticate(EgcaAuthRequest(email, password)) }
        result.onSuccess { auth ->
            val token = auth.resolvedToken
            if (token != null) {
                storeToken(token, auth.resolvedExpiresInSeconds)
                Log.i(TAG, "eGCA authentication successful, token expires in ${auth.resolvedExpiresInSeconds}s")
            } else {
                Log.w(TAG, "eGCA auth response contained no token")
                return@withContext Result.failure(EgcaException("Auth response missing token", 0))
            }
        }
        result.onFailure { e ->
            Log.e(TAG, "eGCA authentication failed: ${e.message}")
        }
        result
    }

    // ── Flight Permission Submission ────────────────────────────────────────

    /**
     * Submit a fly-drone permission application.
     * Auto-retries with fresh token on 401.
     */
    suspend fun submitPermissionApplication(
        request: EgcaPermissionRequest
    ): Result<EgcaPermissionResponse> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Submitting flight permission for UIN=${request.uinNumber}")
        authedCall { api.submitPermissionApplication(request) }
    }

    // ── Permission Status ──────────────────────────────────────────────────

    /**
     * Poll the status of a submitted permission application.
     */
    suspend fun getPermissionStatus(
        applicationId: String
    ): Result<EgcaPermissionStatusResponse> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Polling permission status for applicationId=$applicationId")
        authedCall { api.getPermissionStatus(applicationId) }
    }

    // ── Permission Artefact Download ───────────────────────────────────────

    /**
     * Download the Permission Artefact ZIP for an approved application.
     * Returns raw bytes. Caller should cache via [EgcaDataSource.cachePA].
     */
    suspend fun downloadPermissionArtefact(
        applicationId: String
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Downloading PA for applicationId=$applicationId")
        val result = authedCall { api.downloadPermissionArtefact(applicationId) }
        result.map { responseBody ->
            val bytes = responseBody.bytes()
            Log.i(TAG, "PA downloaded: applicationId=$applicationId, size=${bytes.size} bytes")
            bytes
        }
    }

    // ── Flight Log Upload ──────────────────────────────────────────────────

    /**
     * Upload post-flight log bundle to eGCA.
     * [logBundle] is raw binary (flight log ZIP / signed payload).
     */
    suspend fun uploadFlightLog(
        applicationId: String,
        logBundle: ByteArray
    ): Result<Unit> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Uploading flight log for applicationId=$applicationId, size=${logBundle.size} bytes")
        val body = logBundle.toRequestBody("application/octet-stream".toMediaType())
        authedCall { api.uploadFlightLog(applicationId, body) }
    }

    // ── Token Management (private) ─────────────────────────────────────────

    /**
     * Store the eGCA JWT in memory and in the dedicated EncryptedSharedPreferences.
     * Never logs the raw token value.
     */
    private fun storeToken(token: String, expiresInSeconds: Long) {
        val expiresAt = System.currentTimeMillis() + (expiresInSeconds * 1_000L)
        cachedToken  = token
        expiresAtMs  = expiresAt
        tokenStore.saveToken(token, expiresAt)
    }

    /**
     * Load cached eGCA token from EncryptedSharedPreferences (cold start).
     * Only reads from disk once — subsequent calls use in-memory cache.
     */
    private fun loadCachedToken() {
        if (cachedToken != null) return
        val stored = tokenStore.loadToken()
        if (stored != null) {
            cachedToken = stored.first
            expiresAtMs = stored.second
        }
    }

    /** True if the cached token exists and has not expired (with margin). */
    private fun isTokenValid(): Boolean {
        loadCachedToken()
        val token = cachedToken ?: return false
        if (token.isBlank()) return false
        return System.currentTimeMillis() < (expiresAtMs - TOKEN_REFRESH_MARGIN_MS)
    }

    /**
     * Ensure we have a valid token. If expired or missing, re-authenticate.
     * Serialised via Mutex to prevent concurrent refresh storms.
     */
    private suspend fun ensureToken(): String? {
        if (isTokenValid()) return cachedToken

        return authMutex.withLock {
            // Double-check after acquiring lock (another coroutine may have refreshed).
            if (isTokenValid()) return@withLock cachedToken

            val e = email
            val p = password
            if (e == null || p == null) {
                Log.w(TAG, "Cannot refresh eGCA token — credentials not set")
                return@withLock null
            }

            Log.i(TAG, "Refreshing eGCA token (expired or missing)")
            val result = safeApiCall { api.authenticate(EgcaAuthRequest(e, p)) }
            result.getOrNull()?.let { auth ->
                val token = auth.resolvedToken
                if (token != null) {
                    storeToken(token, auth.resolvedExpiresInSeconds)
                    Log.i(TAG, "eGCA token refreshed successfully")
                    return@withLock token
                }
            }

            Log.e(TAG, "eGCA token refresh failed")
            null
        }
    }

    /**
     * Clear the cached eGCA token (e.g. on logout).
     */
    fun clearToken() {
        cachedToken = null
        expiresAtMs = 0L
        tokenStore.clear()
    }

    // ── Authenticated call wrapper ─────────────────────────────────────────

    /**
     * Execute an authenticated eGCA API call.
     * If the response is 401, refresh the token and retry exactly once.
     */
    private suspend fun <T> authedCall(
        call: suspend () -> Response<T>
    ): Result<T> {
        // Ensure we have a valid token before the first attempt.
        val token = ensureToken()
        if (token == null) {
            return Result.failure(EgcaException("No eGCA auth token available", 401))
        }

        // First attempt.
        val firstResult = safeApiCall(call)
        val firstError  = firstResult.exceptionOrNull()

        // If not a 401, return immediately.
        if (firstError == null || (firstError as? EgcaException)?.httpStatus != 401) {
            return firstResult
        }

        // 401 — invalidate token and retry with fresh credentials.
        Log.w(TAG, "eGCA returned 401 — attempting token refresh and retry")
        cachedToken = null
        expiresAtMs = 0L

        val newToken = ensureToken()
        if (newToken == null) {
            return Result.failure(EgcaException("Token refresh failed after 401", 401))
        }

        // Second (and final) attempt.
        return safeApiCall(call)
    }

    // ── Safe API call wrapper ──────────────────────────────────────────────

    /**
     * Execute a Retrofit call and map outcomes to Result<T>.
     *
     * Success (2xx): Result.success(body)
     * HTTP error:    Result.failure(EgcaException)
     * Network error: Result.failure(EgcaException)
     */
    private suspend fun <T> safeApiCall(
        call: suspend () -> Response<T>
    ): Result<T> {
        return try {
            val response = call()

            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    Result.success(body)
                } else {
                    // 204 No Content or similar — treat as success for Unit responses.
                    @Suppress("UNCHECKED_CAST")
                    Result.success(Unit as T)
                }
            } else {
                val errorBody = response.errorBody()?.string()?.take(500) ?: ""
                val message   = parseErrorMessage(errorBody, response.code())
                Log.e(TAG, "eGCA HTTP ${response.code()}: $message")
                Result.failure(EgcaException(message, response.code()))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "eGCA request timed out", e)
            Result.failure(EgcaException("Request timed out", 0, e))
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "eGCA host not reachable", e)
            Result.failure(EgcaException("Network unavailable — cannot reach eGCA", 0, e))
        } catch (e: java.io.IOException) {
            Log.e(TAG, "eGCA network error", e)
            Result.failure(EgcaException("Network error: ${e.message}", 0, e))
        } catch (e: Exception) {
            Log.e(TAG, "eGCA unexpected error", e)
            Result.failure(EgcaException("Unexpected error: ${e.message}", 0, e))
        }
    }

    /**
     * Try to extract a human-readable error message from the response body.
     */
    private fun parseErrorMessage(body: String, code: Int): String {
        if (body.isBlank()) return "HTTP $code"
        return try {
            val json = com.google.gson.JsonParser.parseString(body).asJsonObject
            json.get("message")?.asString
                ?: json.get("error")?.asString
                ?: "HTTP $code"
        } catch (_: Exception) {
            "HTTP $code: ${body.take(100)}"
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EgcaTokenStore — dedicated EncryptedSharedPreferences for eGCA JWT storage.
//
// Separate from AppPreferences (which stores the JADS backend JWT) to avoid
// modifying existing storage/ classes. Uses AES-256-GCM value encryption
// with AES-256-SIV key encryption, backed by Android Keystore.
//
// SECURITY:
//   - File: "jads_egca_secure_prefs" (encrypted on disk)
//   - MasterKey in Android Keystore (hardware-backed on supported devices)
//   - Raw token values are never exposed in logs
// ─────────────────────────────────────────────────────────────────────────────

class EgcaTokenStore(context: Context) {

    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        prefs = EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * Persist the eGCA JWT token and its expiry timestamp.
     */
    fun saveToken(token: String, expiresAtMs: Long) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putLong(KEY_EXPIRES_AT, expiresAtMs)
            .apply()
    }

    /**
     * Load the persisted eGCA JWT token and expiry.
     * Returns null if no token is stored.
     */
    fun loadToken(): Pair<String, Long>? {
        val token     = prefs.getString(KEY_TOKEN, null) ?: return null
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        return Pair(token, expiresAt)
    }

    /**
     * Clear all eGCA auth data.
     */
    fun clear() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_EXPIRES_AT)
            .apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "jads_egca_secure_prefs"
        private const val KEY_TOKEN       = "egca_jwt_token"
        private const val KEY_EXPIRES_AT  = "egca_jwt_expires_at"
    }
}

// ── Exception type ──────────────────────────────────────────────────────────

/**
 * Typed exception for eGCA API errors.
 * [httpStatus] is 0 for network/timeout errors (no HTTP response received).
 */
class EgcaException(
    message: String,
    val httpStatus: Int,
    cause: Throwable? = null
) : Exception(message, cause) {

    /** True if the error is transient and the operation can be retried. */
    val isRetryable: Boolean
        get() = httpStatus == 0 || httpStatus == 429 || httpStatus >= 500
}

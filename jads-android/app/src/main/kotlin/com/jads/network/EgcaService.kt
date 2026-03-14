package com.jads.network

import com.google.gson.annotations.SerializedName
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// ─────────────────────────────────────────────────────────────────────────────
// EgcaService — Retrofit2 API interface for DGCA eGCA (Electronic Governance
// of Civil Aviation) endpoints.
//
// eGCA handles drone flight permission lifecycle:
//   1. Authenticate operator → JWT token
//   2. Submit flight permission application
//   3. Poll permission status (PENDING → APPROVED / REJECTED)
//   4. Download Permission Artefact (PA) ZIP — signed XML for NPNT
//   5. Upload post-flight log bundle
//
// All endpoints use the eGCA v2 API paths.
// Auth token is injected by OkHttp interceptor (see EgcaModule).
//
// Date format: eGCA uses "dd-MM-yyyy HH:mm:ss" IST for datetime fields.
// ─────────────────────────────────────────────────────────────────────────────

// ── API interface ────────────────────────────────────────────────────────────

interface EgcaApi {

    /**
     * Authenticate with eGCA identity provider.
     * Returns JWT token + expiry. No Bearer header required for this call.
     */
    @POST("user/authenticate")
    suspend fun authenticate(
        @Body request: EgcaAuthRequest
    ): Response<EgcaAuthResponse>

    /**
     * Submit a new fly-drone permission application.
     * Requires Bearer token.
     */
    @POST("applicationForm/flyDronePermissionApplication")
    suspend fun submitPermissionApplication(
        @Body request: EgcaPermissionRequest
    ): Response<EgcaPermissionResponse>

    /**
     * Poll the status of a submitted permission application.
     * Returns current status (PENDING, APPROVED, REJECTED, EXPIRED).
     */
    @GET("applicationForm/flyDronePermissionApplication/{id}")
    suspend fun getPermissionStatus(
        @Path("id") applicationId: String
    ): Response<EgcaPermissionStatusResponse>

    /**
     * Download the Permission Artefact ZIP (signed XML) for an approved application.
     * Returns raw binary — ResponseBody is streamed, not parsed as JSON.
     */
    @GET("applicationForm/flyDronePermissionApplication/{id}/document/permissionArtifact")
    suspend fun downloadPermissionArtefact(
        @Path("id") applicationId: String
    ): Response<ResponseBody>

    /**
     * Upload post-flight log bundle for an approved application.
     * Body is raw binary (application/octet-stream).
     */
    @POST("applicationForm/flyDronePermissionApplication/{id}/document/flightLog")
    suspend fun uploadFlightLog(
        @Path("id") applicationId: String,
        @Body logBundle: RequestBody
    ): Response<Unit>
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

data class EgcaAuthRequest(
    val email: String,
    val password: String
)

/**
 * Fly-drone permission application payload.
 * Field names match eGCA API v2 schema exactly.
 *
 * Date format: "dd-MM-yyyy HH:mm:ss" in IST.
 */
data class EgcaPermissionRequest(
    val pilotBusinessIdentifier: String,
    val droneId: Int,
    val uinNumber: String,
    val flyArea: List<EgcaLatLng>,
    val payloadWeightInKg: Double,
    val payloadDetails: String,
    val flightPurpose: String,
    val startDateTime: String,          // dd-MM-yyyy HH:mm:ss IST
    val endDateTime: String,            // dd-MM-yyyy HH:mm:ss IST
    val maxAltitudeInMeters: Double,
    val typeOfOperation: String,        // VLOS | BVLOS | NIGHT | AGRICULTURAL
    val flightTerminationOrReturnHomeCapability: Boolean,
    val geoFencingCapability: Boolean,
    val detectAndAvoidCapability: Boolean,
    val selfDeclaration: Boolean,
    val recurringTimeExpression: String? = null,
    val recurringTimeDurationInMinutes: Int? = null
)

data class EgcaLatLng(
    val latitude: Double,
    val longitude: Double
)

// ── Response DTOs ────────────────────────────────────────────────────────────

data class EgcaAuthResponse(
    val token: String?,
    @SerializedName("access_token")
    val accessToken: String?,
    @SerializedName("expiresIn")
    val expiresInPrimary: Long?,
    @SerializedName("expires_in")
    val expiresInFallback: Long?
) {
    /** Resolved JWT token — checks both field name variants. */
    val resolvedToken: String?
        get() = token ?: accessToken

    /** Resolved expiry in seconds — defaults to 3600 (1 hour). */
    val resolvedExpiresInSeconds: Long
        get() = expiresInPrimary ?: expiresInFallback ?: 3600L
}

data class EgcaPermissionResponse(
    val applicationId: String,
    val status: String,             // SUBMITTED | PENDING
    val submittedAt: String,        // ISO 8601
    val referenceNumber: String?
)

data class EgcaPermissionStatusResponse(
    val status: String,             // PENDING | APPROVED | REJECTED | EXPIRED
    val permissionArtifactId: String?,
    val remarks: String?,
    val updatedAt: String?          // ISO 8601
)

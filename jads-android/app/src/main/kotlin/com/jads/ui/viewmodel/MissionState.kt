package com.jads.ui.viewmodel

import com.jads.drone.NpntGateResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ─────────────────────────────────────────────────────────────────────────────
// MissionState — process-scoped singleton that bridges the foreground service
// (which owns MissionController) with the Compose UI (which reads StateFlow).
//
// WHY A SINGLETON?
//   MissionForegroundService lives on a separate Android lifecycle from the
//   Activity. The ViewModel is scoped to the Activity, not the Service.
//   A singleton with StateFlows is the correct Android pattern for
//   Service → UI communication without bound services (which add boilerplate
//   and lifecycle complexity).
//
// THREAD SAFETY:
//   All MutableStateFlow writes happen from the IO coroutine in the service.
//   Compose reads them on the main thread via collectAsStateWithLifecycle().
//   StateFlow is thread-safe — no explicit locking needed.
// ─────────────────────────────────────────────────────────────────────────────

object MissionState {

    // ── Session ────────────────────────────────────────────────────────────
    private val _operatorId    = MutableStateFlow("")
    val operatorId: StateFlow<String> = _operatorId.asStateFlow()

    // JWT issued by the backend login endpoint.
    // Distinct from operatorId (the human-readable ID).
    // Used as the Bearer token in Authorization headers.
    // For demo: set to operatorId until a real auth endpoint exists.
    private val _jwtToken      = MutableStateFlow("")
    val jwtToken: StateFlow<String> = _jwtToken.asStateFlow()

    private val _operatorRole  = MutableStateFlow("CIVILIAN")
    val operatorRole: StateFlow<String> = _operatorRole.asStateFlow()

    fun setOperator(id: String, role: String) {
        _operatorId.value   = id
        _jwtToken.value     = id    // Demo: JWT = operatorId until real auth endpoint exists
        _operatorRole.value = role
    }

    // ── Pre-flight ─────────────────────────────────────────────────────────
    private val _npntResult     = MutableStateFlow<NpntGateResult?>(null)
    val npntResult: StateFlow<NpntGateResult?> = _npntResult.asStateFlow()

    private val _ntpSynced      = MutableStateFlow(false)
    val ntpSynced: StateFlow<Boolean> = _ntpSynced.asStateFlow()

    private val _ntpOffsetMs    = MutableStateFlow(0L)
    val ntpOffsetMs: StateFlow<Long> = _ntpOffsetMs.asStateFlow()

    fun setNpntResult(result: NpntGateResult) { _npntResult.value = result }
    fun setNtpStatus(synced: Boolean, offsetMs: Long) {
        _ntpSynced.value   = synced
        _ntpOffsetMs.value = offsetMs
    }

    // ── Active mission telemetry ───────────────────────────────────────────
    private val _activeMissionDbId = MutableStateFlow(-1L)
    val activeMissionDbId: StateFlow<Long> = _activeMissionDbId.asStateFlow()

    private val _activeMissionId   = MutableStateFlow(-1L)
    val activeMissionId: StateFlow<Long> = _activeMissionId.asStateFlow()

    private val _recordCount       = MutableStateFlow(0L)
    val recordCount: StateFlow<Long> = _recordCount.asStateFlow()

    private val _altitudeFt        = MutableStateFlow(0.0)
    val altitudeFt: StateFlow<Double> = _altitudeFt.asStateFlow()

    private val _latDeg            = MutableStateFlow(0.0)
    val latDeg: StateFlow<Double> = _latDeg.asStateFlow()

    private val _lonDeg            = MutableStateFlow(0.0)
    val lonDeg: StateFlow<Double> = _lonDeg.asStateFlow()

    private val _velocityMs        = MutableStateFlow(0.0)
    val velocityMs: StateFlow<Double> = _velocityMs.asStateFlow()

    private val _violations        = MutableStateFlow<List<ViolationSummary>>(emptyList())
    val violations: StateFlow<List<ViolationSummary>> = _violations.asStateFlow()

    private val _missionActive     = MutableStateFlow(false)
    val missionActive: StateFlow<Boolean> = _missionActive.asStateFlow()

    fun setMissionStarted(dbId: Long, missionId: Long) {
        _activeMissionDbId.value = dbId
        _activeMissionId.value   = missionId
        _recordCount.value       = 0L
        _violations.value        = emptyList()
        _missionActive.value     = true
    }

    fun updateTelemetry(
        latDeg:     Double,
        lonDeg:     Double,
        altFt:      Double,
        velocityMs: Double,
        records:    Long
    ) {
        _latDeg.value      = latDeg
        _lonDeg.value      = lonDeg
        _altitudeFt.value  = altFt
        _velocityMs.value  = velocityMs
        _recordCount.value = records
    }

    fun addViolation(v: ViolationSummary) {
        _violations.value = _violations.value + v
    }

    fun setMissionFinished() {
        _missionActive.value = false
    }

    // ── Storage decryption failure (CC-STOR-05 fix) ────────────────────────
    // Set when SQLCipher reports a decryption failure during resumeMission().
    // The UI must surface this as a CRITICAL error — not a normal empty state.
    // The operator must not be able to start a new mission over the corrupted chain.
    private val _decryptionFailure = MutableStateFlow<String?>(null)
    val decryptionFailure: StateFlow<String?> = _decryptionFailure.asStateFlow()

    fun setDecryptionFailure(reason: String) {
        _missionActive.value      = false
        _decryptionFailure.value  = reason
    }

    // ── Upload ─────────────────────────────────────────────────────────────
    private val _uploadStatus = MutableStateFlow<UploadStatus>(UploadStatus.Idle)
    val uploadStatus: StateFlow<UploadStatus> = _uploadStatus.asStateFlow()

    fun setUploadStatus(status: UploadStatus) { _uploadStatus.value = status }

    // ── Reset (for sign-out) ───────────────────────────────────────────────
    fun reset() {
        _npntResult.value      = null
        _ntpSynced.value       = false
        _activeMissionDbId.value = -1L
        _activeMissionId.value   = -1L
        _recordCount.value     = 0L
        _altitudeFt.value      = 0.0
        _violations.value      = emptyList()
        _missionActive.value   = false
        _uploadStatus.value    = UploadStatus.Idle
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared data classes — used across ViewModels and Screens
// ─────────────────────────────────────────────────────────────────────────────

data class ViolationSummary(
    val sequence:      Long,
    val type:          String,   // "AGL_EXCEEDED", "UNPERMITTED_ZONE", etc.
    val severity:      String,   // "CRITICAL", "WARNING", "ADVISORY"
    val timestampMs:   Long,
    val detailMessage: String
)

sealed class UploadStatus {
    object Idle       : UploadStatus()
    object Uploading  : UploadStatus()
    data class Success(val missionServerId: String) : UploadStatus()
    data class Failed(val reason: String, val retryable: Boolean = true) : UploadStatus()
    object AlreadyUploaded : UploadStatus()
}

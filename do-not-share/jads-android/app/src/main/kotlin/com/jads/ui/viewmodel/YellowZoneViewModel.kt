package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.EgcaLatLng
import com.jads.network.EgcaPermissionRequest
import com.jads.network.EgcaPermissionResponse
import com.jads.network.EgcaRepository
import com.jads.network.ZoneClassificationResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

// ─────────────────────────────────────────────────────────────────────────────
// YellowZoneViewModel — drives the YellowZoneSubmissionScreen (P15).
//
// Responsibilities:
//   1. Hold form state for the 3-page yellow-zone permission submission pager
//   2. Build the EgcaPermissionRequest from collected form data
//   3. Call EgcaRepository.submitPermissionApplication()
//   4. Expose submission result (loading, success with application ID, error)
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread.
//   Network calls are dispatched to IO by EgcaRepository internally.
//
// Dependencies:
//   EgcaRepository is set externally via setEgcaRepository() — called once
//   from the composable / MainActivity, consistent with the codebase pattern
//   (cf. AirspaceMapViewModel.setApiClient).
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "YellowZoneVM"

// ── Operation types recognised by eGCA ────────────────────────────────────────
enum class OperationType(val displayName: String, val apiValue: String) {
    VLOS("Visual Line of Sight (VLOS)",   "VLOS"),
    BVLOS("Beyond VLOS (BVLOS)",          "BVLOS"),
    AGRICULTURAL("Agricultural",          "AGRICULTURAL"),
    SURVEY("Aerial Survey",               "SURVEY"),
    DELIVERY("Delivery",                  "DELIVERY"),
    NIGHT("Night Operations",             "NIGHT"),
    OTHER("Other",                        "OTHER")
}

// ── Submission lifecycle ─────────────────────────────────────────────────────
sealed class SubmissionState {
    object Idle      : SubmissionState()
    object Loading   : SubmissionState()
    data class Success(
        val applicationId:   String,
        val referenceNumber: String?,
        val submittedAt:     String
    ) : SubmissionState()
    data class Error(val message: String) : SubmissionState()
}

// ── UI State ────────────────────────────────────────────────────────────────
data class YellowZoneUiState(
    // ── Passed from AirspaceMapScreen ────────────────────────────────────
    val zoneResult:         ZoneClassificationResult? = null,
    val polygon:            List<LatLng>              = emptyList(),
    val altitude:           Int                       = 120,

    // ── Page 1 — Authority Info (read-only, derived from zoneResult) ──────
    val authorityName:      String  = "",
    val authorityContact:   String  = "",
    val expeditedEligible:  Boolean = false,
    val expectedDays:       Int     = 7,

    // ── Page 2 — Operation Details (user input) ──────────────────────────
    val operationType:      OperationType = OperationType.VLOS,
    val rthCapability:      Boolean       = false,
    val geofencingEnabled:  Boolean       = false,
    val daaEnabled:         Boolean       = false,
    val selfDeclared:       Boolean       = false,

    // ── Page 2 — Pilot / drone info ─────────────────────────────────────
    val pilotName:          String = "",
    val uinNumber:          String = "",
    val droneId:            String = "1",

    // ── Page 3 — Submission ─────────────────────────────────────────────
    val submissionState:    SubmissionState = SubmissionState.Idle,
    val estimatedApproval:  String          = ""
)

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

class YellowZoneViewModel(application: Application) : AndroidViewModel(application) {

    private var egcaRepo: EgcaRepository? = null

    private val _state = MutableStateFlow(YellowZoneUiState())
    val state: StateFlow<YellowZoneUiState> = _state.asStateFlow()

    // Date formatter for eGCA: "dd-MM-yyyy HH:mm:ss" IST
    private val egcaDateFormat = SimpleDateFormat("dd-MM-yyyy HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("Asia/Kolkata")
    }

    // ── Dependency injection ──────────────────────────────────────────────────

    /** Provide the EgcaRepository instance (called once from the composable). */
    fun setEgcaRepository(repo: EgcaRepository) {
        egcaRepo = repo
    }

    /**
     * Initialise the state from AirspaceMapScreen data.
     * Called once when navigating to YellowZoneSubmissionScreen.
     */
    fun initialise(
        zoneResult: ZoneClassificationResult,
        polygon:    List<LatLng>,
        altitude:   Int,
        pilotName:  String,
        uinNumber:  String
    ) {
        val authorityName    = zoneResult.atcAuthority ?: "DGCA Regional Authority"
        val expedited        = altitude <= 50 && polygon.size <= 4
        val days             = if (expedited) 3 else 7
        val approvalCal      = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, days) }
        val approvalDate     = SimpleDateFormat("dd MMM yyyy", Locale.US).format(approvalCal.time)

        _state.value = YellowZoneUiState(
            zoneResult        = zoneResult,
            polygon           = polygon,
            altitude          = altitude,
            authorityName     = authorityName,
            authorityContact  = "eGCA Portal: https://eservices.dgca.gov.in\nEmail: support@dgca.gov.in\nPhone: +91-11-24622495",
            expeditedEligible = expedited,
            expectedDays      = days,
            pilotName         = pilotName,
            uinNumber         = uinNumber,
            estimatedApproval = approvalDate
        )
    }

    // ── Page 2 — Form actions ─────────────────────────────────────────────────

    fun onOperationTypeChanged(type: OperationType) {
        _state.value = _state.value.copy(operationType = type)
    }

    fun onRthToggled(enabled: Boolean) {
        _state.value = _state.value.copy(rthCapability = enabled)
    }

    fun onGeofencingToggled(enabled: Boolean) {
        _state.value = _state.value.copy(geofencingEnabled = enabled)
    }

    fun onDaaToggled(enabled: Boolean) {
        _state.value = _state.value.copy(daaEnabled = enabled)
    }

    fun onSelfDeclared(checked: Boolean) {
        _state.value = _state.value.copy(selfDeclared = checked)
    }

    fun onPilotNameChanged(name: String) {
        _state.value = _state.value.copy(pilotName = name)
    }

    fun onUinChanged(uin: String) {
        _state.value = _state.value.copy(uinNumber = uin)
    }

    fun onDroneIdChanged(id: String) {
        _state.value = _state.value.copy(droneId = id)
    }

    // ── Validation ────────────────────────────────────────────────────────────

    /** Whether the form is complete enough to submit. */
    fun canSubmit(): Boolean {
        val s = _state.value
        return s.selfDeclared &&
               s.uinNumber.isNotBlank() &&
               s.pilotName.isNotBlank() &&
               s.polygon.size >= 3 &&
               s.submissionState !is SubmissionState.Loading
    }

    // ── Page 3 — Submission ──────────────────────────────────────────────────

    fun submitToEgca() {
        val repo = egcaRepo
        if (repo == null) {
            Log.e(TAG, "EgcaRepository not set — cannot submit")
            _state.value = _state.value.copy(
                submissionState = SubmissionState.Error("eGCA service not configured")
            )
            return
        }

        if (!canSubmit()) {
            _state.value = _state.value.copy(
                submissionState = SubmissionState.Error("Please complete all required fields")
            )
            return
        }

        _state.value = _state.value.copy(submissionState = SubmissionState.Loading)

        val s = _state.value
        val now = Calendar.getInstance()
        val startTime = egcaDateFormat.format(now.time)
        now.add(Calendar.HOUR_OF_DAY, 2) // default 2h flight window
        val endTime = egcaDateFormat.format(now.time)

        val request = EgcaPermissionRequest(
            pilotBusinessIdentifier          = s.pilotName,
            droneId                          = s.droneId.toIntOrNull() ?: 1,
            uinNumber                        = s.uinNumber,
            flyArea                          = s.polygon.map { EgcaLatLng(it.latitude, it.longitude) },
            payloadWeightInKg                = 0.0,
            payloadDetails                   = "Standard payload",
            flightPurpose                    = s.operationType.displayName,
            startDateTime                    = startTime,
            endDateTime                      = endTime,
            maxAltitudeInMeters              = s.altitude.toDouble(),
            typeOfOperation                  = s.operationType.apiValue,
            flightTerminationOrReturnHomeCapability = s.rthCapability,
            geoFencingCapability             = s.geofencingEnabled,
            detectAndAvoidCapability         = s.daaEnabled,
            selfDeclaration                  = s.selfDeclared
        )

        viewModelScope.launch {
            Log.d(TAG, "Submitting flight permission to eGCA: UIN=${s.uinNumber}")

            val result = repo.submitPermissionApplication(request)

            result.onSuccess { response: EgcaPermissionResponse ->
                Log.i(TAG, "eGCA submission successful: applicationId=${response.applicationId}")
                _state.value = _state.value.copy(
                    submissionState = SubmissionState.Success(
                        applicationId   = response.applicationId,
                        referenceNumber = response.referenceNumber,
                        submittedAt     = response.submittedAt
                    )
                )
            }

            result.onFailure { error ->
                Log.e(TAG, "eGCA submission failed: ${error.message}")
                _state.value = _state.value.copy(
                    submissionState = SubmissionState.Error(
                        error.message ?: "Unknown submission error"
                    )
                )
            }
        }
    }

    /** Reset submission state (e.g. after dismissing error). */
    fun resetSubmission() {
        _state.value = _state.value.copy(submissionState = SubmissionState.Idle)
    }
}

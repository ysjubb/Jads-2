package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.EgcaLatLng
import com.jads.network.EgcaPermissionRequest
import com.jads.network.EgcaPermissionResponse
import com.jads.network.EgcaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

// ─────────────────────────────────────────────────────────────────────────────
// FlightFormViewModel — shared ViewModel for all drone flight planning forms.
//
// Drives FlightDetailsScreen (MICRO/SMALL), AgriculturalFlightScreen, and
// SpecialOpsFlightScreen with category-based field visibility.
//
// Progressive disclosure model:
//   NANO_RECREATIONAL → QuickPlanCard (inline, no navigation, no eGCA)
//   MICRO / SMALL     → FlightDetailsScreen (UIN, time, purpose, payload, eGCA)
//   AGRICULTURAL      → AgriculturalFlightScreen (pesticide, crop, CIB&RC)
//   BVLOS / SPECIAL   → SpecialOpsFlightScreen (multi-step, SAF PDF upload)
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread.
//   Network calls are dispatched to IO by EgcaRepository internally.
//
// Dependencies:
//   EgcaRepository is set externally via setEgcaRepository() — called once
//   from the composable / MainActivity, consistent with codebase pattern.
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "FlightFormVM"

// ── Drone weight categories per DGCA UAS Rules 2021 ──────────────────────────
enum class DroneCategory(val displayName: String, val weightRange: String) {
    NANO("Nano",         "< 250 g"),
    MICRO("Micro",       "250 g – 2 kg"),
    SMALL("Small",       "2 – 25 kg"),
    MEDIUM("Medium",     "25 – 150 kg"),
    LARGE("Large",       "> 150 kg")
}

// ── Flight purpose options ───────────────────────────────────────────────────
enum class FlightPurpose(val displayName: String, val apiValue: String) {
    PHOTOGRAPHY("Photography / Videography",  "PHOTOGRAPHY"),
    SURVEY("Survey & Mapping",                "SURVEY"),
    DELIVERY("Delivery",                      "DELIVERY"),
    INSPECTION("Infrastructure Inspection",   "INSPECTION"),
    AGRICULTURE("Agriculture",                "AGRICULTURAL"),
    EMERGENCY("Emergency / Medical",          "EMERGENCY"),
    TRAINING("Training / Recreational",       "TRAINING"),
    RESEARCH("Research & Development",        "RESEARCH"),
    OTHER("Other",                            "OTHER")
}

// ── Form submission lifecycle ────────────────────────────────────────────────
sealed class FlightFormSubmission {
    object Idle     : FlightFormSubmission()
    object Loading  : FlightFormSubmission()
    data class Success(
        val applicationId:   String,
        val referenceNumber: String?,
        val submittedAt:     String
    ) : FlightFormSubmission()
    data class Error(val message: String) : FlightFormSubmission()
}

// ── UI State ────────────────────────────────────────────────────────────────
data class FlightFormUiState(
    // ── Context from AirspaceMapScreen ─────────────────────────────────
    val polygon:            List<LatLng>        = emptyList(),
    val altitude:           Int                 = 120,
    val zoneType:           String              = "GREEN",
    val atcAuthority:       String?             = null,

    // ── Drone category ────────────────────────────────────────────────
    val droneCategory:      DroneCategory       = DroneCategory.MICRO,

    // ── Common fields (MICRO/SMALL) ──────────────────────────────────
    val uinNumber:          String              = "",
    val pilotName:          String              = "",
    val startTime:          String              = "",
    val endTime:            String              = "",
    val flightPurpose:      FlightPurpose       = FlightPurpose.PHOTOGRAPHY,
    val payloadWeightKg:    Double              = 0.0,
    val selfDeclared:       Boolean             = false,

    // ── Capabilities ──────────────────────────────────────────────────
    val rthCapability:      Boolean             = false,
    val geofencingEnabled:  Boolean             = false,
    val daaEnabled:         Boolean             = false,

    // ── Agricultural fields ───────────────────────────────────────────
    val pesticideName:      String              = "",
    val cibrcNumber:        String              = "",
    val cropType:           String              = "",
    val sprayVolumeLitres:  Double              = 0.0,
    val fieldOwnerName:     String              = "",
    val fieldOwnerPhone:    String              = "",

    // ── Special ops fields (BVLOS / Rule 70 exemption) ────────────────
    val safFileUri:         String?             = null,
    val safFileName:        String?             = null,
    val specialOpsStep:     Int                 = 0,
    val exemptionType:      String              = "RULE_70",
    val operationNarrative: String              = "",

    // ── Nano quick plan (inline, no eGCA) ─────────────────────────────
    val nanoDescription:    String              = "",
    val nanoLocationLat:    Double?             = null,
    val nanoLocationLon:    Double?             = null,
    val nanoTimeMinutes:    Int                 = 15,
    val nanoQuickPlanSaved: Boolean             = false,

    // ── Form submission state ─────────────────────────────────────────
    val submissionState:    FlightFormSubmission = FlightFormSubmission.Idle
)

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

class FlightFormViewModel(application: Application) : AndroidViewModel(application) {

    private var egcaRepo: EgcaRepository? = null

    private val _state = MutableStateFlow(FlightFormUiState())
    val state: StateFlow<FlightFormUiState> = _state.asStateFlow()

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
     * Initialise the form from AirspaceMapScreen context.
     * Called when navigating to any flight form screen.
     */
    fun initialise(
        polygon:       List<LatLng>,
        altitude:      Int,
        zoneType:      String,
        atcAuthority:  String?,
        droneCategory: DroneCategory,
        pilotName:     String
    ) {
        val now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"))
        val startTime = egcaDateFormat.format(now.time)
        now.add(Calendar.HOUR_OF_DAY, 2)
        val endTime = egcaDateFormat.format(now.time)

        _state.value = _state.value.copy(
            polygon       = polygon,
            altitude      = altitude,
            zoneType      = zoneType,
            atcAuthority  = atcAuthority,
            droneCategory = droneCategory,
            pilotName     = pilotName,
            startTime     = startTime,
            endTime       = endTime
        )
    }

    // ── Common field updates ──────────────────────────────────────────────────

    fun onUinChanged(uin: String) {
        _state.value = _state.value.copy(uinNumber = uin)
    }

    fun onPilotNameChanged(name: String) {
        _state.value = _state.value.copy(pilotName = name)
    }

    fun onStartTimeChanged(time: String) {
        _state.value = _state.value.copy(startTime = time)
    }

    fun onEndTimeChanged(time: String) {
        _state.value = _state.value.copy(endTime = time)
    }

    fun onFlightPurposeChanged(purpose: FlightPurpose) {
        _state.value = _state.value.copy(flightPurpose = purpose)
    }

    fun onPayloadWeightChanged(weight: Double) {
        _state.value = _state.value.copy(payloadWeightKg = weight)
    }

    fun onSelfDeclared(checked: Boolean) {
        _state.value = _state.value.copy(selfDeclared = checked)
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

    // ── Agricultural field updates ────────────────────────────────────────────

    fun onPesticideNameChanged(name: String) {
        _state.value = _state.value.copy(pesticideName = name)
    }

    fun onCibrcNumberChanged(number: String) {
        _state.value = _state.value.copy(cibrcNumber = number)
    }

    fun onCropTypeChanged(type: String) {
        _state.value = _state.value.copy(cropType = type)
    }

    fun onSprayVolumeChanged(litres: Double) {
        _state.value = _state.value.copy(sprayVolumeLitres = litres)
    }

    fun onFieldOwnerNameChanged(name: String) {
        _state.value = _state.value.copy(fieldOwnerName = name)
    }

    fun onFieldOwnerPhoneChanged(phone: String) {
        _state.value = _state.value.copy(fieldOwnerPhone = phone)
    }

    // ── Special ops field updates ─────────────────────────────────────────────

    fun onSafFileSelected(uri: String, fileName: String) {
        _state.value = _state.value.copy(safFileUri = uri, safFileName = fileName)
    }

    fun onSpecialOpsStepChanged(step: Int) {
        _state.value = _state.value.copy(specialOpsStep = step)
    }

    fun onExemptionTypeChanged(type: String) {
        _state.value = _state.value.copy(exemptionType = type)
    }

    fun onOperationNarrativeChanged(text: String) {
        _state.value = _state.value.copy(operationNarrative = text)
    }

    // ── Nano quick plan updates ───────────────────────────────────────────────

    fun onNanoDescriptionChanged(desc: String) {
        _state.value = _state.value.copy(nanoDescription = desc)
    }

    fun onNanoLocationSelected(lat: Double, lon: Double) {
        _state.value = _state.value.copy(nanoLocationLat = lat, nanoLocationLon = lon)
    }

    fun onNanoTimeChanged(minutes: Int) {
        _state.value = _state.value.copy(nanoTimeMinutes = minutes)
    }

    fun saveNanoQuickPlan() {
        val s = _state.value
        if (s.nanoDescription.isBlank()) return
        _state.value = _state.value.copy(nanoQuickPlanSaved = true)
        Log.i(TAG, "Nano quick plan saved: desc=${s.nanoDescription}, time=${s.nanoTimeMinutes}min")
    }

    // ── Category-based field visibility ───────────────────────────────────────

    /** Whether the form requires UIN (Unique Identification Number). */
    fun requiresUin(): Boolean {
        val cat = _state.value.droneCategory
        return cat != DroneCategory.NANO
    }

    /** Whether agricultural fields should be shown. */
    fun showAgriculturalFields(): Boolean {
        return _state.value.flightPurpose == FlightPurpose.AGRICULTURE
    }

    /** Whether special ops fields should be shown. */
    fun showSpecialOpsFields(): Boolean {
        val cat = _state.value.droneCategory
        return cat == DroneCategory.MEDIUM || cat == DroneCategory.LARGE
    }

    /** Whether eGCA submission is required (not for NANO recreational). */
    fun requiresEgcaSubmission(): Boolean {
        return _state.value.droneCategory != DroneCategory.NANO
    }

    // ── Validation ────────────────────────────────────────────────────────────

    /** Whether the MICRO/SMALL form is complete enough to submit. */
    fun canSubmitFlightDetails(): Boolean {
        val s = _state.value
        return s.selfDeclared &&
               s.uinNumber.isNotBlank() &&
               s.pilotName.isNotBlank() &&
               s.startTime.isNotBlank() &&
               s.endTime.isNotBlank() &&
               s.polygon.size >= 3 &&
               s.submissionState !is FlightFormSubmission.Loading
    }

    /** Whether the agricultural form is complete enough to submit. */
    fun canSubmitAgricultural(): Boolean {
        val s = _state.value
        return canSubmitFlightDetails() &&
               s.pesticideName.isNotBlank() &&
               s.cibrcNumber.isNotBlank() &&
               s.cropType.isNotBlank() &&
               s.sprayVolumeLitres > 0.0 &&
               s.fieldOwnerName.isNotBlank() &&
               s.fieldOwnerPhone.isNotBlank()
    }

    /** Whether the special ops form is complete enough to submit. */
    fun canSubmitSpecialOps(): Boolean {
        val s = _state.value
        return canSubmitFlightDetails() &&
               s.safFileUri != null &&
               s.operationNarrative.isNotBlank()
    }

    // ── Submission to eGCA ────────────────────────────────────────────────────

    fun submitToEgca() {
        val repo = egcaRepo
        if (repo == null) {
            Log.e(TAG, "EgcaRepository not set — cannot submit")
            _state.value = _state.value.copy(
                submissionState = FlightFormSubmission.Error("eGCA service not configured")
            )
            return
        }

        _state.value = _state.value.copy(submissionState = FlightFormSubmission.Loading)

        val s = _state.value

        val operationTypeValue = when {
            s.flightPurpose == FlightPurpose.AGRICULTURE -> "AGRICULTURAL"
            s.droneCategory == DroneCategory.MEDIUM ||
            s.droneCategory == DroneCategory.LARGE       -> "BVLOS"
            else                                          -> "VLOS"
        }

        val payloadDetails = when {
            s.flightPurpose == FlightPurpose.AGRICULTURE ->
                "Pesticide: ${s.pesticideName}, CIB&RC: ${s.cibrcNumber}, " +
                "Crop: ${s.cropType}, Volume: ${s.sprayVolumeLitres}L"
            s.operationNarrative.isNotBlank() -> s.operationNarrative
            else -> "Standard payload"
        }

        val request = EgcaPermissionRequest(
            pilotBusinessIdentifier          = s.pilotName,
            droneId                          = 1,
            uinNumber                        = s.uinNumber,
            flyArea                          = s.polygon.map { EgcaLatLng(it.latitude, it.longitude) },
            payloadWeightInKg                = s.payloadWeightKg,
            payloadDetails                   = payloadDetails,
            flightPurpose                    = s.flightPurpose.displayName,
            startDateTime                    = s.startTime,
            endDateTime                      = s.endTime,
            maxAltitudeInMeters              = s.altitude.toDouble(),
            typeOfOperation                  = operationTypeValue,
            flightTerminationOrReturnHomeCapability = s.rthCapability,
            geoFencingCapability             = s.geofencingEnabled,
            detectAndAvoidCapability         = s.daaEnabled,
            selfDeclaration                  = s.selfDeclared
        )

        viewModelScope.launch {
            Log.d(TAG, "Submitting flight permission to eGCA: UIN=${s.uinNumber}, category=${s.droneCategory}")

            val result = repo.submitPermissionApplication(request)

            result.onSuccess { response: EgcaPermissionResponse ->
                Log.i(TAG, "eGCA submission successful: applicationId=${response.applicationId}")
                _state.value = _state.value.copy(
                    submissionState = FlightFormSubmission.Success(
                        applicationId   = response.applicationId,
                        referenceNumber = response.referenceNumber,
                        submittedAt     = response.submittedAt
                    )
                )
            }

            result.onFailure { error ->
                Log.e(TAG, "eGCA submission failed: ${error.message}")
                _state.value = _state.value.copy(
                    submissionState = FlightFormSubmission.Error(
                        error.message ?: "Unknown submission error"
                    )
                )
            }
        }
    }

    /** Reset submission state (e.g. after dismissing error). */
    fun resetSubmission() {
        _state.value = _state.value.copy(submissionState = FlightFormSubmission.Idle)
    }
}

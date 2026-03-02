package com.jads.ui.viewmodel

import android.app.Application
import android.content.Intent
import android.util.Log
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.drone.NpntComplianceGate
import com.jads.drone.NpntGateResult
import com.jads.drone.ZoneType
import com.jads.service.MissionForegroundService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

// DataStore — persists operatorId across restarts
private val Application.dataStore by preferencesDataStore(name = "jads_prefs")
private val KEY_OPERATOR_ID   = stringPreferencesKey("operator_id")
private val KEY_OPERATOR_ROLE = stringPreferencesKey("operator_role")

// ─────────────────────────────────────────────────────────────────────────────
// SetupUiState — drives MissionSetupScreen
// ─────────────────────────────────────────────────────────────────────────────
data class SetupUiState(
    val latInput:         String        = "",
    val lonInput:         String        = "",
    val aglInput:         String        = "100",
    val permissionToken:  String        = "",
    val npntResult:       NpntGateResult? = null,
    val ntpSynced:        Boolean       = false,
    val ntpOffsetMs:      Long          = 0L,
    val isCheckingNpnt:   Boolean       = false,
    val isStarting:       Boolean       = false,
    val startError:       String?       = null,
    val checklistItems:   List<ChecklistItem> = defaultChecklist()
)

data class ChecklistItem(
    val label:   String,
    val checked: Boolean,
    val key:     String   // unique key for toggle
)

fun defaultChecklist() = listOf(
    ChecklistItem("Drone pre-flight physical inspection complete",           false, "physical"),
    ChecklistItem("Battery > 80%",                                           false, "battery"),
    ChecklistItem("Props locked and secure",                                 false, "props"),
    ChecklistItem("RTH altitude set in GCS",                                false, "rth"),
    ChecklistItem("Flight zone visually confirmed clear",                    false, "zone_clear"),
    ChecklistItem("Emergency contact notified",                              false, "emergency"),
)

// ─────────────────────────────────────────────────────────────────────────────
// MissionViewModel — shared across Setup / Active / Complete screens
// ─────────────────────────────────────────────────────────────────────────────
class MissionViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application

    // ── Setup state ────────────────────────────────────────────────────────
    private val _setupState = MutableStateFlow(SetupUiState())
    val setupState: StateFlow<SetupUiState> = _setupState.asStateFlow()

    // ── Mission live state (delegated to singleton) ────────────────────────
    val missionActive:    StateFlow<Boolean>           = MissionState.missionActive
    val altitudeFt:       StateFlow<Double>            = MissionState.altitudeFt
    val recordCount:      StateFlow<Long>              = MissionState.recordCount
    val violations:       StateFlow<List<ViolationSummary>> = MissionState.violations
    val latDeg:           StateFlow<Double>            = MissionState.latDeg
    val lonDeg:           StateFlow<Double>            = MissionState.lonDeg
    val velocityMs:       StateFlow<Double>            = MissionState.velocityMs
    val uploadStatus:     StateFlow<UploadStatus>      = MissionState.uploadStatus
    val activeMissionDbId:StateFlow<Long>              = MissionState.activeMissionDbId
    val activeMissionId:  StateFlow<Long>              = MissionState.activeMissionId

    init {
        // Restore NTP state from singleton on ViewModel creation
        viewModelScope.launch {
            _setupState.value = _setupState.value.copy(
                ntpSynced   = MissionState.ntpSynced.value,
                ntpOffsetMs = MissionState.ntpOffsetMs.value
            )
        }
    }

    // ── Setup inputs ───────────────────────────────────────────────────────

    fun onLatChanged(v: String)   { _setupState.value = _setupState.value.copy(latInput = v) }
    fun onLonChanged(v: String)   { _setupState.value = _setupState.value.copy(lonInput = v) }
    fun onAglChanged(v: String)   { _setupState.value = _setupState.value.copy(aglInput = v) }
    fun onTokenChanged(v: String) { _setupState.value = _setupState.value.copy(permissionToken = v) }

    fun toggleChecklist(key: String) {
        val items = _setupState.value.checklistItems.map {
            if (it.key == key) it.copy(checked = !it.checked) else it
        }
        _setupState.value = _setupState.value.copy(checklistItems = items)
    }

    // ── NPNT check ─────────────────────────────────────────────────────────
    // In production: calls NpntComplianceGate.evaluate() via MissionController.
    // In this implementation: calls MissionForegroundService via Intent command.
    // The service writes result to MissionState, which flows back here.

    fun runNpntCheck() {
        val state = _setupState.value
        val lat   = state.latInput.toDoubleOrNull()  ?: return
        val lon   = state.lonInput.toDoubleOrNull()  ?: return
        val agl   = state.aglInput.toDoubleOrNull()  ?: 100.0
        val token = state.permissionToken.ifBlank { null }

        _setupState.value = _setupState.value.copy(isCheckingNpnt = true, npntResult = null)

        viewModelScope.launch {
            // Send check command to foreground service
            val intent = Intent(app, MissionForegroundService::class.java).apply {
                action = MissionForegroundService.ACTION_CHECK_NPNT
                putExtra(MissionForegroundService.EXTRA_LAT, lat)
                putExtra(MissionForegroundService.EXTRA_LON, lon)
                putExtra(MissionForegroundService.EXTRA_AGL, agl)
                token?.let { putExtra(MissionForegroundService.EXTRA_TOKEN, it) }
            }
            app.startService(intent)

            // Wait for result via MissionState flow (service writes it back)
            MissionState.npntResult.collect { result ->
                if (result != null) {
                    _setupState.value = _setupState.value.copy(
                        npntResult    = result,
                        isCheckingNpnt = false
                    )
                    return@collect
                }
            }
        }
    }

    // ── Start mission ──────────────────────────────────────────────────────

    fun startMission() {
        val state     = _setupState.value
        val lat       = state.latInput.toDoubleOrNull()  ?: run { setStartError("Invalid latitude"); return }
        val lon       = state.lonInput.toDoubleOrNull()  ?: run { setStartError("Invalid longitude"); return }
        val agl       = state.aglInput.toDoubleOrNull()  ?: 100.0
        val npnt      = state.npntResult              ?: run { setStartError("Run NPNT check first"); return }
        if (npnt.blocked) { setStartError("Mission blocked by NPNT gate"); return }
        if (!state.checklistItems.all { it.checked }) { setStartError("Complete all pre-flight checklist items"); return }

        _setupState.value = _setupState.value.copy(isStarting = true, startError = null)

        val intent = Intent(app, MissionForegroundService::class.java).apply {
            action = MissionForegroundService.ACTION_START_MISSION
            putExtra(MissionForegroundService.EXTRA_LAT, lat)
            putExtra(MissionForegroundService.EXTRA_LON, lon)
            putExtra(MissionForegroundService.EXTRA_AGL, agl)
            state.permissionToken.ifBlank { null }?.let { putExtra(MissionForegroundService.EXTRA_TOKEN, it) }
            putExtra(MissionForegroundService.EXTRA_OPERATOR_ID, MissionState.operatorId.value)
        }
        app.startForegroundService(intent)

        // Navigation happens when missionActive becomes true (observed in screen)
        viewModelScope.launch {
            MissionState.missionActive.collect { active ->
                if (active) {
                    _setupState.value = _setupState.value.copy(isStarting = false)
                    return@collect
                }
            }
        }
    }

    // ── Stop mission ───────────────────────────────────────────────────────

    fun stopMission() {
        val intent = Intent(app, MissionForegroundService::class.java).apply {
            action = MissionForegroundService.ACTION_STOP_MISSION
        }
        app.startService(intent)
    }

    // ── Upload ─────────────────────────────────────────────────────────────

    fun triggerUpload() {
        val intent = Intent(app, MissionForegroundService::class.java).apply {
            action = MissionForegroundService.ACTION_UPLOAD_MISSION
            putExtra(MissionForegroundService.EXTRA_MISSION_DB_ID, MissionState.activeMissionDbId.value)
        }
        app.startService(intent)
    }

    // ── Reset for new mission ──────────────────────────────────────────────

    fun resetForNewMission() {
        _setupState.value = SetupUiState(
            checklistItems = defaultChecklist(),
            ntpSynced      = MissionState.ntpSynced.value,
            ntpOffsetMs    = MissionState.ntpOffsetMs.value
        )
        MissionState.setUploadStatus(UploadStatus.Idle)
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private fun setStartError(msg: String) {
        _setupState.value = _setupState.value.copy(isStarting = false, startError = msg)
    }
}

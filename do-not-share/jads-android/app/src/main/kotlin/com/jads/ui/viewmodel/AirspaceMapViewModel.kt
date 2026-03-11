package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.ApiResult
import com.jads.network.JadsApiClient
import com.jads.network.ZoneCheckLatLng
import com.jads.network.ZoneClassificationResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────────────
// AirspaceMapViewModel — drives the AirspaceMapScreen.
//
// Responsibilities:
//   1. Hold the drawn polygon vertex list and altitude slider value
//   2. Debounce zone-check API calls (600ms) on polygon or altitude change
//   3. Expose ZoneClassificationResult for the BottomSheet
//   4. No UI / Compose dependencies — pure state + coroutine logic
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread (StateFlow is
//   thread-safe). Network calls dispatch to Dispatchers.IO.
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "AirspaceMapVM"

/** Debounce interval in milliseconds — zone-check fires after polygon/altitude stabilises. */
private const val ZONE_CHECK_DEBOUNCE_MS = 600L

// ── LatLng for polygon vertices ─────────────────────────────────────────────
// Uses osmdroid's GeoPoint-compatible lat/lon. Decoupled from osmdroid type
// so the ViewModel has no Android-view dependency.
data class LatLng(
    val latitude: Double,
    val longitude: Double
)

// ── UI State ────────────────────────────────────────────────────────────────
data class MapUiState(
    val drawnPolygon:       List<LatLng>              = emptyList(),
    val altitude:           Int                       = 120,  // metres AGL (slider default)
    val zoneResult:         ZoneClassificationResult? = null,
    val isLoading:          Boolean                   = false,
    val polygonClosed:      Boolean                   = false,
    val redAcknowledged:    Boolean                   = false,
    val errorMessage:       String?                   = null
)

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

class AirspaceMapViewModel(application: Application) : AndroidViewModel(application) {

    // Injected at init from MainActivity / DI. In this codebase, JadsApiClient
    // is typically constructed in the activity and passed to VMs. For now, we
    // accept late-init from the screen composable.
    private var apiClient: JadsApiClient? = null

    private val _state = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = _state.asStateFlow()

    private var debounceJob: Job? = null

    // ── Public API for the screen ────────────────────────────────────────────

    /** Provide the JadsApiClient instance (called once from the composable). */
    fun setApiClient(client: JadsApiClient) {
        apiClient = client
    }

    /** Add a vertex to the in-progress polygon (single tap). */
    fun addVertex(point: LatLng) {
        if (_state.value.polygonClosed) return
        val updated = _state.value.drawnPolygon + point
        _state.value = _state.value.copy(drawnPolygon = updated)
        scheduleZoneCheck()
    }

    /** Move an existing vertex to a new position (long-press drag). */
    fun moveVertex(index: Int, newPosition: LatLng) {
        val polygon = _state.value.drawnPolygon.toMutableList()
        if (index !in polygon.indices) return
        polygon[index] = newPosition
        _state.value = _state.value.copy(drawnPolygon = polygon)
        scheduleZoneCheck()
    }

    /** Close the polygon (double tap). Requires at least 3 vertices. */
    fun closePolygon() {
        if (_state.value.drawnPolygon.size < 3) return
        _state.value = _state.value.copy(polygonClosed = true)
        scheduleZoneCheck()
    }

    /** Clear the polygon and reset zone result. */
    fun clearPolygon() {
        debounceJob?.cancel()
        _state.value = _state.value.copy(
            drawnPolygon    = emptyList(),
            polygonClosed   = false,
            zoneResult      = null,
            redAcknowledged = false,
            errorMessage    = null
        )
    }

    /** Confirm the drawn polygon (checkmark FAB). Returns true if polygon is valid. */
    fun confirmPolygon(): Boolean {
        if (_state.value.drawnPolygon.size < 3) return false
        if (!_state.value.polygonClosed) {
            closePolygon()
        }
        return true
    }

    /** Update altitude from the slider. */
    fun onAltitudeChanged(altitudeM: Int) {
        _state.value = _state.value.copy(altitude = altitudeM)
        scheduleZoneCheck()
    }

    /** Acknowledge RED zone (user accepts the risk — enables Proceed button). */
    fun acknowledgeRedZone() {
        _state.value = _state.value.copy(redAcknowledged = true)
    }

    /** Whether the user can proceed to the details screen. */
    fun canProceed(): Boolean {
        val s = _state.value
        if (s.drawnPolygon.size < 3) return false
        val zone = s.zoneResult ?: return false
        return zone.zone != "RED" || s.redAcknowledged
    }

    // ── Debounced zone check ─────────────────────────────────────────────────

    private fun scheduleZoneCheck() {
        debounceJob?.cancel()
        val polygon = _state.value.drawnPolygon
        if (polygon.size < 3) return

        debounceJob = viewModelScope.launch {
            delay(ZONE_CHECK_DEBOUNCE_MS)
            performZoneCheck()
        }
    }

    private suspend fun performZoneCheck() {
        val client = apiClient
        if (client == null) {
            Log.w(TAG, "API client not set — skipping zone check")
            return
        }

        val s = _state.value
        if (s.drawnPolygon.size < 3) return

        _state.value = _state.value.copy(isLoading = true, errorMessage = null)

        val polygonPayload = s.drawnPolygon.map { ZoneCheckLatLng(it.latitude, it.longitude) }

        val result = withContext(Dispatchers.IO) {
            client.checkAirspaceZone(polygonPayload, s.altitude)
        }

        when (result) {
            is ApiResult.Success -> {
                Log.i(TAG, "Zone check result: zone=${result.data.zone}, reasons=${result.data.reasons.size}")
                _state.value = _state.value.copy(
                    zoneResult   = result.data,
                    isLoading    = false,
                    errorMessage = null,
                    // Reset red acknowledgement when zone result changes
                    redAcknowledged = _state.value.redAcknowledged && result.data.zone == "RED"
                )
            }
            is ApiResult.Error -> {
                Log.e(TAG, "Zone check HTTP error: ${result.code} ${result.message}")
                _state.value = _state.value.copy(
                    isLoading    = false,
                    errorMessage = "Zone check failed: ${result.message}"
                )
            }
            is ApiResult.NetworkError -> {
                Log.e(TAG, "Zone check network error: ${result.message}")
                _state.value = _state.value.copy(
                    isLoading    = false,
                    errorMessage = "Network error: ${result.message}"
                )
            }
        }
    }
}

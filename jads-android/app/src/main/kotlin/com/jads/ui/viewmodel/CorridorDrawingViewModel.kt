package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ---------------------------------------------------------------------------
// CorridorDrawingViewModel -- drives the CorridorDrawingOverlay screen.
//
// Responsibilities:
//   1. Hold the waypoint list forming the corridor centreline
//   2. Hold the buffer width (10-500m) for live corridor preview
//   3. Manage corridor mode toggle and lock state
//   4. No UI / Compose dependencies -- pure state logic
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread.
// ---------------------------------------------------------------------------

private const val TAG = "CorridorDrawingVM"

/** Default corridor buffer width in metres. */
private const val DEFAULT_BUFFER_WIDTH = 50

/** Minimum buffer width in metres. */
private const val MIN_BUFFER_WIDTH = 10

/** Maximum buffer width in metres. */
private const val MAX_BUFFER_WIDTH = 500

// -- UI State ---------------------------------------------------------------

data class CorridorUiState(
    /** Ordered waypoints forming the corridor centreline. */
    val waypoints:        List<LatLng> = emptyList(),
    /** Corridor buffer width in metres (half-width; total corridor = 2x). */
    val bufferWidthMetres: Int         = DEFAULT_BUFFER_WIDTH,
    /** Whether corridor drawing mode is active. */
    val isCorridorMode:   Boolean      = false,
    /** Whether the corridor has been locked (no further edits). */
    val isLocked:         Boolean      = false,
    /** Optional error message shown in the UI. */
    val errorMessage:     String?      = null
)

// -- ViewModel --------------------------------------------------------------

class CorridorDrawingViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(CorridorUiState())
    val state: StateFlow<CorridorUiState> = _state.asStateFlow()

    // -- Public API for the screen ----------------------------------------

    /** Toggle corridor drawing mode on/off. */
    fun toggleCorridorMode() {
        if (_state.value.isLocked) return
        val current = _state.value.isCorridorMode
        _state.value = _state.value.copy(
            isCorridorMode = !current,
            errorMessage   = null
        )
        Log.d(TAG, "Corridor mode toggled: ${!current}")
    }

    /** Add a waypoint at the given position. Only works in corridor mode. */
    fun addWaypoint(point: LatLng) {
        val s = _state.value
        if (!s.isCorridorMode || s.isLocked) return

        val updated = s.waypoints + point
        _state.value = s.copy(
            waypoints    = updated,
            errorMessage = null
        )
        Log.d(TAG, "Waypoint added: (${point.latitude}, ${point.longitude}), total=${updated.size}")
    }

    /** Remove the last waypoint (undo). */
    fun undoLastWaypoint() {
        val s = _state.value
        if (s.isLocked || s.waypoints.isEmpty()) return

        _state.value = s.copy(
            waypoints    = s.waypoints.dropLast(1),
            errorMessage = null
        )
    }

    /** Clear all waypoints and reset corridor state. */
    fun clearCorridor() {
        _state.value = _state.value.copy(
            waypoints    = emptyList(),
            isLocked     = false,
            errorMessage = null
        )
        Log.d(TAG, "Corridor cleared")
    }

    /** Update the corridor buffer width (clamped to 10-500m). */
    fun setBufferWidth(metres: Int) {
        if (_state.value.isLocked) return
        val clamped = metres.coerceIn(MIN_BUFFER_WIDTH, MAX_BUFFER_WIDTH)
        _state.value = _state.value.copy(bufferWidthMetres = clamped)
    }

    /** Lock the corridor, preventing further edits. Requires >= 2 waypoints. */
    fun lockCorridor() {
        val s = _state.value
        if (s.waypoints.size < 2) {
            _state.value = s.copy(
                errorMessage = "At least 2 waypoints are required to lock the corridor."
            )
            return
        }
        _state.value = s.copy(
            isLocked     = true,
            errorMessage = null
        )
        Log.i(TAG, "Corridor locked: ${s.waypoints.size} waypoints, buffer=${s.bufferWidthMetres}m")
    }

    /** Whether the corridor is ready to proceed (locked with valid geometry). */
    fun canProceed(): Boolean {
        val s = _state.value
        return s.isLocked && s.waypoints.size >= 2
    }

    /** Get the locked corridor waypoints. */
    fun getLockedWaypoints(): List<LatLng> {
        return if (_state.value.isLocked) _state.value.waypoints else emptyList()
    }

    /** Get the locked corridor buffer width in metres. */
    fun getLockedBufferWidth(): Int {
        return if (_state.value.isLocked) _state.value.bufferWidthMetres else DEFAULT_BUFFER_WIDTH
    }
}

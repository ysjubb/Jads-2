package com.jads.mission

import com.jads.drone.RawSensorFields
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// MissionStateHolder — singleton bridge between MissionForegroundService and UI ViewModels.
//
// The foreground service runs on its own coroutine scope (no Activity lifecycle).
// The ActiveMissionViewModel observes this holder via StateFlow — no bound service,
// no AIDL, no LocalBroadcast needed.
//
// Thread safety: StateFlow emissions are always on the service's coroutine context.
// Collectors (ViewModels) observe on their own scope — safe by design.

object MissionStateHolder {

    // ── Live telemetry ─────────────────────────────────────────────────────

    data class LiveTelemetry(
        val recordCount:       Long    = 0L,
        val latDeg:            Double  = 0.0,
        val lonDeg:            Double  = 0.0,
        val altMeters:         Double  = 0.0,
        val speedMs:           Double  = 0.0,
        val satelliteCount:    Int     = 0,
        val hdop:              Float   = 99f,
        val elapsedSeconds:    Long    = 0L,
        val violationCount:    Int     = 0,
        val lastViolationType: String? = null,
    )

    private val _telemetry = MutableStateFlow(LiveTelemetry())
    val telemetry: StateFlow<LiveTelemetry> = _telemetry.asStateFlow()

    // ── Mission lifecycle state ────────────────────────────────────────────

    sealed class MissionStatus {
        object Idle                                      : MissionStatus()
        data class Active(val missionDbId: Long,
                          val missionId:   Long,
                          val startMs:     Long)         : MissionStatus()
        data class Finalizing(val missionDbId: Long)     : MissionStatus()
        data class Complete(val missionDbId: Long,
                            val recordCount: Long,
                            val violationCount: Int)     : MissionStatus()
        data class Error(val reason: String)             : MissionStatus()
    }

    private val _status = MutableStateFlow<MissionStatus>(MissionStatus.Idle)
    val status: StateFlow<MissionStatus> = _status.asStateFlow()

    // ── Write API (called by MissionForegroundService only) ───────────────

    fun onMissionStarted(missionDbId: Long, missionId: Long, startMs: Long) {
        _status.value = MissionStatus.Active(missionDbId, missionId, startMs)
        _telemetry.value = LiveTelemetry()
    }

    fun onTelemetryTick(raw: RawSensorFields, recordCount: Long, violationCount: Int,
                        lastViolationType: String?, elapsedSeconds: Long) {
        val speedMs = Math.sqrt(
            raw.velNorthMs * raw.velNorthMs +
            raw.velEastMs  * raw.velEastMs
        )
        _telemetry.value = LiveTelemetry(
            recordCount       = recordCount,
            latDeg            = raw.latDeg,
            lonDeg            = raw.lonDeg,
            altMeters         = raw.altMeters,
            speedMs           = speedMs,
            satelliteCount    = raw.satelliteCount,
            hdop              = raw.hdop,
            elapsedSeconds    = elapsedSeconds,
            violationCount    = violationCount,
            lastViolationType = lastViolationType,
        )
    }

    fun onMissionFinalizing(missionDbId: Long) {
        _status.value = MissionStatus.Finalizing(missionDbId)
    }

    fun onMissionComplete(missionDbId: Long, recordCount: Long, violationCount: Int) {
        _status.value = MissionStatus.Complete(missionDbId, recordCount, violationCount)
    }

    fun onError(reason: String) {
        _status.value = MissionStatus.Error(reason)
    }

    fun reset() {
        _status.value  = MissionStatus.Idle
        _telemetry.value = LiveTelemetry()
    }
}

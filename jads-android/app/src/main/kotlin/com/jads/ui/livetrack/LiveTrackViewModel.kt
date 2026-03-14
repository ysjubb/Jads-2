// T06 — ViewModel for live drone tracking on remote viewer
package com.jads.ui.livetrack

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jads.websocket.JadsWebSocketClient
import com.jads.websocket.WsEvent
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class DronePosition(
    val lat: Double,
    val lon: Double,
    val heading: Double,
    val altAGL: Double,
    val batteryPct: Double,
    val speedKmh: Double,
    val uin: String,
    val ts: Long
)

data class ViolationAlert(
    val type: String,
    val lat: Double,
    val lon: Double,
    val ts: Long,
    val dismissed: Boolean = false
)

class LiveTrackViewModel(
    private val wsClient: JadsWebSocketClient
) : ViewModel() {

    private val _position = MutableStateFlow<DronePosition?>(null)
    val position: StateFlow<DronePosition?> = _position

    private val _violations = MutableStateFlow<List<ViolationAlert>>(emptyList())
    val violations: StateFlow<List<ViolationAlert>> = _violations

    private val _connectionStatus = MutableStateFlow("CONNECTING")
    val connectionStatus: StateFlow<String> = _connectionStatus

    val trackHistory = mutableListOf<DronePosition>()

    init {
        wsClient.connect()
        viewModelScope.launch {
            wsClient.events.collect { event ->
                when (event) {
                    is WsEvent.Connected -> _connectionStatus.value = "LIVE"
                    is WsEvent.Disconnected -> _connectionStatus.value = "RECONNECTING"
                    is WsEvent.TelemetryPoint -> {
                        val p = DronePosition(
                            lat = event.data.lat,
                            lon = event.data.lon,
                            heading = event.data.headingDeg,
                            altAGL = event.data.altAGL,
                            batteryPct = event.data.batteryPct,
                            speedKmh = event.data.speedKmh,
                            uin = event.data.uin,
                            ts = event.data.ts
                        )
                        _position.value = p
                        trackHistory.add(p)
                        if (trackHistory.size > 500) trackHistory.removeAt(0)
                    }
                    is WsEvent.GeofenceViolation -> {
                        val v = ViolationAlert(event.violationType, event.lat, event.lon, event.ts)
                        _violations.value = _violations.value + v
                    }
                    is WsEvent.BatteryCritical -> {
                        val v = ViolationAlert("BATTERY_CRITICAL", event.data.lat, event.data.lon, event.data.ts)
                        _violations.value = _violations.value + v
                    }
                }
            }
        }
    }

    fun dismissViolation(index: Int) {
        _violations.value = _violations.value.mapIndexed { i, v ->
            if (i == index) v.copy(dismissed = true) else v
        }
    }

    override fun onCleared() {
        wsClient.disconnect()
        super.onCleared()
    }
}

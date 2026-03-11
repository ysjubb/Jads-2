// T06 — Android WebSocket client for live telemetry viewing
package com.jads.websocket

import com.jads.telemetry.TelemetryPointDto
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import okhttp3.*

sealed class WsEvent {
    data class TelemetryPoint(val data: TelemetryPointDto) : WsEvent()
    data class GeofenceViolation(val violationType: String, val lat: Double, val lon: Double, val ts: Long) : WsEvent()
    data class BatteryCritical(val data: TelemetryPointDto) : WsEvent()
    object Connected : WsEvent()
    object Disconnected : WsEvent()
}

class JadsWebSocketClient(
    private val wsUrl: String,
    private val token: String,
    private val missionIds: List<String>
) {
    private val _events = MutableSharedFlow<WsEvent>(replay = 0, extraBufferCapacity = 64)
    val events: SharedFlow<WsEvent> = _events

    private val client = OkHttpClient()
    private var ws: WebSocket? = null
    private var retryDelay = 1000L

    fun connect() {
        val url = "$wsUrl/ws/missions?token=$token&subscribe=${missionIds.joinToString(",")}"
        val req = Request.Builder().url(url).build()

        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                retryDelay = 1000L
                _events.tryEmit(WsEvent.Connected)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                parseAndEmit(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _events.tryEmit(WsEvent.Disconnected)
                reconnectAfterDelay()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _events.tryEmit(WsEvent.Disconnected)
            }
        })
    }

    private fun parseAndEmit(text: String) {
        try {
            val obj = Json.parseToJsonElement(text).jsonObject
            val type = obj["type"].toString().trim('"')

            when (type) {
                "TELEMETRY_POINT" -> {
                    val data = Json.decodeFromJsonElement(
                        TelemetryPointDto.serializer(),
                        obj["data"]!!
                    )
                    _events.tryEmit(WsEvent.TelemetryPoint(data))
                }
                "GEOFENCE_VIOLATION" -> {
                    val dataObj = obj["data"]!!.jsonObject
                    val point = Json.decodeFromJsonElement(
                        TelemetryPointDto.serializer(),
                        dataObj["point"]!!
                    )
                    val vType = dataObj["violationType"].toString().trim('"')
                    _events.tryEmit(WsEvent.GeofenceViolation(vType, point.lat, point.lon, point.ts))
                }
                "BATTERY_CRITICAL" -> {
                    val data = Json.decodeFromJsonElement(
                        TelemetryPointDto.serializer(),
                        obj["data"]!!
                    )
                    _events.tryEmit(WsEvent.BatteryCritical(data))
                }
            }
        } catch (_: Exception) { /* ignore parse errors */ }
    }

    private fun reconnectAfterDelay() {
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            connect()
        }, retryDelay)
        retryDelay = minOf(retryDelay * 2, 30_000L)
    }

    fun disconnect() {
        ws?.close(1000, "User closed")
    }
}

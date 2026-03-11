// T04 — DJI MSDK v5 live telemetry bridge
// Reads position, heading, battery, satellite count at 2Hz from DJI KeyManager
// and enqueues points into TelemetryUploader for batch upload to backend.
package com.jads.telemetry

import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.KeyTools
import dji.v5.manager.KeyManager
import kotlinx.coroutines.*

class DjiTelemetryBridge(
    private val missionId: String,
    private val uin: String,
    private val uploader: TelemetryUploader
) {
    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    fun startStreaming() {
        job = scope.launch {
            while (isActive) {
                val point = readCurrentPosition()
                if (point != null) uploader.enqueue(point)
                delay(500) // 2 Hz
            }
        }
    }

    fun stopStreaming() {
        job?.cancel()
    }

    private fun readCurrentPosition(): TelemetryPointDto? {
        val km = KeyManager.getInstance()

        val loc = km.getValue(
            KeyTools.createKey(FlightControllerKey.KeyAircraftLocation3D)
        ) ?: return null

        val hdg = km.getValue(
            KeyTools.createKey(FlightControllerKey.KeyCompassHeading)
        ) ?: 0.0

        val bat = km.getValue(
            KeyTools.createKey(FlightControllerKey.KeyBatteryChargeRemainingInPercent)
        ) ?: 0

        val sat = km.getValue(
            KeyTools.createKey(FlightControllerKey.KeyGPSSatelliteCount)
        ) ?: 0

        return TelemetryPointDto(
            missionId      = missionId,
            uin            = uin,
            lat            = loc.latitude,
            lon            = loc.longitude,
            altAGL         = loc.altitude,
            altMSL         = loc.altitude,     // barometric correction TBD
            speedKmh       = 0.0,               // use velocity key if needed
            headingDeg     = hdg,
            batteryPct     = bat.toDouble(),
            satelliteCount = sat,
            source         = "DJI_MSDK",
            ts             = System.currentTimeMillis()
        )
    }
}

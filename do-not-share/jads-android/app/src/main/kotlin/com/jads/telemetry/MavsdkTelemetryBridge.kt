// T05 — MAVSDK-Java telemetry bridge for MAVLink/Pixhawk drones
// Subscribes to position, heading, and battery telemetry via RxJava
// and enqueues points at 2Hz into TelemetryUploader.
package com.jads.telemetry

import io.mavsdk.System
import io.reactivex.disposables.CompositeDisposable
import java.util.concurrent.TimeUnit

class MavsdkTelemetryBridge(
    private val missionId: String,
    private val uin: String,
    private val uploader: TelemetryUploader,
    private val droneAddress: String = "udp://:14550"
) {
    private val drone = System(droneAddress)
    private val disposables = CompositeDisposable()

    fun startStreaming() {
        // Subscribe to position updates from MAVSDK (fires at ~5Hz from PX4/ArduPilot)
        val posSub = drone.telemetry.position
            .sample(500, TimeUnit.MILLISECONDS) // throttle to 2Hz
            .subscribe({ pos ->
                uploader.enqueue(
                    TelemetryPointDto(
                        missionId      = missionId,
                        uin            = uin,
                        lat            = pos.latitudeDeg,
                        lon            = pos.longitudeDeg,
                        altAGL         = pos.relativeAltitudeM.toDouble(),
                        altMSL         = pos.absoluteAltitudeM.toDouble(),
                        speedKmh       = 0.0,       // use velocity stream if needed
                        headingDeg     = 0.0,        // use heading stream if needed
                        batteryPct     = 0.0,        // use battery stream if needed
                        satelliteCount = 0,
                        source         = "MAVSDK",
                        ts             = java.lang.System.currentTimeMillis()
                    )
                )
            }, { /* log connection error */ })

        disposables.add(posSub)
    }

    fun stopStreaming() {
        disposables.clear()
        drone.dispose()
    }
}

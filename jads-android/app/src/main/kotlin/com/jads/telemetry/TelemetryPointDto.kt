// T04 — Telemetry point data class for live streaming
package com.jads.telemetry

import kotlinx.serialization.Serializable

@Serializable
data class TelemetryPointDto(
    val missionId: String,
    val uin: String,
    val lat: Double,
    val lon: Double,
    val altAGL: Double,
    val altMSL: Double,
    val speedKmh: Double,
    val headingDeg: Double,
    val batteryPct: Double,
    val satelliteCount: Int,
    val source: String,
    val ts: Long
)

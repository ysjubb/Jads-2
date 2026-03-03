package com.jads.drone

import kotlin.math.*

// GNSS plausibility validator — detects spoofing and bad fixes.
// INVARIANT: Rejected readings are NOT dropped — they are still recorded with
// GPS_OK=0 in sensorHealthFlags. Preserving bad evidence is forensically required.
// A Warning means the record is kept; only REJECTED triggers the GPS_OK flag.

object GnssPlausibilityValidator {

    const val HDOP_MAX                = 2.0f
    const val MIN_SATELLITE_COUNT     = 6
    const val MAX_POSITION_JUMP_M     = 50.0    // Max believable jump at 1 Hz polling
    const val MAX_ALTITUDE_JUMP_M     = 10.0

    // Sensor health flag bits
    const val FLAG_GPS_OK             = 0x00000001  // bit 0: GPS valid
    const val FLAG_GNSS_WARNING       = 0x00000002  // bit 1: anomaly detected, evidence preserved

    data class GnssReading(
        val hdop:           Float,
        val satelliteCount: Int,
        val latDeg:         Double,
        val lonDeg:         Double,
        val altMeters:      Double
    )

    sealed class PlausibilityResult {
        object Valid                                              : PlausibilityResult()
        data class Warning(val code: String, val detail: String) : PlausibilityResult()
        data class Rejected(val code: String, val detail: String): PlausibilityResult()
    }

    fun validate(current: GnssReading, previous: GnssReading?): PlausibilityResult {
        // Hard rejections — fix is not usable
        if (current.hdop > HDOP_MAX) {
            return PlausibilityResult.Rejected(
                "HDOP_EXCEEDED",
                "HDOP=${current.hdop} > $HDOP_MAX — fix quality too low"
            )
        }
        if (current.satelliteCount < MIN_SATELLITE_COUNT) {
            return PlausibilityResult.Rejected(
                "INSUFFICIENT_SATS",
                "satelliteCount=${current.satelliteCount} < $MIN_SATELLITE_COUNT"
            )
        }

        // Warnings — fix is suspicious but evidence must be preserved
        if (previous != null) {
            val jumpM = haversineDistanceM(
                previous.latDeg, previous.lonDeg,
                current.latDeg,  current.lonDeg
            )
            if (jumpM > MAX_POSITION_JUMP_M) {
                return PlausibilityResult.Warning(
                    "POSITION_JUMP",
                    "jump=${jumpM.toInt()}m exceeds ${MAX_POSITION_JUMP_M.toInt()}m — possible spoofing"
                )
            }

            val altJumpM = abs(current.altMeters - previous.altMeters)
            if (altJumpM > MAX_ALTITUDE_JUMP_M) {
                return PlausibilityResult.Warning(
                    "ALTITUDE_JUMP",
                    "altJump=${altJumpM.toInt()}m exceeds ${MAX_ALTITUDE_JUMP_M.toInt()}m"
                )
            }
        }

        return PlausibilityResult.Valid
    }

    // Apply validation result to sensor health flags.
    // Called by MissionController to set the correct bits before serialization.
    fun applySensorFlags(result: PlausibilityResult, baseFlags: Int): Int {
        return when (result) {
            is PlausibilityResult.Valid   -> baseFlags or FLAG_GPS_OK
            is PlausibilityResult.Warning -> baseFlags or FLAG_GPS_OK or FLAG_GNSS_WARNING
            is PlausibilityResult.Rejected -> baseFlags and FLAG_GPS_OK.inv()  // GPS_OK = 0
        }
    }

    private fun haversineDistanceM(lat1: Double, lon1: Double,
                                    lat2: Double, lon2: Double): Double {
        val R    = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a    = sin(dLat / 2).pow(2) +
                   cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return R * 2 * asin(sqrt(a))
    }
}

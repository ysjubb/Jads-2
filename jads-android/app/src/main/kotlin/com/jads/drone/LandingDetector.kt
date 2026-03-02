package com.jads.drone

// Landing is confirmed when CONSECUTIVE_REQUIRED consecutive sensor records
// ALL satisfy BOTH conditions:
//   1. altitudeCm < altThresholdCm   (drone is near ground)
//   2. velocity magnitude < velocityThresholdMms  (drone is stationary)
//
// A single non-qualifying record resets the counter to zero.
// The 10-record requirement prevents false positives from momentary hover near ground.

class LandingDetector(
    private val consecutiveRequired:  Int  = 10,
    private val altThresholdCm:       Long = 50L,    // < 50 cm above ground
    private val velocityThresholdMms: Long = 100L    // < 100 mm/s total speed
) {
    private var consecutiveCount = 0

    var landed: Boolean = false
        private set

    data class SensorSnapshot(
        val altitudeCm:       Long,
        val velocityNorthMms: Long,
        val velocityEastMms:  Long,
        val velocityDownMms:  Long
    )

    // Returns true if landing is now confirmed.
    fun processSample(sample: SensorSnapshot): Boolean {
        if (landed) return true

        val velocityMagnitude = Math.sqrt(
            (sample.velocityNorthMms * sample.velocityNorthMms +
             sample.velocityEastMms  * sample.velocityEastMms  +
             sample.velocityDownMms  * sample.velocityDownMms).toDouble()
        ).toLong()

        val qualifies = sample.altitudeCm < altThresholdCm &&
                        velocityMagnitude < velocityThresholdMms

        consecutiveCount = if (qualifies) consecutiveCount + 1 else 0
        landed           = consecutiveCount >= consecutiveRequired
        return landed
    }

    fun reset() {
        consecutiveCount = 0
        landed           = false
    }
}

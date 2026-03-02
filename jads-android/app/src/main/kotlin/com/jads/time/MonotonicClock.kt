package com.jads.time

import java.util.concurrent.atomic.AtomicLong

// Monotonic clock that applies NTP correction and prevents timestamp inversions.
//
// INVARIANT: Never return System.currentTimeMillis() directly in mission record path.
// Always route through nextTimestamp() which applies the NTP correction.
//
// Anti-regression: When NTP resyncs apply a large negative offset (rare but real),
// corrected time can be less than the last issued timestamp.
// Enforce: corrected = max(corrected, lastIssued + 1)
// This preserves monotonicity and prevents sequence-number corruption.

class MonotonicClock(private var ntpCorrectionMs: Long = 0L) {

    private val lastIssuedMs = AtomicLong(Long.MIN_VALUE)

    // Called after each NTP sync to update the correction offset
    fun updateCorrection(newCorrectionMs: Long) {
        ntpCorrectionMs = newCorrectionMs
    }

    // Returns NTP-corrected, monotonically increasing timestamp.
    // Never returns System.currentTimeMillis() directly.
    fun nextTimestamp(): Long {
        val corrected = System.currentTimeMillis() + ntpCorrectionMs
        return lastIssuedMs.updateAndGet { last ->
            // Enforce monotonic: corrected must always exceed the last issued
            if (corrected > last) corrected else last + 1
        }
    }
}

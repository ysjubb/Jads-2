package com.jads.telemetry

import com.jads.crypto.HashChainEngine

/**
 * Holds state for one active drone mission.
 * Tracks the hash chain cursor and record sequence counter.
 */
class MissionSession(
    val missionId: Long,
    val signingProvider: Any
) {
    var recordSequence: Long = 0L
    var previousHash: ByteArray = HashChainEngine.computeHash0(missionId)
    val startedAtMs: Long = System.currentTimeMillis()
    var isActive: Boolean = true

    fun close() {
        isActive = false
    }
}

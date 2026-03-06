package com.jads.telemetry

import com.jads.crypto.HashChainEngine

/**
 * In-memory store for the current session's forensic frames.
 * SQLCipher persistence is a Phase 2 integration — this provides
 * the interface that SQLCipher will replace.
 */
class ForensicFrameStore {

    private val frames = mutableListOf<ForensicFrame>()

    fun append(frame: ForensicFrame) {
        frames.add(frame)
    }

    fun getAll(): List<ForensicFrame> = frames.toList()

    fun getBySequence(seq: Long): ForensicFrame? =
        frames.find { it.recordSequence == seq }

    fun count(): Int = frames.size

    fun clear() {
        frames.clear()
    }

    fun toExportList(): List<Map<String, Any>> =
        frames.map { frame ->
            mapOf(
                "recordSequence"  to frame.recordSequence,
                "canonical96Hex"  to HashChainEngine.toHex(frame.canonical96),
                "currentHashHex"  to HashChainEngine.toHex(frame.currentHash),
                "signatureHex"    to HashChainEngine.toHex(frame.signatureBytes),
                "timestampUtcMs"  to frame.timestampUtcMs
            )
        }
}

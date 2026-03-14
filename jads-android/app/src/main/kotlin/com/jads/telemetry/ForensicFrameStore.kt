package com.jads.telemetry

import com.jads.crypto.HashChainEngine
import com.jads.storage.SqlCipherMissionStore

/**
 * Write-through forensic frame store.
 *
 * Primary storage is SQLCipher via [SqlCipherMissionStore] — survives
 * Android service kills and process death. The in-memory list is a
 * read-through cache for fast iteration during active flight.
 *
 * On service restart, call [restoreFromDb] to reload frames from SQLCipher
 * before resuming telemetry recording.
 *
 * If no [SqlCipherMissionStore] is provided (unit-test mode), falls back to
 * pure in-memory storage — identical to the pre-fix behaviour.
 */
class ForensicFrameStore(
    private val sqlStore: SqlCipherMissionStore? = null,
    private val missionDbId: Long = 0L,
    private val missionId: Long = 0L
) {

    private val frames = mutableListOf<ForensicFrame>()

    /**
     * Append a frame — writes to SQLCipher first, then adds to in-memory cache.
     * If SQLCipher write fails, the frame is still added to the in-memory cache
     * so the hash chain is not broken during the current session, but a warning
     * is logged. The frame will be lost if the service is killed before upload.
     */
    fun append(frame: ForensicFrame) {
        // Write-through to SQLCipher
        sqlStore?.let { store ->
            try {
                store.saveRecord(
                    missionDbId     = missionDbId,
                    missionId       = missionId,
                    sequence        = frame.recordSequence,
                    canonicalHex    = HashChainEngine.toHex(frame.canonical96),
                    signatureHex    = HashChainEngine.toHex(frame.signatureBytes),
                    hashHex         = HashChainEngine.toHex(frame.currentHash),
                    prevHashHex     = if (frame.recordSequence == 0L) "0".repeat(64)
                                     else frames.lastOrNull()?.let {
                                         HashChainEngine.toHex(it.currentHash)
                                     } ?: "0".repeat(64),
                    timestampMs     = frame.timestampUtcMs
                )
            } catch (e: Exception) {
                // Log but do not crash — mission continues in-memory.
                // The upload step will detect the gap via chain verification.
                android.util.Log.e("ForensicFrameStore",
                    "SQLCipher write failed for seq=${frame.recordSequence}: ${e.message}")
            }
        }
        frames.add(frame)
    }

    fun getAll(): List<ForensicFrame> = frames.toList()

    fun getBySequence(seq: Long): ForensicFrame? =
        frames.find { it.recordSequence == seq }

    fun count(): Int = frames.size

    fun clear() {
        frames.clear()
    }

    /**
     * Restore frames from SQLCipher after a service restart.
     * Populates the in-memory cache from the durable store.
     * Returns the number of frames restored.
     */
    fun restoreFromDb(): Int {
        val store = sqlStore ?: return 0
        val records = store.getRecords(missionDbId)
        frames.clear()
        for (rec in records) {
            frames.add(
                ForensicFrame(
                    recordSequence  = rec.sequence,
                    canonical96     = HashChainEngine.fromHex(rec.canonicalHex),
                    currentHash     = HashChainEngine.fromHex(rec.recordHashHex),
                    signatureBytes  = HashChainEngine.fromHex(rec.signatureHex),
                    timestampUtcMs  = rec.timestampUtcMs
                )
            )
        }
        return frames.size
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

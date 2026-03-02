package com.jads.crypto

import com.jads.telemetry.CanonicalSerializer
import com.jads.telemetry.EndianWriter
import java.security.MessageDigest

// Hash chain for drone telemetry forensic linking.
//
// HASH_0 = SHA256("MISSION_INIT" || missionId_uint64_BE)
//   - "MISSION_INIT" is exactly 12 ASCII bytes
//   - missionId is 8 bytes big-endian
//   - Total input: 20 bytes
//
// HASH_n = SHA256(canonical_96_bytes || HASH_(n-1))
//   - canonical_96_bytes: 96 bytes
//   - HASH_(n-1): 32 bytes
//   - Total input: 128 bytes
//
// Cross-runtime invariant: TypeScript backend must produce identical hashes.
// Any divergence means either the prefix string or endianness is wrong.

object HashChainEngine {

    private const val HASH_0_PREFIX = "MISSION_INIT"
    private val HASH_0_PREFIX_BYTES: ByteArray

    init {
        HASH_0_PREFIX_BYTES = HASH_0_PREFIX.toByteArray(Charsets.US_ASCII)
        // Runtime assertion — if someone edits the string above, this catches it immediately
        check(HASH_0_PREFIX_BYTES.size == 12) {
            "INVARIANT VIOLATION: MISSION_INIT prefix must be exactly 12 ASCII bytes, " +
            "got ${HASH_0_PREFIX_BYTES.size}"
        }
    }

    // HASH_0 = SHA256("MISSION_INIT" [12 bytes] || missionId [8 bytes BE])
    fun computeHash0(missionId: Long): ByteArray {
        val input = ByteArray(20)
        System.arraycopy(HASH_0_PREFIX_BYTES, 0, input, 0, 12)
        EndianWriter.writeUint64Be(input, 12, missionId)
        return sha256(input)
    }

    // HASH_n = SHA256(canonical96 [96 bytes] || previousHash [32 bytes])
    fun computeHashN(canonical96: ByteArray, previousHash: ByteArray): ByteArray {
        require(canonical96.size == CanonicalSerializer.PAYLOAD_SIZE) {
            "canonical96 must be ${CanonicalSerializer.PAYLOAD_SIZE} bytes, got ${canonical96.size}"
        }
        require(previousHash.size == 32) { "previousHash must be 32 bytes, got ${previousHash.size}" }

        val input = ByteArray(128)
        System.arraycopy(canonical96, 0, input, 0, 96)
        System.arraycopy(previousHash, 0, input, 96, 32)
        return sha256(input)
    }

    fun sha256(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(data)

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    fun fromHex(hex: String): ByteArray = ByteArray(hex.length / 2) {
        hex.substring(it * 2, it * 2 + 2).toInt(16).toByte()
    }
}

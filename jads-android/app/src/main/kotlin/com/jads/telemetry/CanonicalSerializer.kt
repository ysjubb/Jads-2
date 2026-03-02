package com.jads.telemetry

import java.util.zip.CRC32

// Frozen canonical payload layout — must never change without versioning:
//   00-07: mission_id             (uint64 BE)
//   08-15: record_sequence        (uint64 BE)
//   16-23: timestamp_utc_ms       (uint64 BE)
//   24-31: latitude_microdeg      (uint64 BE, signed as Long)
//   32-39: longitude_microdeg     (uint64 BE, signed as Long)
//   40-47: altitude_cm            (uint64 BE, signed as Long)
//   48-55: velocity_north_mms     (uint64 BE, signed as Long)
//   56-63: velocity_east_mms      (uint64 BE, signed as Long)
//   64-71: velocity_down_mms      (uint64 BE, signed as Long)
//   72-79: prev_hash_prefix       (8 raw bytes)
//   80-83: flight_state_flags     (uint32 BE)
//   84-87: sensor_health_flags    (uint32 BE)
//   88-91: reserved_zero          (must be 0x00000000)
//   92-95: crc32_self             (CRC32 of bytes 00-91, unsigned)
//
// Cross-runtime invariant: TypeScript and Kotlin MUST produce identical bytes.
// Test: serialize with same input in both runtimes → hex must match.

data class TelemetryFields(
    val missionId:         Long,
    val recordSequence:    Long,
    val timestampUtcMs:    Long,
    val latitudeMicrodeg:  Long,   // lat × 1_000_000 as Long
    val longitudeMicrodeg: Long,   // lon × 1_000_000 as Long
    val altitudeCm:        Long,   // signed centimetres
    val velocityNorthMms:  Long,
    val velocityEastMms:   Long,
    val velocityDownMms:   Long,
    val prevHashPrefix:    ByteArray,  // exactly 8 bytes
    val flightStateFlags:  Int,
    val sensorHealthFlags: Int
) {
    init {
        require(prevHashPrefix.size == 8) {
            "prevHashPrefix must be exactly 8 bytes, got ${prevHashPrefix.size}"
        }
    }
}

object CanonicalSerializer {

    const val PAYLOAD_SIZE = 96

    // CRC32 is not thread-safe — create per call
    fun serialize(fields: TelemetryFields): ByteArray {
        val out = ByteArray(PAYLOAD_SIZE)

        EndianWriter.writeUint64Be(out, 0,  fields.missionId)
        EndianWriter.writeUint64Be(out, 8,  fields.recordSequence)
        EndianWriter.writeUint64Be(out, 16, fields.timestampUtcMs)
        EndianWriter.writeUint64Be(out, 24, fields.latitudeMicrodeg)
        EndianWriter.writeUint64Be(out, 32, fields.longitudeMicrodeg)
        EndianWriter.writeUint64Be(out, 40, fields.altitudeCm)
        EndianWriter.writeUint64Be(out, 48, fields.velocityNorthMms)
        EndianWriter.writeUint64Be(out, 56, fields.velocityEastMms)
        EndianWriter.writeUint64Be(out, 64, fields.velocityDownMms)

        System.arraycopy(fields.prevHashPrefix, 0, out, 72, 8)

        EndianWriter.writeUint32Be(out, 80, fields.flightStateFlags)
        EndianWriter.writeUint32Be(out, 84, fields.sensorHealthFlags)
        EndianWriter.writeUint32Be(out, 88, 0x00000000)  // reserved — MUST be zero

        val crc = computeCrc32(out, 0, 92)
        EndianWriter.writeUint32Be(out, 92, crc)

        check(out.size == PAYLOAD_SIZE) {
            "INVARIANT VIOLATION: canonical payload is ${out.size} bytes, expected $PAYLOAD_SIZE"
        }

        return out
    }

    fun deserialize(bytes: ByteArray): TelemetryFields {
        require(bytes.size == PAYLOAD_SIZE) { "Expected $PAYLOAD_SIZE bytes, got ${bytes.size}" }

        // Verify CRC32 first
        val storedCrc   = EndianWriter.readUint32Be(bytes, 92)
        val computedCrc = computeCrc32(bytes, 0, 92)
        require(storedCrc == computedCrc) {
            "CRC32 mismatch: stored=0x${storedCrc.toString(16)}, computed=0x${computedCrc.toString(16)}"
        }

        // Verify reserved bytes
        val reserved = EndianWriter.readUint32Be(bytes, 88)
        require(reserved == 0) { "Reserved bytes must be 0x00000000, got 0x${reserved.toString(16)}" }

        val prevHashPrefix = ByteArray(8)
        System.arraycopy(bytes, 72, prevHashPrefix, 0, 8)

        return TelemetryFields(
            missionId         = EndianWriter.readUint64Be(bytes, 0),
            recordSequence    = EndianWriter.readUint64Be(bytes, 8),
            timestampUtcMs    = EndianWriter.readUint64Be(bytes, 16),
            latitudeMicrodeg  = EndianWriter.readUint64Be(bytes, 24),
            longitudeMicrodeg = EndianWriter.readUint64Be(bytes, 32),
            altitudeCm        = EndianWriter.readUint64Be(bytes, 40),
            velocityNorthMms  = EndianWriter.readUint64Be(bytes, 48),
            velocityEastMms   = EndianWriter.readUint64Be(bytes, 56),
            velocityDownMms   = EndianWriter.readUint64Be(bytes, 64),
            prevHashPrefix    = prevHashPrefix,
            flightStateFlags  = EndianWriter.readUint32Be(bytes, 80),
            sensorHealthFlags = EndianWriter.readUint32Be(bytes, 84)
        )
    }

    private fun computeCrc32(data: ByteArray, offset: Int, length: Int): Int {
        val crc = CRC32()
        crc.update(data, offset, length)
        return crc.value.toInt()
    }

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    fun fromHex(hex: String): ByteArray = ByteArray(hex.length / 2) {
        hex.substring(it * 2, it * 2 + 2).toInt(16).toByte()
    }
}

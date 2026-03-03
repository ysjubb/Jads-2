// Backend counterpart to Android's CanonicalSerializer + EndianWriter.
// Used by ForensicVerifier and MissionService for CRC32 verification.
//
// FROZEN LAYOUT — 96 bytes, big-endian, matches Android byte-for-byte:
//   00-07: mission_id             (int64 BE)
//   08-15: record_sequence        (int64 BE)
//   16-23: timestamp_utc_ms       (int64 BE)
//   24-31: latitude_microdeg      (int64 BE)
//   32-39: longitude_microdeg     (int64 BE)
//   40-47: altitude_cm            (int64 BE)
//   48-55: velocity_north_mms     (int64 BE)
//   56-63: velocity_east_mms      (int64 BE)
//   64-71: velocity_down_mms      (int64 BE)
//   72-79: prev_hash_prefix       (8 raw bytes)
//   80-83: flight_state_flags     (uint32 BE)
//   84-87: sensor_health_flags    (uint32 BE)
//   88-91: reserved_zero          (must be 0x00000000)
//   92-95: crc32_self             (CRC32 of bytes 00-91, unsigned uint32 BE)
//
// CRITICAL: CRC32 must use (>>> 0) unsigned conversion.
// JS CRC32 libs return signed int32. Without >>> 0, values > 0x7FFFFFFF are
// negative and produce different bytes than Kotlin's unsigned CRC32.

import CRC32 from 'crc-32'

export const PAYLOAD_SIZE = 96

export interface TelemetryFields {
  missionId:         bigint
  recordSequence:    bigint
  timestampUtcMs:    bigint
  latitudeMicrodeg:  bigint
  longitudeMicrodeg: bigint
  altitudeCm:        bigint
  velocityNorthMms:  bigint
  velocityEastMms:   bigint
  velocityDownMms:   bigint
  prevHashPrefix:    Buffer   // exactly 8 bytes
  flightStateFlags:  number
  sensorHealthFlags: number
}

export function serialize(fields: TelemetryFields): Buffer {
  if (fields.prevHashPrefix.length !== 8) {
    throw new Error(`prevHashPrefix must be 8 bytes, got ${fields.prevHashPrefix.length}`)
  }

  const out = Buffer.alloc(PAYLOAD_SIZE)

  out.writeBigInt64BE(fields.missionId,         0)
  out.writeBigInt64BE(fields.recordSequence,     8)
  out.writeBigInt64BE(fields.timestampUtcMs,    16)
  out.writeBigInt64BE(fields.latitudeMicrodeg,  24)
  out.writeBigInt64BE(fields.longitudeMicrodeg, 32)
  out.writeBigInt64BE(fields.altitudeCm,        40)
  out.writeBigInt64BE(fields.velocityNorthMms,  48)
  out.writeBigInt64BE(fields.velocityEastMms,   56)
  out.writeBigInt64BE(fields.velocityDownMms,   64)
  fields.prevHashPrefix.copy(out, 72)
  out.writeUInt32BE(fields.flightStateFlags,  80)
  out.writeUInt32BE(fields.sensorHealthFlags, 84)
  out.writeUInt32BE(0x00000000,               88)  // reserved — MUST be zero

  // CRITICAL: >>> 0 converts signed int32 → unsigned uint32
  const crc = (CRC32.buf(out.slice(0, 92)) >>> 0)
  out.writeUInt32BE(crc, 92)

  if (out.length !== PAYLOAD_SIZE) {
    throw new Error(`INVARIANT VIOLATION: payload is ${out.length} bytes, expected ${PAYLOAD_SIZE}`)
  }

  return out
}

export function deserialize(bytes: Buffer): TelemetryFields {
  if (bytes.length !== PAYLOAD_SIZE) {
    throw new Error(`Expected ${PAYLOAD_SIZE} bytes, got ${bytes.length}`)
  }

  // Verify CRC32 first
  const storedCrc   = bytes.readUInt32BE(92)
  const computedCrc = (CRC32.buf(bytes.slice(0, 92)) >>> 0)
  if (storedCrc !== computedCrc) {
    throw new Error(`CRC32 mismatch: stored=0x${storedCrc.toString(16)}, computed=0x${computedCrc.toString(16)}`)
  }

  // Verify reserved bytes
  const reserved = bytes.readUInt32BE(88)
  if (reserved !== 0) {
    throw new Error(`Reserved bytes must be 0x00000000, got 0x${reserved.toString(16)}`)
  }

  return {
    missionId:         bytes.readBigInt64BE(0),
    recordSequence:    bytes.readBigInt64BE(8),
    timestampUtcMs:    bytes.readBigInt64BE(16),
    latitudeMicrodeg:  bytes.readBigInt64BE(24),
    longitudeMicrodeg: bytes.readBigInt64BE(32),
    altitudeCm:        bytes.readBigInt64BE(40),
    velocityNorthMms:  bytes.readBigInt64BE(48),
    velocityEastMms:   bytes.readBigInt64BE(56),
    velocityDownMms:   bytes.readBigInt64BE(64),
    prevHashPrefix:    bytes.slice(72, 80),
    flightStateFlags:  bytes.readUInt32BE(80),
    sensorHealthFlags: bytes.readUInt32BE(84),
  }
}

// Verify a 96-byte canonical payload's CRC32.
export function verifyCrc32(canonicalHex: string): {
  valid: boolean; storedCrc: number; computedCrc: number
} {
  const buf = Buffer.from(canonicalHex, 'hex')
  if (buf.length !== PAYLOAD_SIZE) {
    return { valid: false, storedCrc: 0, computedCrc: 0 }
  }
  const storedCrc   = buf.readUInt32BE(92)
  const computedCrc = (CRC32.buf(buf.slice(0, 92)) >>> 0)
  return { valid: storedCrc === computedCrc, storedCrc, computedCrc }
}

// Check reserved bytes (88-91) are zero.
export function reservedBytesZero(canonicalHex: string): boolean {
  const buf = Buffer.from(canonicalHex, 'hex')
  if (buf.length !== PAYLOAD_SIZE) return false
  return buf.readUInt32BE(88) === 0
}

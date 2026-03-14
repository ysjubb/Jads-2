package com.jads.telemetry

import com.jads.crypto.HashChainEngine

data class ForensicFrame(
    val recordSequence: Long,
    val canonical96:    ByteArray,
    val currentHash:    ByteArray,   // 32 bytes
    val signatureBytes: ByteArray,   // DER ECDSA or ML-DSA-65
    val timestampUtcMs: Long
)

class TelemetryRecorder(private val session: MissionSession) {

    fun recordFrame(
        timestampUtcMs:    Long,
        latitudeMicrodeg:  Long,
        longitudeMicrodeg: Long,
        altitudeCm:        Long,
        velocityNorthMms:  Long,
        velocityEastMms:   Long,
        velocityDownMms:   Long,
        flightStateFlags:  Int,
        sensorHealthFlags: Int,
        sign: (hash32: ByteArray) -> ByteArray
    ): ForensicFrame {
        check(session.isActive) { "MISSION_CLOSED" }

        session.recordSequence++

        val fields = TelemetryFields(
            missionId         = session.missionId,
            recordSequence    = session.recordSequence,
            timestampUtcMs    = timestampUtcMs,
            latitudeMicrodeg  = latitudeMicrodeg,
            longitudeMicrodeg = longitudeMicrodeg,
            altitudeCm        = altitudeCm,
            velocityNorthMms  = velocityNorthMms,
            velocityEastMms   = velocityEastMms,
            velocityDownMms   = velocityDownMms,
            prevHashPrefix    = session.previousHash.copyOfRange(0, 8),
            flightStateFlags  = flightStateFlags,
            sensorHealthFlags = sensorHealthFlags
        )

        val canonical96   = CanonicalSerializer.serialize(fields)
        val currentHash   = HashChainEngine.computeHashN(canonical96, session.previousHash)
        val payloadHash32 = HashChainEngine.sha256(canonical96)
        val signatureBytes = sign(payloadHash32)

        session.previousHash = currentHash

        return ForensicFrame(
            recordSequence  = session.recordSequence,
            canonical96     = canonical96,
            currentHash     = currentHash,
            signatureBytes  = signatureBytes,
            timestampUtcMs  = timestampUtcMs
        )
    }
}

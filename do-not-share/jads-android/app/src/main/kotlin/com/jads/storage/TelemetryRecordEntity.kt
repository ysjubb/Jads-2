package com.jads.storage

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "telemetry_records",
    foreignKeys = [
        ForeignKey(
            entity      = MissionEntity::class,
            parentColumns = ["id"],
            childColumns  = ["missionDbId"],
            // RESTRICT: never silently delete flight data on cascade.
            // Explicit delete required — protects forensic chain.
            onDelete    = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["missionDbId"]),
        Index(value = ["missionId", "sequence"], unique = true)
    ]
)
data class TelemetryRecordEntity(
    @PrimaryKey(autoGenerate = true)
    val id:             Long = 0,

    val missionDbId:    Long,
    val missionId:      Long,
    val sequence:       Long,

    val canonicalHex:   String,   // 96-byte payload as hex (192 chars)
    val signatureHex:   String,   // DER-encoded ECDSA signature as hex
    val recordHashHex:  String,   // HASH_n = SHA256(canonical || HASH_(n-1))
    val prevHashHex:    String,   // HASH_(n-1) for chain link verification

    val timestampUtcMs: Long      // NTP-corrected, monotonic
)

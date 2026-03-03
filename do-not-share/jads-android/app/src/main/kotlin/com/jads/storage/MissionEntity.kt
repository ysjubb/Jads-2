package com.jads.storage

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "missions",
    indices = [
        Index(value = ["idempotencyKey"], unique = true),
        Index(value = ["missionId"])
    ]
)
data class MissionEntity(
    @PrimaryKey(autoGenerate = true)
    val id:                     Long = 0,

    val missionId:              Long,
    val state:                  String,              // ACTIVE, COMPLETED, ABORTED, UPLOADING

    val npntClassification:     String,              // RED, YELLOW, GREEN
    val npntPermissionToken:    String?,

    val deviceCertHash:         String,
    val rootHashHex:            String,
    val recordCount:            Long,

    val missionStartUtcMs:      Long,
    val missionEndUtcMs:        Long?,               // null until finalized

    val ntpEvidenceJson:        String,              // JSON blob of TimeAuthorityEvidence

    // Populated at finalization — null during active mission.
    // Stored here so ForensicVerifier can verify against CRL state AT mission time,
    // never requiring a live network call years later.
    val archivedCrlBase64:      String?,

    val idempotencyKey:         String,              // Unique per device+session, prevents replay

    // Android Keystore / hardware security attestation — recorded at mission start.
    // null means device did not report (older hardware, non-GMS build).
    val strongboxBacked:        Boolean? = null,     // Key material in dedicated HSM (Strongbox)
    val secureBootVerified:     Boolean? = null,     // Bootloader chain verified by attestation
    val androidVersion:         Int?    = null,      // android.os.Build.VERSION.SDK_INT at upload

    val uploadedAt:             Long?   = null,      // null until successfully uploaded to backend
    val localIntegrityCheckOk:  Boolean = false      // set true before upload attempt
)

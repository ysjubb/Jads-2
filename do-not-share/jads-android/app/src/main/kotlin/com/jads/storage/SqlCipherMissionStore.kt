package com.jads.storage

// SQLCipher-backed mission store. All writes go through JadsDatabase DAOs.
//
// CRITICAL: resumeMission() reads lastStoredSequence from SQLCipher and
// continues from (lastStoredSequence + 1). NEVER restart from 0.
// A gap in sequence is detectable and triggers chain verification failure.
// A silent restart from 0 on resume is catastrophic — the hash chain breaks.

/**
 * Thrown when SQLCipher reports a decryption failure or schema mismatch.
 * This is distinct from an empty result set — callers MUST NOT treat this as "no records".
 * A resumeMission() call that catches this error must halt, not restart the hash chain.
 */
class MissionStoreDecryptionError(message: String) : Exception(message)

class SqlCipherMissionStore(private val db: JadsDatabase) {

    // Create a new mission record (called at mission start)
    fun createMission(
        missionId:           Long,
        npntClassification:  String,
        npntPermissionToken: String?,
        deviceCertHash:      String,
        rootHashHex:         String,
        ntpEvidenceJson:     String,
        idempotencyKey:      String,
        startUtcMs:          Long,
        // Hardware attestation — nullable; older devices may not report these
        strongboxBacked:     Boolean?  = null,
        secureBootVerified:  Boolean?  = null,
        androidVersion:      Int?      = null,
        // Drone category fields (DGCA UAS Rules 2021)
        droneWeightCategory: String?   = null,
        droneWeightGrams:    Int?      = null,
        droneManufacturer:   String?   = null,
        droneSerialNumber:   String?   = null,
        nanoAckNumber:       String?   = null,
        uinNumber:           String?   = null
    ): Long {
        val entity = MissionEntity(
            missionId           = missionId,
            state               = "ACTIVE",
            npntClassification  = npntClassification,
            npntPermissionToken = npntPermissionToken,
            deviceCertHash      = deviceCertHash,
            rootHashHex         = rootHashHex,
            recordCount         = 0L,
            missionStartUtcMs   = startUtcMs,
            missionEndUtcMs     = null,
            ntpEvidenceJson     = ntpEvidenceJson,
            archivedCrlBase64   = null,
            idempotencyKey      = idempotencyKey,
            strongboxBacked     = strongboxBacked,
            secureBootVerified  = secureBootVerified,
            androidVersion      = androidVersion,
            droneWeightCategory = droneWeightCategory,
            droneWeightGrams    = droneWeightGrams,
            droneManufacturer   = droneManufacturer,
            droneSerialNumber   = droneSerialNumber,
            nanoAckNumber       = nanoAckNumber,
            uinNumber           = uinNumber
        )
        return db.missionDao().insert(entity)
    }

    // Save a single telemetry record
    fun saveRecord(
        missionDbId:  Long,
        missionId:    Long,
        sequence:     Long,
        canonicalHex: String,
        signatureHex: String,
        hashHex:      String,
        prevHashHex:  String,
        timestampMs:  Long
    ) {
        db.telemetryRecordDao().insert(
            TelemetryRecordEntity(
                missionDbId    = missionDbId,
                missionId      = missionId,
                sequence       = sequence,
                canonicalHex   = canonicalHex,
                signatureHex   = signatureHex,
                recordHashHex  = hashHex,
                prevHashHex    = prevHashHex,
                timestampUtcMs = timestampMs
            )
        )
    }

    // Save a detected violation
    fun saveViolation(
        missionDbId:       Long,
        missionId:         Long,
        sequence:          Long,
        violationType:     String,
        severity:          String,
        timestampMs:       Long,
        latMicrodeg:       Long,
        lonMicrodeg:       Long,
        altCm:             Long,
        detailJson:        String
    ) {
        db.violationDao().insert(
            ViolationEntity(
                missionDbId       = missionDbId,
                missionId         = missionId,
                sequence          = sequence,
                violationType     = violationType,
                severity          = severity,
                timestampUtcMs    = timestampMs,
                latitudeMicrodeg  = latMicrodeg,
                longitudeMicrodeg = lonMicrodeg,
                altitudeCm        = altCm,
                detailJson        = detailJson
            )
        )
    }

    // Used by resumeMission() — returns last stored sequence for this mission.
    // CRITICAL: caller must resume from (result + 1), never from 0.
    fun getLastSequence(missionId: Long): Long {
        val mission = db.missionDao().getByMissionId(missionId)
            ?: return -1L   // -1 means no records; first sequence is 0
        return db.telemetryRecordDao().getLastSequence(mission.id) ?: -1L
    }

    // Called after landing + CRL revalidation
    fun finalizeMission(missionDbId: Long, archivedCrlBase64: String?, endUtcMs: Long) {
        db.missionDao().finalize(missionDbId, archivedCrlBase64, endUtcMs)
    }

    fun setIntegrityCheckResult(missionDbId: Long, ok: Boolean) {
        db.missionDao().setIntegrityCheck(missionDbId, ok)
    }

    // Returns missions that have completed locally but not yet uploaded to backend
    fun getPendingUploadMissions(): List<MissionEntity> =
        db.missionDao().getPendingUpload()

    fun markUploaded(missionDbId: Long) {
        db.missionDao().markUploaded(missionDbId, System.currentTimeMillis())
    }

    fun getMission(missionDbId: Long): MissionEntity? =
        db.missionDao().getById(missionDbId)

    // Look up a mission by missionId (timestamp-based Long, not the Room primary key)
    // Look up by missionId (timestamp Long) — NOT the Room primary key
    fun getMissionByMissionId(missionId: Long): MissionEntity? =
        db.missionDao().getByMissionId(missionId)

    /**
     * Returns all telemetry records for a mission, ordered by sequence.
     *
     * THROWS [MissionStoreDecryptionError] if the SQLCipher database cannot be decrypted.
     * This is DISTINCT from an empty list (which means the mission was interrupted at start).
     *
     * A caller who receives an empty list from a resumed mission must distinguish:
     *   - Empty because the mission had no records written yet (OK — restart from HASH_0)
     *   - Empty because decryption failed (CRITICAL — must NOT restart chain)
     *
     * The distinction is made by catching MissionStoreDecryptionError here rather than
     * allowing SQLCipher to silently return [] on a bad key.
     */
    @Throws(MissionStoreDecryptionError::class)
    fun getRecords(missionDbId: Long): List<TelemetryRecordEntity> {
        return try {
            db.telemetryRecordDao().getAllForMission(missionDbId)
        } catch (e: Exception) {
            // SQLCipher throws android.database.sqlite.SQLiteException with messages like:
            //   "file is not a database (code 26)"  — wrong key or corrupted DB
            //   "no such table: telemetry_records"  — wrong schema / not a JADS DB
            // Both indicate a decryption/access failure, NOT an empty result.
            val msg = e.message ?: ""
            if (msg.contains("not a database", ignoreCase = true) ||
                msg.contains("no such table", ignoreCase = true) ||
                msg.contains("SQLiteDatabaseCorruptException", ignoreCase = true)) {
                throw MissionStoreDecryptionError(
                    "SQLCipher database could not be read — possible key rotation or corruption. " +
                    "Refusing to return empty result to prevent silent chain restart. " +
                    "Original error: ${e.message}"
                )
            }
            // Other exceptions (e.g. network, IO) — rethrow as-is
            throw e
        }
    }

    fun getViolations(missionDbId: Long): List<ViolationEntity> =
        db.violationDao().getAllForMission(missionDbId)

    fun getAllMissions(): List<MissionEntity> =
        db.missionDao().getAllMissions()

    fun getViolationCount(missionDbId: Long): Int =
        db.violationDao().countForMission(missionDbId)

    fun getRecordCount(missionDbId: Long): Long =
        db.telemetryRecordDao().countForMission(missionDbId)

}
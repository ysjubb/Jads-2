package com.jads.drone

import com.jads.crypto.EcdsaSigner
import com.jads.crypto.HashChainEngine
import com.jads.crypto.MlDsaSigner
import com.jads.storage.SqlCipherMissionStore
import com.jads.telemetry.CanonicalSerializer
import com.jads.telemetry.TelemetryFields
import com.jads.time.MonotonicClock
import com.jads.time.NtpQuorumAuthority
import com.jads.time.SyncStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// MissionController — orchestrates the full drone mission lifecycle.
//
// Start order (MUST be respected):
//   1. NpntComplianceGate.evaluate()    — if RED, HARD STOP. No exceptions.
//   2. NtpQuorumAuthority.sync()        — if FAILED, block mission
//   3. CertificateValidator.validate()  — if invalid, block mission
//   4. Generate missionId + HASH_0
//   5. SqlCipherMissionStore.createMission()
//
// Record order (per sensor tick):
//   1. GnssPlausibilityValidator.validate()  — set health flags, never drop records
//   2. MonotonicClock.nextTimestamp()         — NTP-corrected, never System.currentTimeMillis()
//   3. CanonicalSerializer.serialize()        — 96-byte canonical payload
//   4. EcdsaSigner.sha256() + sign()          — ECDSA over the 96 bytes
//   5. HashChainEngine.computeHashN()         — forensic chain link
//   6. SqlCipherMissionStore.saveRecord()
//   7. LandingDetector.processSample()        — trigger finalize on landing

sealed class MissionStartResult {
    data class Started(
        val missionDbId: Long,
        val missionId: Long,
        val droneCategory: DroneWeightCategory = DroneWeightCategory.UNKNOWN,
        val npntExempt: Boolean = false
    ) : MissionStartResult()
    data class Blocked(val reason: String, val details: List<String>) : MissionStartResult()
}

data class RawSensorFields(
    val latDeg:         Double,
    val lonDeg:         Double,
    val altMeters:      Double,
    val hdop:           Float,
    val satelliteCount: Int,
    val velNorthMs:     Double,   // m/s — converted to mm/s internally
    val velEastMs:      Double,
    val velDownMs:      Double,
    val flightState:    Int       // bitmask
)

class MissionController(
    private val npntGate:       NpntComplianceGate,
    private val ntpAuthority:   NtpQuorumAuthority,
    private val store:          SqlCipherMissionStore,
    private val clock:          MonotonicClock,
    private val privateKeyBytes: ByteArray,
    private val onMissionFinalized: suspend (missionDbId: Long) -> Unit,
    // Phase 1 PQC: ML-DSA-65 keys for hybrid dual-signing.
    // Null = PQC signing disabled (backward compatible).
    private val pqcPrivateKey:    ByteArray? = null,
    private val pqcPublicKeyHex:  String?    = null
) {
    private var missionDbId:      Long      = -1L
    private var missionId:        Long      = -1L
    private var currentSequence:  Long      = 0L
    private var currentHash:      ByteArray = ByteArray(32)
    private var prevGnss:         GnssPlausibilityValidator.GnssReading? = null
    private val landingDetector   = LandingDetector()
    private var active            = false
    // Approved polygon from NPNT gate — null means no geofence constraint.
    // Set at mission start, checked every GPS tick in checkViolations().
    private var approvedPolygon:  List<LatLon>? = null

    // Callback fired when SQLCipher reports a decryption failure during resumeMission().
    // The operator layer (MissionForegroundService) must surface this as a critical error —
    // not silently continue — because the mission cannot be resumed safely.
    var onDecryptionFailure: ((missionId: Long, reason: String) -> Unit)? = null

    // ── START ───────────────────────────────────────────────────────────────

    suspend fun startMission(
        latDeg:           Double,
        lonDeg:           Double,
        plannedAglFt:     Double,
        permissionToken:  String?,
        idempotencyKey:   String,
        deviceCertHash:   String,
        // Device attestation — provided by Android KeyStore attestation flow
        strongboxBacked:  Boolean = false,
        secureBootVerified: Boolean = false,
        androidVersion:   Int = 0,
        // ── Drone category fields (DGCA UAS Rules 2021) ──
        droneCategory:    DroneWeightCategory = DroneWeightCategory.UNKNOWN,
        droneWeightGrams: Int? = null,
        droneManufacturer: String? = null,
        droneSerialNumber: String? = null,
        nanoAckNumber:    String? = null,
        uinNumber:        String? = null
    ): MissionStartResult = withContext(Dispatchers.IO) {

        // Step 1: NPNT gate — MUST be first (now category-aware)
        val npnt = npntGate.evaluate(
            latDeg, lonDeg, plannedAglFt, permissionToken,
            droneCategory, droneWeightGrams
        )
        if (npnt.blocked) {
            return@withContext MissionStartResult.Blocked(
                "NPNT_BLOCKED", npnt.blockingReasons
            )
        }

        // StrongBox degradation warning — logged but does NOT block mission.
        // JADS records whether hardware security was available at mission start.
        // Degradation means the key is software-backed (less tamper-resistant).
        if (!strongboxBacked) {
            // LOG: key will be software-backed this mission
            // Server receives this flag and records it in device_attestation
        }

        // Step 2: NTP quorum
        val ntpEvidence = ntpAuthority.syncAndGetEvidence()
        if (ntpEvidence.syncStatus == SyncStatus.FAILED) {
            return@withContext MissionStartResult.Blocked(
                "NTP_QUORUM_FAILED",
                listOf("NTP quorum not reached. Mission requires at least 2 time servers.")
            )
        }
        clock.updateCorrection(ntpEvidence.correctionMs)

        // Step 3: (Certificate validation would be injected — skipped for stub)

        // Step 4: Generate missionId and HASH_0
        val id      = System.currentTimeMillis()
        val hash0   = HashChainEngine.computeHash0(id)
        val rootHex = HashChainEngine.toHex(hash0)

        // Step 5: Persist mission record (includes attestation + category metadata)
        val ntpJson = buildNtpJson(ntpEvidence)
        val dbId = store.createMission(
            missionId            = id,
            npntClassification   = npnt.classification.name,
            npntPermissionToken  = npnt.permissionToken,
            deviceCertHash       = deviceCertHash,
            rootHashHex          = rootHex,
            ntpEvidenceJson      = ntpJson,
            idempotencyKey       = idempotencyKey,
            startUtcMs           = clock.nextTimestamp(),
            strongboxBacked      = strongboxBacked,
            secureBootVerified   = secureBootVerified,
            androidVersion       = androidVersion,
            droneWeightCategory  = npnt.droneCategory.name,
            droneWeightGrams     = droneWeightGrams,
            droneManufacturer    = droneManufacturer,
            droneSerialNumber    = droneSerialNumber,
            nanoAckNumber        = nanoAckNumber,
            uinNumber            = uinNumber,
            pqcPublicKeyHex      = pqcPublicKeyHex
        )

        missionDbId     = dbId
        missionId       = id
        currentSequence = 0L
        currentHash     = hash0
        prevGnss        = null
        approvedPolygon = npnt.approvedPolygon   // store for per-record geofence checks
        landingDetector.reset()
        active          = true

        MissionStartResult.Started(
            dbId, id,
            droneCategory = npnt.droneCategory,
            npntExempt    = npnt.npntExempt
        )
    }

    // ── RECORD ───────────────────────────────────────────────────────────────

    suspend fun processReading(raw: RawSensorFields) = withContext(Dispatchers.IO) {
        if (!active) return@withContext

        // Step 1: GNSS plausibility — set health flags, NEVER drop records
        val gnssReading = GnssPlausibilityValidator.GnssReading(
            hdop           = raw.hdop,
            satelliteCount = raw.satelliteCount,
            latDeg         = raw.latDeg,
            lonDeg         = raw.lonDeg,
            altMeters      = raw.altMeters
        )
        val gnssResult    = GnssPlausibilityValidator.validate(gnssReading, prevGnss)
        val sensorFlags   = GnssPlausibilityValidator.applySensorFlags(gnssResult, 0)
        prevGnss          = gnssReading

        // Step 2: Normalize values
        val latMicrodeg  = (raw.latDeg  * 1_000_000.0).toLong()
        val lonMicrodeg  = (raw.lonDeg  * 1_000_000.0).toLong()
        val altCm        = (raw.altMeters * 100.0).toLong()
        val velNorthMms  = (raw.velNorthMs * 1000.0).toLong()
        val velEastMms   = (raw.velEastMs  * 1000.0).toLong()
        val velDownMms   = (raw.velDownMs  * 1000.0).toLong()

        // Step 3: NTP-corrected monotonic timestamp — never System.currentTimeMillis()
        val timestamp = clock.nextTimestamp()

        // Step 4: Prev hash prefix (first 8 bytes of current chain hash)
        val prevHashPrefix = currentHash.copyOf(8)

        // Step 5: Build and serialize canonical payload
        val fields = TelemetryFields(
            missionId         = missionId,
            recordSequence    = currentSequence,
            timestampUtcMs    = timestamp,
            latitudeMicrodeg  = latMicrodeg,
            longitudeMicrodeg = lonMicrodeg,
            altitudeCm        = altCm,
            velocityNorthMms  = velNorthMms,
            velocityEastMms   = velEastMms,
            velocityDownMms   = velDownMms,
            prevHashPrefix    = prevHashPrefix,
            flightStateFlags  = raw.flightState,
            sensorHealthFlags = sensorFlags
        )
        val canonical96 = CanonicalSerializer.serialize(fields)

        // Step 6: Sign (classical ECDSA P-256)
        val hash32       = EcdsaSigner.sha256(canonical96)
        val signatureDer = EcdsaSigner.sign(hash32, privateKeyBytes)

        // Step 6b: PQC hybrid sign (ML-DSA-65, FIPS 204)
        // ML-DSA signs the canonical payload directly — no pre-hashing needed.
        val pqcSigBytes = pqcPrivateKey?.let { MlDsaSigner.sign(canonical96, it) }

        // Step 7: Advance hash chain
        val newHash = HashChainEngine.computeHashN(canonical96, currentHash)

        // Step 8: Persist
        store.saveRecord(
            missionDbId     = missionDbId,
            missionId       = missionId,
            sequence        = currentSequence,
            canonicalHex    = HashChainEngine.toHex(canonical96),
            signatureHex    = HashChainEngine.toHex(signatureDer),
            pqcSignatureHex = pqcSigBytes?.let { HashChainEngine.toHex(it) },
            hashHex         = HashChainEngine.toHex(newHash),
            prevHashHex     = HashChainEngine.toHex(currentHash),
            timestampMs     = timestamp
        )

        // Step 9: Detect violations
        checkViolations(raw, latMicrodeg, lonMicrodeg, altCm, timestamp)

        // Advance state
        currentHash     = newHash
        currentSequence += 1

        // Step 10: Landing detection
        val snapshot = LandingDetector.SensorSnapshot(
            altitudeCm       = altCm,
            velocityNorthMms = velNorthMms,
            velocityEastMms  = velEastMms,
            velocityDownMms  = velDownMms
        )
        if (landingDetector.processSample(snapshot)) {
            active = false
            finalizeMission()
        }
    }

    // ── RESUME ───────────────────────────────────────────────────────────────

    /**
     * Resumes a previously interrupted mission.
     *
     * CRITICAL INVARIANT: Never silently restart the hash chain from HASH_0 when
     * records exist or when a decryption failure occurred.
     *
     * Two legitimate empty-records cases:
     *   1. Mission was created (startMission called) but no records were saved before crash.
     *      → Safe to start from HASH_0. lastSeq = -1, currentSequence = 0.
     *   2. SQLCipher decryption failure — getRecords() throws MissionStoreDecryptionError.
     *      → HALT. Do not resume. Do not restart chain. Log the failure and return.
     *
     * Confusing case 1 with case 2 is the silent chain restart vulnerability (CC-STOR-05).
     */
    fun resumeMission(existingMissionId: Long) {
        // existingMissionId is the missionId (timestamp Long), NOT the Room primary key.
        val entity = store.getMissionByMissionId(existingMissionId)
        if (entity == null) {
            // Mission not found in local DB — cannot resume (may have been on a different device)
            return
        }

        missionDbId     = entity.id               // Room primary key — used for all DAO calls
        missionId       = existingMissionId
        val lastSeq     = store.getLastSequence(existingMissionId)
        currentSequence = lastSeq + 1             // resume from next sequence number

        // ── Re-establish hash chain ──────────────────────────────────────────
        // We MUST catch MissionStoreDecryptionError here.
        // If SQLCipher cannot read the records (key rotation, passphrase change, corruption),
        // getRecords() throws rather than returning []. This prevents the silent chain restart
        // vulnerability where resumeMission thinks there are no records and resets to HASH_0.
        val records = try {
            store.getRecords(missionDbId)
        } catch (e: MissionStoreDecryptionError) {
            // HALT — do not resume. Do not restart chain. Notify caller.
            // The mission data is inaccessible. This must be surfaced to the operator
            // as a STORAGE_DECRYPTION_FAILURE, not silently ignored.
            active = false
            onDecryptionFailure?.invoke(missionId, e.message ?: "SQLCipher decryption failure")
            return
        }

        currentHash = if (records.isNotEmpty()) {
            // Resume from last committed hash — chain continues from HASH_N
            HashChainEngine.fromHex(records.last().recordHashHex)
        } else {
            // No records written yet — mission was interrupted at startMission before first record.
            // Safe to start from HASH_0 because there is nothing to continue from.
            HashChainEngine.computeHash0(missionId)
        }

        active = true
    }

    // ── FINALIZE ────────────────────────────────────────────────────────────

    private suspend fun finalizeMission() {
        // Post-flight upload only after:
        // (1) Landing confirmed — already done (LandingDetector fired)
        // (2) Local integrity check
        val integrityOk = runLocalIntegrityCheck()
        store.setIntegrityCheckResult(missionDbId, integrityOk)

        // (3) CRL revalidation — result stored regardless of outcome
        val archivedCrl = revalidateCertAndGetCrl()
        store.finalizeMission(missionDbId, archivedCrl, clock.nextTimestamp())

        // Trigger upload callback
        onMissionFinalized(missionDbId)
    }

    private fun runLocalIntegrityCheck(): Boolean {
        val records = store.getRecords(missionDbId)
        if (records.isEmpty()) return true
        // Verify sequence is gapless
        for (i in records.indices) {
            if (records[i].sequence != i.toLong()) return false
        }
        return true
    }

    private fun revalidateCertAndGetCrl(): String? {
        // Stub — live implementation calls CertificateValidator.revalidate()
        // which fetches fresh CRL bytes from the CA and returns them as base64.
        // The CRL is archived here, not on backend — frozen at mission_end_utc.
        return null
    }

    private fun checkViolations(
        raw:         RawSensorFields,
        latMicrodeg: Long, lonMicrodeg: Long, altCm: Long, timestamp: Long
    ) {
        val altFt = raw.altMeters * 3.28084

        // ── 1. Altitude check ──────────────────────────────────────────────
        if (altFt > 400.0) {
            store.saveViolation(
                missionDbId   = missionDbId,
                missionId     = missionId,
                sequence      = currentSequence,
                violationType = "AGL_EXCEEDED",
                severity      = "CRITICAL",
                timestampMs   = timestamp,
                latMicrodeg   = latMicrodeg,
                lonMicrodeg   = lonMicrodeg,
                altCm         = altCm,
                detailJson    = """{"limitFt":400,"actualFt":$altFt}"""
            )
        }

        // ── 2. Geofence check — only when an approved polygon exists ───────
        // The approved polygon is set at mission start from the NPNT permission artefact.
        // A null polygon means no boundary constraint (GREEN zone, no token required).
        val poly = approvedPolygon
        if (poly != null && poly.size >= 3) {
            val latDeg = raw.latDeg
            val lonDeg = raw.lonDeg
            if (!GeofenceChecker.isPointInPolygon(latDeg, lonDeg, poly)) {
                store.saveViolation(
                    missionDbId   = missionDbId,
                    missionId     = missionId,
                    sequence      = currentSequence,
                    violationType = "GEOFENCE_BREACH",
                    severity      = "CRITICAL",
                    timestampMs   = timestamp,
                    latMicrodeg   = latMicrodeg,
                    lonMicrodeg   = lonMicrodeg,
                    altCm         = altCm,
                    detailJson    = """{"zoneId":"NPNT_APPROVED_AREA","outsidePolygon":true}"""
                )
            }
        }
    }

    private fun buildNtpJson(ev: com.jads.time.TimeAuthorityEvidence): String =
        """{"syncStatus":"${ev.syncStatus}","correctionMs":${ev.correctionMs},"spreadMs":${ev.spreadMs},"servers":${ev.servers},"evidenceTimeMs":${ev.evidenceTimeMs}}"""

    private fun buildCategoryJson(
        category: DroneWeightCategory,
        npntExempt: Boolean,
        manufacturer: String?,
        serialNumber: String?,
        weightGrams: Int?,
        nanoAck: String?,
        uin: String?
    ): String =
        """{"category":"${category.name}","npntExempt":$npntExempt,"manufacturer":${manufacturer?.let { "\"$it\"" } ?: "null"},"serialNumber":${serialNumber?.let { "\"$it\"" } ?: "null"},"weightGrams":${weightGrams ?: "null"},"nanoAckNumber":${nanoAck?.let { "\"$it\"" } ?: "null"},"uinNumber":${uin?.let { "\"$it\"" } ?: "null"}}"""
}

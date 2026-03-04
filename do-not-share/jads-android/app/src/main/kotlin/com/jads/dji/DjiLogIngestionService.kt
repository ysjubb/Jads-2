package com.jads.dji

import android.content.Context
import android.util.Log
import com.jads.crypto.EcdsaSigner
import com.jads.crypto.HashChainEngine
import com.jads.storage.SqlCipherMissionStore
import com.jads.telemetry.CanonicalSerializer
import com.jads.telemetry.TelemetryFields
import com.jads.time.MonotonicClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

// DjiLogIngestionService — converts DJI flight logs into forensic JADS missions.
//
// This is the POST-FLIGHT equivalent of MissionController.processReading().
// Instead of real-time GPS ticks, we process an entire DJI flight log at once:
//
//   DJI flight log file
//     → DjiFlightLogParser.parse()       — extract GPS records
//     → createMission()                   — JADS mission in SQLCipher
//     → for each record:
//         → CanonicalSerializer.serialize() — 96-byte canonical payload
//         → EcdsaSigner.sign()              — ECDSA over SHA256(canonical)
//         → HashChainEngine.computeHashN()  — forensic chain link
//         → SqlCipherMissionStore.saveRecord()
//     → finalizeMission()
//     → MissionUploadWorker.enqueue()     — upload to backend
//
// The mission is tagged with source="DJI_FLIGHT_LOG" so the backend knows
// this data was ingested post-flight (not captured in real-time).
//
// Forensic implications:
//   - Hash chain is computed retroactively (still cryptographically valid)
//   - Timestamps come from DJI log (not our NTP-synced clock)
//   - ECDSA signatures are applied post-hoc (prove chain integrity from ingestion)
//   - The backend's forensic verifier validates all 8 invariants identically
//
// This is forensically weaker than real-time capture because we trust the DJI
// timestamps rather than our own NTP quorum. The backend records this distinction
// via the npntClassification="DJI_IMPORT" flag.

class DjiLogIngestionService(
    private val store:           SqlCipherMissionStore,
    private val clock:           MonotonicClock,
    private val privateKeyBytes: ByteArray,
    private val context:         Context,
    private val onMissionIngested: suspend (missionDbId: Long) -> Unit,
) {
    companion object {
        private const val TAG = "DjiIngestion"

        // Sensor health flag: GPS data came from DJI log (not live GNSS)
        const val FLAG_DJI_IMPORT = 0x00000010   // bit 4

        // Flight state flag: post-flight ingestion (not real-time)
        const val FLAG_POST_FLIGHT = 0x00000100  // bit 8
    }

    /**
     * Ingest a DJI flight log file into the JADS forensic pipeline.
     * Runs on Dispatchers.IO. Returns the mission DB ID on success, null on failure.
     */
    suspend fun ingest(file: File): Long? = withContext(Dispatchers.IO) {
        Log.i(TAG, "Ingesting DJI flight log: ${file.name}")

        // Step 1: Parse the DJI flight log
        val flightLog = DjiFlightLogParser.parse(file)
        if (flightLog == null) {
            Log.w(TAG, "Failed to parse DJI flight log: ${file.name}")
            return@withContext null
        }

        if (flightLog.records.isEmpty()) {
            Log.w(TAG, "DJI flight log has no GPS records: ${file.name}")
            return@withContext null
        }

        Log.i(TAG, "Parsed ${flightLog.records.size} records from ${flightLog.metadata.sourceFormat} " +
                "(${flightLog.metadata.droneModel}, SN: ${flightLog.metadata.serialNumber})")

        // Step 2: Generate a unique mission ID from the flight start time
        val missionId = flightLog.metadata.flightStartMs

        // Check if we already ingested this exact flight (idempotency)
        val existingMission = store.getMissionByMissionId(missionId)
        if (existingMission != null) {
            Log.i(TAG, "Flight log already ingested (missionId=$missionId), skipping")
            return@withContext existingMission.id
        }

        // Step 3: Compute HASH_0
        val hash0 = HashChainEngine.computeHash0(missionId)
        val rootHashHex = HashChainEngine.toHex(hash0)

        // Step 4: Build NTP evidence (mark as DJI import — not live NTP sync)
        val ntpJson = """{"syncStatus":"DJI_IMPORT","correctionMs":0,"spreadMs":0,""" +
                """"servers":["dji_flight_log"],"evidenceTimeMs":${System.currentTimeMillis()},""" +
                """"sourceFile":"${file.name}","sourceFormat":"${flightLog.metadata.sourceFormat}",""" +
                """"droneModel":"${flightLog.metadata.droneModel}",""" +
                """"serialNumber":"${flightLog.metadata.serialNumber}"}"""

        // Step 5: Create mission in SQLCipher
        val idempotencyKey = "dji_${flightLog.metadata.serialNumber}_${missionId}"
        val missionDbId = store.createMission(
            missionId           = missionId,
            npntClassification  = "DJI_IMPORT",  // distinct from GREEN/YELLOW/RED
            npntPermissionToken = null,
            deviceCertHash      = "DJI_${flightLog.metadata.serialNumber}",
            rootHashHex         = rootHashHex,
            ntpEvidenceJson     = ntpJson,
            idempotencyKey      = idempotencyKey,
            startUtcMs          = flightLog.metadata.flightStartMs,
        )

        Log.i(TAG, "Mission created: dbId=$missionDbId, missionId=$missionId")

        // Step 6: Process each telemetry record through the forensic pipeline
        var currentHash = hash0
        var sequence = 0L

        for (record in flightLog.records) {
            // Convert DJI record to JADS canonical units
            val latMicrodeg = (record.latitudeDeg * 1_000_000.0).toLong()
            val lonMicrodeg = (record.longitudeDeg * 1_000_000.0).toLong()
            val altCm       = (record.altitudeM * 100.0).toLong()
            val velNorthMms = (record.velNorthMs * 1000.0).toLong()
            val velEastMms  = (record.velEastMs * 1000.0).toLong()
            val velDownMms  = (record.velDownMs * 1000.0).toLong()

            // Prev hash prefix = first 8 bytes of current chain hash
            val prevHashPrefix = currentHash.copyOf(8)

            // Build canonical 96-byte payload
            val fields = TelemetryFields(
                missionId         = missionId,
                recordSequence    = sequence,
                timestampUtcMs    = record.timestampMs,
                latitudeMicrodeg  = latMicrodeg,
                longitudeMicrodeg = lonMicrodeg,
                altitudeCm        = altCm,
                velocityNorthMms  = velNorthMms,
                velocityEastMms   = velEastMms,
                velocityDownMms   = velDownMms,
                prevHashPrefix    = prevHashPrefix,
                flightStateFlags  = FLAG_POST_FLIGHT,
                sensorHealthFlags = FLAG_DJI_IMPORT or 0x00000001, // GPS_OK + DJI_IMPORT
            )
            val canonical96 = CanonicalSerializer.serialize(fields)

            // Sign
            val hash32       = EcdsaSigner.sha256(canonical96)
            val signatureDer = EcdsaSigner.sign(hash32, privateKeyBytes)

            // Advance hash chain
            val newHash = HashChainEngine.computeHashN(canonical96, currentHash)

            // Persist
            store.saveRecord(
                missionDbId  = missionDbId,
                missionId    = missionId,
                sequence     = sequence,
                canonicalHex = HashChainEngine.toHex(canonical96),
                signatureHex = HashChainEngine.toHex(signatureDer),
                hashHex      = HashChainEngine.toHex(newHash),
                prevHashHex  = HashChainEngine.toHex(currentHash),
                timestampMs  = record.timestampMs,
            )

            currentHash = newHash
            sequence += 1

            // Log progress every 100 records
            if (sequence % 100 == 0L) {
                Log.d(TAG, "Processed $sequence / ${flightLog.records.size} records")
            }
        }

        Log.i(TAG, "All $sequence records processed and stored")

        // Step 7: Check for altitude violations (> 400ft AGL)
        for ((idx, record) in flightLog.records.withIndex()) {
            val altFt = record.altitudeM * 3.28084
            if (altFt > 400.0) {
                store.saveViolation(
                    missionDbId   = missionDbId,
                    missionId     = missionId,
                    sequence      = idx.toLong(),
                    violationType = "AGL_EXCEEDED",
                    severity      = "CRITICAL",
                    timestampMs   = record.timestampMs,
                    latMicrodeg   = (record.latitudeDeg * 1_000_000.0).toLong(),
                    lonMicrodeg   = (record.longitudeDeg * 1_000_000.0).toLong(),
                    altCm         = (record.altitudeM * 100.0).toLong(),
                    detailJson    = """{"limitFt":400,"actualFt":$altFt,"source":"DJI_FLIGHT_LOG"}""",
                )
            }
        }

        // Step 8: Finalize mission
        store.setIntegrityCheckResult(missionDbId, true)
        store.finalizeMission(
            missionDbId,
            archivedCrlBase64 = null,
            endUtcMs = flightLog.metadata.flightEndMs,
        )

        Log.i(TAG, "Mission finalized: dbId=$missionDbId, records=$sequence")

        // Step 9: Trigger upload
        onMissionIngested(missionDbId)

        missionDbId
    }
}

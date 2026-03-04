-- Phase 1 PQC: Add ML-DSA-65 (FIPS 204) hybrid signature fields.
--
-- pqcPublicKeyHex on DroneMission: stores the ML-DSA-65 public key
-- submitted by the Android device at upload time. ~3,904 hex chars (1,952 bytes).
--
-- pqcSignatureHex on DroneTelemetryRecord: stores the ML-DSA-65 signature
-- per telemetry record. ~6,586 hex chars (3,293 bytes).
--
-- Both fields are nullable — old missions without PQC signatures remain valid.
-- The ForensicVerifier verifies PQC signatures when present, falls back to
-- ECDSA-only verification when absent.

-- Mission-level: ML-DSA-65 public key for post-hoc verification
ALTER TABLE "DroneMission" ADD COLUMN "pqcPublicKeyHex" TEXT;

-- Record-level: ML-DSA-65 signature per telemetry record
ALTER TABLE "DroneTelemetryRecord" ADD COLUMN "pqcSignatureHex" TEXT;

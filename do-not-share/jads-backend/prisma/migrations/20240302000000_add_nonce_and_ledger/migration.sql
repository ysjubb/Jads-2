-- Migration: 20240302000000_add_nonce_and_ledger
--
-- Adds three things:
--   1. DroneMission.deviceNonce — nullable idempotency nonce sent by Android device.
--      Distinguishes genuine duplicate upload (same nonce) from clock-regression collision
--      (same missionId timestamp but different nonce = different flight).
--
--   2. AuditLog.sequenceNumber index — BIGSERIAL already exists in initial migration.
--      This adds a unique index + a separate gap-detection index for forensic use.
--
--   3. EvidenceLedger table — daily Merkle anchor chain for tamper detection.
--      The EvidenceLedgerJob (already written) writes here every 00:05 UTC.

-- ── 1. deviceNonce on DroneMission ────────────────────────────────────────────
-- Nullable: older Android builds (pre-Step6) do not send a nonce.
-- When present: idempotency key is (missionId + operatorId + deviceNonce).
-- When absent:  idempotency falls back to (missionId + operatorId) — existing behaviour.
ALTER TABLE "DroneMission"
  ADD COLUMN "deviceNonce" TEXT;

-- Unique constraint: same device cannot upload the same nonce twice.
-- This prevents a compromised device replaying an old mission with a new missionId
-- but the same nonce (i.e. the nonce was not freshly generated).
-- NULL values are excluded from unique constraints in PostgreSQL (correct behaviour).
CREATE UNIQUE INDEX "DroneMission_deviceNonce_key"
  ON "DroneMission"("deviceNonce")
  WHERE "deviceNonce" IS NOT NULL;

-- ── 1b. deviceCertDer on DroneMission ───────────────────────────────────────
-- DER-encoded (base64) X.509 device certificate sent at upload time.
-- Stored so ForensicVerifier can re-verify ECDSA signatures on telemetry records
-- without trusting the boolean certValidAtStart flag alone.
-- Nullable: missions uploaded before this migration do not have it stored.
ALTER TABLE "DroneMission"
  ADD COLUMN "deviceCertDer" TEXT;

-- ── 2. AuditLog sequenceNumber unique index ───────────────────────────────────
-- BIGSERIAL guarantees monotone assignment; this unique index makes gap-detection
-- a simple SELECT query rather than a full scan:
--   SELECT MIN(s), MAX(s), COUNT(*) FROM AuditLog
--   WHERE (MAX - MIN + 1) != COUNT → gaps exist
CREATE UNIQUE INDEX "AuditLog_sequenceNumber_key"
  ON "AuditLog"("sequenceNumber");

-- Additional composite index: enables "find audit entries after sequence N" efficiently.
-- Used by the sequence-integrity endpoint and forensic export tools.
CREATE INDEX "AuditLog_sequenceNumber_timestamp_idx"
  ON "AuditLog"("sequenceNumber", "timestamp");

-- ── 3. EvidenceLedger table ───────────────────────────────────────────────────
-- One row per calendar day (UTC).
-- anchorHash is a chained SHA-256 over: date | missionCount | missionIdsCsvHash | prevAnchorHash
-- This forms an append-only hash chain — modifying any past entry breaks all subsequent anchors.
CREATE TABLE "EvidenceLedger" (
    "id"                TEXT         NOT NULL,
    "anchorDate"        DATE         NOT NULL,
    "missionCount"      INTEGER      NOT NULL DEFAULT 0,
    "missionIdsCsvHash" TEXT         NOT NULL,
    "anchorHash"        TEXT         NOT NULL,
    "prevAnchorHash"    TEXT         NOT NULL,
    "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobRunId"          TEXT         NOT NULL,

    CONSTRAINT "EvidenceLedger_pkey" PRIMARY KEY ("id")
);

-- One anchor per day — re-runs are idempotent (job checks before inserting).
CREATE UNIQUE INDEX "EvidenceLedger_anchorDate_key"
  ON "EvidenceLedger"("anchorDate");

CREATE INDEX "EvidenceLedger_anchorDate_idx"
  ON "EvidenceLedger"("anchorDate");

-- ── Verify everything was created ─────────────────────────────────────────────
-- (PostgreSQL will error and rollback if any statement above failed)

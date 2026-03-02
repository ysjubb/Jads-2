-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20240302000000_evidence_ledger
-- Purpose:   Append-only daily chain-of-custody anchor for drone mission records.
--
-- Design:
--   Every day at 00:00 UTC the EvidenceLedgerJob computes:
--     anchorHash = SHA-256(date_str || mission_count_str || sorted_mission_ids_csv || prevAnchorHash)
--   and stores it here.
--
--   A gap in ledger dates = server was down for that day (logged, not fatal).
--   A mismatch between recomputed and stored anchorHash = tampered ledger.
--   A mission whose uploadedAt date has a ledger entry but whose missionId
--   is NOT in that day's missionIdsCsv = mission was deleted post-anchor.
--
--   The genesis anchor (first entry ever) uses prevAnchorHash = '0' * 64.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "EvidenceLedger" (
    "id"                TEXT        NOT NULL,
    "anchorDate"        DATE        NOT NULL,
    "missionCount"      INTEGER     NOT NULL DEFAULT 0,
    "missionIdsCsvHash" TEXT        NOT NULL,
    "anchorHash"        TEXT        NOT NULL,
    "prevAnchorHash"    TEXT        NOT NULL,
    "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobRunId"          TEXT        NOT NULL,

    CONSTRAINT "EvidenceLedger_pkey" PRIMARY KEY ("id")
);

-- One entry per day — enforced by DB
CREATE UNIQUE INDEX "EvidenceLedger_anchorDate_key" ON "EvidenceLedger"("anchorDate");

-- Fast lookup by date range (for forensic panel)
CREATE INDEX "EvidenceLedger_anchorDate_idx" ON "EvidenceLedger"("anchorDate");

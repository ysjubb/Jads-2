-- AlterTable: add serverReceivedAtUtcMs to DroneMission
-- Captures the server wall-clock time (UTC ms) at mission ingestion.
-- Used by ForensicVerifier I-2 to detect device-vs-server time drift.

ALTER TABLE "DroneMission" ADD COLUMN "serverReceivedAtUtcMs" TEXT;

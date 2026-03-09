-- PA Lifecycle State Machine — Enhance PermissionArtefact with full lifecycle tracking
-- Adds PAStatus enum and new columns for NPNT compliance lifecycle:
--   PENDING -> APPROVED -> DOWNLOADED -> LOADED -> ACTIVE -> COMPLETED -> LOG_UPLOADED -> AUDIT_COMPLETE
--   Also: EXPIRED, REJECTED, REVOKED terminal states.

-- Create the PAStatus enum
CREATE TYPE "PAStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'DOWNLOADED',
  'LOADED',
  'ACTIVE',
  'COMPLETED',
  'LOG_UPLOADED',
  'AUDIT_COMPLETE',
  'EXPIRED',
  'REJECTED',
  'REVOKED'
);

-- Add new columns to PermissionArtefact
ALTER TABLE "PermissionArtefact"
  ADD COLUMN "permissionArtifactId" TEXT,
  ADD COLUMN "txnId"               TEXT,
  ADD COLUMN "uinNumber"           TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pilotId"             TEXT NOT NULL DEFAULT '',
  ADD COLUMN "operatorId"          TEXT NOT NULL DEFAULT '',
  ADD COLUMN "primaryZone"         TEXT NOT NULL DEFAULT 'YELLOW',
  ADD COLUMN "flightStartTime"     TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  ADD COLUMN "flightEndTime"       TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  ADD COLUMN "geofencePolygon"     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "maxAltitudeMeters"   INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "rawPaXml"            BYTEA,
  ADD COLUMN "loadedToDroneAt"     TIMESTAMP(3),
  ADD COLUMN "flightLogUploadedAt" TIMESTAMP(3),
  ADD COLUMN "flightLogHash"       TEXT,
  ADD COLUMN "violations"          JSONB,
  ADD COLUMN "revokedAt"           TIMESTAMP(3),
  ADD COLUMN "revokeReason"        TEXT;

-- Rename existing paFileHash to paZipHash for consistency
ALTER TABLE "PermissionArtefact"
  RENAME COLUMN "paFileHash" TO "paZipHash";

-- Convert status column from TEXT to PAStatus enum
-- First rename the old column, then add new typed column, copy data, drop old
ALTER TABLE "PermissionArtefact" RENAME COLUMN "status" TO "status_old";
ALTER TABLE "PermissionArtefact" ADD COLUMN "status" "PAStatus" NOT NULL DEFAULT 'PENDING';

-- Migrate existing status values
UPDATE "PermissionArtefact" SET "status" = 'PENDING'  WHERE "status_old" = 'PENDING';
UPDATE "PermissionArtefact" SET "status" = 'PENDING'  WHERE "status_old" = 'SUBMITTED';
UPDATE "PermissionArtefact" SET "status" = 'APPROVED' WHERE "status_old" = 'APPROVED';
UPDATE "PermissionArtefact" SET "status" = 'REJECTED' WHERE "status_old" = 'REJECTED';
UPDATE "PermissionArtefact" SET "status" = 'EXPIRED'  WHERE "status_old" = 'EXPIRED';
UPDATE "PermissionArtefact" SET "status" = 'COMPLETED' WHERE "status_old" = 'COMPLETED';

ALTER TABLE "PermissionArtefact" DROP COLUMN "status_old";

-- Add new indexes
CREATE INDEX "PermissionArtefact_operatorId_idx" ON "PermissionArtefact"("operatorId");
CREATE INDEX "PermissionArtefact_uinNumber_idx" ON "PermissionArtefact"("uinNumber");

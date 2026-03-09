-- PA Lifecycle State Machine — Create PermissionArtefact table with full lifecycle tracking
-- PAStatus enum models the NPNT compliance lifecycle:
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

-- Create the PermissionArtefact table with all columns
CREATE TABLE "PermissionArtefact" (
  "id"                    TEXT NOT NULL,
  "applicationId"         TEXT NOT NULL,
  "planId"                TEXT NOT NULL,
  "permissionArtifactId"  TEXT,
  "txnId"                 TEXT,
  "uinNumber"             TEXT NOT NULL,
  "pilotId"               TEXT NOT NULL,
  "operatorId"            TEXT NOT NULL,
  "status"                "PAStatus" NOT NULL DEFAULT 'PENDING',
  "primaryZone"           TEXT NOT NULL,
  "flightStartTime"       TIMESTAMP(3) NOT NULL,
  "flightEndTime"         TIMESTAMP(3) NOT NULL,
  "geofencePolygon"       JSONB NOT NULL,
  "maxAltitudeMeters"     INTEGER NOT NULL,
  "rawPaXml"              BYTEA,
  "paZipHash"             TEXT,
  "paFilePath"            TEXT,
  "signatureValid"        BOOLEAN,
  "loadedToDroneAt"       TIMESTAMP(3),
  "flightLogUploadedAt"   TIMESTAMP(3),
  "flightLogHash"         TEXT,
  "violations"            JSONB,
  "submittedAt"           TIMESTAMP(3) NOT NULL,
  "approvedAt"            TIMESTAMP(3),
  "downloadedAt"          TIMESTAMP(3),
  "expiresAt"             TIMESTAMP(3),
  "completedAt"           TIMESTAMP(3),
  "archivedAt"            TIMESTAMP(3),
  "revokedAt"             TIMESTAMP(3),
  "revokeReason"          TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PermissionArtefact_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "PermissionArtefact_applicationId_key" ON "PermissionArtefact"("applicationId");

-- Performance indexes
CREATE INDEX "PermissionArtefact_status_idx" ON "PermissionArtefact"("status");
CREATE INDEX "PermissionArtefact_expiresAt_idx" ON "PermissionArtefact"("expiresAt");
CREATE INDEX "PermissionArtefact_planId_idx" ON "PermissionArtefact"("planId");
CREATE INDEX "PermissionArtefact_operatorId_idx" ON "PermissionArtefact"("operatorId");
CREATE INDEX "PermissionArtefact_uinNumber_idx" ON "PermissionArtefact"("uinNumber");

-- Foreign key: PermissionArtefact → DroneOperationPlan
ALTER TABLE "PermissionArtefact" ADD CONSTRAINT "PermissionArtefact_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "DroneOperationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

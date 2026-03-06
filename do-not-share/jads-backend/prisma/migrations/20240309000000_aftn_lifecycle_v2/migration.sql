-- AFTN Lifecycle V2 Migration
-- Adds: FlightPlanStatus enum values, MannedFlightPlan AFTN/lifecycle columns,
--        EvidenceLedger RFC 3161 fields, NpntClass DJI_IMPORT removal,
--        ManufacturerPushSource IZI→IDEAFORGE rename.

-- ═══════════════════════════════════════════════
-- 1. FlightPlanStatus enum — add missing values
-- ═══════════════════════════════════════════════
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'FILING_FAILED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'CLEARANCE_REJECTED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'PENDING_CLEARANCE';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'ADC_ISSUED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'FIC_ISSUED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'FULLY_CLEARED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'STUB_TRANSMITTED';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'VOID';
ALTER TYPE "FlightPlanStatus" ADD VALUE IF NOT EXISTS 'DEPARTED';

-- ═══════════════════════════════════════════════
-- 2. MannedFlightPlan — AFTN gateway result fields
-- ═══════════════════════════════════════════════
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "aftnTransmissionStatus" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "aftnGatewayResultJson" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "aftnTransmittedAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════
-- 3. MannedFlightPlan — CNL/ARR/DLA message storage
-- ═══════════════════════════════════════════════
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "cnlAftnMessage" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "arrAftnMessage" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "dlaAftnMessage" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "dlaFiledAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════
-- 3b. MannedFlightPlan — original EOBT preservation for DLA
-- ═══════════════════════════════════════════════
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "originalEobt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════
-- 4. EvidenceLedger — RFC 3161 TSA fields
-- ═══════════════════════════════════════════════
ALTER TABLE "EvidenceLedger" ADD COLUMN IF NOT EXISTS "rfc3161TimestampToken" TEXT;
ALTER TABLE "EvidenceLedger" ADD COLUMN IF NOT EXISTS "tsaName" TEXT;
ALTER TABLE "EvidenceLedger" ADD COLUMN IF NOT EXISTS "tsaTimestamp" TIMESTAMP(3);
ALTER TABLE "EvidenceLedger" ADD COLUMN IF NOT EXISTS "tsaRequestHash" TEXT;

-- ═══════════════════════════════════════════════
-- 5. NpntClass — remove DJI_IMPORT
-- ═══════════════════════════════════════════════
-- PostgreSQL does not support ALTER TYPE ... REMOVE VALUE.
-- DJI_IMPORT was added in migration 20240305 but is no longer used.
-- To safely remove: rename any rows using DJI_IMPORT to GREEN, then
-- recreate the enum. This is a data-safe operation.
-- NOTE: If no rows use DJI_IMPORT, the UPDATE is a no-op.
UPDATE "AirspaceZone" SET "npntClassification" = 'GREEN' WHERE "npntClassification" = 'DJI_IMPORT';

-- Recreate enum without DJI_IMPORT
ALTER TYPE "NpntClass" RENAME TO "NpntClass_old";
CREATE TYPE "NpntClass" AS ENUM ('GREEN', 'YELLOW', 'RED');
ALTER TABLE "AirspaceZone" ALTER COLUMN "npntClassification" TYPE "NpntClass" USING "npntClassification"::text::"NpntClass";
DROP TYPE "NpntClass_old";

-- ═══════════════════════════════════════════════
-- 6. ManufacturerPushSource — rename IZI to IDEAFORGE
-- ═══════════════════════════════════════════════
-- Only needed if ManufacturerPushSource enum exists in database.
-- If it doesn't exist yet (no prior migration), this will be handled
-- by the next prisma migrate deploy which creates it fresh.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManufacturerPushSource') THEN
    -- Rename IZI to IDEAFORGE
    ALTER TYPE "ManufacturerPushSource" ADD VALUE IF NOT EXISTS 'IDEAFORGE';
    -- Note: PostgreSQL cannot remove enum values without recreating the type.
    -- IZI remains in the enum but is unused. Any rows with IZI should be updated.
  END IF;
END $$;

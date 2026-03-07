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
-- NOTE: NpntClass is used by DroneMission, not AirspaceZone.
-- Remove DJI_IMPORT from enum by recreating it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NpntClass') THEN
    -- Migrate any DJI_IMPORT rows to GREEN in DroneMission
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DroneMission') THEN
      UPDATE "DroneMission" SET "npntClassification" = 'GREEN' WHERE "npntClassification" = 'DJI_IMPORT';
    END IF;

    -- Recreate enum without DJI_IMPORT
    ALTER TYPE "NpntClass" RENAME TO "NpntClass_old";
    CREATE TYPE "NpntClass" AS ENUM ('GREEN', 'YELLOW', 'RED');

    -- Re-type the column in DroneMission
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DroneMission') THEN
      ALTER TABLE "DroneMission" ALTER COLUMN "npntClassification" TYPE "NpntClass" USING "npntClassification"::text::"NpntClass";
    END IF;

    DROP TYPE "NpntClass_old";
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 6. ManufacturerPushSource — remove IZI, add IDEAFORGE
-- ═══════════════════════════════════════════════
-- PostgreSQL cannot remove enum values without recreating the type.
-- Recreate the enum without IZI. Any rows with IZI are migrated to IDEAFORGE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManufacturerPushSource') THEN
    -- Migrate any IZI rows to IDEAFORGE before dropping the old enum
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ManufacturerVendor') THEN
      UPDATE "ManufacturerVendor" SET "vendorCode" = 'IDEAFORGE' WHERE "vendorCode" = 'IZI';
    END IF;

    ALTER TYPE "ManufacturerPushSource" RENAME TO "ManufacturerPushSource_old";
    CREATE TYPE "ManufacturerPushSource" AS ENUM ('DJI', 'AUTEL', 'PARROT', 'SKYDIO', 'IDEAFORGE', 'ASTERIA', 'THROTTLE', 'GENERIC');

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ManufacturerVendor') THEN
      ALTER TABLE "ManufacturerVendor" ALTER COLUMN "vendorCode" TYPE "ManufacturerPushSource" USING "vendorCode"::text::"ManufacturerPushSource";
    END IF;

    DROP TYPE "ManufacturerPushSource_old";
  END IF;
END $$;

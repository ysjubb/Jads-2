-- Add DELAYED status to FlightPlanStatus enum
ALTER TYPE "FlightPlanStatus" ADD VALUE 'DELAYED';

-- Add CNL/DLA tracking fields to MannedFlightPlan
ALTER TABLE "MannedFlightPlan" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "MannedFlightPlan" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "MannedFlightPlan" ADD COLUMN "delayedNewEobt" TIMESTAMP(3);
ALTER TABLE "MannedFlightPlan" ADD COLUMN "delayReason" TEXT;

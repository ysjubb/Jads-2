-- Add ARRIVED status to FlightPlanStatus enum
ALTER TYPE "FlightPlanStatus" ADD VALUE 'ARRIVED';

-- Add arrival tracking fields to MannedFlightPlan
ALTER TABLE "MannedFlightPlan" ADD COLUMN "arrivedAt" TIMESTAMP(3);
ALTER TABLE "MannedFlightPlan" ADD COLUMN "actualArrivalTime" TEXT;

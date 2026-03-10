-- Add Digital Sky validation + flight feedback fields to DroneOperationPlan
ALTER TABLE "DroneOperationPlan"
  ADD COLUMN "digitalSkyRegStatus" TEXT,
  ADD COLUMN "digitalSkyCheckAt" TIMESTAMP(3),
  ADD COLUMN "flightFeedback" TEXT,
  ADD COLUMN "flightFeedbackAt" TIMESTAMP(3),
  ADD COLUMN "trackLogId" TEXT;

-- Create TrackLog table for web-uploaded flight track logs
CREATE TABLE "TrackLog" (
  "id" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "droneOperationPlanId" TEXT,
  "droneSerialNumber" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "takeoffLat" DOUBLE PRECISION,
  "takeoffLon" DOUBLE PRECISION,
  "landingLat" DOUBLE PRECISION,
  "landingLon" DOUBLE PRECISION,
  "pathPointsJson" TEXT NOT NULL,
  "maxAltitudeM" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "breachCount" INTEGER NOT NULL DEFAULT 0,
  "violationsJson" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrackLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "TrackLog_operatorId_idx" ON "TrackLog"("operatorId");
CREATE INDEX "TrackLog_droneOperationPlanId_idx" ON "TrackLog"("droneOperationPlanId");

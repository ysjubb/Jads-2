-- DroneOperationPlan — Create table (was missing from initial migration)
CREATE TABLE "DroneOperationPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "droneSerialNumber" TEXT NOT NULL,
    "uinNumber" TEXT,
    "areaType" TEXT NOT NULL,
    "areaGeoJson" TEXT,
    "centerLatDeg" DOUBLE PRECISION,
    "centerLonDeg" DOUBLE PRECISION,
    "radiusM" DOUBLE PRECISION,
    "maxAltitudeAglM" DOUBLE PRECISION NOT NULL,
    "minAltitudeAglM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedStartUtc" TIMESTAMP(3) NOT NULL,
    "plannedEndUtc" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "notifyEmail" TEXT,
    "notifyMobile" TEXT,
    "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,

    CONSTRAINT "DroneOperationPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DroneOperationPlan_planId_key" ON "DroneOperationPlan"("planId");
CREATE INDEX "DroneOperationPlan_operatorId_idx" ON "DroneOperationPlan"("operatorId");
CREATE INDEX "DroneOperationPlan_status_idx" ON "DroneOperationPlan"("status");
CREATE INDEX "DroneOperationPlan_plannedStartUtc_plannedEndUtc_idx" ON "DroneOperationPlan"("plannedStartUtc", "plannedEndUtc");

-- Yellow Zone Routing — Add routing decision fields to DroneOperationPlan
ALTER TABLE "DroneOperationPlan"
  ADD COLUMN "routingAuthority" TEXT,
  ADD COLUMN "expeditedFlag"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "routedAt"         TIMESTAMP(3),
  ADD COLUMN "approvalDueBy"    TIMESTAMP(3);

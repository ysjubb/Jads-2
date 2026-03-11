-- Yellow Zone Routing — Add routing decision fields to DroneOperationPlan
-- These fields store the ATC authority routing decision, expedited flag,
-- and approval deadline for yellow-zone drone flight permission applications.

ALTER TABLE "DroneOperationPlan"
  ADD COLUMN "routingAuthority" TEXT,
  ADD COLUMN "expeditedFlag"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "routedAt"         TIMESTAMP(3),
  ADD COLUMN "approvalDueBy"    TIMESTAMP(3);

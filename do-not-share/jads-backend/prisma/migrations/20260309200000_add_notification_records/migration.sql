-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'EXPIRY_90_DAYS',
  'EXPIRY_60_DAYS',
  'EXPIRY_30_DAYS',
  'EXPIRY_7_DAYS',
  'EXPIRY_EXPIRED',
  'PERMISSION_SUBMITTED',
  'PERMISSION_APPROVED',
  'PERMISSION_REJECTED',
  'PERMISSION_DOWNLOADED',
  'PERMISSION_REVOKED',
  'VIOLATION_DETECTED',
  'COMPLIANCE_WARNING',
  'SYSTEM_BROADCAST'
);

-- CreateTable
CREATE TABLE "NotificationRecord" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "metadata"  JSONB        NOT NULL DEFAULT '{}',
  "read"      BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"    TIMESTAMP(3),

  CONSTRAINT "NotificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "NotificationRecord_userId_idx" ON "NotificationRecord"("userId");
CREATE INDEX "NotificationRecord_type_idx" ON "NotificationRecord"("type");
CREATE INDEX "NotificationRecord_read_idx" ON "NotificationRecord"("read");
CREATE INDEX "NotificationRecord_createdAt_idx" ON "NotificationRecord"("createdAt");

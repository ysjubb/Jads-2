-- Add missing fields to SpecialUser for SpecialUserAuthService compatibility
ALTER TABLE "SpecialUser" ADD COLUMN "unitName" TEXT;
ALTER TABLE "SpecialUser" ADD COLUMN "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SpecialUser" ADD COLUMN "unitType" TEXT;
ALTER TABLE "SpecialUser" ADD COLUMN "baseLocation" TEXT;
ALTER TABLE "SpecialUser" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "SpecialUser" ADD COLUMN "credentialsIssuedAt" TIMESTAMP(3);
ALTER TABLE "SpecialUser" ADD COLUMN "lastPasswordChangedAt" TIMESTAMP(3);
ALTER TABLE "SpecialUser" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "SpecialUser" ADD COLUMN "suspendedReason" TEXT;

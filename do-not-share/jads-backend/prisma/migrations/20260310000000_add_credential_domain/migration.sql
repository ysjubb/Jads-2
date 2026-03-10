-- Credential Domain Separation — Aircraft vs Drone
-- Aircraft users: credentials from AAI or DGCA
-- Drone users: credentials from Digital Sky or DGCA
-- No dual-domain access — one user ID = one domain only

-- 1. Create new enum types
CREATE TYPE "CredentialDomain" AS ENUM ('AIRCRAFT', 'DRONE');
CREATE TYPE "IssuingAuthority" AS ENUM ('AAI', 'DGCA', 'DIGITAL_SKY');

-- 2. Add columns as nullable first
ALTER TABLE "CivilianUser"
  ADD COLUMN "credentialDomain"     "CredentialDomain",
  ADD COLUMN "issuingAuthority"     "IssuingAuthority",
  ADD COLUMN "credentialSyncedAt"   TIMESTAMP(3),
  ADD COLUMN "credentialExternalId" TEXT;

ALTER TABLE "SpecialUser"
  ADD COLUMN "credentialDomain"     "CredentialDomain",
  ADD COLUMN "issuingAuthority"     "IssuingAuthority",
  ADD COLUMN "credentialSyncedAt"   TIMESTAMP(3),
  ADD COLUMN "credentialExternalId" TEXT;

-- 3. Backfill existing data based on role
-- PILOT / PILOT_AND_DRONE → AIRCRAFT domain, AAI authority
UPDATE "CivilianUser" SET "credentialDomain" = 'AIRCRAFT', "issuingAuthority" = 'AAI'
  WHERE "role" IN ('PILOT', 'PILOT_AND_DRONE');

-- DRONE_OPERATOR → DRONE domain, DIGITAL_SKY authority
UPDATE "CivilianUser" SET "credentialDomain" = 'DRONE', "issuingAuthority" = 'DIGITAL_SKY'
  WHERE "role" = 'DRONE_OPERATOR';

-- Any remaining NULL (shouldn't happen) defaults to AIRCRAFT/DGCA
UPDATE "CivilianUser" SET "credentialDomain" = 'AIRCRAFT', "issuingAuthority" = 'DGCA'
  WHERE "credentialDomain" IS NULL;

-- Change PILOT_AND_DRONE users to PILOT (aircraft domain only)
UPDATE "CivilianUser" SET "role" = 'PILOT' WHERE "role" = 'PILOT_AND_DRONE';

-- SpecialUser backfill
UPDATE "SpecialUser" SET "credentialDomain" = 'AIRCRAFT', "issuingAuthority" = 'DGCA'
  WHERE "role" IN ('GOVT_PILOT');

UPDATE "SpecialUser" SET "credentialDomain" = 'DRONE', "issuingAuthority" = 'DGCA'
  WHERE "role" IN ('GOVT_DRONE_OPERATOR');

-- Remaining special users (GOVT_ADMIN etc) default to AIRCRAFT/DGCA
UPDATE "SpecialUser" SET "credentialDomain" = 'AIRCRAFT', "issuingAuthority" = 'DGCA'
  WHERE "credentialDomain" IS NULL;

-- 4. Make columns NOT NULL
ALTER TABLE "CivilianUser"
  ALTER COLUMN "credentialDomain"  SET NOT NULL,
  ALTER COLUMN "issuingAuthority"  SET NOT NULL;

ALTER TABLE "SpecialUser"
  ALTER COLUMN "credentialDomain"  SET NOT NULL,
  ALTER COLUMN "issuingAuthority"  SET NOT NULL;

-- 5. CHECK constraints: block PILOT_AND_DRONE role from future use
ALTER TABLE "CivilianUser"
  ADD CONSTRAINT "chk_civilian_no_dual_domain" CHECK ("role" != 'PILOT_AND_DRONE');

ALTER TABLE "SpecialUser"
  ADD CONSTRAINT "chk_special_no_dual_domain" CHECK ("role" != 'PILOT_AND_DRONE');

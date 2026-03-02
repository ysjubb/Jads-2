-- JADS Platform v4.0 — Initial Schema Migration
-- Generated from schema.prisma
-- Run with: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PILOT', 'DRONE_OPERATOR', 'PILOT_AND_DRONE', 'GOVT_PILOT', 'GOVT_DRONE_OPERATOR', 'GOVT_ADMIN', 'PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR', 'AAI_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR', 'INVESTIGATION_OFFICER');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVERIFICATION_DUE', 'EXPIRED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "AirspaceDataSource" AS ENUM ('DGCA_MANUAL', 'AAI_AIP', 'NOTAM_DERIVED', 'IAF_CLASSIFIED', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "AirspaceApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NpntClass" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "NtpSyncStatus" AS ENUM ('SYNCED', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "MissionUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('GEOFENCE_BREACH', 'ALTITUDE_VIOLATION', 'SPEED_VIOLATION', 'TIME_WINDOW_VIOLATION', 'CHAIN_BREAK', 'REPLAY_ATTEMPT', 'GPS_SPOOFING_SUSPECTED', 'UNPERMITTED_ZONE');

-- CreateEnum
CREATE TYPE "ViolationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FlightRules" AS ENUM ('IFR', 'VFR', 'SVFR', 'Y', 'Z');

-- CreateEnum
CREATE TYPE "FlightType" AS ENUM ('S', 'N', 'G', 'M', 'X');

-- CreateEnum
CREATE TYPE "FlightPlanStatus" AS ENUM ('DRAFT', 'VALIDATED', 'FILED', 'ACKNOWLEDGED', 'ACTIVATED', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'REJECTED_BY_ATC');

-- CreateTable
CREATE TABLE "CivilianUser" (
    "id" TEXT NOT NULL,
    "aadhaarHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PILOT',
    "identityStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "dgcaLicenseNumber" TEXT,
    "dgcaLicenseExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "annualReconfirmDue" TIMESTAMP(3),

    CONSTRAINT "CivilianUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "unitDesignator" TEXT NOT NULL,
    "entityCode" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'GOVT_DRONE_OPERATOR',
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "provisionedBy" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "passwordLastChanged" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovtAdminEntityRights" (
    "id" TEXT NOT NULL,
    "specialUserId" TEXT NOT NULL,
    "entityCode" TEXT NOT NULL,
    "canViewMissions" BOOLEAN NOT NULL DEFAULT true,
    "canViewFlightPlans" BOOLEAN NOT NULL DEFAULT true,
    "canViewViolations" BOOLEAN NOT NULL DEFAULT true,
    "canExportForensic" BOOLEAN NOT NULL DEFAULT false,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovtAdminEntityRights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationAccess" (
    "id" TEXT NOT NULL,
    "grantedToUserId" TEXT NOT NULL,
    "missionId" TEXT,
    "flightPlanId" TEXT,
    "reason" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestigationAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detailJson" TEXT NOT NULL,
    "sequenceNumber" BIGSERIAL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'GOVT_ADMIN',
    "entityCode" TEXT NOT NULL,
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpRecord" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirspaceVersion" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "approvalStatus" "AirspaceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "dataSource" "AirspaceDataSource" NOT NULL DEFAULT 'ADMIN_OVERRIDE',
    "airacCycle" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "changeReason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "supersededById" TEXT,

    CONSTRAINT "AirspaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MannedFlightPlan" (
    "id" TEXT NOT NULL,
    "filedBy" TEXT NOT NULL,
    "filedByType" TEXT NOT NULL DEFAULT 'CIVILIAN',
    "status" "FlightPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "flightRules" "FlightRules" NOT NULL DEFAULT 'VFR',
    "flightType" "FlightType" NOT NULL DEFAULT 'G',
    "aircraftId" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "wakeTurbulence" TEXT NOT NULL DEFAULT 'L',
    "equipment" TEXT NOT NULL DEFAULT 'S',
    "survivalEquipment" TEXT,
    "adep" TEXT NOT NULL,
    "ades" TEXT NOT NULL,
    "altn1" TEXT,
    "altn2" TEXT,
    "eobt" TIMESTAMP(3) NOT NULL,
    "eet" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "cruisingLevel" TEXT NOT NULL,
    "cruisingSpeed" TEXT NOT NULL,
    "totalEet" TEXT,
    "endurance" TEXT,
    "personsOnBoard" INTEGER,
    "item18" TEXT,
    "item19" TEXT,
    "aftnMessage" TEXT,
    "aftnAddressees" TEXT,
    "ficNumber" TEXT,
    "adcNumber" TEXT,
    "notifyEmail" TEXT,
    "notifyMobile" TEXT,
    "filedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MannedFlightPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroneMission" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operatorType" TEXT NOT NULL DEFAULT 'CIVILIAN',
    "deviceId" TEXT NOT NULL,
    "deviceModel" TEXT,
    "npntClassification" "NpntClass" NOT NULL,
    "permissionArtefactId" TEXT,
    "missionStartUtcMs" TEXT NOT NULL,
    "missionEndUtcMs" TEXT,
    "ntpSyncStatus" "NtpSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "ntpOffsetMs" INTEGER,
    "certValidAtStart" BOOLEAN NOT NULL DEFAULT false,
    "certExpiryUtcMs" TEXT,
    "chainVerifiedByServer" BOOLEAN NOT NULL DEFAULT false,
    "chainFailureSequence" INTEGER,
    "uploadStatus" "MissionUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfMissionId" TEXT,
    "strongboxBacked" BOOLEAN,
    "secureBootVerified" BOOLEAN,
    "androidVersionAtUpload" TEXT,
    "sensorHealthSummaryFlags" INTEGER,
    "recordsWithDegradedGps" INTEGER,
    "archivedCrlBase64" TEXT,

    CONSTRAINT "DroneMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroneTelemetryRecord" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "canonicalPayloadHex" TEXT NOT NULL,
    "chainHashHex" TEXT NOT NULL,
    "signatureHex" TEXT NOT NULL,
    "prevHashPrefixHex" TEXT NOT NULL,
    "crc32Valid" BOOLEAN NOT NULL,
    "gnssStatus" TEXT NOT NULL,
    "sensorHealthFlags" INTEGER NOT NULL DEFAULT 0,
    "decodedJson" TEXT NOT NULL,
    "recordedAtUtcMs" TEXT NOT NULL,

    CONSTRAINT "DroneTelemetryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroneViolation" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "violationType" "ViolationType" NOT NULL,
    "severity" "ViolationSeverity" NOT NULL,
    "timestampUtcMs" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "overriddenAt" TIMESTAMP(3),

    CONSTRAINT "DroneViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroneMissionOverride" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "overriddenBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "overrideType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DroneMissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdcRecord" (
    "id" TEXT NOT NULL,
    "flightPlanId" TEXT,
    "adcNumber" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "AdcRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FicRecord" (
    "id" TEXT NOT NULL,
    "ficNumber" TEXT NOT NULL,
    "firCode" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "issuedBy" TEXT NOT NULL,
    "issuedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FicRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotamRecord" (
    "id" TEXT NOT NULL,
    "notamId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotamRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetarRecord" (
    "id" TEXT NOT NULL,
    "icao" TEXT NOT NULL,
    "rawMetar" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "windDirection" INTEGER,
    "windSpeedKt" INTEGER,
    "visibilityM" INTEGER,
    "tempC" DOUBLE PRECISION,
    "dewpointC" DOUBLE PRECISION,
    "qnhHpa" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetarRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AerodromeRecord" (
    "id" TEXT NOT NULL,
    "icao" TEXT NOT NULL,
    "iata" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "latitudeDeg" DOUBLE PRECISION NOT NULL,
    "longitudeDeg" DOUBLE PRECISION NOT NULL,
    "elevationFt" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'AIRPORT',
    "runways" TEXT,

    CONSTRAINT "AerodromeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CivilianUser_aadhaarHash_key" ON "CivilianUser"("aadhaarHash");
CREATE UNIQUE INDEX "CivilianUser_phone_key" ON "CivilianUser"("phone");
CREATE UNIQUE INDEX "SpecialUser_username_key" ON "SpecialUser"("username");
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
CREATE UNIQUE INDEX "DroneMission_missionId_key" ON "DroneMission"("missionId");
CREATE UNIQUE INDEX "AdcRecord_adcNumber_key" ON "AdcRecord"("adcNumber");
CREATE UNIQUE INDEX "FicRecord_ficNumber_key" ON "FicRecord"("ficNumber");
CREATE UNIQUE INDEX "NotamRecord_notamId_key" ON "NotamRecord"("notamId");
CREATE UNIQUE INDEX "AerodromeRecord_icao_key" ON "AerodromeRecord"("icao");

-- CreateIndex (performance)
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "DroneMission_operatorId_idx" ON "DroneMission"("operatorId");
CREATE INDEX "DroneMission_uploadedAt_idx" ON "DroneMission"("uploadedAt");
CREATE INDEX "DroneTelemetryRecord_missionId_idx" ON "DroneTelemetryRecord"("missionId");
CREATE INDEX "DroneTelemetryRecord_sequence_idx" ON "DroneTelemetryRecord"("sequence");
CREATE INDEX "DroneViolation_missionId_idx" ON "DroneViolation"("missionId");
CREATE INDEX "MannedFlightPlan_filedBy_idx" ON "MannedFlightPlan"("filedBy");
CREATE INDEX "MannedFlightPlan_adep_ades_idx" ON "MannedFlightPlan"("adep", "ades");
CREATE INDEX "AirspaceVersion_dataType_idx" ON "AirspaceVersion"("dataType");
CREATE INDEX "AirspaceVersion_approvalStatus_idx" ON "AirspaceVersion"("approvalStatus");

-- AddForeignKey
ALTER TABLE "GovtAdminEntityRights" ADD CONSTRAINT "GovtAdminEntityRights_specialUserId_fkey" FOREIGN KEY ("specialUserId") REFERENCES "SpecialUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DroneTelemetryRecord" ADD CONSTRAINT "DroneTelemetryRecord_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DroneViolation" ADD CONSTRAINT "DroneViolation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DroneMissionOverride" ADD CONSTRAINT "DroneMissionOverride_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdcRecord" ADD CONSTRAINT "AdcRecord_flightPlanId_fkey" FOREIGN KEY ("flightPlanId") REFERENCES "MannedFlightPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

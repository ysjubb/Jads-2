-- JADS Platform v4.0 — Consolidated Schema Migration
-- Single migration matching schema.prisma exactly.
-- Run with: npx prisma migrate deploy

-- ═══════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════

CREATE TYPE "UserRole" AS ENUM ('PILOT', 'DRONE_OPERATOR', 'PILOT_AND_DRONE', 'GOVT_PILOT', 'GOVT_DRONE_OPERATOR', 'GOVT_ADMIN', 'PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR', 'AAI_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR', 'INVESTIGATION_OFFICER');

CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVERIFICATION_DUE', 'EXPIRED', 'SUSPENDED', 'REVOKED');

CREATE TYPE "UserAccountStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REVOKED');

CREATE TYPE "AirspaceDataSource" AS ENUM ('DGCA_MANUAL', 'AAI_AIP', 'NOTAM_DERIVED', 'IAF_CLASSIFIED', 'ADMIN_OVERRIDE', 'MANUAL');

CREATE TYPE "AirspaceApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

CREATE TYPE "NpntClass" AS ENUM ('GREEN', 'YELLOW', 'RED');

CREATE TYPE "DroneWeightCategory" AS ENUM ('NANO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN');

CREATE TYPE "ManufacturerPushSource" AS ENUM ('DJI', 'AUTEL', 'PARROT', 'SKYDIO', 'IDEAFORGE', 'ASTERIA', 'THROTTLE', 'GENERIC');

CREATE TYPE "DeferredSyncStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'PARTIAL', 'REJECTED');

CREATE TYPE "NtpSyncStatus" AS ENUM ('SYNCED', 'DEGRADED', 'FAILED');

CREATE TYPE "MissionUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

CREATE TYPE "ViolationType" AS ENUM ('GEOFENCE_BREACH', 'ALTITUDE_VIOLATION', 'SPEED_VIOLATION', 'TIME_WINDOW_VIOLATION', 'CHAIN_BREAK', 'REPLAY_ATTEMPT', 'GPS_SPOOFING_SUSPECTED', 'UNPERMITTED_ZONE');

CREATE TYPE "ViolationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "FlightRules" AS ENUM ('IFR', 'VFR', 'SVFR', 'Y', 'Z');

CREATE TYPE "FlightType" AS ENUM ('S', 'N', 'G', 'M', 'X');

CREATE TYPE "FlightPlanStatus" AS ENUM ('DRAFT', 'VALIDATED', 'FILED', 'FILING_FAILED', 'ACKNOWLEDGED', 'ACTIVATED', 'COMPLETED', 'CANCELLED', 'DELAYED', 'OVERDUE', 'REJECTED_BY_ATC', 'CLEARANCE_REJECTED', 'PENDING_CLEARANCE', 'ADC_ISSUED', 'FIC_ISSUED', 'FULLY_CLEARED', 'ARRIVED', 'STUB_TRANSMITTED', 'VOID', 'DEPARTED');

-- ═══════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════

-- CivilianUser
CREATE TABLE "CivilianUser" (
    "id" TEXT NOT NULL,
    "aadhaarHash" TEXT,
    "phone" TEXT,
    "mobileNumber" TEXT,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PILOT',
    "dgcaLicenseNumber" TEXT,
    "dgcaLicenseExpiry" TIMESTAMP(3),
    "pilotLicenceNumber" TEXT,
    "uinNumber" TEXT,
    "identityStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "aadhaarLast4" TEXT,
    "aadhaarUidToken" TEXT,
    "aadhaarNextDueAt" TIMESTAMP(3),
    "aadhaarVerifiedAt" TIMESTAMP(3),
    "maskedAadhaarNumber" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "mobileVerifiedAt" TIMESTAMP(3),
    "lastVerificationAt" TIMESTAMP(3),
    "nextReverificationDue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "annualReconfirmDue" TIMESTAMP(3),

    CONSTRAINT "CivilianUser_pkey" PRIMARY KEY ("id")
);

-- SpecialUser
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
    "unitName" TEXT,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "unitType" TEXT,
    "baseLocation" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credentialsIssuedAt" TIMESTAMP(3),
    "lastPasswordChangedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "serviceNumber" TEXT,
    "officialEmail" TEXT,
    "mobileNumber" TEXT,
    "unitDesignation" TEXT,
    "authorisedCallsigns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reconfirmationStatus" TEXT,
    "lastReconfirmedAt" TIMESTAMP(3),
    "nextReconfirmDueAt" TIMESTAMP(3),
    "nextAdminReconfirmDue" TIMESTAMP(3),
    "lastAdminReconfirmAt" TIMESTAMP(3),
    "annualReconfirmDue" TIMESTAMP(3),
    "createdByAdminId" TEXT,

    CONSTRAINT "SpecialUser_pkey" PRIMARY KEY ("id")
);

-- GovtAdminEntityRights
CREATE TABLE "GovtAdminEntityRights" (
    "id" TEXT NOT NULL,
    "specialUserId" TEXT NOT NULL,
    "adminUserId" TEXT,
    "entityCode" TEXT NOT NULL,
    "canViewMissions" BOOLEAN NOT NULL DEFAULT true,
    "canViewFlightPlans" BOOLEAN NOT NULL DEFAULT true,
    "canViewViolations" BOOLEAN NOT NULL DEFAULT true,
    "canExportForensic" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" TEXT NOT NULL,
    "grantedByAdminId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovtAdminEntityRights_pkey" PRIMARY KEY ("id")
);

-- InvestigationAccess
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

-- AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN,
    "errorCode" TEXT,
    "detailJson" TEXT NOT NULL,
    "sequenceNumber" BIGSERIAL,
    "rowHash" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AdminUser
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

-- OtpRecord
CREATE TABLE "OtpRecord" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "targetId" TEXT,
    "targetType" TEXT,
    "otpHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpRecord_pkey" PRIMARY KEY ("id")
);

-- AirspaceVersion
CREATE TABLE "AirspaceVersion" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT,
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
    "supersedes" TEXT,
    "supersededById" TEXT,

    CONSTRAINT "AirspaceVersion_pkey" PRIMARY KEY ("id")
);

-- MannedFlightPlan
CREATE TABLE "MannedFlightPlan" (
    "id" TEXT NOT NULL,
    "flightPlanId" BIGINT,
    "filedBy" TEXT NOT NULL,
    "filedByType" TEXT NOT NULL DEFAULT 'CIVILIAN',
    "aftnMessage" TEXT,
    "aftnAddressees" TEXT,
    "aftnTransmissionId" TEXT,
    "ficNumber" TEXT,
    "adcNumber" TEXT,
    "atsRef" TEXT,
    "notifyEmail" TEXT,
    "notifyMobile" TEXT,
    "filedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "item18" TEXT,
    "item19" TEXT,
    "item10Equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "item10Surveillance" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permissionArtefactId" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validatedAtUtc" TIMESTAMP(3),
    "validationResultJson" TEXT,
    "status" "FlightPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "flightRules" "FlightRules" NOT NULL DEFAULT 'VFR',
    "flightType" "FlightType" NOT NULL DEFAULT 'G',
    "aircraftId" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "wakeTurbulence" TEXT NOT NULL DEFAULT 'L',
    "equipment" TEXT NOT NULL DEFAULT 'S',
    "surveillance" TEXT,
    "survivalEquipment" TEXT,
    "adep" TEXT NOT NULL,
    "ades" TEXT NOT NULL,
    "altn1" TEXT,
    "altn2" TEXT,
    "eobt" TIMESTAMP(3) NOT NULL,
    "originalEobt" TIMESTAMP(3),
    "eet" TEXT NOT NULL,
    "totalEet" TEXT,
    "endurance" TEXT,
    "personsOnBoard" INTEGER,
    "route" TEXT NOT NULL,
    "cruisingLevel" TEXT NOT NULL,
    "cruisingSpeed" TEXT NOT NULL,
    "confirmationEmailSentAt" TIMESTAMP(3),
    "confirmationEmailStatus" TEXT,
    "confirmationSmsSentAt" TIMESTAMP(3),
    "confirmationSmsStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aftnTransmissionStatus" TEXT,
    "aftnGatewayResultJson" TEXT,
    "aftnTransmittedAt" TIMESTAMP(3),
    "cnlAftnMessage" TEXT,
    "arrAftnMessage" TEXT,
    "dlaAftnMessage" TEXT,
    "dlaFiledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "delayedNewEobt" TIMESTAMP(3),
    "delayReason" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "actualArrivalTime" TEXT,

    CONSTRAINT "MannedFlightPlan_pkey" PRIMARY KEY ("id")
);

-- DroneMission
CREATE TABLE "DroneMission" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "deviceNonce" TEXT,
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
    "deviceCertDer" TEXT,
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
    "serverReceivedAtUtcMs" TEXT,
    "droneWeightCategory" "DroneWeightCategory" NOT NULL DEFAULT 'UNKNOWN',
    "droneWeightGrams" INTEGER,
    "droneManufacturer" TEXT,
    "droneSerialNumber" TEXT,
    "nanoAckNumber" TEXT,
    "uinNumber" TEXT,
    "npntExempt" BOOLEAN NOT NULL DEFAULT false,
    "pqcPublicKeyHex" TEXT,
    "manufacturerPushId" TEXT,
    "manufacturerSource" TEXT,

    CONSTRAINT "DroneMission_pkey" PRIMARY KEY ("id")
);

-- DroneTelemetryRecord
CREATE TABLE "DroneTelemetryRecord" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "canonicalPayloadHex" TEXT NOT NULL,
    "chainHashHex" TEXT NOT NULL,
    "signatureHex" TEXT NOT NULL,
    "pqcSignatureHex" TEXT,
    "prevHashPrefixHex" TEXT NOT NULL,
    "crc32Valid" BOOLEAN NOT NULL,
    "gnssStatus" TEXT NOT NULL,
    "sensorHealthFlags" INTEGER NOT NULL DEFAULT 0,
    "decodedJson" TEXT NOT NULL,
    "recordedAtUtcMs" TEXT NOT NULL,

    CONSTRAINT "DroneTelemetryRecord_pkey" PRIMARY KEY ("id")
);

-- DroneViolation
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

-- DroneMissionOverride
CREATE TABLE "DroneMissionOverride" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "overriddenBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "overrideType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DroneMissionOverride_pkey" PRIMARY KEY ("id")
);

-- AdcRecord
CREATE TABLE "AdcRecord" (
    "id" TEXT NOT NULL,
    "flightPlanId" TEXT,
    "afmluId" INTEGER,
    "adcNumber" TEXT NOT NULL,
    "adcType" TEXT,
    "areaGeoJson" TEXT,
    "lowerFt" INTEGER NOT NULL DEFAULT 0,
    "lowerRef" TEXT NOT NULL DEFAULT 'AGL',
    "upperFt" INTEGER NOT NULL DEFAULT 0,
    "upperRef" TEXT NOT NULL DEFAULT 'AGL',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "activitySchedule" TEXT,
    "contactFrequency" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "remarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pulledAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdcRecord_pkey" PRIMARY KEY ("id")
);

-- FicRecord
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
    "supersedes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),

    CONSTRAINT "FicRecord_pkey" PRIMARY KEY ("id")
);

-- NotamRecord
CREATE TABLE "NotamRecord" (
    "id" TEXT NOT NULL,
    "notamId" TEXT,
    "notamNumber" TEXT,
    "notamSeries" TEXT,
    "series" TEXT,
    "number" INTEGER,
    "year" INTEGER,
    "type" TEXT,
    "notamType" TEXT,
    "firCode" TEXT,
    "location" TEXT,
    "subject" TEXT,
    "condition" TEXT,
    "traffic" TEXT,
    "purpose" TEXT,
    "scope" TEXT,
    "lowerFl" INTEGER,
    "upperFl" INTEGER,
    "lowerFt" INTEGER,
    "upperFt" INTEGER,
    "areaGeoJson" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "content" TEXT,
    "rawText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "issuingAuthority" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "pulledAtUtc" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotamRecord_pkey" PRIMARY KEY ("id")
);

-- MetarRecord
CREATE TABLE "MetarRecord" (
    "id" TEXT NOT NULL,
    "icao" TEXT,
    "icaoCode" TEXT,
    "rawMetar" TEXT,
    "rawText" TEXT,
    "observedAt" TIMESTAMP(3),
    "observationUtc" TIMESTAMP(3),
    "windDirection" INTEGER,
    "windDirDeg" INTEGER,
    "windSpeedKt" INTEGER,
    "windGustKt" INTEGER,
    "visibilityM" INTEGER,
    "tempC" DOUBLE PRECISION,
    "dewpointC" DOUBLE PRECISION,
    "dewPointC" DOUBLE PRECISION,
    "qnhHpa" DOUBLE PRECISION,
    "altimeterHpa" DOUBLE PRECISION,
    "isSpeci" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetarRecord_pkey" PRIMARY KEY ("id")
);

-- AerodromeRecord
CREATE TABLE "AerodromeRecord" (
    "id" TEXT NOT NULL,
    "icao" TEXT,
    "icaoCode" TEXT,
    "iata" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "latitudeDeg" DOUBLE PRECISION,
    "longitudeDeg" DOUBLE PRECISION,
    "latDeg" DOUBLE PRECISION,
    "lonDeg" DOUBLE PRECISION,
    "elevationFt" INTEGER,
    "magneticVariation" DOUBLE PRECISION,
    "type" TEXT NOT NULL DEFAULT 'AIRPORT',
    "aerodromeType" TEXT,
    "status" TEXT,
    "firCode" TEXT,
    "transitionAltitudeFt" INTEGER,
    "transitionLevelFl" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "runways" TEXT,

    CONSTRAINT "AerodromeRecord_pkey" PRIMARY KEY ("id")
);

-- EvidenceLedger
CREATE TABLE "EvidenceLedger" (
    "id" TEXT NOT NULL,
    "anchorDate" DATE NOT NULL,
    "missionCount" INTEGER NOT NULL DEFAULT 0,
    "missionIdsCsvHash" TEXT NOT NULL,
    "anchorHash" TEXT NOT NULL,
    "prevAnchorHash" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobRunId" TEXT NOT NULL,
    "rfc3161TimestampToken" TEXT,
    "tsaName" TEXT,
    "tsaTimestamp" TIMESTAMP(3),
    "tsaRequestHash" TEXT,

    CONSTRAINT "EvidenceLedger_pkey" PRIMARY KEY ("id")
);

-- ManufacturerVendor
CREATE TABLE "ManufacturerVendor" (
    "id" TEXT NOT NULL,
    "vendorCode" "ManufacturerPushSource" NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorKeyHash" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredBy" TEXT NOT NULL,
    "lastPushAt" TIMESTAMP(3),
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "totalFlights" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ManufacturerVendor_pkey" PRIMARY KEY ("id")
);

-- ManufacturerPushBatch
CREATE TABLE "ManufacturerPushBatch" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "pushType" TEXT NOT NULL,
    "deferredReason" TEXT,
    "deferredSinceUtcMs" TEXT,
    "receivedAtUtcMs" TEXT NOT NULL,
    "status" "DeferredSyncStatus" NOT NULL DEFAULT 'QUEUED',
    "flightCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ManufacturerPushBatch_pkey" PRIMARY KEY ("id")
);

-- ManufacturerPushFlight
CREATE TABLE "ManufacturerPushFlight" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "vendorFlightId" TEXT NOT NULL,
    "droneSerialNumber" TEXT NOT NULL,
    "droneModel" TEXT NOT NULL,
    "droneWeightCategory" "DroneWeightCategory" NOT NULL DEFAULT 'UNKNOWN',
    "operatorId" TEXT,
    "pilotId" TEXT,
    "flightStartUtcMs" TEXT NOT NULL,
    "flightEndUtcMs" TEXT NOT NULL,
    "takeoffLatDeg" DOUBLE PRECISION NOT NULL,
    "takeoffLonDeg" DOUBLE PRECISION NOT NULL,
    "landingLatDeg" DOUBLE PRECISION,
    "landingLonDeg" DOUBLE PRECISION,
    "maxAltitudeMeters" DOUBLE PRECISION,
    "maxSpeedMs" DOUBLE PRECISION,
    "totalDistanceMeters" DOUBLE PRECISION,
    "telemetryJson" TEXT NOT NULL,
    "telemetryPointCount" INTEGER NOT NULL DEFAULT 0,
    "telemetryHz" DOUBLE PRECISION,
    "linkedMissionId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "ingestionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ingestionError" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ManufacturerPushFlight_pkey" PRIMARY KEY ("id")
);

-- Bsa2023PartBDeclaration
CREATE TABLE "Bsa2023PartBDeclaration" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "declarantName" TEXT NOT NULL,
    "declarantDesignation" TEXT NOT NULL,
    "declarantEntityCode" TEXT NOT NULL,
    "declarantUserId" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "allInvariantsHeld" BOOLEAN NOT NULL,
    "conditionsSatisfied" BOOLEAN NOT NULL,
    "signedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureMethod" TEXT NOT NULL DEFAULT 'DIGITAL_JWT',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bsa2023PartBDeclaration_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════
-- UNIQUE INDEXES
-- ═══════════════════════════════════════════════

CREATE UNIQUE INDEX "CivilianUser_aadhaarHash_key" ON "CivilianUser"("aadhaarHash");
CREATE UNIQUE INDEX "CivilianUser_mobileNumber_key" ON "CivilianUser"("mobileNumber");
CREATE UNIQUE INDEX "SpecialUser_username_key" ON "SpecialUser"("username");
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
CREATE UNIQUE INDEX "DroneMission_missionId_key" ON "DroneMission"("missionId");
CREATE UNIQUE INDEX "DroneMission_deviceNonce_key" ON "DroneMission"("deviceNonce");
CREATE UNIQUE INDEX "AdcRecord_adcNumber_key" ON "AdcRecord"("adcNumber");
CREATE UNIQUE INDEX "AdcRecord_afmluId_adcNumber_key" ON "AdcRecord"("afmluId", "adcNumber");
CREATE UNIQUE INDEX "FicRecord_ficNumber_key" ON "FicRecord"("ficNumber");
CREATE UNIQUE INDEX "NotamRecord_notamId_key" ON "NotamRecord"("notamId");
CREATE UNIQUE INDEX "NotamRecord_notamNumber_key" ON "NotamRecord"("notamNumber");
CREATE UNIQUE INDEX "AerodromeRecord_icao_key" ON "AerodromeRecord"("icao");
CREATE UNIQUE INDEX "EvidenceLedger_anchorDate_key" ON "EvidenceLedger"("anchorDate");
CREATE UNIQUE INDEX "ManufacturerVendor_vendorCode_key" ON "ManufacturerVendor"("vendorCode");
CREATE UNIQUE INDEX "ManufacturerPushBatch_batchReference_key" ON "ManufacturerPushBatch"("batchReference");
CREATE UNIQUE INDEX "ManufacturerPushFlight_batchId_vendorFlightId_key" ON "ManufacturerPushFlight"("batchId", "vendorFlightId");

-- ═══════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "AuditLog_sequenceNumber_idx" ON "AuditLog"("sequenceNumber");
CREATE INDEX "AirspaceVersion_dataType_idx" ON "AirspaceVersion"("dataType");
CREATE INDEX "AirspaceVersion_approvalStatus_idx" ON "AirspaceVersion"("approvalStatus");
CREATE INDEX "MannedFlightPlan_filedBy_idx" ON "MannedFlightPlan"("filedBy");
CREATE INDEX "MannedFlightPlan_adep_ades_idx" ON "MannedFlightPlan"("adep", "ades");
CREATE INDEX "DroneMission_operatorId_idx" ON "DroneMission"("operatorId");
CREATE INDEX "DroneMission_uploadedAt_idx" ON "DroneMission"("uploadedAt");
CREATE INDEX "DroneMission_droneWeightCategory_idx" ON "DroneMission"("droneWeightCategory");
CREATE INDEX "DroneMission_droneManufacturer_idx" ON "DroneMission"("droneManufacturer");
CREATE INDEX "DroneTelemetryRecord_missionId_idx" ON "DroneTelemetryRecord"("missionId");
CREATE INDEX "DroneTelemetryRecord_sequence_idx" ON "DroneTelemetryRecord"("sequence");
CREATE INDEX "DroneViolation_missionId_idx" ON "DroneViolation"("missionId");
CREATE INDEX "EvidenceLedger_anchorDate_idx" ON "EvidenceLedger"("anchorDate");
CREATE INDEX "ManufacturerPushBatch_vendorId_idx" ON "ManufacturerPushBatch"("vendorId");
CREATE INDEX "ManufacturerPushBatch_status_idx" ON "ManufacturerPushBatch"("status");
CREATE INDEX "ManufacturerPushBatch_receivedAtUtcMs_idx" ON "ManufacturerPushBatch"("receivedAtUtcMs");
CREATE INDEX "ManufacturerPushFlight_batchId_idx" ON "ManufacturerPushFlight"("batchId");
CREATE INDEX "ManufacturerPushFlight_droneSerialNumber_idx" ON "ManufacturerPushFlight"("droneSerialNumber");
CREATE INDEX "ManufacturerPushFlight_operatorId_idx" ON "ManufacturerPushFlight"("operatorId");
CREATE INDEX "ManufacturerPushFlight_flightStartUtcMs_idx" ON "ManufacturerPushFlight"("flightStartUtcMs");
CREATE INDEX "Bsa2023PartBDeclaration_missionId_idx" ON "Bsa2023PartBDeclaration"("missionId");
CREATE INDEX "Bsa2023PartBDeclaration_certificateId_idx" ON "Bsa2023PartBDeclaration"("certificateId");
CREATE INDEX "Bsa2023PartBDeclaration_declarantUserId_idx" ON "Bsa2023PartBDeclaration"("declarantUserId");

-- ═══════════════════════════════════════════════
-- FOREIGN KEYS
-- ═══════════════════════════════════════════════

ALTER TABLE "GovtAdminEntityRights" ADD CONSTRAINT "GovtAdminEntityRights_specialUserId_fkey" FOREIGN KEY ("specialUserId") REFERENCES "SpecialUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MannedFlightPlan" ADD CONSTRAINT "MannedFlightPlan_civilianFiler_fkey" FOREIGN KEY ("filedBy") REFERENCES "CivilianUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MannedFlightPlan" ADD CONSTRAINT "MannedFlightPlan_specialFiler_fkey" FOREIGN KEY ("filedBy") REFERENCES "SpecialUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DroneTelemetryRecord" ADD CONSTRAINT "DroneTelemetryRecord_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DroneViolation" ADD CONSTRAINT "DroneViolation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DroneMissionOverride" ADD CONSTRAINT "DroneMissionOverride_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdcRecord" ADD CONSTRAINT "AdcRecord_flightPlanId_fkey" FOREIGN KEY ("flightPlanId") REFERENCES "MannedFlightPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManufacturerPushBatch" ADD CONSTRAINT "ManufacturerPushBatch_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ManufacturerVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturerPushFlight" ADD CONSTRAINT "ManufacturerPushFlight_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ManufacturerPushBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BSA 2023 Section 63 Part B Declarations
-- Stores signed declarations from authorised officers confirming
-- that conditions of BSA Section 63 are satisfied for a mission's evidence.

CREATE TABLE "Bsa2023PartBDeclaration" (
    "id"                     TEXT NOT NULL,
    "missionId"              TEXT NOT NULL,
    "certificateId"          TEXT NOT NULL,
    "declarantName"          TEXT NOT NULL,
    "declarantDesignation"   TEXT NOT NULL,
    "declarantEntityCode"    TEXT NOT NULL,
    "declarantUserId"        TEXT NOT NULL,
    "declarationText"        TEXT NOT NULL,
    "allInvariantsHeld"      BOOLEAN NOT NULL,
    "conditionsSatisfied"    BOOLEAN NOT NULL,
    "signedAtUtc"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureMethod"        TEXT NOT NULL DEFAULT 'DIGITAL_JWT',
    "ipAddress"              TEXT,
    "userAgent"              TEXT,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bsa2023PartBDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bsa2023PartBDeclaration_missionId_idx" ON "Bsa2023PartBDeclaration"("missionId");
CREATE INDEX "Bsa2023PartBDeclaration_certificateId_idx" ON "Bsa2023PartBDeclaration"("certificateId");
CREATE INDEX "Bsa2023PartBDeclaration_declarantUserId_idx" ON "Bsa2023PartBDeclaration"("declarantUserId");

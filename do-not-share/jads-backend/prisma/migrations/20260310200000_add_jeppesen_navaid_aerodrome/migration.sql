-- Jeppesen chart data (one-way import from Jeppesen NavData)
CREATE TABLE IF NOT EXISTS "JeppesenChart" (
    "id"            SERIAL       PRIMARY KEY,
    "chartId"       TEXT         NOT NULL,
    "icaoCode"      TEXT         NOT NULL,
    "chartType"     TEXT         NOT NULL,
    "procedureName" TEXT         NOT NULL,
    "revision"      TEXT         NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate"    TIMESTAMP(3),
    "chartDataUrl"  TEXT,
    "waypointsJson" TEXT,
    "isActive"      BOOLEAN      NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JeppesenChart_chartId_key" UNIQUE ("chartId")
);

CREATE INDEX IF NOT EXISTS "JeppesenChart_icaoCode_idx" ON "JeppesenChart"("icaoCode");
CREATE INDEX IF NOT EXISTS "JeppesenChart_chartType_idx" ON "JeppesenChart"("chartType");

-- Navaid data (one-way import from Jeppesen NavData)
CREATE TABLE IF NOT EXISTS "Navaid" (
    "id"            SERIAL       PRIMARY KEY,
    "navaidId"      TEXT         NOT NULL,
    "type"          TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "lat"           DOUBLE PRECISION NOT NULL,
    "lon"           DOUBLE PRECISION NOT NULL,
    "frequency"     TEXT,
    "declination"   DOUBLE PRECISION,
    "icaoCode"      TEXT,
    "firCode"       TEXT,
    "isActive"      BOOLEAN      NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Navaid_navaidId_key" UNIQUE ("navaidId")
);

CREATE INDEX IF NOT EXISTS "Navaid_firCode_idx" ON "Navaid"("firCode");
CREATE INDEX IF NOT EXISTS "Navaid_icaoCode_idx" ON "Navaid"("icaoCode");

-- AAI aerodrome operational data (two-way sync with AAI)
CREATE TABLE IF NOT EXISTS "AerodromeInfo" (
    "id"             SERIAL       PRIMARY KEY,
    "icaoCode"       TEXT         NOT NULL,
    "iataCode"       TEXT,
    "name"           TEXT         NOT NULL,
    "city"           TEXT         NOT NULL,
    "runwaysJson"    TEXT         NOT NULL,
    "operatingHours" TEXT         NOT NULL,
    "elevationFt"    INTEGER      NOT NULL,
    "refLat"         DOUBLE PRECISION NOT NULL,
    "refLon"         DOUBLE PRECISION NOT NULL,
    "lastSyncedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AerodromeInfo_icaoCode_key" UNIQUE ("icaoCode")
);

CREATE INDEX IF NOT EXISTS "AerodromeInfo_icaoCode_idx" ON "AerodromeInfo"("icaoCode");

-- Add AAI reporting tracking to MannedFlightPlan (for two-way AAI data sync)
ALTER TABLE "MannedFlightPlan" ADD COLUMN IF NOT EXISTS "aaiReportedAt" TIMESTAMP(3);

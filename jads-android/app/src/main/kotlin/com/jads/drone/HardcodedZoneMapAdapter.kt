package com.jads.drone

// ─────────────────────────────────────────────────────────────────────────────
// HardcodedZoneMapAdapter — demo-quality IDigitalSkyAdapter.
//
// Why this exists:
//   The real Digital Sky adapter requires live HTTPS credentials (C3-01 —
//   UTM-SP registration pending). This adapter provides realistic zone
//   behaviour for demos and testing WITHOUT network access.
//
// Zone map strategy:
//   Zones are defined as axis-aligned bounding boxes (AABB) keyed by a
//   human-readable zone ID. For each zone the approved operating polygon is
//   the same rectangle — so GeofenceChecker has a real polygon to enforce.
//
//   Zone priority order (first match wins):
//     1. RED zones   — hard stop, no override
//     2. YELLOW zones — permission token required
//     3. GREEN zones  — proceed within AGL limit
//     4. Default      — GREEN, no polygon
//
// Demo configuration:
//   The DEMO_YELLOW_ZONE covers the iDEX demo site (Pragati Maidan, Delhi).
//   When the app is started at those coordinates with no permissionToken,
//   NpntComplianceGate will block and display the yellow-zone rationale.
//   Supplying token "DEMO-TOKEN-YELLOW-OK" simulates a valid PA.
//
// Production replacement:
//   Replace this class with a real HTTP adapter calling:
//     POST https://digitalsky.dgca.gov.in/api/gcs/flightlog/classify
//   with a valid UTM-SP API key and return the ZoneResult from the response.
// ─────────────────────────────────────────────────────────────────────────────

private data class ZoneEntry(
    val zoneId:    String,
    val zoneType:  ZoneType,
    val maxAglFt:  Int?,
    val minLat:    Double,
    val maxLat:    Double,
    val minLon:    Double,
    val maxLon:    Double
) {
    /** Returns a rectangle polygon for GeofenceChecker enforcement */
    fun toPolygon(): List<LatLon> = listOf(
        LatLon(minLat, minLon),
        LatLon(maxLat, minLon),
        LatLon(maxLat, maxLon),
        LatLon(minLat, maxLon)
    )
}

class HardcodedZoneMapAdapter : IDigitalSkyAdapter {

    // ── Zone definitions ──────────────────────────────────────────────────────
    // Coordinates: WGS-84 decimal degrees.  All altitudes: ft AGL.
    //
    // IMPORTANT: These zones are for DEMO purposes only.
    // Do NOT use for actual flight planning.

    private val zones: List<ZoneEntry> = listOf(

        // ── RED zones (near major airports, <5km) ──────────────────────────
        // IGI Airport Delhi — inner exclusion zone
        ZoneEntry("RED_VIDP_INNER", ZoneType.RED, null,
            minLat = 28.530, maxLat = 28.610, minLon = 77.060, maxLon = 77.140),

        // Indira Gandhi International — outer restricted buffer
        ZoneEntry("RED_VIDP_OUTER", ZoneType.RED, null,
            minLat = 28.480, maxLat = 28.660, minLon = 76.990, maxLon = 77.210),

        // Hindon AFS (military) — IAF operational airfield
        ZoneEntry("RED_VIHD_MILITARY", ZoneType.RED, null,
            minLat = 28.680, maxLat = 28.730, minLon = 77.680, maxLon = 77.740),

        // Chandigarh Airport (VICG)
        ZoneEntry("RED_VICG_INNER", ZoneType.RED, null,
            minLat = 30.640, maxLat = 30.700, minLon = 76.760, maxLon = 76.820),

        // ── YELLOW zones (require permission artefact) ───────────────────────
        // iDEX demo site — Pragati Maidan area, Delhi
        // This is the zone the demo operator will start in.
        // Triggering this zone exercises the full PA token flow.
        ZoneEntry("YELLOW_PRAGATI_MAIDAN_DEMO", ZoneType.YELLOW, 200,
            minLat = 28.615, maxLat = 28.640, minLon = 77.230, maxLon = 77.265),

        // Connaught Place central Delhi
        ZoneEntry("YELLOW_CP_DELHI", ZoneType.YELLOW, 150,
            minLat = 28.625, maxLat = 28.640, minLon = 77.205, maxLon = 77.225),

        // India Gate heritage zone
        ZoneEntry("YELLOW_INDIA_GATE", ZoneType.YELLOW, 100,
            minLat = 28.608, maxLat = 28.618, minLon = 77.225, maxLon = 77.240),

        // Rashtrapati Bhavan / government district
        ZoneEntry("YELLOW_RAJPATH_GOV", ZoneType.YELLOW, 50,
            minLat = 28.607, maxLat = 28.620, minLon = 77.195, maxLon = 77.215),

        // ── GREEN zones (approved, AGL-limited) ─────────────────────────────
        // Greater Noida drone testing corridor
        ZoneEntry("GREEN_NOIDA_TEST_CORRIDOR", ZoneType.GREEN, 400,
            minLat = 28.450, maxLat = 28.510, minLon = 77.490, maxLon = 77.570),

        // Dwarka open area
        ZoneEntry("GREEN_DWARKA_OPEN", ZoneType.GREEN, 300,
            minLat = 28.555, maxLat = 28.590, minLon = 77.010, maxLon = 77.060),

        // Palam agricultural zone (not near airport runway)
        ZoneEntry("GREEN_PALAM_AGRI", ZoneType.GREEN, 400,
            minLat = 28.560, maxLat = 28.590, minLon = 77.120, maxLon = 77.160)
    )

    // ── Demo valid tokens ─────────────────────────────────────────────────────
    // In production, token validation calls Digital Sky PA verification endpoint.
    // Demo tokens allow testing the YELLOW flow without live API credentials.
    private val validDemoTokens: Set<String> = setOf(
        "DEMO-TOKEN-YELLOW-OK",
        "DEMO-PA-PRAGATI-2026",
        "DEMO-PA-CP-2026"
    )

    // ── IDigitalSkyAdapter implementation ─────────────────────────────────────

    override suspend fun classifyLocation(
        latDeg: Double,
        lonDeg: Double,
        altFt:  Double
    ): ZoneResult {
        // Priority scan: RED first, then YELLOW, then GREEN
        for (priority in listOf(ZoneType.RED, ZoneType.YELLOW, ZoneType.GREEN)) {
            val match = zones.filter { it.zoneType == priority }.firstOrNull { z ->
                latDeg in z.minLat..z.maxLat && lonDeg in z.minLon..z.maxLon
            }
            if (match != null) {
                return ZoneResult(
                    zoneType        = match.zoneType,
                    zoneId          = match.zoneId,
                    maxAglFt        = match.maxAglFt,
                    approvedPolygon = if (match.zoneType != ZoneType.RED)
                                         match.toPolygon()
                                     else null
                )
            }
        }

        // No match — default GREEN, no polygon constraint
        return ZoneResult(
            zoneType        = ZoneType.GREEN,
            zoneId          = "GREEN_DEFAULT_UNZONED",
            maxAglFt        = 400,
            approvedPolygon = null
        )
    }

    override suspend fun validatePermissionToken(token: String): TokenValidationResult {
        // Demo: accept configured demo tokens OR any token that starts with "PA-DGCA-"
        // (simulates a real DGCA permission artefact prefix).
        val valid = token in validDemoTokens || token.startsWith("PA-DGCA-")
        return TokenValidationResult(
            valid  = valid,
            reason = if (!valid) "Unknown token. Use DEMO-TOKEN-YELLOW-OK for demo." else null
        )
    }
}

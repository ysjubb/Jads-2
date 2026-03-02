package com.jads.drone

// ─────────────────────────────────────────────────────────────────────────────
// GeofenceCheckerTest — unit tests for the ray-casting geofence algorithm.
//
// CONTROL FRAMEWORK
//   Every test documents:
//     TRIGGER:      Exact condition
//     OUTPUT:       Measurable result
//     FAILURE MODE: What breaks if the test fails
//     OWNER:        GeofenceChecker.isPointInPolygon()
//
// REQUIREMENT TRACEABILITY
//   RT-NPNT-07: DGCA NPNT Spec §4.1 — geofence breach detection
//   RT-FORENSIC: JADS Evidence Ledger §3.5 — GEOFENCE_BREACH violation recording
//
// PERFORMANCE SLA
//   Single isPointInPolygon() call < 1ms (verified in GF-14)
//   10,000 calls < 10ms (verified in GF-15)
// ─────────────────────────────────────────────────────────────────────────────

import org.junit.Assert.*
import org.junit.Test

class GeofenceCheckerTest {

    // ── Test polygons ─────────────────────────────────────────────────────────

    /** 1°×1° square centred near Delhi (28-29°N, 77-78°E) */
    private val squarePoly = listOf(
        LatLon(28.0, 77.0),
        LatLon(29.0, 77.0),
        LatLon(29.0, 78.0),
        LatLon(28.0, 78.0)
    )

    /** iDEX demo zone (Pragati Maidan bounding box) — matches HardcodedZoneMapAdapter */
    private val pragatiPoly = listOf(
        LatLon(28.615, 77.230),
        LatLon(28.640, 77.230),
        LatLon(28.640, 77.265),
        LatLon(28.615, 77.265)
    )

    /** L-shaped (concave) polygon — upper-left square with bottom-right notch removed */
    private val lShapePoly = listOf(
        LatLon(28.0, 77.0),
        LatLon(29.0, 77.0),
        LatLon(29.0, 78.0),
        LatLon(28.5, 78.0),   // notch begins
        LatLon(28.5, 77.5),
        LatLon(28.0, 77.5)    // notch ends
    )

    // ─────────────────────────────────────────────────────────────────────────
    // GF-01–05: Basic classification
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Point clearly inside square polygon (geometric centre)
    // OUTPUT:   isPointInPolygon returns true
    // FAILURE:  False-negative → legitimate GPS fix triggers GEOFENCE_BREACH violation
    // REQ:      RT-NPNT-07
    @Test fun `GF-01 centre of square polygon is inside`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.5, 77.5, squarePoly))
    }

    // TRIGGER:  Point clearly north of square (30°N, far outside)
    // OUTPUT:   false
    // FAILURE:  False-positive → breach not detected, non-compliant flight unchallenged
    @Test fun `GF-02 point north of polygon is outside`() {
        assertFalse(GeofenceChecker.isPointInPolygon(30.0, 77.5, squarePoly))
    }

    // TRIGGER:  Point south of polygon
    // OUTPUT:   false
    @Test fun `GF-03 point south of polygon is outside`() {
        assertFalse(GeofenceChecker.isPointInPolygon(27.0, 77.5, squarePoly))
    }

    // TRIGGER:  Point east of polygon
    // OUTPUT:   false
    @Test fun `GF-04 point east of polygon is outside`() {
        assertFalse(GeofenceChecker.isPointInPolygon(28.5, 79.0, squarePoly))
    }

    // TRIGGER:  Point west of polygon
    // OUTPUT:   false
    @Test fun `GF-05 point west of polygon is outside`() {
        assertFalse(GeofenceChecker.isPointInPolygon(28.5, 76.0, squarePoly))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-06–09: Boundary (edge and vertex) classification
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Point exactly on north edge (lat=29.0, inside lon range)
    // OUTPUT:   true (boundary = inside, conservative safe-pass for operators at zone edge)
    // FAILURE:  Boundary classified outside → operator at legal zone boundary gets false alarm
    // REQ:      RT-NPNT-07 — boundary must be inside for safe operation
    @Test fun `GF-06 point on north edge is inside (safe boundary)`() {
        assertTrue(GeofenceChecker.isPointInPolygon(29.0, 77.5, squarePoly))
    }

    // TRIGGER:  Exact corner vertex
    // OUTPUT:   true (corner is inside)
    @Test fun `GF-07 exact corner vertex is inside`() {
        for (corner in squarePoly) {
            assertTrue(
                "Corner (${corner.latDeg},${corner.lonDeg}) should be inside",
                GeofenceChecker.isPointInPolygon(corner.latDeg, corner.lonDeg, squarePoly)
            )
        }
    }

    // TRIGGER:  Point on east edge (lon=78.0, inside lat range)
    // OUTPUT:   true
    @Test fun `GF-08 point on east edge is inside`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.5, 78.0, squarePoly))
    }

    // TRIGGER:  Point on south edge
    // OUTPUT:   true
    @Test fun `GF-09 point on south edge is inside`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.0, 77.5, squarePoly))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-10–12: Concave polygon (L-shape)
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Point in upper-right arm of L-shape
    // OUTPUT:   true (inside L)
    // FAILURE:  Convex-hull fallback wrongly includes notch → breach inside notch missed
    @Test fun `GF-10 upper-right arm of L-shape is inside`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.75, 77.75, lShapePoly))
    }

    // TRIGGER:  Point in notch (lower-right quadrant — OUTSIDE the L)
    // OUTPUT:   false
    // FAILURE:  Notch classified inside → drone in excluded area not flagged
    @Test fun `GF-11 notch (lower-right) of L-shape is outside`() {
        assertFalse(GeofenceChecker.isPointInPolygon(28.25, 77.75, lShapePoly))
    }

    // TRIGGER:  Point in lower-left portion of L-shape
    // OUTPUT:   true
    @Test fun `GF-12 lower-left arm of L-shape is inside`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.25, 77.25, lShapePoly))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-13: Degenerate input
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Degenerate polygon with < 3 vertices
    // OUTPUT:   true (safe-pass — no constraint)
    // FAILURE:  Returns false → entire mission flagged as geofence breach for bad polygon data
    @Test fun `GF-13 degenerate polygon less than 3 vertices returns true (safe-pass)`() {
        assertTrue(GeofenceChecker.isPointInPolygon(28.5, 77.5, emptyList()))
        assertTrue(GeofenceChecker.isPointInPolygon(28.5, 77.5, listOf(LatLon(28.0, 77.0))))
        assertTrue(GeofenceChecker.isPointInPolygon(28.5, 77.5, listOf(LatLon(28.0, 77.0), LatLon(29.0, 77.0))))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-14–15: Performance SLA
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Single isPointInPolygon call with square polygon
    // OUTPUT:   Completes < 1ms
    // FAILURE:  Slow geofence check blocks 1Hz GPS loop — telemetry gap in evidence
    // REQ:      FORENSIC §6.1 performance SLA
    @Test fun `GF-14 single geofence check completes in less than 1ms`() {
        val start = System.nanoTime()
        GeofenceChecker.isPointInPolygon(28.5, 77.5, squarePoly)
        val elapsedMs = (System.nanoTime() - start) / 1_000_000.0
        assertTrue("Single check took ${elapsedMs}ms (limit 1ms)", elapsedMs < 1.0)
    }

    // TRIGGER:  10,000 geofence checks in loop (outside AABB fast-path)
    // OUTPUT:   All complete < 10ms total (avg < 0.001ms each)
    // FAILURE:  O(n²) or allocation in each call → GPS loop lag at sustained 1Hz
    @Test fun `GF-15 ten thousand geofence checks complete in less than 10ms`() {
        val start = System.nanoTime()
        repeat(10_000) {
            GeofenceChecker.isPointInPolygon(30.0, 79.0, squarePoly)  // outside, AABB fast-path
        }
        val elapsedMs = (System.nanoTime() - start) / 1_000_000.0
        assertTrue("10,000 checks took ${elapsedMs}ms (limit 10ms)", elapsedMs < 10.0)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-16–18: Edge cases and chaos inputs
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  Point at (0.0, 0.0) — prime meridian / equator
    // OUTPUT:   No crash, classified outside Delhi polygon
    // FAILURE:  Division by zero in interpolation → ArithmeticException crashes service
    @Test fun `GF-16 origin (0,0) does not crash and is outside Delhi polygon`() {
        assertFalse(GeofenceChecker.isPointInPolygon(0.0, 0.0, squarePoly))
    }

    // TRIGGER:  Negative latitude (southern hemisphere)
    // OUTPUT:   Classified outside (Delhi is northern hemisphere)
    // FAILURE:  Sign error in latitude comparison → S hemisphere classified as inside N hemisphere zone
    @Test fun `GF-17 negative latitude (southern hemisphere) classified outside Delhi polygon`() {
        assertFalse(GeofenceChecker.isPointInPolygon(-28.5, 77.5, squarePoly))
    }

    // TRIGGER:  iDEX demo point inside Pragati Maidan polygon
    // OUTPUT:   true — this is the exact demo flow that must work on 31 March
    // FAILURE:  Demo site misclassified → NPNT gate blocks demo mission
    @Test fun `GF-18 iDEX demo site inside Pragati Maidan polygon (demo critical)`() {
        // Point: centre of Pragati Maidan
        val lat = (28.615 + 28.640) / 2.0
        val lon = (77.230 + 77.265) / 2.0
        assertTrue(GeofenceChecker.isPointInPolygon(lat, lon, pragatiPoly))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GF-19–20: NPNT integration — polygon from zone adapter
    // ─────────────────────────────────────────────────────────────────────────

    // TRIGGER:  1000 random points strictly inside square polygon
    // OUTPUT:   All classified inside — 0 false-negatives
    // FAILURE:  Any false-negative generates spurious GEOFENCE_BREACH violations in normal flight
    @Test fun `GF-19 one thousand random interior points classified inside with zero false-negatives`() {
        var falseNegatives = 0
        val rng = java.util.Random(42)   // fixed seed for reproducibility
        repeat(1000) {
            val lat = 28.1 + rng.nextDouble() * 0.8   // strictly inside 28.1–28.9
            val lon = 77.1 + rng.nextDouble() * 0.8   // strictly inside 77.1–77.9
            if (!GeofenceChecker.isPointInPolygon(lat, lon, squarePoly)) falseNegatives++
        }
        assertEquals("False-negative count must be 0", 0, falseNegatives)
    }

    // TRIGGER:  1000 random points strictly outside square polygon (far away)
    // OUTPUT:   All classified outside — 0 false-positives
    // FAILURE:  Any false-positive means a geofence breach is NOT detected — regulatory violation
    @Test fun `GF-20 one thousand random exterior points classified outside with zero false-positives`() {
        var falsePositives = 0
        val rng = java.util.Random(99)
        repeat(1000) {
            val lat = 31.0 + rng.nextDouble() * 5.0   // strictly outside (>31°N)
            val lon = 80.0 + rng.nextDouble() * 5.0   // strictly outside (>80°E)
            if (GeofenceChecker.isPointInPolygon(lat, lon, squarePoly)) falsePositives++
        }
        assertEquals("False-positive count must be 0", 0, falsePositives)
    }
}

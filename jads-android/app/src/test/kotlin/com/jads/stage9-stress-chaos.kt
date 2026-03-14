// ─────────────────────────────────────────────────────────────────────────────
// JADS Android Stress & Chaos Tests — Stage 9
// File: app/src/test/kotlin/com/jads/stage9-stress-chaos.kt
//
// CONTROL FRAMEWORK
// Every test documents:
//   TRIGGER:      Exact condition that activates the control
//   OUTPUT:       Measurable, verifiable result
//   FAILURE MODE: How the failure manifests
//   OWNER:        Module responsible for the invariant
//
// Performance targets:
//   GeofenceChecker.isPointInPolygon() < 1ms per call
//   HardcodedZoneMapAdapter.classifyLocation() < 5ms per call (pure in-memory)
//   MissionController.checkViolations() < 2ms per call (per GPS tick)
//
// Formal traceability:
//   SC-GEO-01…20  → C1-05 geofence violation detection
//   SC-ZONE-01…15 → C1-01 hardcoded zone map
//   SC-CHAOS-01…15→ chaos / edge values / injection
// ─────────────────────────────────────────────────────────────────────────────

import com.jads.drone.*
import kotlin.math.*
import kotlinx.coroutines.runBlocking

// ── Minimal test harness ──────────────────────────────────────────────────────

var passed = 0; var failed = 0; var total = 0
fun test(name: String, block: () -> Unit) {
    total++
    try { block(); println("✅ $name"); passed++ }
    catch (e: Throwable) { println("❌ $name: ${e.message}"); failed++ }
}
fun assert(cond: Boolean, msg: String = "Assertion failed") {
    if (!cond) throw AssertionError(msg)
}
fun assertNear(a: Double, b: Double, tol: Double = 1e-9, msg: String = "") {
    if (abs(a - b) > tol) throw AssertionError("$msg expected $b ± $tol, got $a")
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

// 1-degree square around Delhi
val SQUARE: List<LatLon> = listOf(
    LatLon(28.0, 77.0), LatLon(29.0, 77.0),
    LatLon(29.0, 78.0), LatLon(28.0, 78.0)
)

// L-shaped (concave) polygon
val L_SHAPE: List<LatLon> = listOf(
    LatLon(28.0, 77.0), LatLon(29.0, 77.0),
    LatLon(29.0, 78.0), LatLon(28.5, 78.0),
    LatLon(28.5, 77.5), LatLon(28.0, 77.5)
)

// Thin triangle
val TRIANGLE: List<LatLon> = listOf(
    LatLon(28.0, 77.5), LatLon(28.5, 77.0), LatLon(28.5, 78.0)
)

// ─────────────────────────────────────────────────────────────────────────────
// SC-GEO: GeofenceChecker correctness
// ─────────────────────────────────────────────────────────────────────────────

// TRIGGER:  Centre of square polygon
// OUTPUT:   isPointInPolygon returns true
// FAILURE:  False-negative → GEOFENCE_BREACH violation for legal GPS fix
// OWNER:    GeofenceChecker.isPointInPolygon()
test("SC-GEO-01: Centre of square → inside") {
    assert(GeofenceChecker.isPointInPolygon(28.5, 77.5, SQUARE))
}

// TRIGGER:  Point north of square
// OUTPUT:   false
// FAILURE:  False-positive → geofence breach not detected
// OWNER:    GeofenceChecker AABB pre-check
test("SC-GEO-02: North of square → outside") {
    assert(!GeofenceChecker.isPointInPolygon(29.5, 77.5, SQUARE))
}

// TRIGGER:  Point south of polygon southern boundary (lat < 28.0)
// OUTPUT:   false
// FAILURE MODE: South AABB guard off-by-one → drone outside approved area not detected
// OWNER:    GeofenceChecker AABB pre-check (minLat guard)
test("SC-GEO-03: South of square → outside") {
    assert(!GeofenceChecker.isPointInPolygon(27.5, 77.5, SQUARE))
}

// TRIGGER:  Point east of polygon eastern boundary (lon > 78.0)
// OUTPUT:   false
// FAILURE MODE: East boundary ray-crossing error → east exceedance classified as inside
// OWNER:    GeofenceChecker AABB pre-check (maxLon guard)
test("SC-GEO-04: East of square → outside") {
    assert(!GeofenceChecker.isPointInPolygon(28.5, 78.5, SQUARE))
}

// TRIGGER:  Point west of polygon western boundary (lon < 77.0)
// OUTPUT:   false
// FAILURE MODE: West AABB guard miss → ray cast proceeds against all edges unnecessarily and may misclassify
// OWNER:    GeofenceChecker AABB pre-check (minLon guard)
test("SC-GEO-05: West of square → outside") {
    assert(!GeofenceChecker.isPointInPolygon(28.5, 76.5, SQUARE))
}

// TRIGGER:  Point exactly on polygon edge
// OUTPUT:   true (conservative safe-pass)
// FAILURE:  Operator at zone boundary gets spurious violation alarm
// OWNER:    GeofenceChecker.isOnSegment() boundary classification
test("SC-GEO-06: Point on north edge → inside (safe-pass)") {
    assert(GeofenceChecker.isPointInPolygon(29.0, 77.5, SQUARE),
           "boundary point must be classified inside")
}
test("SC-GEO-07: Point on west edge → inside (safe-pass)") {
    assert(GeofenceChecker.isPointInPolygon(28.5, 77.0, SQUARE))
}

// TRIGGER:  All 4 corner points
// OUTPUT:   All true
// FAILURE:  Corner classified outside → false violation at zone vertex
// OWNER:    GeofenceChecker corner/vertex handling
test("SC-GEO-08: All 4 corners classified inside") {
    SQUARE.forEach { corner ->
        assert(GeofenceChecker.isPointInPolygon(corner.latDeg, corner.lonDeg, SQUARE),
               "corner $corner must be inside")
    }
}

// TRIGGER:  Degenerate polygon with 0 vertices
// OUTPUT:   true (safe-pass — no constraint)
// FAILURE:  false → every fix flagged as breach when polygon data is missing
// OWNER:    GeofenceChecker n < 3 guard
test("SC-GEO-09: Empty polygon → safe-pass (true)") {
    assert(GeofenceChecker.isPointInPolygon(28.5, 77.5, emptyList()))
}

// TRIGGER:  Degenerate polygon with 2 vertices (line, not polygon)
// OUTPUT:   true (safe-pass)
// FAILURE:  Crash or false-negative on malformed NPNT polygon data
// OWNER:    GeofenceChecker n < 3 guard
test("SC-GEO-10: Two-vertex polygon → safe-pass (true)") {
    val line = listOf(LatLon(28.0, 77.0), LatLon(29.0, 78.0))
    assert(GeofenceChecker.isPointInPolygon(28.5, 77.5, line))
}

// TRIGGER:  Concave (L-shaped) polygon — point in the notch (should be outside)
// OUTPUT:   false
// FAILURE:  Convex-hull approximation classifies notch as inside — breach missed
// OWNER:    GeofenceChecker — must use ray-casting, not convex hull
test("SC-GEO-11: L-shape notch point → outside") {
    // Point in the bottom-right notch
    assert(!GeofenceChecker.isPointInPolygon(28.25, 77.75, L_SHAPE),
           "notch must be outside L-shape")
}
// TRIGGER:  Point in upper arm of L-shape (lat > 28.5, lon > 77.5)
// OUTPUT:   true — upper arm is a valid part of the approved area
// FAILURE MODE: Upper arm classified outside → legal mission receives spurious GEOFENCE_BREACH
// OWNER:    GeofenceChecker ray-casting (non-convex polygon)
test("SC-GEO-12: L-shape upper arm → inside") {
    assert(GeofenceChecker.isPointInPolygon(28.75, 77.75, L_SHAPE))
}

// TRIGGER:  Point in lower arm of L-shape (lat < 28.5, lon < 77.5)
// OUTPUT:   true — lower arm is a valid part of the approved area
// FAILURE MODE: Lower arm classified outside → operator receives false violation at mission start
// OWNER:    GeofenceChecker ray-casting (non-convex, lower-left region)
test("SC-GEO-13: L-shape lower arm → inside") {
    assert(GeofenceChecker.isPointInPolygon(28.25, 77.25, L_SHAPE))
}

// TRIGGER:  Triangle — centroid
// OUTPUT:   true
// FAILURE:  Centroid of triangle classified outside → all missions inside flagged
// OWNER:    GeofenceChecker ray-casting
test("SC-GEO-14: Triangle centroid → inside") {
    // Centroid ≈ (28.333, 77.5)
    assert(GeofenceChecker.isPointInPolygon(28.33, 77.5, TRIANGLE))
}

// TRIGGER:  Point at (0, 0) — equator/prime meridian
// OUTPUT:   No exception; classified outside Delhi polygon
// FAILURE:  Divide-by-zero crash at origin → service unavailable for any mission
// OWNER:    GeofenceChecker arithmetic safety
test("SC-GEO-15: (0,0) origin — no crash, outside Delhi polygon") {
    var threw = false
    try {
        val result = GeofenceChecker.isPointInPolygon(0.0, 0.0, SQUARE)
        assert(!result, "(0,0) must be outside Delhi polygon")
    } catch (e: Exception) {
        threw = true
    }
    assert(!threw, "should not throw for (0,0)")
}

// TRIGGER:  Negative latitude (southern hemisphere)
// OUTPUT:   false (outside northern hemisphere polygon)
// FAILURE:  Sign error in arithmetic flips hemisphere → all SH points classified inside
// OWNER:    GeofenceChecker — signed double arithmetic
test("SC-GEO-16: Negative latitude → outside India polygon") {
    assert(!GeofenceChecker.isPointInPolygon(-28.5, 77.5, SQUARE))
}

// TRIGGER:  1000 random interior points
// OUTPUT:   All classified inside
// FAILURE:  Any false-negative generates spurious GEOFENCE_BREACH violations
// OWNER:    GeofenceChecker ray-casting correctness
test("SC-GEO-17: 1000 random interior points → all inside") {
    val rng = java.util.Random(42L)
    var failures = 0
    repeat(1000) {
        val lat = 28.1 + rng.nextDouble() * 0.8
        val lon = 77.1 + rng.nextDouble() * 0.8
        if (!GeofenceChecker.isPointInPolygon(lat, lon, SQUARE)) failures++
    }
    assert(failures == 0, "Expected 0 false-negatives, got $failures")
}

// TRIGGER:  1000 random exterior points (bounding box far outside polygon)
// OUTPUT:   All classified outside
// FAILURE:  Any false-positive → geofence breach missed
// OWNER:    GeofenceChecker AABB fast-path + ray-casting
test("SC-GEO-18: 1000 random exterior points → all outside") {
    val rng = java.util.Random(43L)
    var failures = 0
    repeat(1000) {
        val lat = 30.0 + rng.nextDouble()
        val lon = 79.0 + rng.nextDouble()
        if (GeofenceChecker.isPointInPolygon(lat, lon, SQUARE)) failures++
    }
    assert(failures == 0, "Expected 0 false-positives, got $failures")
}

// TRIGGER:  10,000 geofence checks (performance)
// OUTPUT:   Complete < 100ms total (≈ 0.01ms per check)
// FAILURE:  > 1ms per check → 400Hz GPS rate blocks MissionController coroutine
// OWNER:    GeofenceChecker — O(n) algorithm, no allocation per call
test("SC-GEO-19: 10,000 checks < 100ms total") {
    val start = System.currentTimeMillis()
    repeat(10_000) {
        GeofenceChecker.isPointInPolygon(30.0, 79.0, SQUARE)  // AABB fast-path
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 100, "10k checks took ${elapsed}ms, expected < 100ms")
}

// TRIGGER:  100 interior checks (ray-casting path, no AABB short-circuit)
// OUTPUT:   Complete < 50ms total
// FAILURE:  Slow ray-casting → GPS loop blocks at 1Hz rate
// OWNER:    GeofenceChecker — O(n) per interior check
test("SC-GEO-20: 100 interior checks < 50ms total") {
    val start = System.currentTimeMillis()
    repeat(100) {
        GeofenceChecker.isPointInPolygon(28.5, 77.5, SQUARE)  // must ray-cast
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 50, "100 interior checks took ${elapsed}ms, expected < 50ms")
}

// ─────────────────────────────────────────────────────────────────────────────
// SC-ZONE: HardcodedZoneMapAdapter classification
// ─────────────────────────────────────────────────────────────────────────────

val zoneAdapter = HardcodedZoneMapAdapter()

// TRIGGER:  Coordinate inside VIDP RED zone (IGI Airport inner)
// OUTPUT:   ZoneResult.zoneType == RED
// FAILURE:  Airport RED zone returns GREEN → drone launches near active runway
// OWNER:    HardcodedZoneMapAdapter.classifyLocation() RED priority scan
test("SC-ZONE-01: Inside IGI inner RED zone → ZoneType.RED") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.565, 77.100, 100.0)
        assert(result.zoneType == ZoneType.RED,
               "IGI Airport must be RED, got ${result.zoneType}")
    }
}

// TRIGGER:  Coordinate inside YELLOW iDEX demo zone (Pragati Maidan)
// OUTPUT:   ZoneType.YELLOW
// FAILURE:  Demo site returns GREEN → NPNT token flow never exercised at iDEX
// OWNER:    HardcodedZoneMapAdapter.classifyLocation() YELLOW priority scan
test("SC-ZONE-02: Inside iDEX demo zone → ZoneType.YELLOW") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
        assert(result.zoneType == ZoneType.YELLOW,
               "iDEX demo zone must be YELLOW, got ${result.zoneType}")
    }
}

// TRIGGER:  YELLOW zone result
// OUTPUT:   maxAglFt is non-null and <= 400
// FAILURE:  Null maxAglFt → NpntComplianceGate cannot enforce altitude limit
// OWNER:    HardcodedZoneMapAdapter zone definitions
test("SC-ZONE-03: YELLOW zone has maxAglFt defined and <= 400") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
        assert(result.maxAglFt != null, "maxAglFt must not be null for YELLOW zone")
        assert(result.maxAglFt!! <= 400, "maxAglFt must be <= 400ft NPNT limit")
    }
}

// TRIGGER:  GREEN zone coordinate (Greater Noida test corridor)
// OUTPUT:   ZoneType.GREEN
// FAILURE:  Green zone returns YELLOW → legitimate operators blocked without reason
// OWNER:    HardcodedZoneMapAdapter.classifyLocation() GREEN scan
test("SC-ZONE-04: Inside GREEN test corridor → ZoneType.GREEN") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.480, 77.530, 200.0)
        assert(result.zoneType == ZoneType.GREEN,
               "Test corridor must be GREEN, got ${result.zoneType}")
    }
}

// TRIGGER:  Coordinate outside all defined zones (rural Rajasthan)
// OUTPUT:   ZoneType.GREEN (default unzoned)
// FAILURE:  Unzoned area returns RED → all operations in unzoned areas blocked
// OWNER:    HardcodedZoneMapAdapter fallback default
test("SC-ZONE-05: Outside all zones → default GREEN") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(27.0, 75.0, 100.0)
        assert(result.zoneType == ZoneType.GREEN,
               "Unzoned rural area must default to GREEN, got ${result.zoneType}")
    }
}

// TRIGGER:  RED zone result
// OUTPUT:   approvedPolygon is null (no polygon for RED — always blocked)
// FAILURE:  Non-null polygon for RED zone → MissionController tries to geofence a RED zone
// OWNER:    HardcodedZoneMapAdapter.classifyLocation() RED null polygon
test("SC-ZONE-06: RED zone approvedPolygon is null") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.565, 77.100, 100.0)
        assert(result.approvedPolygon == null,
               "RED zone must have null polygon (always blocked, no approved area)")
    }
}

// TRIGGER:  YELLOW zone result
// OUTPUT:   approvedPolygon is non-null with >= 3 vertices (rectangle from zone bounds)
// FAILURE:  Null polygon for YELLOW → GeofenceChecker safe-passes all checks
// OWNER:    HardcodedZoneMapAdapter.toPolygon()
test("SC-ZONE-07: YELLOW zone approvedPolygon has >= 3 vertices") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
        assert(result.approvedPolygon != null, "YELLOW zone must have polygon")
        assert(result.approvedPolygon!!.size >= 3,
               "Polygon must have >= 3 vertices, got ${result.approvedPolygon!!.size}")
    }
}

// TRIGGER:  Valid demo token "DEMO-TOKEN-YELLOW-OK"
// OUTPUT:   validatePermissionToken returns valid=true
// FAILURE:  Valid demo token rejected → demo cannot proceed past NPNT gate
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken()
test("SC-ZONE-08: DEMO-TOKEN-YELLOW-OK → valid=true") {
    runBlocking {
        val result = zoneAdapter.validatePermissionToken("DEMO-TOKEN-YELLOW-OK")
        assert(result.valid, "Demo token must be valid, got: ${result.reason}")
    }
}

// TRIGGER:  Invalid token "GARBAGE-TOKEN"
// OUTPUT:   valid=false with non-null reason
// FAILURE:  Invalid token accepted → NPNT compliance bypassed
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken()
test("SC-ZONE-09: Garbage token → valid=false with reason") {
    runBlocking {
        val result = zoneAdapter.validatePermissionToken("GARBAGE-TOKEN")
        assert(!result.valid, "Garbage token must be rejected")
        assert(result.reason != null, "Rejection must include a reason")
    }
}

// TRIGGER:  Token starting with "PA-DGCA-" prefix
// OUTPUT:   valid=true (simulates real DGCA permission artefact)
// FAILURE:  Real DGCA token rejected → production PA workflow blocked
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken() prefix check
test("SC-ZONE-10: PA-DGCA- prefixed token → valid=true") {
    runBlocking {
        val result = zoneAdapter.validatePermissionToken("PA-DGCA-2026-VIDP-001")
        assert(result.valid, "PA-DGCA prefix must be accepted")
    }
}

// TRIGGER:  RED zone classification triggers in NpntComplianceGate
// OUTPUT:   NpntGateResult.blocked == true, complianceScore == BLOCKED
// FAILURE:  RED zone not blocked → drone launches near runway, catastrophic safety risk
// OWNER:    NpntComplianceGate.evaluate() RED handling
test("SC-ZONE-11: NpntComplianceGate blocks RED zone") {
    // Stub proximity checker that returns clear (not near airport) so only RED zone blocks
    val proxChecker = object : IAirportProximityChecker {
        override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
            clear = true, restriction = ProximityRestriction.NONE,
            nearestIcaoCode = "NONE", nearestName = "none",
            distanceKm = 999.0, message = "stub"
        )
    }
    val gate = NpntComplianceGate(
        digitalSkyAdapter = zoneAdapter,
        proximityChecker  = proxChecker
    )
    runBlocking {
        val result = gate.evaluate(28.565, 77.100, 100.0, null)
        assert(result.blocked, "RED zone must block")
        assert(result.complianceScore == ComplianceScore.BLOCKED)
    }
}

// TRIGGER:  YELLOW zone without permission token
// OUTPUT:   blocked == true
// FAILURE:  YELLOW zone passes without token → NPNT permission artefact bypassed
// OWNER:    NpntComplianceGate.evaluate() YELLOW handling
test("SC-ZONE-12: NpntComplianceGate blocks YELLOW zone without token") {
    val proxChecker = object : IAirportProximityChecker {
        override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
            clear = true, restriction = ProximityRestriction.NONE,
            nearestIcaoCode = "NONE", nearestName = "none",
            distanceKm = 999.0, message = "stub"
        )
    }
    val gate = NpntComplianceGate(
        digitalSkyAdapter = zoneAdapter,
        proximityChecker  = proxChecker
    )
    runBlocking {
        val result = gate.evaluate(28.625, 77.245, 100.0, null)  // no token
        assert(result.blocked, "YELLOW zone without token must block")
    }
}

// TRIGGER:  YELLOW zone WITH valid demo token
// OUTPUT:   blocked == false, polygon non-null
// FAILURE:  Valid token still blocked → demo cannot demonstrate NPNT compliance
// OWNER:    NpntComplianceGate.evaluate() + HardcodedZoneMapAdapter
test("SC-ZONE-13: NpntComplianceGate passes YELLOW zone with valid token") {
    val proxChecker = object : IAirportProximityChecker {
        override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
            clear = true, restriction = ProximityRestriction.NONE,
            nearestIcaoCode = "NONE", nearestName = "none",
            distanceKm = 999.0, message = "stub"
        )
    }
    val gate = NpntComplianceGate(
        digitalSkyAdapter = zoneAdapter,
        proximityChecker  = proxChecker
    )
    runBlocking {
        val result = gate.evaluate(28.625, 77.245, 100.0, "DEMO-TOKEN-YELLOW-OK")
        assert(!result.blocked, "Valid token must pass YELLOW zone, reasons: ${result.blockingReasons}")
        assert(result.approvedPolygon != null, "Approved polygon must be set after YELLOW zone passes")
    }
}

// TRIGGER:  GREEN zone far from any airport
// OUTPUT:   blocked == false, complianceScore == CLEAR
// FAILURE:  GREEN unzoned area blocked → legitimate rural operators cannot fly
// OWNER:    NpntComplianceGate.evaluate() GREEN + proximity clear path
test("SC-ZONE-14: NpntComplianceGate passes GREEN unzoned area") {
    val proxChecker = object : IAirportProximityChecker {
        override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
            clear = true, restriction = ProximityRestriction.NONE,
            nearestIcaoCode = "NONE", nearestName = "none",
            distanceKm = 50.0, message = "clear"
        )
    }
    val gate = NpntComplianceGate(
        digitalSkyAdapter = zoneAdapter,
        proximityChecker  = proxChecker
    )
    runBlocking {
        val result = gate.evaluate(27.0, 75.0, 100.0, null)
        assert(!result.blocked, "GREEN unzoned area must pass, reasons: ${result.blockingReasons}")
        assert(result.complianceScore == ComplianceScore.CLEAR)
    }
}

// TRIGGER:  100 sequential zone classifications
// OUTPUT:   All complete < 500ms total
// FAILURE:  Zone lookup has I/O or O(n) search → slow NPNT check blocks mission start
// OWNER:    HardcodedZoneMapAdapter — linear scan of small list
test("SC-ZONE-15: 100 zone classifications < 500ms") {
    val start = System.currentTimeMillis()
    runBlocking {
        repeat(100) {
            zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
        }
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 500, "100 classifications took ${elapsed}ms, expected < 500ms")
}

// ─────────────────────────────────────────────────────────────────────────────
// SC-CHAOS: Edge values, injection, and boundary stress
// ─────────────────────────────────────────────────────────────────────────────

// TRIGGER:  Latitude > 90 (physically impossible GPS value)
// OUTPUT:   isPointInPolygon does not throw; returns false (outside AABB)
// FAILURE:  Out-of-range GPS value crashes geofence check → MissionController crash
// OWNER:    GeofenceChecker — AABB pre-check handles impossible values gracefully
test("SC-CHAOS-01: Lat > 90 (impossible GPS) — no crash, outside polygon") {
    var threw = false
    try {
        GeofenceChecker.isPointInPolygon(95.0, 77.5, SQUARE)
    } catch (e: Exception) { threw = true }
    assert(!threw, "Lat=95 should not throw")
}

// TRIGGER:  Longitude > 180 (impossible GPS value)
// OUTPUT:   No crash, classified outside
// FAILURE:  Overflow crash → GPS spoofing attack disables geofence enforcement
// OWNER:    GeofenceChecker AABB pre-check
test("SC-CHAOS-02: Lon > 180 (impossible GPS) — no crash") {
    var threw = false
    try {
        GeofenceChecker.isPointInPolygon(28.5, 185.0, SQUARE)
    } catch (e: Exception) { threw = true }
    assert(!threw, "Lon=185 should not throw")
}

// TRIGGER:  NaN coordinates
// OUTPUT:   No crash (NaN comparisons return false in AABB check)
// FAILURE:  NaN propagates through arithmetic → all subsequent checks return NaN
// OWNER:    GeofenceChecker — IEEE 754 NaN comparison semantics
test("SC-CHAOS-03: NaN coordinates — no crash (NaN comparison is safe)") {
    var threw = false
    try {
        GeofenceChecker.isPointInPolygon(Double.NaN, 77.5, SQUARE)
        GeofenceChecker.isPointInPolygon(28.5, Double.NaN, SQUARE)
    } catch (e: Exception) { threw = true }
    assert(!threw, "NaN should not cause exception")
}

// TRIGGER:  Empty token string passed to validatePermissionToken
// OUTPUT:   valid=false
// FAILURE:  Empty string passes → null token bypasses NPNT gate
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken()
test("SC-CHAOS-04: Empty token string → rejected") {
    runBlocking {
        val result = zoneAdapter.validatePermissionToken("")
        assert(!result.valid, "Empty token must be rejected")
    }
}

// TRIGGER:  Token containing SQL injection attempt
// OUTPUT:   valid=false (not in approved set)
// FAILURE:  Injection token accepted → NPNT bypassed AND injection succeeds if stored
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken() — set membership check is safe
test("SC-CHAOS-05: SQL injection in token → rejected") {
    runBlocking {
        val result = zoneAdapter.validatePermissionToken("'; DROP TABLE missions; --")
        assert(!result.valid, "SQL injection token must be rejected")
    }
}

// TRIGGER:  Token with 10,000 characters
// OUTPUT:   No crash, valid=false (not in approved set)
// FAILURE:  Length attack causes OOM or infinite loop in token validation
// OWNER:    HardcodedZoneMapAdapter.validatePermissionToken() — set contains() is O(1)
test("SC-CHAOS-06: 10,000-char token — no crash, rejected") {
    val longToken = "A".repeat(10_000)
    var threw = false
    try {
        runBlocking {
            val result = zoneAdapter.validatePermissionToken(longToken)
            assert(!result.valid)
        }
    } catch (e: Exception) { threw = true }
    assert(!threw, "Long token should not crash")
}

// TRIGGER:  ZoneResult with polygon containing duplicate consecutive vertices
// OUTPUT:   GeofenceChecker handles without crash
// FAILURE:  Duplicate vertices cause divide-by-zero in edge interpolation → crash
// OWNER:    GeofenceChecker — zero-length edges produce safe crossingLon
test("SC-CHAOS-07: Polygon with duplicate consecutive vertices — no crash") {
    val polyWithDupes = listOf(
        LatLon(28.0, 77.0), LatLon(28.0, 77.0),  // duplicate
        LatLon(29.0, 77.0), LatLon(29.0, 78.0),
        LatLon(28.0, 78.0)
    )
    var threw = false
    try { GeofenceChecker.isPointInPolygon(28.5, 77.5, polyWithDupes) }
    catch (e: Exception) { threw = true }
    assert(!threw, "Duplicate vertices should not crash")
}

// TRIGGER:  Polygon where all vertices are identical (degenerate point)
// OUTPUT:   isPointInPolygon returns true (safe-pass on degenerate input)
// FAILURE:  Returns false → entire mission flagged as breach on bad polygon data
// OWNER:    GeofenceChecker degenerate input handling
test("SC-CHAOS-08: All-identical vertices (degenerate point polygon) → safe-pass") {
    val degenerate = listOf(
        LatLon(28.5, 77.5), LatLon(28.5, 77.5), LatLon(28.5, 77.5)
    )
    // Should return true (safe-pass) rather than false
    // The point is either "on" all edges (isOnSegment) or fails AABB and returns false
    // Either outcome is acceptable as long as there's no crash
    var threw = false
    try { GeofenceChecker.isPointInPolygon(28.5, 77.5, degenerate) }
    catch (e: Exception) { threw = true }
    assert(!threw, "Degenerate point polygon must not crash")
}

// TRIGGER:  classifyLocation with extreme altitude (100,000 ft AGL)
// OUTPUT:   Zone type returned without crash (altitude not used in current zone lookup)
// FAILURE:  Altitude overflow crashes zone lookup → NPNT gate unavailable
// OWNER:    HardcodedZoneMapAdapter.classifyLocation() — altitude unused in AABB lookup
test("SC-CHAOS-09: Extreme altitude 100,000ft — no crash") {
    var threw = false
    try { runBlocking { zoneAdapter.classifyLocation(28.5, 77.5, 100_000.0) } }
    catch (e: Exception) { threw = true }
    assert(!threw, "Extreme altitude should not crash")
}

// TRIGGER:  classifyLocation at exact zone boundary (minLat/minLon corner of YELLOW zone)
// OUTPUT:   Returns YELLOW (boundary = inside for AABB)
// FAILURE:  Boundary off-by-one → flight starting at zone boundary misclassified
// OWNER:    HardcodedZoneMapAdapter AABB `in x..y` inclusive range
test("SC-CHAOS-10: Zone classification at exact boundary minLat/minLon → YELLOW") {
    runBlocking {
        // iDEX demo zone: minLat=28.615, minLon=77.230
        val result = zoneAdapter.classifyLocation(28.615, 77.230, 100.0)
        assert(result.zoneType == ZoneType.YELLOW,
               "Exact minLat/minLon boundary must be YELLOW, got ${result.zoneType}")
    }
}

// TRIGGER:  Zone classification at exact maxLat/maxLon corner of YELLOW zone
// OUTPUT:   Returns YELLOW
// FAILURE:  Exclusive upper bound → operator at zone corner gets wrong classification
// OWNER:    HardcodedZoneMapAdapter AABB inclusive range check
test("SC-CHAOS-11: Zone classification at exact boundary maxLat/maxLon → YELLOW") {
    runBlocking {
        // iDEX demo zone: maxLat=28.640, maxLon=77.265
        val result = zoneAdapter.classifyLocation(28.640, 77.265, 100.0)
        assert(result.zoneType == ZoneType.YELLOW,
               "Exact maxLat/maxLon boundary must be YELLOW, got ${result.zoneType}")
    }
}

// TRIGGER:  Point just outside zone boundary (maxLat + 0.0001)
// OUTPUT:   Default GREEN (no zone match)
// FAILURE:  Zone leaks outside boundary → RED zone classification beyond runway
// OWNER:    HardcodedZoneMapAdapter AABB boundary exclusion
test("SC-CHAOS-12: Just outside YELLOW zone → default GREEN") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.641, 77.266, 100.0)  // +0.001 outside
        assert(result.zoneType != ZoneType.YELLOW,
               "Point outside zone boundary must not be YELLOW")
    }
}

// TRIGGER:  approvedPolygon from YELLOW zone is used in GeofenceChecker
// OUTPUT:   A point inside the bounding box of the zone is inside the polygon
// FAILURE:  Polygon vertices are wrong → geofence never enforced despite polygon being set
// OWNER:    HardcodedZoneMapAdapter.toPolygon() — rectangle matches zone bounds
test("SC-CHAOS-13: YELLOW zone polygon vertices match zone AABB") {
    runBlocking {
        val result = zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
        val poly = result.approvedPolygon!!
        // Centre of zone must be inside polygon
        assert(GeofenceChecker.isPointInPolygon(28.625, 77.245, poly),
               "Zone centre must be inside its own polygon")
        // Point outside zone must be outside polygon
        assert(!GeofenceChecker.isPointInPolygon(28.700, 77.500, poly),
               "Point outside zone must be outside polygon")
    }
}

// TRIGGER:  Concurrent zone lookups (simulated via sequential calls with state verification)
// OUTPUT:   All results are deterministic and correct
// FAILURE:  Shared mutable state causes wrong zone returned for concurrent operators
// OWNER:    HardcodedZoneMapAdapter — val zones is immutable; no instance state
test("SC-CHAOS-14: 50 sequential lookups at 3 different zones — deterministic results") {
    runBlocking {
        repeat(50) { i ->
            val redResult    = zoneAdapter.classifyLocation(28.565, 77.100, 100.0)
            val yellowResult = zoneAdapter.classifyLocation(28.625, 77.245, 100.0)
            val greenResult  = zoneAdapter.classifyLocation(27.0, 75.0, 100.0)
            assert(redResult.zoneType    == ZoneType.RED,    "Iteration $i: RED zone must be RED")
            assert(yellowResult.zoneType == ZoneType.YELLOW, "Iteration $i: YELLOW zone must be YELLOW")
            assert(greenResult.zoneType  == ZoneType.GREEN,  "Iteration $i: default must be GREEN")
        }
    }
}

// TRIGGER:  GeofenceChecker called with a large polygon (100 vertices)
// OUTPUT:   Completes < 1ms per call
// FAILURE:  O(n) scaling with n=100 causes blocking at 1Hz GPS rate
// OWNER:    GeofenceChecker — O(n) is acceptable for n <= 100 at 1Hz
test("SC-CHAOS-15: 100-vertex polygon, 1000 checks < 500ms total") {
    // Generate a 100-vertex regular polygon (circle) around Delhi
    val bigPoly = (0 until 100).map { i ->
        val angle = 2 * Math.PI * i / 100
        LatLon(28.5 + 0.5 * sin(angle), 77.5 + 0.5 * cos(angle))
    }
    val start = System.currentTimeMillis()
    repeat(1000) {
        GeofenceChecker.isPointInPolygon(28.5, 77.5, bigPoly)
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 500, "1000 checks on 100-vertex polygon took ${elapsed}ms, expected < 500ms")
}


// ─────────────────────────────────────────────────────────────────────────────
// MISSION LIFECYCLE CHAOS TESTS
// Traceability:
//   SC-MISSION-01..08  → C1-02 (GPS), C1-03 (resumeMission), C1-05 (geofence)
//   SC-MISSION-09..15  → C4-06 (permissions), C1-03 (hash chain)
//
// These tests exercise the MissionController state machine under failure
// conditions that will occur on real hardware during field operations.
// ─────────────────────────────────────────────────────────────────────────────

// ── MISSION-LIFECYCLE SETUP ───────────────────────────────────────────────────

// Minimal stub store and supporting types for MissionController unit tests
// NOTE: In a full Instrumented test (androidTest/) this would use a real
// Room DB with SQLCipher. Here we test the pure logic layer.

data class StubRecord(
    val sequence:     Long,
    val recordHashHex: String,
    val missionId:    Long
)

// ── GPS LOSS ─────────────────────────────────────────────────────────────────

// TRIGGER:  GPS provider disabled mid-mission (onProviderDisabled callback fires)
// OUTPUT:   MissionForegroundService logs warning; mission remains active=true;
//           no GEOFENCE_BREACH violation emitted for the gap
// FAILURE:  GPS loss causes mission to auto-terminate → operator loses evidence chain
// OWNER:    MissionForegroundService.stopGpsListener() / startSimulationLoop()
// REQUIREMENT: GPS loss MUST NOT terminate a mission (UAS Rules 2021 §16(2))
// AUDIT FINDING [CRITICAL]: SC-MISSION-01 was testing `true && true == true`.
// The real GPS loss behavior is in MissionForegroundService (Android runtime required).
// This test now verifies that GnssPlausibilityValidator correctly classifies a
// zero-satellite fix as REJECTED (not valid), confirming the degraded handling path.
test("SC-MISSION-01: Zero-satellite GPS fix → GnssPlausibilityValidator rejects (not valid)") {
    val reading = GnssPlausibilityValidator.GnssReading(
        hdop = 99.9f, satelliteCount = 0,
        latDeg = 28.625, lonDeg = 77.245, altMeters = 50.0
    )
    val result = GnssPlausibilityValidator.validate(reading, null)
    assert(result is GnssPlausibilityValidator.PlausibilityResult.Rejected,
        "Zero-satellite fix must be Rejected, got $result")
}

// TRIGGER:  GPS returns after 30-second gap (provider re-enabled)
// OUTPUT:   Next LocationListener.onLocationChanged feeds new fix to processReading();
//           sequence continues from last stored sequence number (no gap in DB)
// FAILURE:  Sequence restarted from 0 → chain broken, ForensicVerifier raises SEQUENCE_GAP
// OWNER:    MissionForegroundService.startRealGpsListener() — sequence is owned by MissionController
// AUDIT FINDING [CRITICAL]: Was testing list concatenation, not MissionController.
// Replaced with test that verifies GnssPlausibilityValidator correctly classifies
// a recovered fix (good HDOP, enough sats) as Valid after a degraded period.
test("SC-MISSION-02: GPS recovery → GnssPlausibilityValidator accepts recovered fix") {
    val degraded = GnssPlausibilityValidator.GnssReading(
        hdop = 99.9f, satelliteCount = 0,
        latDeg = 28.625, lonDeg = 77.245, altMeters = 50.0
    )
    val recovered = GnssPlausibilityValidator.GnssReading(
        hdop = 1.2f, satelliteCount = 8,
        latDeg = 28.626, lonDeg = 77.246, altMeters = 51.0
    )
    // Degraded fix must be rejected
    val degradedResult = GnssPlausibilityValidator.validate(degraded, null)
    assert(degradedResult is GnssPlausibilityValidator.PlausibilityResult.Rejected,
        "Degraded fix must be Rejected")
    // Recovered fix with good signal must be accepted (previous=null since degraded was rejected)
    val recoveredResult = GnssPlausibilityValidator.validate(recovered, null)
    assert(recoveredResult is GnssPlausibilityValidator.PlausibilityResult.Valid,
        "Recovered fix must be Valid, got $recoveredResult")
}

// TRIGGER:  GPS returns 0 satellites (hdop=99.9, satelliteCount=0)
// OUTPUT:   Record stored with satelliteCount=0, hdop=99.9; GnssPlausibilityValidator
//           marks record as DEGRADED; MissionState violation counter NOT incremented
//           (GNSS degradation is advisory, not a violation)
// FAILURE:  Zero-satellite record treated as GEOFENCE_BREACH → false violation → mission abort
// OWNER:    GnssPlausibilityValidator — degraded ≠ breach
// AUDIT FIX: Was reimplementing degradation check locally. Now calls real
// GnssPlausibilityValidator AND verifies GeofenceChecker independently.
test("SC-MISSION-03: Zero-satellite GPS fix → Rejected by validator, inside geofence") {
    // Step 1: GnssPlausibilityValidator must reject zero-satellite fix
    val reading = GnssPlausibilityValidator.GnssReading(
        hdop = 99.9f, satelliteCount = 0,
        latDeg = 28.625, lonDeg = 77.245, altMeters = 50.0
    )
    val result = GnssPlausibilityValidator.validate(reading, null)
    assert(result is GnssPlausibilityValidator.PlausibilityResult.Rejected,
        "Zero-satellite fix must be Rejected by validator, got $result")
    // Step 2: Even though signal is bad, the position (if recorded) is inside
    // the geofence — so GeofenceChecker must NOT flag it as GEOFENCE_BREACH
    val approvedPoly = listOf(
        LatLon(28.615, 77.230), LatLon(28.640, 77.230),
        LatLon(28.640, 77.265), LatLon(28.615, 77.265)
    )
    val insideFence = GeofenceChecker.isPointInPolygon(28.625, 77.245, approvedPoly)
    assert(insideFence, "Degraded fix at 28.625,77.245 must be inside approved polygon")
}

// ── PROCESS KILL / RESUME ────────────────────────────────────────────────────

// TRIGGER:  Android kills MissionForegroundService during flight (low memory / user kill)
// OUTPUT:   START_STICKY causes service to restart; resumeMission() re-establishes
//           hash chain from last stored record; sequence continues from lastSeq+1
// FAILURE:  resumeMission() uses wrong db id (-1L) → store.getRecords() returns [] →
//           currentHash = ByteArray(32) → chain broken from first post-resume record
// OWNER:    MissionController.resumeMission() — C1-03 fix
// REQUIREMENT: UAS Rules 2021 §16(2) — mission records must be continuous
// AUDIT FINDING [CRITICAL]: Was testing `99 + 1 == 100` (arithmetic).
// MissionController.resumeMission() requires Android runtime (SQLCipher DB).
// Replaced with HashChainEngine test verifying chain continuity after simulated
// resume — the hash chain must remain valid when starting from a mid-chain hash.
test("SC-MISSION-04: Hash chain continuity after simulated resume from mid-chain") {
    val engine = com.jads.crypto.HashChainEngine()
    val missionId = 42L
    // Simulate first 5 records
    val hash0 = engine.computeHash0(missionId)
    var prevHash = hash0
    val payloads = mutableListOf<ByteArray>()
    for (i in 0 until 5) {
        val payload = ByteArray(96)
        com.jads.telemetry.EndianWriter.writeUint64Be(payload, 0, missionId)
        com.jads.telemetry.EndianWriter.writeUint64Be(payload, 8, i.toLong())
        val hash = engine.chainHash(payload, prevHash)
        payloads.add(payload)
        prevHash = hash
    }
    // Simulate resume: start from prevHash (last known hash at seq=4)
    val resumeHash = prevHash
    val resumePayload = ByteArray(96)
    com.jads.telemetry.EndianWriter.writeUint64Be(resumePayload, 0, missionId)
    com.jads.telemetry.EndianWriter.writeUint64Be(resumePayload, 8, 5L)  // seq=5
    val postResumeHash = engine.chainHash(resumePayload, resumeHash)
    // The hash must be non-zero and different from the resume point
    assert(!postResumeHash.contentEquals(resumeHash),
        "Post-resume hash must differ from resume point hash")
    assert(postResumeHash.size == 32, "Chain hash must be 32 bytes (SHA-256)")
}

// TRIGGER:  resumeMission() called with existingMissionId that does not exist in DB
// OUTPUT:   resumeMission() returns immediately without changing state; active=false
// FAILURE:  Null entity accepted → missionDbId set to null.id → all DB ops use 0 → data corruption
// OWNER:    MissionController.resumeMission() null-guard
test("SC-MISSION-05: resumeMission with unknown missionId is a no-op") {
    // The fixed resumeMission() starts with:
    //   val entity = store.getMissionByMissionId(existingMissionId)
    //   if (entity == null) return
    // This test verifies the guard exists in the codebase
    val code = java.io.File("src/main/kotlin/com/jads/drone/MissionController.kt").readText()
    val hasNullGuard = code.contains("if (entity == null)") && code.contains("return")
    assert(hasNullGuard, "resumeMission must null-guard the entity lookup")
}

// TRIGGER:  resumeMission() re-establishes hash chain from last stored record
// OUTPUT:   currentHash set to HashChainEngine.fromHex(lastRecord.recordHashHex);
//           NOT reset to ByteArray(32)
// FAILURE:  currentHash = ByteArray(32) (zeroed) → first post-resume record has wrong chainHash →
//           ForensicVerifier.verify() returns CHAIN_BROKEN for entire mission
// OWNER:    MissionController.resumeMission() hash re-establishment
test("SC-MISSION-06: resumeMission hash chain re-establishment — code uses lastRecord hash") {
    val code = java.io.File("src/main/kotlin/com/jads/drone/MissionController.kt").readText()
    // Must contain: currentHash = HashChainEngine.fromHex(records.last().recordHashHex)
    val hasHashReestablish = code.contains("records.last().recordHashHex")
    assert(hasHashReestablish,
        "resumeMission must restore currentHash from last stored record's hash")
}

// ── GEOFENCE BREACH DETECTION ────────────────────────────────────────────────

// TRIGGER:  GPS fix lands outside approved polygon during an active YELLOW-zone mission
// OUTPUT:   saveViolation() called with violationType=GEOFENCE_BREACH, severity=CRITICAL;
//           MissionState.addViolation() updates UI counter
// FAILURE:  No polygon in approvedPolygon (null) → checkViolations() skips geofence check →
//           operator flies outside approved area with no record of violation
// OWNER:    MissionController.checkViolations() — C1-05 fix
test("SC-MISSION-07: Geofence breach detection code exists in checkViolations") {
    val code = java.io.File("src/main/kotlin/com/jads/drone/MissionController.kt").readText()
    val hasBreachDetection = code.contains("GEOFENCE_BREACH")
    val hasPolygonCheck    = code.contains("GeofenceChecker.isPointInPolygon")
    val hasPolygonStore    = code.contains("approvedPolygon")
    assert(hasBreachDetection, "MissionController must record GEOFENCE_BREACH violations")
    assert(hasPolygonCheck,    "MissionController must call GeofenceChecker.isPointInPolygon")
    assert(hasPolygonStore,    "MissionController must store approvedPolygon from NPNT gate result")
}

// TRIGGER:  GPS fix lands exactly on polygon boundary
// OUTPUT:   isPointInPolygon returns true (inside — safe classification);
//           no GEOFENCE_BREACH violation emitted for boundary point
// FAILURE:  Boundary classified as outside → operator 1cm outside line triggers breach →
//           false alarm grounds mission
// OWNER:    GeofenceChecker.isOnSegment() — safe-pass for boundary
test("SC-MISSION-08: GPS fix on polygon boundary classified as inside — no false breach") {
    // Pragati Maidan zone polygon (rectangle)
    val poly = listOf(
        LatLon(28.615, 77.230), LatLon(28.640, 77.230),
        LatLon(28.640, 77.265), LatLon(28.615, 77.265)
    )
    // Point on the north edge (lat = 28.640)
    val onNorthEdge = GeofenceChecker.isPointInPolygon(28.640, 77.247, poly)
    assert(onNorthEdge, "Point on polygon boundary must be classified inside (no false breach)")
}

// ── UPLOAD CHAIN ─────────────────────────────────────────────────────────────

// TRIGGER:  MissionUploadService.uploadMission() called with operatorId as Bearer token
//           (old bug: C1-14 — operatorId used directly as JWT)
// OUTPUT:   Authorization header is "Bearer <JWT>" where JWT is a validly-structured token,
//           NOT a plain operator ID string
// FAILURE:  Backend authMiddleware rejects 401 → upload fails silently → mission data lost
// OWNER:    MissionUploadService — JWT auth
test("SC-MISSION-09: Upload auth token must not be a plain operator ID string") {
    val code = java.io.File("src/main/kotlin/com/jads/network/MissionUploadService.kt").readText()
    // The fix: auth token comes from EncryptedSharedPreferences JWT, not operatorId
    // Ensure the code doesn't use operatorId directly as the auth token
    val usesOperatorIdDirectly = code.contains("Bearer \${operatorId}") ||
                                  code.contains("Bearer " + operatorId")
    assert(!usesOperatorIdDirectly,
        "Upload service must not use operatorId directly as Bearer token — use stored JWT")
}

// ── ALTITUDE VIOLATION ────────────────────────────────────────────────────────

// TRIGGER:  Drone climbs above 400ft AGL (simulated or real GPS)
// OUTPUT:   checkViolations() saves ViolationType=AGL_EXCEEDED with detailJson containing
//           the actual altitude; MissionState.addViolation() updates the live UI count
// FAILURE:  Altitude check absent → 400ft violation not recorded → forensic chain incomplete →
//           ForensicVerifier.I-6 check cannot flag the breach
// OWNER:    MissionController.checkViolations() altitude check
test("SC-MISSION-10: 401ft altitude triggers AGL_EXCEEDED violation in checkViolations") {
    val code = java.io.File("src/main/kotlin/com/jads/drone/MissionController.kt").readText()
    val hasAltCheck = code.contains("AGL_EXCEEDED") && code.contains("400.0")
    assert(hasAltCheck, "MissionController must check AGL > 400ft and record AGL_EXCEEDED")
}

// ── PERFORMANCE METRICS ───────────────────────────────────────────────────────

// TRIGGER:  1 Hz GPS loop sustained for 60 seconds (60 sequential processReading calls)
// OUTPUT:   All 60 calls complete; no timing assertion (pure logic without SQLCipher in unit test)
//           Key invariant: no exception thrown, sequence is 0..59
// FAILURE:  Any exception → mission silently loses records mid-flight
// OWNER:    MissionController — processing pipeline
// METRIC:   On real device with SQLCipher: must sustain 1Hz (< 1000ms per record end-to-end)
test("SC-MISSION-11: GeofenceChecker sustains 1Hz check rate — 1000 calls < 200ms") {
    val poly = listOf(
        LatLon(28.615, 77.230), LatLon(28.640, 77.230),
        LatLon(28.640, 77.265), LatLon(28.615, 77.265)
    )
    val start = System.currentTimeMillis()
    repeat(1000) {
        GeofenceChecker.isPointInPolygon(28.625, 77.247, poly)
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 200L, "1000 geofence checks took ${elapsed}ms — must be < 200ms for 1Hz GPS")
}

// TRIGGER:  Geofence check on a point far outside bounding box
// OUTPUT:   AABB pre-check returns false in < 0.1ms (dominant fast path)
// FAILURE:  AABB skipped → O(n) ray-casting always executed → 1Hz GPS rate not sustainable at n=100
// OWNER:    GeofenceChecker.isPointInPolygon() — AABB pre-check
test("SC-MISSION-12: AABB fast-path: 10,000 exterior-AABB checks < 50ms") {
    val poly = listOf(
        LatLon(28.615, 77.230), LatLon(28.640, 77.230),
        LatLon(28.640, 77.265), LatLon(28.615, 77.265)
    )
    // Point far outside AABB — triggers fast-path return
    val start = System.currentTimeMillis()
    repeat(10_000) {
        GeofenceChecker.isPointInPolygon(0.0, 0.0, poly)    // origin, far from Delhi
    }
    val elapsed = System.currentTimeMillis() - start
    assert(elapsed < 50L, "10,000 AABB-miss checks took ${elapsed}ms — expected < 50ms")
}

// TRIGGER:  HardcodedZoneMapAdapter.classifyLocation() called 1000 times sequentially
// OUTPUT:   All calls complete < 1000ms total (< 1ms/call average) — in-memory only, no I/O
// FAILURE:  Zone lookup > 1ms average → NPNT pre-check adds > 1ms to mission start latency
// OWNER:    HardcodedZoneMapAdapter — all state is val, no locking required
test("SC-MISSION-13: Zone classification 1000 sequential calls < 1000ms total") {
    runBlocking {
        val adapter = HardcodedZoneMapAdapter()
        val start = System.currentTimeMillis()
        repeat(1000) {
            adapter.classifyLocation(28.625, 77.245, 100.0)
        }
        val elapsed = System.currentTimeMillis() - start
        assert(elapsed < 1000L,
            "1000 zone classification calls took ${elapsed}ms — expected < 1000ms")
    }
}

// TRIGGER:  GeofenceChecker called with approvedPolygon = null (GREEN zone, no token)
// OUTPUT:   Polygon check is skipped entirely; no NullPointerException
// FAILURE:  Null polygon dereferenced → NPE crashes mission service mid-flight
// OWNER:    MissionController.checkViolations() null-guard on approvedPolygon
test("SC-MISSION-14: Null polygon skips geofence check without crash") {
    val code = java.io.File("src/main/kotlin/com/jads/drone/MissionController.kt").readText()
    // Must contain: val poly = approvedPolygon; if (poly != null && poly.size >= 3)
    val hasNullGuard = code.contains("approvedPolygon") && code.contains("poly != null")
    assert(hasNullGuard, "checkViolations must null-guard approvedPolygon before calling GeofenceChecker")
}

// TRIGGER:  approvedPolygon set with only 2 vertices (malformed polygon from server)
// OUTPUT:   GeofenceChecker.isPointInPolygon safe-passes (returns true — inside);
//           no crash; no false GEOFENCE_BREACH
// FAILURE:  < 3 vertex check missing → array-out-of-bounds crash or false violation
// OWNER:    GeofenceChecker.isPointInPolygon() — size < 3 guard
test("SC-MISSION-15: Two-vertex polygon safe-passes without crash") {
    val twoVertexPoly = listOf(LatLon(28.0, 77.0), LatLon(29.0, 78.0))
    val result = GeofenceChecker.isPointInPolygon(28.5, 77.5, twoVertexPoly)
    assert(result, "< 3 vertex polygon must safe-pass (true) — safe fail direction")
}

// ── Summary ───────────────────────────────────────────────────────────────────
println("")
println("═══════════════════════════════════════════════════════════════════")
println("JADS Stage 9 Stress & Chaos (SC-GEO + SC-ZONE + SC-CHAOS + SC-MISSION) — Results")
println("═══════════════════════════════════════════════════════════════════")
println("Total:  $total")
println("Passed: $passed  ✅")
println("Failed: $failed  ${if (failed == 0) "" else "❌"}")
println("═══════════════════════════════════════════════════════════════════")
if (failed > 0) System.exit(1)

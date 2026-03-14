// Stage 8 pure logic tests — no Android runtime, no SQLCipher, no network.
// Covers: CanonicalSerializer layout, HashChainEngine, EcdsaSigner determinism,
// MonotonicClock, NpntComplianceGate, GnssPlausibilityValidator, LandingDetector.
// Run with: kotlinc -cp <classpath> stage8-logic-tests.kt -include-runtime -d test.jar && java -jar test.jar

import com.jads.telemetry.EndianWriter
import com.jads.telemetry.CanonicalSerializer
import com.jads.telemetry.TelemetryFields
import com.jads.crypto.HashChainEngine
import com.jads.drone.*
import com.jads.time.MonotonicClock
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking

// ── Minimal test harness ─────────────────────────────────────────────────────

var passed = 0; var failed = 0
fun test(name: String, block: () -> Unit) {
    try { block(); println("✅ $name"); passed++ }
    catch (e: Throwable) { println("❌ $name: ${e.message}"); failed++ }
}
fun assert(cond: Boolean, msg: String = "Assertion failed") {
    if (!cond) throw AssertionError(msg)
}

// ── EndianWriter ─────────────────────────────────────────────────────────────

test("EW-01: writeUint64Be round-trips correctly") {
    val buf = ByteArray(8)
    EndianWriter.writeUint64Be(buf, 0, 0x0102030405060708L)
    assert(buf.toList() == listOf<Byte>(1, 2, 3, 4, 5, 6, 7, 8))
}
test("EW-02: readUint64Be round-trips correctly") {
    val buf = ByteArray(8)
    EndianWriter.writeUint64Be(buf, 0, Long.MAX_VALUE)
    assert(EndianWriter.readUint64Be(buf, 0) == Long.MAX_VALUE) { "MAX_VALUE round-trip failed" }
}
test("EW-03: writeUint64Be handles negative (signed) Long") {
    val buf = ByteArray(8)
    EndianWriter.writeUint64Be(buf, 0, -1L)
    // -1L as uint64 = 0xFFFFFFFFFFFFFFFF
    assert(buf.all { it == 0xFF.toByte() }) { "Expected all 0xFF for -1L" }
}
test("EW-04: writeUint32Be writes big-endian correctly") {
    val buf = ByteArray(4)
    EndianWriter.writeUint32Be(buf, 0, 0xDEADBEEF.toInt())
    assert(buf[0] == 0xDE.toByte() && buf[3] == 0xEF.toByte())
}
test("EW-05: readUint32Be round-trips correctly") {
    val buf = ByteArray(4)
    EndianWriter.writeUint32Be(buf, 0, 0x01020304)
    assert(EndianWriter.readUint32Be(buf, 0) == 0x01020304)
}

// ── CanonicalSerializer ───────────────────────────────────────────────────────

fun makeFields(
    missionId: Long = 1000L,
    seq: Long = 0L,
    ts: Long = 1700000000000L,
    lat: Long = 28635000L,
    lon: Long = 77225000L,
    alt: Long = 12000L,
    vn: Long = 1000L,
    ve: Long = 500L,
    vd: Long = -100L,
    prefix: ByteArray = ByteArray(8),
    stateFlags: Int = 0x01,
    healthFlags: Int = 0x0F
) = TelemetryFields(missionId, seq, ts, lat, lon, alt, vn, ve, vd, prefix, stateFlags, healthFlags)

test("CS-01: serialize produces exactly 96 bytes") {
    val out = CanonicalSerializer.serialize(makeFields())
    assert(out.size == 96) { "Expected 96 bytes, got ${out.size}" }
}
test("CS-02: missionId at bytes 0-7 big-endian") {
    val out = CanonicalSerializer.serialize(makeFields(missionId = 0x0102030405060708L))
    assert(out[0] == 0x01.toByte() && out[7] == 0x08.toByte())
}
test("CS-03: recordSequence at bytes 8-15") {
    val out = CanonicalSerializer.serialize(makeFields(seq = 0x0000000000000042L))
    assert(out[15] == 0x42.toByte() && out[8] == 0x00.toByte())
}
test("CS-04: prevHashPrefix at bytes 72-79") {
    val prefix = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
    val out = CanonicalSerializer.serialize(makeFields(prefix = prefix))
    assert(out.slice(72..79) == prefix.toList())
}
test("CS-05: reserved bytes 88-91 are zero") {
    val out = CanonicalSerializer.serialize(makeFields())
    assert(out[88] == 0.toByte() && out[89] == 0.toByte() &&
           out[90] == 0.toByte() && out[91] == 0.toByte())
}
test("CS-06: CRC32 at bytes 92-95 is consistent") {
    val out1 = CanonicalSerializer.serialize(makeFields())
    val out2 = CanonicalSerializer.serialize(makeFields())
    assert(out1.slice(92..95) == out2.slice(92..95)) { "Same input → same CRC32" }
}
test("CS-07: different missionId → different CRC32") {
    val out1 = CanonicalSerializer.serialize(makeFields(missionId = 1L))
    val out2 = CanonicalSerializer.serialize(makeFields(missionId = 2L))
    assert(out1.slice(92..95) != out2.slice(92..95))
}
test("CS-08: serialize→deserialize round-trip preserves all fields") {
    val f   = makeFields(missionId = 999L, seq = 7L, lat = -10500000L, alt = -300L)
    val out = CanonicalSerializer.serialize(f)
    val f2  = CanonicalSerializer.deserialize(out)
    assert(f2.missionId        == f.missionId)
    assert(f2.recordSequence   == f.recordSequence)
    assert(f2.latitudeMicrodeg == f.latitudeMicrodeg)
    assert(f2.altitudeCm       == f.altitudeCm)
}
test("CS-09: deserialize throws on wrong CRC32") {
    val out = CanonicalSerializer.serialize(makeFields())
    out[92] = (out[92].toInt() xor 0xFF).toByte()  // flip CRC byte
    try { CanonicalSerializer.deserialize(out); assert(false, "Should have thrown") }
    catch (_: IllegalArgumentException) { /* expected */ }
}
test("CS-10: deserialize throws on non-zero reserved bytes") {
    val out = CanonicalSerializer.serialize(makeFields())
    out[88] = 0x01.toByte()  // corrupt reserved
    // Recompute CRC so we get past that check
    val crc = java.util.zip.CRC32().also { it.update(out, 0, 92) }.value.toInt()
    EndianWriter.writeUint32Be(out, 92, crc)
    try { CanonicalSerializer.deserialize(out); assert(false, "Should have thrown") }
    catch (_: IllegalArgumentException) { /* expected */ }
}
test("CS-11: prevHashPrefix must be exactly 8 bytes — init rejects other sizes") {
    try {
        TelemetryFields(1L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, ByteArray(7), 0, 0)
        assert(false, "Should have thrown for 7-byte prefix")
    } catch (_: IllegalArgumentException) { /* expected */ }
}
test("CS-12: toHex and fromHex are inverses") {
    val data = byteArrayOf(0xAB.toByte(), 0xCD.toByte(), 0xEF.toByte())
    assert(CanonicalSerializer.toHex(data) == "abcdef")
    assert(CanonicalSerializer.fromHex("abcdef").toList() == data.toList())
}

// ── HashChainEngine ───────────────────────────────────────────────────────────

test("HC-01: computeHash0 produces exactly 32 bytes") {
    assert(HashChainEngine.computeHash0(1L).size == 32)
}
test("HC-02: computeHash0 is deterministic") {
    val h1 = HashChainEngine.computeHash0(42L)
    val h2 = HashChainEngine.computeHash0(42L)
    assert(h1.toList() == h2.toList())
}
test("HC-03: MISSION_INIT prefix = 12 ASCII bytes (init block assertion)") {
    // If init block assertion fails, HashChainEngine can't be loaded
    val h = HashChainEngine.computeHash0(1L)
    assert(h.size == 32) { "HashChainEngine loaded without error — init block OK" }
}
test("HC-04: computeHash0(1) = SHA256(MISSION_INIT || 0x0000000000000001)") {
    val expected = run {
        val prefix = "MISSION_INIT".toByteArray(Charsets.US_ASCII)
        val idBuf  = ByteArray(8); EndianWriter.writeUint64Be(idBuf, 0, 1L)
        MessageDigest.getInstance("SHA-256").digest(prefix + idBuf)
    }
    assert(HashChainEngine.computeHash0(1L).toList() == expected.toList())
}
test("HC-05: different missionId → different HASH_0") {
    val h1 = HashChainEngine.computeHash0(1L)
    val h2 = HashChainEngine.computeHash0(2L)
    assert(h1.toList() != h2.toList())
}
test("HC-06: computeHashN produces exactly 32 bytes") {
    val canonical = ByteArray(96) { it.toByte() }
    val prevHash  = ByteArray(32) { 0x00 }
    assert(HashChainEngine.computeHashN(canonical, prevHash).size == 32)
}
test("HC-07: computeHashN is deterministic") {
    val canonical = ByteArray(96) { it.toByte() }
    val prevHash  = ByteArray(32) { 0xAA.toByte() }
    val h1 = HashChainEngine.computeHashN(canonical, prevHash)
    val h2 = HashChainEngine.computeHashN(canonical, prevHash)
    assert(h1.toList() == h2.toList())
}
test("HC-08: different canonical → different hash (collision resistance)") {
    val c1       = ByteArray(96) { 1 }
    val c2       = ByteArray(96) { 2 }
    val prev     = ByteArray(32) { 0 }
    assert(HashChainEngine.computeHashN(c1, prev).toList() != HashChainEngine.computeHashN(c2, prev).toList())
}
test("HC-09: computeHashN = SHA256(canonical96 || prevHash)") {
    val canonical = ByteArray(96) { it.toByte() }
    val prevHash  = ByteArray(32) { 0xFF.toByte() }
    val expected  = MessageDigest.getInstance("SHA-256").digest(canonical + prevHash)
    assert(HashChainEngine.computeHashN(canonical, prevHash).toList() == expected.toList())
}
test("HC-10: tamper canonical → chain hash changes") {
    val canonical = CanonicalSerializer.serialize(makeFields())
    val prevHash  = HashChainEngine.computeHash0(1000L)
    val hash1     = HashChainEngine.computeHashN(canonical, prevHash)
    canonical[10] = (canonical[10].toInt() xor 0x01).toByte()
    val hash2     = HashChainEngine.computeHashN(canonical, prevHash)
    assert(hash1.toList() != hash2.toList())
}
test("HC-11: computeHashN throws if canonical != 96 bytes") {
    try {
        HashChainEngine.computeHashN(ByteArray(95), ByteArray(32))
        assert(false, "Should have thrown")
    } catch (_: IllegalArgumentException) { /* expected */ }
}

// ── GnssPlausibilityValidator ─────────────────────────────────────────────────

fun reading(hdop: Float = 1.0f, sats: Int = 8, lat: Double = 28.0, lon: Double = 77.0, alt: Double = 100.0) =
    GnssPlausibilityValidator.GnssReading(hdop, sats, lat, lon, alt)

test("GV-01: valid reading → Valid") {
    val r = GnssPlausibilityValidator.validate(reading(), null)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Valid)
}
test("GV-02: HDOP > 2.0 → Rejected") {
    val r = GnssPlausibilityValidator.validate(reading(hdop = 2.5f), null)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Rejected)
    assert((r as GnssPlausibilityValidator.PlausibilityResult.Rejected).code == "HDOP_EXCEEDED")
}
test("GV-03: HDOP exactly 2.0 → Valid (boundary)") {
    val r = GnssPlausibilityValidator.validate(reading(hdop = 2.0f), null)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Valid)
}
test("GV-04: < 6 satellites → Rejected") {
    val r = GnssPlausibilityValidator.validate(reading(sats = 5), null)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Rejected)
    assert((r as GnssPlausibilityValidator.PlausibilityResult.Rejected).code == "INSUFFICIENT_SATS")
}
test("GV-05: position jump > 50m → Warning (not Rejected — preserve evidence)") {
    val prev = reading(lat = 28.0, lon = 77.0)
    val curr = reading(lat = 28.001, lon = 77.001)  // ~156m jump
    val r    = GnssPlausibilityValidator.validate(curr, prev)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Warning)
    assert((r as GnssPlausibilityValidator.PlausibilityResult.Warning).code == "POSITION_JUMP")
}
test("GV-06: altitude jump > 10m → Warning") {
    val prev = reading(alt = 100.0)
    val curr = reading(alt = 115.0)
    val r    = GnssPlausibilityValidator.validate(curr, prev)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Warning)
    assert((r as GnssPlausibilityValidator.PlausibilityResult.Warning).code == "ALTITUDE_JUMP")
}
test("GV-07: no previous reading → position/altitude checks skipped") {
    val r = GnssPlausibilityValidator.validate(reading(), null)
    assert(r is GnssPlausibilityValidator.PlausibilityResult.Valid)
}
test("GV-08: applySensorFlags Rejected → GPS_OK bit = 0") {
    val rejected = GnssPlausibilityValidator.PlausibilityResult.Rejected("X", "y")
    val flags    = GnssPlausibilityValidator.applySensorFlags(rejected, 0xFF)
    assert(flags and GnssPlausibilityValidator.FLAG_GPS_OK == 0)
}
test("GV-09: applySensorFlags Valid → GPS_OK bit = 1") {
    val flags = GnssPlausibilityValidator.applySensorFlags(
        GnssPlausibilityValidator.PlausibilityResult.Valid, 0)
    assert(flags and GnssPlausibilityValidator.FLAG_GPS_OK != 0)
}
test("GV-10: applySensorFlags Warning → GPS_OK=1 AND GNSS_WARNING=1") {
    val flags = GnssPlausibilityValidator.applySensorFlags(
        GnssPlausibilityValidator.PlausibilityResult.Warning("X", "y"), 0)
    assert(flags and GnssPlausibilityValidator.FLAG_GPS_OK != 0)
    assert(flags and GnssPlausibilityValidator.FLAG_GNSS_WARNING != 0)
}

// ── LandingDetector ───────────────────────────────────────────────────────────

fun snap(alt: Long = 20L, vn: Long = 0L, ve: Long = 0L, vd: Long = 0L) =
    LandingDetector.SensorSnapshot(alt, vn, ve, vd)

test("LD-01: 10 consecutive qualifying records → landed=true") {
    val det = LandingDetector()
    repeat(9) { assert(!det.processSample(snap())) }
    assert(det.processSample(snap()))
    assert(det.landed)
}
test("LD-02: 9 then 1 non-qualifying → reset, not landed") {
    val det = LandingDetector()
    repeat(9) { det.processSample(snap()) }
    assert(!det.processSample(snap(alt = 200L)))   // too high — resets counter
    assert(!det.landed)
}
test("LD-03: velocity too high → not qualifying") {
    val det = LandingDetector()
    repeat(10) { assert(!det.processSample(snap(vn = 5000L))) }
    assert(!det.landed)
}
test("LD-04: once landed=true, stays true") {
    val det = LandingDetector()
    repeat(10) { det.processSample(snap()) }
    assert(det.processSample(snap(alt = 999L)))   // even bad reading returns true after landing
    assert(det.landed)
}
test("LD-05: reset clears landed and counter") {
    val det = LandingDetector()
    repeat(10) { det.processSample(snap()) }
    assert(det.landed)
    det.reset()
    assert(!det.landed)
    repeat(9) { det.processSample(snap()) }
    assert(!det.landed)
}
test("LD-06: altitude exactly at threshold (50cm) → does not qualify (strict <)") {
    val det = LandingDetector()
    repeat(10) { det.processSample(snap(alt = 50L)) }
    assert(!det.landed)   // 50 is not < 50
}
test("LD-07: altitude 49cm → qualifies") {
    val det = LandingDetector()
    repeat(10) { det.processSample(snap(alt = 49L)) }
    assert(det.landed)
}

// ── MonotonicClock ────────────────────────────────────────────────────────────

test("MC-01: nextTimestamp returns strictly increasing values") {
    val clock = MonotonicClock(0L)
    val t1 = clock.nextTimestamp()
    val t2 = clock.nextTimestamp()
    assert(t2 > t1) { "Expected $t2 > $t1" }
}
test("MC-02: large negative NTP correction never causes timestamp inversion") {
    val clock = MonotonicClock(0L)
    val t1 = clock.nextTimestamp()
    clock.updateCorrection(-999_999_999L)   // extreme negative
    val t2 = clock.nextTimestamp()
    assert(t2 > t1) { "Expected monotonic even with large negative correction: $t2 > $t1" }
}
test("MC-03: NTP correction is applied") {
    val clock = MonotonicClock(1_000L)   // +1 second
    val before = System.currentTimeMillis()
    val t = clock.nextTimestamp()
    assert(t >= before + 1_000L) { "Expected NTP correction to shift timestamp" }
}
test("MC-04: updateCorrection changes future timestamps") {
    val clock = MonotonicClock(0L)
    clock.updateCorrection(5_000L)
    val t = clock.nextTimestamp()
    assert(t >= System.currentTimeMillis() + 4_000L)   // roughly +5s
}

// ── NpntComplianceGate logic invariants ──────────────────────────────────────
// AUDIT FIX: NG-01..05 were tautological — tested local variables, never called
// NpntComplianceGate. Now call real NpntComplianceGate.evaluate() with
// HardcodedZoneMapAdapter + stub proximity checker.

val ngProxChecker = object : IAirportProximityChecker {
    override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
        clear = true, restriction = ProximityRestriction.NONE,
        nearestIcaoCode = "NONE", nearestName = "none",
        distanceKm = 999.0, message = "stub"
    )
}
val ngZoneAdapter = HardcodedZoneMapAdapter()
val ngGate = NpntComplianceGate(digitalSkyAdapter = ngZoneAdapter, proximityChecker = ngProxChecker)

test("NG-01: RED zone → blocked=true, no override path") {
    runBlocking {
        // 28.565, 77.100 is in the IGI Airport RED zone in HardcodedZoneMapAdapter
        val result = ngGate.evaluate(28.565, 77.100, 100.0, null)
        assert(result.blocked, "RED zone must block, got blocked=${result.blocked}")
        assert(result.complianceScore == ComplianceScore.BLOCKED,
            "RED zone must be BLOCKED, got ${result.complianceScore}")
    }
}
test("NG-02: YELLOW without token → blocked=true") {
    runBlocking {
        // 28.625, 77.245 is in the iDEX YELLOW zone
        val result = ngGate.evaluate(28.625, 77.245, 100.0, null)
        assert(result.blocked, "YELLOW without token must block, reasons: ${result.blockingReasons}")
    }
}
test("NG-03: YELLOW with valid token → blocked=false, CONDITIONAL") {
    runBlocking {
        val result = ngGate.evaluate(28.625, 77.245, 100.0, "DEMO-TOKEN-YELLOW-OK")
        assert(!result.blocked, "Valid token must pass YELLOW zone, reasons: ${result.blockingReasons}")
        assert(result.complianceScore == ComplianceScore.CONDITIONAL,
            "Expected CONDITIONAL, got ${result.complianceScore}")
    }
}
test("NG-04: GREEN <= 400ft, no token → blocked=false, CLEAR") {
    runBlocking {
        // 27.0, 75.0 is unzoned → GREEN
        val result = ngGate.evaluate(27.0, 75.0, 100.0, null)
        assert(!result.blocked, "GREEN zone must pass, reasons: ${result.blockingReasons}")
        assert(result.complianceScore == ComplianceScore.CLEAR,
            "Expected CLEAR, got ${result.complianceScore}")
    }
}
test("NG-05: GREEN > 400ft, no token → blocked=true") {
    runBlocking {
        val result = ngGate.evaluate(27.0, 75.0, 450.0, null)
        assert(result.blocked, "GREEN zone >400ft without token must block")
    }
}

// ── Summary ───────────────────────────────────────────────────────────────────

println("\n$passed passed, $failed failed ${if (failed == 0) "✅" else "❌"}")

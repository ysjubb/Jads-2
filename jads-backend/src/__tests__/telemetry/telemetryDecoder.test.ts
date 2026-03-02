import { decodeCanonical, PAYLOAD_OFFSETS } from '../../telemetry/telemetryDecoder'
import * as fs   from 'fs'
import * as path from 'path'

const vectorFile = path.join(__dirname, '../vectors/canonical_test_vectors.json')
const vectors    = JSON.parse(fs.readFileSync(vectorFile, 'utf-8'))
const tv001      = vectors.vectors.find((v: any) => v._id === 'TV-001')
const tv002      = vectors.vectors.find((v: any) => v._id === 'TV-002')

describe('TelemetryDecoder', () => {

  // ── DEC-01: Basic decode of TV-001 ──────────────────────────────────────

  test('DEC-01: decodes TV-001 sequence = 0', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.sequence).toBe(0)
    expect(dec.payloadSizeBytes).toBe(96)
  })

  // ── DEC-02: Coordinate decoding ─────────────────────────────────────────

  test('DEC-02: latitude decoded to correct decimal degrees', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    // latitudeMicrodeg = 28_632_500 → 28.632500°
    expect(dec.latitudeDeg).toBeCloseTo(28.6325, 4)
    expect(dec.latitudeMicrodeg).toBe(28_632_500)
  })

  test('DEC-02b: longitude decoded to correct decimal degrees', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    // longitudeMicrodeg = 77_219_500 → 77.219500°
    expect(dec.longitudeDeg).toBeCloseTo(77.2195, 4)
    expect(dec.longitudeMicrodeg).toBe(77_219_500)
  })

  // ── DEC-03: Display format — WARNING 4 from spec ─────────────────────────
  // Format: "28.632500°N"  NOT "+28.6325" or "28.6325N"
  // Must be 6 decimal places + degree symbol + N/S or E/W

  test('DEC-03: latitudeDisplay format = "28.632500°N"', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.latitudeDisplay).toBe('28.632500°N')
  })

  test('DEC-03b: longitudeDisplay format = "77.219500°E"', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.longitudeDisplay).toBe('77.219500°E')
  })

  test('DEC-03c: latitudeDisplay matches regex /^\\d+\\.\\d{6}°[NS]$/', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.latitudeDisplay).toMatch(/^\d+\.\d{6}°[NS]$/)
  })

  test('DEC-03d: longitudeDisplay matches regex /^\\d+\\.\\d{6}°[EW]$/', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.longitudeDisplay).toMatch(/^\d+\.\d{6}°[EW]$/)
  })

  test('DEC-03e: southern latitude uses S suffix', () => {
    // Build a buffer with negative latMicro to verify S suffix
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf.writeInt32BE(-28_632_500, 12)  // negative = southern hemisphere
    // Recompute CRC
    const CRC32 = require('crc-32')
    buf.writeUInt32BE((CRC32.buf(buf.slice(0, 92)) >>> 0), 92)
    const hex = buf.toString('hex')
    const dec = decodeCanonical(hex)
    expect(dec.latitudeDisplay).toMatch(/°S$/)
  })

  test('DEC-03f: western longitude uses W suffix', () => {
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf.writeInt32BE(-77_219_500, 16)  // negative = western hemisphere
    const CRC32 = require('crc-32')
    buf.writeUInt32BE((CRC32.buf(buf.slice(0, 92)) >>> 0), 92)
    const dec = decodeCanonical(buf.toString('hex'))
    expect(dec.longitudeDisplay).toMatch(/°W$/)
  })

  // ── DEC-04: Altitude display — WARNING 5 from spec ──────────────────────
  // Format: "30.5m (100ft) AGL" — both metres and feet, "AGL" suffix

  test('DEC-04: altitudeDisplay contains "m", "ft", and "AGL"', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.altitudeDisplay).toContain('m')
    expect(dec.altitudeDisplay).toContain('ft')
    expect(dec.altitudeDisplay).toContain('AGL')
  })

  test('DEC-04b: TV-001 altitudeCm=3048 → "30.5m (100ft) AGL"', () => {
    // altitudeCm = 3048 → 30.48m → 100ft
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.altitudeCm).toBe(3048)
    expect(dec.altitudeM).toBeCloseTo(30.5, 0)
    expect(dec.altitudeFt).toBeCloseTo(100.0, 0)
    expect(dec.altitudeDisplay).toBe('30.5m (100ft) AGL')
  })

  test('DEC-04c: TV-002 altitudeCm=5000 → correct metres/feet', () => {
    const dec = decodeCanonical(tv002.expected.canonicalHex)
    expect(dec.altitudeCm).toBe(5000)
    expect(dec.altitudeM).toBeCloseTo(50.0, 0)
    // 5000cm / 30.48 ≈ 164ft
    expect(dec.altitudeFt).toBeCloseTo(164.0, 0)
  })

  // ── DEC-05: CRC32 validation ─────────────────────────────────────────────

  test('DEC-05: crc32Valid = true for valid TV-001', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.crc32Valid).toBe(true)
  })

  test('DEC-05b: crc32Valid = false when CRC byte is corrupted', () => {
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf[92] ^= 0xFF  // corrupt first CRC byte
    const dec = decodeCanonical(buf.toString('hex'))
    expect(dec.crc32Valid).toBe(false)
  })

  test('DEC-05c: crc32Valid = false when payload byte 5 is corrupted', () => {
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf[5] ^= 0x01   // corrupt a payload byte — stored CRC no longer matches
    const dec = decodeCanonical(buf.toString('hex'))
    expect(dec.crc32Valid).toBe(false)
  })

  // ── DEC-06: Reserved bytes ───────────────────────────────────────────────

  test('DEC-06: reservedBytesZero = true for TV-001', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.reservedBytesZero).toBe(true)
  })

  test('DEC-06b: reservedBytesZero = false when a reserved byte is set', () => {
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf[70] = 0x01  // reserved region starts at offset 65
    // Recompute CRC so we don't fail on CRC instead
    const CRC32 = require('crc-32')
    buf.writeUInt32BE((CRC32.buf(buf.slice(0, 92)) >>> 0), 92)
    const dec = decodeCanonical(buf.toString('hex'))
    expect(dec.reservedBytesZero).toBe(false)
  })

  // ── DEC-07: missionId ─────────────────────────────────────────────────────

  test('DEC-07: missionId decoded as decimal string', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    // TV-001 missionId = 1704067200000 (BigInt, stored at offset 41)
    expect(dec.missionId).toBe('1704067200000')
    expect(typeof dec.missionId).toBe('string')
  })

  // ── DEC-08: Input validation ─────────────────────────────────────────────

  test('DEC-08: throws on input shorter than 192 chars', () => {
    expect(() => decodeCanonical('deadbeef')).toThrow('Invalid payload')
  })

  test('DEC-08b: throws on input longer than 192 chars', () => {
    expect(() => decodeCanonical('00'.repeat(97))).toThrow('Invalid payload')
  })

  test('DEC-08c: throws with message including actual length', () => {
    expect(() => decodeCanonical('aabb')).toThrow('4')
  })

  // ── DEC-09: TV-002 moving record ─────────────────────────────────────────

  test('DEC-09: TV-002 sequence = 1', () => {
    const dec = decodeCanonical(tv002.expected.canonicalHex)
    expect(dec.sequence).toBe(1)
  })

  test('DEC-09b: TV-002 groundspeedKph > 0 (north-east movement)', () => {
    const dec = decodeCanonical(tv002.expected.canonicalHex)
    // velN=2500, velE=1800 → groundspeed = sqrt(2500²+1800²) ≈ 3082 mm/s ≈ 11.1 kph
    expect(dec.groundspeedKph).toBeGreaterThan(0)
    expect(dec.groundspeedMms).toBeGreaterThan(0)
  })

  test('DEC-09c: TV-002 velocityNorthMms = 2500', () => {
    const dec = decodeCanonical(tv002.expected.canonicalHex)
    expect(dec.velocityNorthMms).toBe(2500)
    expect(dec.velocityEastMms).toBe(1800)
    expect(dec.velocityDownMms).toBe(-100)
  })

  // ── DEC-10: Enum labels ───────────────────────────────────────────────────

  test('DEC-10: fixTypeLabel = "3D" for fixType=2', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.fixType).toBe(2)
    expect(dec.fixTypeLabel).toBe('3D')
  })

  test('DEC-10b: npntClassLabel = "GREEN" for classification=0', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.npntClassification).toBe(0)
    expect(dec.npntClassLabel).toBe('GREEN')
  })

  test('DEC-10c: npntClassLabel = "RED" for classification=2', () => {
    const buf = Buffer.from(tv001.expected.canonicalHex, 'hex')
    buf[40] = 2  // RED
    const CRC32 = require('crc-32')
    buf.writeUInt32BE((CRC32.buf(buf.slice(0, 92)) >>> 0), 92)
    const dec = decodeCanonical(buf.toString('hex'))
    expect(dec.npntClassLabel).toBe('RED')
  })

  // ── DEC-11: hdop ─────────────────────────────────────────────────────────

  test('DEC-11: hdop decoded as float (raw/100)', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    // TV-001 hdop input = 85 → stored as 85 → decoded as 0.85
    expect(dec.hdop).toBeCloseTo(0.85, 2)
  })

  // ── DEC-12: PAYLOAD_OFFSETS export ───────────────────────────────────────

  test('DEC-12: PAYLOAD_OFFSETS exported and contains expected fields', () => {
    expect(PAYLOAD_OFFSETS.sequence.offset).toBe(0)
    expect(PAYLOAD_OFFSETS.timestampUtcMs.offset).toBe(4)
    expect(PAYLOAD_OFFSETS.latitudeMicrodeg.offset).toBe(12)
    expect(PAYLOAD_OFFSETS.crc32.offset).toBe(92)
  })

  test('DEC-12b: PAYLOAD_OFFSETS crc32 length = 4', () => {
    expect(PAYLOAD_OFFSETS.crc32.length).toBe(4)
  })

  // ── DEC-13: groundspeed calculation ─────────────────────────────────────

  test('DEC-13: TV-001 groundspeedMms = 0 (hovering)', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.groundspeedMms).toBe(0)
    expect(dec.groundspeedKph).toBe(0)
  })

  test('DEC-13b: groundspeed = sqrt(N² + E²) — not including downward velocity', () => {
    const dec = decodeCanonical(tv002.expected.canonicalHex)
    const expected = Math.sqrt(2500 ** 2 + 1800 ** 2)
    expect(dec.groundspeedMms).toBe(Math.round(expected))
  })

  // ── DEC-14: timestampIso format ──────────────────────────────────────────

  test('DEC-14: timestampIso is valid ISO-8601 UTC', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.timestampIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })

  test('DEC-14b: timestampUtcMs is decimal string matching input', () => {
    const dec = decodeCanonical(tv001.expected.canonicalHex)
    expect(dec.timestampUtcMs).toBe('1704067200000')
  })

})

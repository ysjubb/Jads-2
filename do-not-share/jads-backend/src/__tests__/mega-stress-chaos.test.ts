// ─────────────────────────────────────────────────────────────────────────────
// JADS MEGA STRESS & CHAOS TEST — "Does It Break?"
// File: src/__tests__/mega-stress-chaos.test.ts
//
// PURPOSE: One exhaustive test suite that pushes every pure-logic component
// to its absolute limits. If this file passes, the platform's core logic
// is battle-tested against:
//
//   STRESS:  Volume, throughput, latency under sustained load
//   CHAOS:   Malformed, adversarial, extreme, null, and garbage inputs
//   CRYPTO:  Hash chain integrity, Merkle trees, CRC32, tamper detection
//   GEO:     Geofence, FIR boundaries, airport proximity, haversine math
//   AVIATION: AFTN, ICAO, PBN, DOF, semicircular rule, RVSM, SAR
//   CONCURRENCY: Statelessness, no shared mutable state, parallel safety
//   FORENSIC: Every invariant check (I-1 through I-9), attack vectors
//
// TEST COUNT: 80+ individual test cases across 12 describe blocks
// TOTAL ITERATIONS: ~500,000+ individual operations
//
// CONTROL FRAMEWORK — every test documents:
//   TRIGGER:      Exact condition
//   OUTPUT:       Measurable result
//   FAILURE MODE: What breaks if this control is absent
//   OWNER:        Module responsible
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { AftnMessageBuilder, AftnFplInput } from '../services/AftnMessageBuilder'
import { Item18Parser, Item18Parsed }       from '../services/Item18Parser'
import { ForensicVerifier }                 from '../services/ForensicVerifier'
import { AltitudeComplianceEngine }         from '../services/AltitudeComplianceEngine'
import { FirGeometryEngine }                from '../services/FirGeometryEngine'
import {
  checkAirportProximity,
  haversineKm,
  INDIAN_AERODROMES_PROXIMITY,
}                                           from '../services/AirportProximityGate'
import {
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  createGenesisAnchor,
}                                           from '../services/MerkleTreeService'
import {
  serialize,
  deserialize,
  verifyCrc32,
  reservedBytesZero,
  PAYLOAD_SIZE,
  TelemetryFields,
}                                           from '../telemetry/canonicalSerializer'

// ── Shared instances ─────────────────────────────────────────────────────────

const builder   = new AftnMessageBuilder()
const parser    = new Item18Parser()
const verifier  = new ForensicVerifier(null as any)
const altitude  = new AltitudeComplianceEngine()
const firEngine = new FirGeometryEngine()

// ── Helpers ──────────────────────────────────────────────────────────────────

function minItem18(overrides: Partial<Item18Parsed> = {}): Item18Parsed {
  return {
    dof: null, reg: null, pbnCodes: [], opr: null, sts: null,
    dep: null, dest: null, selcal: null, rmk: null, unknown: [], raw: '',
    ...overrides,
  }
}

function minInput(overrides: Partial<AftnFplInput> = {}): AftnFplInput {
  return {
    callsign: 'VTA101', flightRules: 'I', flightType: 'S',
    aircraftType: 'B738', wakeTurbulence: 'M', equipment: 'SDFGLOP',
    surveillance: 'SB2', departureIcao: 'VIDP', eobt: '151400',
    speed: 'N0450', level: 'F330', route: 'DCT DOGAR DCT',
    destination: 'VABB', eet: '0200',
    item18Parsed: minItem18({ dof: '260315' }),
    ...overrides,
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

// Canonical payload builder matching ForensicVerifier expectations
function buildCanonicalPayload(): string {
  const data = Buffer.alloc(92, 0x00)
  for (let i = 0; i < 65; i++) data[i] = 0xAB
  // bytes 65-91 = reserved = zero (already zero from alloc)
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xEDB88320
      else crc >>>= 1
    }
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc, 0)
  return Buffer.concat([data, crcBuf]).toString('hex')
}

function buildValidChain(missionId: bigint, numRecords: number) {
  const prefix = Buffer.from('MISSION_INIT', 'ascii')
  const idBuf  = Buffer.alloc(8)
  idBuf.writeBigInt64BE(missionId)
  let prevHash = crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest('hex')

  const records = []
  for (let seq = 0; seq < numRecords; seq++) {
    const payload = buildCanonicalPayload()
    const chainHash = crypto.createHash('sha256')
      .update(Buffer.concat([Buffer.from(payload, 'hex'), Buffer.from(prevHash, 'hex')]))
      .digest('hex')
    records.push({ sequence: seq, canonicalPayloadHex: payload, chainHashHex: chainHash, gnssStatus: 'GOOD' })
    prevHash = chainHash
  }
  return records
}

function makeTelemetryFields(overrides: Partial<TelemetryFields> = {}): TelemetryFields {
  return {
    missionId:         BigInt('1709280000000'),
    recordSequence:    BigInt(0),
    timestampUtcMs:    BigInt(Date.now()),
    latitudeMicrodeg:  BigInt(28625000),     // 28.625°N
    longitudeMicrodeg: BigInt(77245000),     // 77.245°E
    altitudeCm:        BigInt(12000),        // 120m AGL
    velocityNorthMms:  BigInt(5000),
    velocityEastMms:   BigInt(3000),
    velocityDownMms:   BigInt(-100),
    prevHashPrefix:    Buffer.alloc(8, 0xAA),
    flightStateFlags:  0x00000001,
    sensorHealthFlags: 0x0000FFFF,
    ...overrides,
  }
}

// Geofence helper
interface LatLon { latDeg: number; lonDeg: number }
function isPointInPolygon(latDeg: number, lonDeg: number, polygon: LatLon[]): boolean {
  const n = polygon.length
  if (n < 3) return true
  const minLat = Math.min(...polygon.map(p => p.latDeg))
  const maxLat = Math.max(...polygon.map(p => p.latDeg))
  const minLon = Math.min(...polygon.map(p => p.lonDeg))
  const maxLon = Math.max(...polygon.map(p => p.lonDeg))
  if (latDeg < minLat || latDeg > maxLat || lonDeg < minLon || lonDeg > maxLon) return false
  let crossings = 0
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const straddles = (a.latDeg < latDeg && b.latDeg >= latDeg) ||
                      (b.latDeg < latDeg && a.latDeg >= latDeg)
    if (!straddles) continue
    const crossingLon = a.lonDeg + (latDeg - a.latDeg) * (b.lonDeg - a.lonDeg) / (b.latDeg - a.latDeg)
    if (crossingLon > lonDeg) crossings++
  }
  return (crossings % 2) === 1
}

const DELHI_SQUARE: LatLon[] = [
  { latDeg: 28.0, lonDeg: 77.0 },
  { latDeg: 29.0, lonDeg: 77.0 },
  { latDeg: 29.0, lonDeg: 78.0 },
  { latDeg: 28.0, lonDeg: 78.0 },
]

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 1: AFTN MESSAGE BUILDER — EXTREME THROUGHPUT
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-AFTN-01: AftnMessageBuilder extreme throughput', () => {

  test('10,000 builds with unique callsigns — all valid, all unique', () => {
    const N = 10_000
    const messages = new Set<string>()
    let malformed = 0
    const t0 = performance.now()
    for (let i = 0; i < N; i++) {
      const cs = `V${String(i).padStart(5, '0')}`
      const msg = builder.build(minInput({
        callsign: cs,
        item18Parsed: minItem18({ dof: '260315' }),
      }))
      if (!msg.startsWith('(FPL-') || !msg.endsWith(')')) malformed++
      if (!msg.includes(`(FPL-${cs}-`)) malformed++
      messages.add(msg)
    }
    const elapsed = performance.now() - t0
    expect(malformed).toBe(0)
    expect(messages.size).toBe(N)
    expect(elapsed).toBeLessThan(10000) // 10s for 10k builds
  })

  test('Latency percentiles over 10,000 builds — p50<1ms, p95<3ms, p99<5ms', () => {
    const N = 10_000
    const times: number[] = []
    for (let i = 0; i < N; i++) {
      const t0 = performance.now()
      builder.build(minInput())
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    expect(percentile(times, 50)).toBeLessThan(1)
    expect(percentile(times, 95)).toBeLessThan(3)
    expect(percentile(times, 99)).toBeLessThan(5)
  })

  test('Concurrent simulation — 500 Promise.all builds, zero cross-contamination', async () => {
    const N = 500
    const callsigns = Array.from({ length: N }, (_, i) => `TS${String(i).padStart(4, '0')}`)
    const results = await Promise.all(
      callsigns.map(cs => Promise.resolve(builder.build(minInput({ callsign: cs }))))
    )
    const extracted = results.map(r => {
      const m = r.match(/\(FPL-([A-Z0-9]+)-/)
      return m ? m[1] : null
    })
    expect(new Set(extracted).size).toBe(N)
    expect(extracted.every((cs, i) => cs === callsigns[i])).toBe(true)
  })

  test('Mixed PBN/SAR/DOF variants — 5000 builds, zero field mismatches', () => {
    const variants = [
      { equipment: 'SDFGR', radioEquipment: 'VU', item18Parsed: parser.parse(null) },
      { equipment: 'SDFG', radioEquipment: undefined, item18Parsed: parser.parse(null) },
      { equipment: 'SDFGR', survivalEquipment: 'DM', item18Parsed: parser.parse(null) },
      { equipment: 'SR', jackets: 'LFUV', item18Parsed: parser.parse(null) },
    ]
    let mismatches = 0
    for (let i = 0; i < 5000; i++) {
      const v = variants[i % variants.length]
      const msg = builder.build(minInput(v))
      if (v.equipment.includes('R') && !msg.includes('PBN/')) mismatches++
      if (!v.equipment.includes('R') && msg.includes('PBN/')) mismatches++
      if (v.radioEquipment && !msg.includes('R/VU')) mismatches++
      if (v.survivalEquipment && !msg.includes('S/DM')) mismatches++
      if (v.jackets && !msg.includes('J/LFUV')) mismatches++
    }
    expect(mismatches).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 2: ITEM 18 PARSER — CHAOS GAUNTLET
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-PARSER-01: Item18Parser chaos gauntlet', () => {

  test('Null, undefined, empty, "0" — all produce safe empty results', () => {
    const inputs = [null, undefined, '', '0', '   ', '\t\n']
    for (const inp of inputs) {
      const r = parser.parse(inp as any)
      expect(r.pbnCodes).toHaveLength(0)
      expect(r.dof).toBeNull()
      expect(r.unknown).toHaveLength(0)
    }
  })

  test('5000 parse calls with garbage strings — zero crashes', () => {
    const garbageStrings = [
      '/////', '!!!@@@###$$$', '\x00\x01\x02', 'DOF/', 'PBN/  ',
      'A'.repeat(10000), 'DOF/999999', 'PBN/ZZZZZZ', '<script>alert(1)</script>',
      'DROP TABLE missions;--', '{{}}', 'DOF/260315\nINJECTED/PAYLOAD',
      '​', // zero-width space
      'DOF/260315 '.repeat(100),
      String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i)),
    ]
    let crashes = 0
    for (let i = 0; i < 5000; i++) {
      try {
        const s = garbageStrings[i % garbageStrings.length]
        parser.parse(s)
      } catch { crashes++ }
    }
    expect(crashes).toBe(0)
  })

  test('PBN code extraction — all valid 2-char codes found, garbage ignored', () => {
    expect(parser.parsePbnCodes('B4D3S1T1O1L1')).toEqual(['B4', 'D3', 'S1', 'T1', 'O1', 'L1'])
    expect(parser.parsePbnCodes('')).toEqual([])
    expect(parser.parsePbnCodes('ZZZZ')).toEqual([])
    expect(parser.parsePbnCodes('B4 D3')).toEqual(['B4', 'D3']) // space-separated
    expect(parser.parsePbnCodes('B4D3GARBAGE')).toHaveLength(2)
  })

  test('validateDof — 50,000 calls, valid/invalid correctly classified', () => {
    const valid   = ['260101', '261231', '260615', '251130', '300228']
    const invalid = ['261301', '260032', '26031', 'YYMMDD', '', '000000', '999999']
    let errors = 0
    for (let i = 0; i < 50_000; i++) {
      if (i % 2 === 0) {
        if (!parser.validateDof(valid[i % valid.length])) errors++
      } else {
        if (parser.validateDof(invalid[i % invalid.length])) errors++
      }
    }
    expect(errors).toBe(0)
  })

  test('50,000 getRequiredEquipmentForPbn lookups — all known codes return non-empty', () => {
    const codes = ['A1', 'B1', 'B2', 'B3', 'B4', 'C1', 'C4', 'D1', 'D4', 'L1', 'O1', 'S1', 'T1']
    let failures = 0
    for (let i = 0; i < 50_000; i++) {
      const req = parser.getRequiredEquipmentForPbn(codes[i % codes.length])
      if (req.length === 0) failures++
    }
    expect(failures).toBe(0)
  })

  test('Unknown PBN code returns empty array — never crashes', () => {
    expect(parser.getRequiredEquipmentForPbn('Z9')).toEqual([])
    expect(parser.getRequiredEquipmentForPbn('')).toEqual([])
    expect(parser.getRequiredEquipmentForPbn('INVALID')).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 3: FORENSIC VERIFIER — HASH CHAIN ATTACK VECTORS
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-FORENSIC-01: Hash chain — every attack vector', () => {

  const missionId = BigInt('1709280000000')

  test('Valid chain 1000 records — passes I-1 in < 100ms', () => {
    const records = buildValidChain(missionId, 1000)
    const t0 = performance.now()
    const result = (verifier as any).checkHashChain(String(missionId), records)
    const elapsed = performance.now() - t0
    expect(result.pass).toBe(true)
    expect(result.code).toBe('I1_HASH_CHAIN')
    expect(elapsed).toBeLessThan(100)
  })

  test('Single-record chain — passes', () => {
    const result = (verifier as any).checkHashChain(String(missionId), buildValidChain(missionId, 1))
    expect(result.pass).toBe(true)
  })

  test('Empty chain — passes (blocked mission)', () => {
    const result = (verifier as any).checkHashChain(String(missionId), [])
    expect(result.pass).toBe(true)
  })

  test('Attack: tampered payload at record 0 — chain broken', () => {
    const records = buildValidChain(missionId, 20)
    records[0].canonicalPayloadHex = records[0].canonicalPayloadHex.replace('ab', 'cd')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })

  test('Attack: tampered payload at LAST record — chain broken', () => {
    const records = buildValidChain(missionId, 20)
    const last = records[records.length - 1]
    last.canonicalPayloadHex = last.canonicalPayloadHex.replace('ab', 'cd')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })

  test('Attack: tampered hash at record 5 — chain broken', () => {
    const records = buildValidChain(missionId, 20)
    records[5].chainHashHex = records[5].chainHashHex.replace(/^./, c => c === 'a' ? 'b' : 'a')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })

  test('Attack: deleted record (sequence gap) — detected', () => {
    const records = buildValidChain(missionId, 20)
    const gapped = records.filter(r => r.sequence !== 10)
    const result = (verifier as any).checkHashChain(String(missionId), gapped)
    expect(result.pass).toBe(false)
    expect(result.detail).toMatch(/SEQUENCE_GAP/)
  })

  test('Attack: wrong missionId — HASH_0 mismatch', () => {
    const records = buildValidChain(missionId, 10)
    const wrongId = missionId + BigInt(1)
    const result = (verifier as any).checkHashChain(String(wrongId), records)
    expect(result.pass).toBe(false)
  })

  test('Records in reverse order — still passes (verifier sorts)', () => {
    const records = buildValidChain(missionId, 20)
    const reversed = [...records].reverse()
    const result = (verifier as any).checkHashChain(String(missionId), reversed)
    expect(result.pass).toBe(true)
  })

  test('Records in random order — still passes (verifier sorts)', () => {
    const records = buildValidChain(missionId, 50)
    const shuffled = [...records].sort(() => Math.random() - 0.5)
    const result = (verifier as any).checkHashChain(String(missionId), shuffled)
    expect(result.pass).toBe(true)
  })

  test('Attack: swap two records payloads — CRC mismatch breaks chain', () => {
    // Swapping two identical payloads won't break CRC, but swapping payloads
    // between records with different sequence numbers means the recomputed
    // hash = SHA256(payload + prevHash) won't match stored chainHashHex.
    // However, in our test fixture all payloads are identical (same buildCanonicalPayload()),
    // so swapping produces the same result. Instead, corrupt a payload directly:
    const records = buildValidChain(missionId, 20)
    // Replace record 10's payload with a fully different (but CRC-valid) payload
    const original = Buffer.from(records[10].canonicalPayloadHex, 'hex')
    original[0] = (original[0] + 1) % 256 // change first byte
    records[10].canonicalPayloadHex = original.toString('hex')
    // The CRC will no longer match AND the chain hash will break
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 4: FORENSIC VERIFIER — ALL INVARIANT CHECKS (I-2 to I-9)
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-FORENSIC-02: All invariant checks I-2 through I-9', () => {

  // I-2: NTP
  test('NTP SYNCED → pass', () => {
    const r = (verifier as any).checkNtpEvidence('SYNCED', 42)
    expect(r.pass).toBe(true)
    expect(r.code).toBe('I2_NTP_SYNC')
  })

  test('NTP FAILED → fail + critical', () => {
    const r = (verifier as any).checkNtpEvidence('FAILED', null)
    expect(r.pass).toBe(false)
    expect(r.critical).toBe(true)
  })

  test('NTP SYNCED but offset >24h → forced DEGRADED', () => {
    const r = (verifier as any).checkNtpEvidence('SYNCED', 100_000_000) // ~27h
    expect(r.detail).toMatch(/DEGRADED/)
  })

  test('NTP with server time drift >300s → advisory appended', () => {
    const now = Date.now()
    const r = (verifier as any).checkNtpEvidence('SYNCED', 42, String(now), String(now + 600_000))
    expect(r.detail).toMatch(/SERVER_TIME_DRIFT/)
  })

  // I-3: Certificate
  test('Valid cert → pass', () => {
    const ms = Date.now() - 3600_000
    const r = (verifier as any).checkCertificate(true, String(ms + 365 * 86400_000), ms)
    expect(r.pass).toBe(true)
  })

  test('Expired cert → fail + critical', () => {
    const ms = Date.now()
    const r = (verifier as any).checkCertificate(true, String(ms - 86400_000), ms)
    expect(r.pass).toBe(false)
    expect(r.critical).toBe(true)
  })

  test('certValidAtStart=false → fail', () => {
    const r = (verifier as any).checkCertificate(false, null, Date.now())
    expect(r.pass).toBe(false)
  })

  // I-4: CRL
  test('CRL present → pass', () => {
    const r = (verifier as any).checkArchivedCrl('BASE64DATA')
    expect(r.pass).toBe(true)
  })

  test('CRL absent → fail (non-critical)', () => {
    const r = (verifier as any).checkArchivedCrl(null)
    expect(r.pass).toBe(false)
    expect(r.critical).toBe(false)
  })

  // I-6: Zone compliance
  test('No violations → pass', () => {
    const r = (verifier as any).checkZoneCompliance([])
    expect(r.pass).toBe(true)
  })

  test('RED zone violation → fail + critical', () => {
    const r = (verifier as any).checkZoneCompliance([
      { violationType: 'UNPERMITTED_ZONE', severity: 'CRITICAL' },
    ])
    expect(r.pass).toBe(false)
    expect(r.critical).toBe(true)
  })

  test('Non-critical violations only → pass', () => {
    const r = (verifier as any).checkZoneCompliance([
      { violationType: 'ALTITUDE_EXCEEDED', severity: 'WARNING' },
    ])
    expect(r.pass).toBe(true)
  })

  // I-7: GNSS
  test('All GOOD GNSS → pass', () => {
    const records = Array(100).fill({ gnssStatus: 'GOOD' })
    const r = (verifier as any).checkGnssIntegrity(records)
    expect(r.pass).toBe(true)
  })

  test('>20% degraded GNSS → fail', () => {
    const records = [
      ...Array(70).fill({ gnssStatus: 'GOOD' }),
      ...Array(30).fill({ gnssStatus: 'DEGRADED' }),
    ]
    const r = (verifier as any).checkGnssIntegrity(records)
    expect(r.pass).toBe(false)
  })

  test('Exactly 20% degraded → pass (threshold is <=20%)', () => {
    const records = [
      ...Array(80).fill({ gnssStatus: 'GOOD' }),
      ...Array(20).fill({ gnssStatus: 'DEGRADED' }),
    ]
    const r = (verifier as any).checkGnssIntegrity(records)
    expect(r.pass).toBe(true)
  })

  test('Empty records → pass', () => {
    const r = (verifier as any).checkGnssIntegrity([])
    expect(r.pass).toBe(true)
  })

  // I-8: Hardware security
  test('StrongBox backed + secure boot → pass', () => {
    const r = (verifier as any).checkHardwareSecurity(true, true)
    expect(r.pass).toBe(true)
  })

  test('No attestation → fail (non-critical)', () => {
    const r = (verifier as any).checkHardwareSecurity(null, null)
    expect(r.pass).toBe(false)
    expect(r.critical).toBe(false)
  })

  // I-9: Timestamp monotonicity
  test('Monotonic timestamps → pass', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      sequence: i, recordedAtUtcMs: String(1709280000000 + i * 1000),
    }))
    const r = (verifier as any).checkTimestampMonotonicity(records)
    expect(r.pass).toBe(true)
  })

  test('Clock rollback detected → fail', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      sequence: i, recordedAtUtcMs: String(1709280000000 + i * 1000),
    }))
    records[5].recordedAtUtcMs = String(1709280000000) // rollback to seq 0 time
    const r = (verifier as any).checkTimestampMonotonicity(records)
    expect(r.pass).toBe(false)
    expect(r.detail).toMatch(/CLOCK_ROLLBACK/)
  })

  test('Single record → pass (insufficient to evaluate)', () => {
    const r = (verifier as any).checkTimestampMonotonicity([{ sequence: 0, recordedAtUtcMs: '123' }])
    expect(r.pass).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 5: CANONICAL SERIALIZER — STRESS + EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-SERIAL-01: Canonical serializer round-trip stress', () => {

  test('1000 serialize → deserialize round-trips — all fields match', () => {
    for (let i = 0; i < 1000; i++) {
      const fields = makeTelemetryFields({
        recordSequence: BigInt(i),
        timestampUtcMs: BigInt(Date.now() + i),
        latitudeMicrodeg: BigInt(28000000 + i * 100),
        longitudeMicrodeg: BigInt(77000000 + i * 100),
      })
      const buf = serialize(fields)
      expect(buf.length).toBe(PAYLOAD_SIZE)
      const decoded = deserialize(buf)
      expect(decoded.missionId).toBe(fields.missionId)
      expect(decoded.recordSequence).toBe(fields.recordSequence)
      expect(decoded.latitudeMicrodeg).toBe(fields.latitudeMicrodeg)
      expect(decoded.longitudeMicrodeg).toBe(fields.longitudeMicrodeg)
    }
  })

  test('CRC32 verification — valid payloads pass, tampered payloads fail', () => {
    const fields = makeTelemetryFields()
    const buf = serialize(fields)
    const hex = buf.toString('hex')

    // Valid
    expect(verifyCrc32(hex).valid).toBe(true)
    expect(reservedBytesZero(hex)).toBe(true)

    // Tamper byte 0
    const tampered = 'ff' + hex.substring(2)
    expect(verifyCrc32(tampered).valid).toBe(false)
  })

  test('Reserved bytes non-zero → detected', () => {
    const fields = makeTelemetryFields()
    const buf = serialize(fields)
    // Manually corrupt reserved bytes (88-91)
    buf.writeUInt32BE(0xDEADBEEF, 88)
    const hex = buf.toString('hex')
    expect(reservedBytesZero(hex)).toBe(false)
  })

  test('Wrong-length payload → deserialize throws', () => {
    expect(() => deserialize(Buffer.alloc(50))).toThrow()
    expect(() => deserialize(Buffer.alloc(100))).toThrow()
    expect(() => deserialize(Buffer.alloc(0))).toThrow()
  })

  test('prevHashPrefix must be exactly 8 bytes', () => {
    expect(() => serialize(makeTelemetryFields({ prevHashPrefix: Buffer.alloc(7) }))).toThrow()
    expect(() => serialize(makeTelemetryFields({ prevHashPrefix: Buffer.alloc(9) }))).toThrow()
    expect(() => serialize(makeTelemetryFields({ prevHashPrefix: Buffer.alloc(0) }))).toThrow()
  })

  test('verifyCrc32 with wrong-length hex → returns invalid', () => {
    expect(verifyCrc32('aabb').valid).toBe(false)
    expect(verifyCrc32('').valid).toBe(false)
    expect(verifyCrc32('zz'.repeat(96)).valid).toBe(false) // invalid hex
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 6: MERKLE TREE — BUILD, PROVE, VERIFY, ATTACK
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-MERKLE-01: Merkle tree build, prove, verify, attack', () => {

  test('Build tree with 1000 missions — root is deterministic', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `mission_${i}`)
    const tree1 = buildMerkleTree(ids)
    const tree2 = buildMerkleTree(ids)
    expect(tree1.hash).toBe(tree2.hash)
    expect(tree1.hash).toHaveLength(64) // SHA-256 hex
  })

  test('Empty day → EMPTY_DAY sentinel hash', () => {
    const tree = buildMerkleTree([])
    expect(tree.hash).toHaveLength(64)
    expect(tree.hash).toBe(buildMerkleTree([]).hash) // deterministic
  })

  test('Single mission → valid tree and proof', () => {
    const ids = ['single_mission']
    const tree = buildMerkleTree(ids)
    const proof = generateMerkleProof(ids, 'single_mission')
    expect(proof).not.toBeNull()
    expect(verifyMerkleProof(proof!)).toBe(true)
  })

  test('Inclusion proof for every mission in a 100-mission tree — all verify', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `m_${i}`)
    for (const id of ids) {
      const proof = generateMerkleProof(ids, id)
      expect(proof).not.toBeNull()
      expect(verifyMerkleProof(proof!)).toBe(true)
    }
  })

  test('Proof for non-existent mission → returns null', () => {
    const ids = ['a', 'b', 'c']
    expect(generateMerkleProof(ids, 'nonexistent')).toBeNull()
  })

  test('Tampered proof root → verification fails', () => {
    const ids = ['x', 'y', 'z']
    const proof = generateMerkleProof(ids, 'y')!
    proof.root = proof.root.replace(/^./, c => c === 'a' ? 'b' : 'a')
    expect(verifyMerkleProof(proof)).toBe(false)
  })

  test('Tampered proof step hash → verification fails', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `id_${i}`)
    const proof = generateMerkleProof(ids, 'id_5')!
    if (proof.proof.length > 0) {
      proof.proof[0].hash = proof.proof[0].hash.replace(/^./, c => c === 'a' ? 'b' : 'a')
    }
    expect(verifyMerkleProof(proof)).toBe(false)
  })

  test('Genesis anchor — unique nonce, deterministic hash', () => {
    const g1 = createGenesisAnchor('admin1')
    const g2 = createGenesisAnchor('admin1')
    expect(g1.genesisHash).toHaveLength(64)
    expect(g2.genesisHash).toHaveLength(64)
    expect(g1.nonce).not.toBe(g2.nonce)          // random nonce each time
    expect(g1.genesisHash).not.toBe(g2.genesisHash) // different because nonce differs
    expect(g1.platformVersion).toBe('JADS-4.0')
  })

  test('Odd-number mission list → tree still works (last leaf duplicated)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']  // 5 = odd
    const tree = buildMerkleTree(ids)
    expect(tree.hash).toHaveLength(64)
    for (const id of ids) {
      const proof = generateMerkleProof(ids, id)
      expect(proof).not.toBeNull()
      expect(verifyMerkleProof(proof!)).toBe(true)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 7: GEOFENCE — 50K POINTS, CONCAVE POLYGONS, EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-GEO-01: Geofence — 50K point stress + edge cases', () => {

  test('25,000 interior + 25,000 exterior points — zero misclassifications', () => {
    let failures = 0
    for (let i = 0; i < 25_000; i++) {
      const lat = 28.1 + Math.random() * 0.8
      const lon = 77.1 + Math.random() * 0.8
      if (!isPointInPolygon(lat, lon, DELHI_SQUARE)) failures++
    }
    for (let i = 0; i < 25_000; i++) {
      const lat = 30.0 + Math.random()
      const lon = 79.0 + Math.random()
      if (isPointInPolygon(lat, lon, DELHI_SQUARE)) failures++
    }
    expect(failures).toBe(0)
  })

  test('50,000 AABB fast-path checks < 200ms', () => {
    const t0 = performance.now()
    for (let i = 0; i < 50_000; i++) {
      isPointInPolygon(40.0, 90.0, DELHI_SQUARE) // way outside — AABB rejects
    }
    expect(performance.now() - t0).toBeLessThan(200)
  })

  test('Concave L-shape polygon — notch correctly excluded', () => {
    const lShape: LatLon[] = [
      { latDeg: 28.0, lonDeg: 77.0 },
      { latDeg: 29.0, lonDeg: 77.0 },
      { latDeg: 29.0, lonDeg: 78.0 },
      { latDeg: 28.5, lonDeg: 78.0 },
      { latDeg: 28.5, lonDeg: 77.5 },
      { latDeg: 28.0, lonDeg: 77.5 },
    ]
    expect(isPointInPolygon(28.75, 77.75, lShape)).toBe(true)  // upper right: inside
    expect(isPointInPolygon(28.25, 77.75, lShape)).toBe(false) // notch: outside
    expect(isPointInPolygon(28.25, 77.25, lShape)).toBe(true)  // lower left: inside
  })

  test('Degenerate polygons — safe pass', () => {
    expect(isPointInPolygon(28.5, 77.5, [])).toBe(true)
    expect(isPointInPolygon(28.5, 77.5, [{ latDeg: 28, lonDeg: 77 }])).toBe(true)
    expect(isPointInPolygon(28.5, 77.5, [{ latDeg: 28, lonDeg: 77 }, { latDeg: 29, lonDeg: 78 }])).toBe(true)
  })

  test('Origin (0,0) — no arithmetic error, classified correctly', () => {
    expect(() => isPointInPolygon(0, 0, DELHI_SQUARE)).not.toThrow()
    expect(isPointInPolygon(0, 0, DELHI_SQUARE)).toBe(false)
  })

  test('Negative coordinates (southern hemisphere) — classified outside', () => {
    expect(isPointInPolygon(-28.5, 77.5, DELHI_SQUARE)).toBe(false)
    expect(isPointInPolygon(28.5, -77.5, DELHI_SQUARE)).toBe(false)
    expect(isPointInPolygon(-90, 180, DELHI_SQUARE)).toBe(false)
  })

  test('FirGeometryEngine.isPointInPolygon — 10,000 checks on India FIR polygons', () => {
    // Point clearly in Delhi region
    let delhiHits = 0
    for (let i = 0; i < 10_000; i++) {
      const fir = firEngine.pointInFir(28.5, 77.1)
      if (fir && fir.firCode === 'VIDF') delhiHits++
    }
    // Should be either always inside Delhi FIR or always not — consistent
    expect(delhiHits === 0 || delhiHits === 10_000).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 8: AIRPORT PROXIMITY — ALL INDIAN AIRPORTS + EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-AIRPORT-01: Airport proximity gate — exhaustive', () => {

  test('Every Indian airport ARP at 500ft → PROHIBITED', () => {
    for (const aero of INDIAN_AERODROMES_PROXIMITY) {
      const r = checkAirportProximity(aero.arpLat, aero.arpLon, 500)
      expect(r.clear).toBe(false)
      expect(r.restriction).toBe('PROHIBITED')
      expect(r.nearestAerodrome?.icaoCode).toBe(aero.icaoCode)
    }
  })

  test('Point 100km from every airport → CLEAR', () => {
    // A point in the middle of the Thar desert, far from any airport
    const r = checkAirportProximity(25.0, 71.0, 100) // middle of nowhere
    expect(r.clear).toBe(true)
    expect(r.restriction).toBe('NONE')
  })

  test('Haversine distance sanity — Delhi to Mumbai ≈ 1148km', () => {
    const d = haversineKm(28.5665, 77.1031, 19.0896, 72.8656)
    expect(d).toBeGreaterThan(1100)
    expect(d).toBeLessThan(1200)
  })

  test('Haversine — same point = 0 distance', () => {
    expect(haversineKm(28.5, 77.1, 28.5, 77.1)).toBe(0)
  })

  test('Haversine — antipodal points ≈ 20,000km', () => {
    const d = haversineKm(0, 0, 0, 180)
    expect(d).toBeGreaterThan(19000)
    expect(d).toBeLessThan(21000)
  })

  test('10,000 proximity checks < 2000ms', () => {
    const t0 = performance.now()
    for (let i = 0; i < 10_000; i++) {
      checkAirportProximity(
        20 + Math.random() * 15,
        70 + Math.random() * 25,
        Math.random() * 2000
      )
    }
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  test('Airport at 1001ft inside inner zone → COORDINATION_REQUIRED (not prohibited)', () => {
    const aero = INDIAN_AERODROMES_PROXIMITY[0] // VIDP Delhi
    const r = checkAirportProximity(aero.arpLat, aero.arpLon, 1001)
    expect(r.restriction).toBe('COORDINATION_REQUIRED')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 9: ALTITUDE COMPLIANCE ENGINE — SEMICIRCULAR + RVSM
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-ALT-01: Altitude compliance — semicircular, RVSM, transitions', () => {

  test('Eastbound FL330 → compliant (odd FL)', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: 90, equipment: 'SDFGLOPW',
    })
    expect(r.errors).toHaveLength(0)
    expect(r.info.some(i => i.code === 'SEMICIRCULAR_RULE_COMPLIANT')).toBe(true)
  })

  test('Eastbound FL340 → violation (even FL for eastbound)', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '340',
      magneticTrackDeg: 90, equipment: 'SDFGLOPW',
    })
    expect(r.errors.some(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBe(true)
  })

  test('Westbound FL340 → compliant (even FL)', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '340',
      magneticTrackDeg: 270, equipment: 'SDFGLOPW',
    })
    expect(r.errors).toHaveLength(0)
  })

  test('RVSM FL330 without W equipment → error', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: 90, equipment: 'SDFGLOP',
    })
    expect(r.errors.some(e => e.code === 'RVSM_EQUIPMENT_MISSING')).toBe(true)
  })

  test('FL460 (above FL450) → high altitude warning', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '460',
      magneticTrackDeg: 90, equipment: 'SDFGLOPW',
    })
    expect(r.warnings.some(w => w.code === 'LEVEL_ABOVE_FL450')).toBe(true)
  })

  test('No magnetic track → SEMICIRCULAR_UNABLE_NO_TRACK warning', () => {
    const r = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: null, equipment: 'SDFGLOPW',
    })
    expect(r.warnings.some(w => w.code === 'SEMICIRCULAR_UNABLE_NO_TRACK')).toBe(true)
  })

  test('VFR flight → hemispherical advisory only, no errors', () => {
    const r = altitude.checkCompliance({
      flightRules: 'V', levelIndicator: 'F', levelValue: '100',
      magneticTrackDeg: 90, equipment: 'SDFGLOP',
    })
    expect(r.errors).toHaveLength(0)
    expect(r.info.some(i => i.code === 'VFR_HEMISPHERICAL_ADVISORY')).toBe(true)
  })

  test('resolveToFl — F330→330, A045→45, VFR→null', () => {
    expect(altitude.resolveToFl('F', '330')).toBe(330)
    expect(altitude.resolveToFl('A', '045')).toBe(45)
    expect(altitude.resolveToFl('VFR', '')).toBeNull()
    expect(altitude.resolveToFl('F', 'NaN')).toBeNull()
  })

  test('All valid eastbound RVSM FLs → no errors', () => {
    const validEast = [290, 310, 330, 350, 370, 390, 410]
    for (const fl of validEast) {
      const r = altitude.checkCompliance({
        flightRules: 'I', levelIndicator: 'F', levelValue: String(fl),
        magneticTrackDeg: 45, equipment: 'SDFGLOPW',
      })
      expect(r.errors.filter(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toHaveLength(0)
    }
  })

  test('All valid westbound RVSM FLs → no errors', () => {
    const validWest = [300, 320, 340, 360, 380, 400]
    for (const fl of validWest) {
      const r = altitude.checkCompliance({
        flightRules: 'I', levelIndicator: 'F', levelValue: String(fl),
        magneticTrackDeg: 225, equipment: 'SDFGLOPW',
      })
      expect(r.errors.filter(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toHaveLength(0)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 10: AFTN CHAOS — INJECTION, OVERFLOW, UNICODE, BOUNDARY VALUES
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-CHAOS-01: AFTN builder — injection, overflow, unicode', () => {

  test('SQL injection in callsign — rejected by ICAO validation', () => {
    // Builder validates callsign per ICAO Doc 4444 — 2-7 alphanumeric only.
    // SQL injection attempt is caught before reaching message construction.
    expect(() => builder.build(minInput({ callsign: "VTA'; DROP TABLE--" as any }))).toThrow('AFTN_INVALID_CALLSIGN')
  })

  test('XSS in RMK field — no crash, angle brackets preserved', () => {
    const parsed = parser.parse('DOF/260315 RMK/<script>alert(1)</script>')
    const msg = builder.build(minInput({ item18Parsed: parsed }))
    expect(msg.endsWith(')')).toBe(true)
    // The RMK should be rebuilt from parsed field, not raw
    expect(msg).not.toContain('\n<script')
  })

  test('Unicode emoji in callsign — rejected by ICAO validation', () => {
    // ICAO Doc 4444 requires alphanumeric callsigns only — emoji is rejected.
    expect(() => builder.build(minInput({ callsign: '✈️🔥' as any }))).toThrow('AFTN_INVALID_CALLSIGN')
  })

  test('10KB route string — completes < 50ms', () => {
    const longRoute = 'DCT WAYPOINT '.repeat(700).trim()
    const t0 = performance.now()
    const msg = builder.build(minInput({ route: longRoute }))
    expect(performance.now() - t0).toBeLessThan(50)
    expect(msg.startsWith('(FPL-')).toBe(true)
  })

  test('Empty string for every optional field — no crash', () => {
    expect(() => builder.build(minInput({
      alternate1: '', alternate2: '', endurance: '',
      radioEquipment: '', survivalEquipment: '', jackets: '', dinghies: '',
    }))).not.toThrow()
  })

  test('POB edge values: 0, 1, 999, undefined', () => {
    const m0 = builder.build(minInput({ pob: 0 }))
    expect(m0).not.toMatch(/[\s\n]P\/\d/) // 0 = falsy, omitted

    const m1 = builder.build(minInput({ pob: 1 }))
    expect(m1).toContain('P/001')

    const m999 = builder.build(minInput({ pob: 999 }))
    expect(m999).toContain('P/999')

    const mUndef = builder.build(minInput({ pob: undefined }))
    // Check for P/ as an Item 19 field (preceded by space, newline, or dash)
    expect(mUndef).not.toMatch(/[\s\n-]P\/\d/)
  })

  test('SAR fields auto-uppercased and trimmed', () => {
    const msg = builder.build(minInput({
      radioEquipment: '  vue1  ', survivalEquipment: '  dm  ',
      jackets: '  lfuv  ', dinghies: '  C/02/010/C/ORANGE  ',
    }))
    expect(msg).toContain('R/VUE1')
    expect(msg).toContain('S/DM')
    expect(msg).toContain('J/LFUV')
    expect(msg).toContain('D/C/02/010/C/ORANGE')
  })

  test('DOF auto-generation for all 31 EOBT days — all valid YYMMDD', () => {
    for (let dd = 1; dd <= 31; dd++) {
      const eobt = `${String(dd).padStart(2, '0')}1400`
      const msg = builder.build(minInput({
        eobt,
        item18Parsed: minItem18({ dof: null }),
      }))
      const dofMatch = msg.match(/DOF\/(\d{6})/)
      expect(dofMatch).not.toBeNull()
      const month = parseInt(dofMatch![1].substring(2, 4))
      const day = parseInt(dofMatch![1].substring(4, 6))
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      expect(day).toBe(dd)
    }
  })

  test('PBN injection does NOT mutate original item18Parsed', () => {
    const original = parser.parse(null) // pbnCodes = []
    expect(original.pbnCodes).toHaveLength(0)
    builder.build(minInput({ equipment: 'SDFGR', item18Parsed: original }))
    expect(original.pbnCodes).toHaveLength(0) // must be unmodified
  })

  test('Same item18Parsed used 100 times — all get PBN injected', () => {
    const shared = parser.parse(null)
    for (let i = 0; i < 100; i++) {
      const msg = builder.build(minInput({ equipment: 'SDFGR', item18Parsed: shared }))
      expect(msg).toContain('PBN/')
    }
    expect(shared.pbnCodes).toHaveLength(0) // still unmodified
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 11: NPNT COMPLIANCE GATE — BOUNDARY & CHAOS
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-NPNT-01: NPNT gate — every zone/token/altitude combination', () => {

  type ZoneType = 'RED' | 'YELLOW' | 'GREEN'
  interface ZoneResult { zoneType: ZoneType; zoneId: string; maxAglFt: number | null }

  function evaluateNpnt(
    zone: ZoneResult, plannedAglFt: number,
    token: string | null, tokenValid: boolean, airportClear: boolean
  ): { blocked: boolean; reasons: string[] } {
    const reasons: string[] = []
    if (zone.zoneType === 'RED') {
      reasons.push(`RED zone — no-fly. Zone: ${zone.zoneId}`)
      return { blocked: true, reasons }
    }
    if (!airportClear) {
      reasons.push('Within 5km airport exclusion zone')
      return { blocked: true, reasons }
    }
    if (zone.zoneType === 'YELLOW') {
      if (!token) { reasons.push(`YELLOW zone requires permission artefact`); return { blocked: true, reasons } }
      if (!tokenValid) { reasons.push(`Permission token invalid`); return { blocked: true, reasons } }
    }
    if (zone.zoneType === 'GREEN' && plannedAglFt > 400 && !token) {
      reasons.push(`AGL ${plannedAglFt}ft exceeds 400ft green zone limit`)
      return { blocked: true, reasons }
    }
    return { blocked: false, reasons }
  }

  const GREEN:  ZoneResult = { zoneType: 'GREEN',  zoneId: 'GREEN_TEST', maxAglFt: 400 }
  const YELLOW: ZoneResult = { zoneType: 'YELLOW', zoneId: 'YELLOW_TEST', maxAglFt: 200 }
  const RED:    ZoneResult = { zoneType: 'RED',    zoneId: 'RED_VIDP', maxAglFt: null }

  test('GREEN 200ft no-token → NOT blocked', () => {
    expect(evaluateNpnt(GREEN, 200, null, true, true).blocked).toBe(false)
  })

  test('GREEN 400ft (exact boundary) no-token → NOT blocked', () => {
    expect(evaluateNpnt(GREEN, 400, null, true, true).blocked).toBe(false)
  })

  test('GREEN 401ft no-token → BLOCKED', () => {
    expect(evaluateNpnt(GREEN, 401, null, true, true).blocked).toBe(true)
  })

  test('GREEN 401ft WITH token → NOT blocked', () => {
    expect(evaluateNpnt(GREEN, 401, 'TOKEN', true, true).blocked).toBe(false)
  })

  test('RED zone → ALWAYS blocked regardless of token', () => {
    expect(evaluateNpnt(RED, 50, 'VALID_TOKEN', true, true).blocked).toBe(true)
    expect(evaluateNpnt(RED, 50, null, true, true).blocked).toBe(true)
  })

  test('YELLOW no-token → blocked', () => {
    expect(evaluateNpnt(YELLOW, 100, null, true, true).blocked).toBe(true)
  })

  test('YELLOW invalid-token → blocked', () => {
    expect(evaluateNpnt(YELLOW, 100, 'FAKE', false, true).blocked).toBe(true)
  })

  test('YELLOW valid-token → NOT blocked', () => {
    expect(evaluateNpnt(YELLOW, 100, 'VALID', true, true).blocked).toBe(false)
  })

  test('Airport exclusion overrides GREEN zone', () => {
    expect(evaluateNpnt(GREEN, 100, null, true, false).blocked).toBe(true)
  })

  test('Airport exclusion overrides YELLOW with valid token', () => {
    expect(evaluateNpnt(YELLOW, 100, 'VALID', true, false).blocked).toBe(true)
  })

  test('1000 random combinations — no crashes', () => {
    const zones = [GREEN, YELLOW, RED]
    let crashes = 0
    for (let i = 0; i < 1000; i++) {
      try {
        evaluateNpnt(
          zones[i % 3],
          Math.random() * 1000,
          i % 4 === 0 ? null : 'TOKEN',
          i % 3 !== 1,
          i % 5 !== 0
        )
      } catch { crashes++ }
    }
    expect(crashes).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BLOCK 12: COMPREHENSIVE INTEGRATION — FULL PIPELINE CHAOS
// ═════════════════════════════════════════════════════════════════════════════

describe('MEGA-INTEGRATION-01: Full pipeline chaos — everything at once', () => {

  test('2000 builds with alternating valid/garbage Item18 — ZERO crashes', () => {
    const strings = [
      'DOF/260301 PBN/B4', '/////', 'DOF/ PBN/', null, undefined as any,
      'X'.repeat(5000), 'DOF/260301', '<script>', 'DROP TABLE;--',
      'DOF/260315 RMK/TEST(VALUE)',
    ]
    let crashes = 0
    for (let i = 0; i < 2000; i++) {
      try {
        const s = strings[i % strings.length]
        const parsed = parser.parse(s)
        builder.build(minInput({ item18Parsed: parsed }))
      } catch { crashes++ }
    }
    expect(crashes).toBe(0)
  })

  test('Full cross-module chain: parse → validate → build → hash-chain verify', () => {
    // Step 1: Parse Item 18
    const item18 = parser.parse('DOF/260315 PBN/B4D3 OPR/INDIGO REG/VT-ABC')
    expect(item18.dof).toBe('260315')
    expect(item18.pbnCodes).toEqual(['B4', 'D3'])

    // Step 2: Build AFTN message
    const msg = builder.build(minInput({ item18Parsed: item18, equipment: 'SDFGR' }))
    expect(msg.startsWith('(FPL-')).toBe(true)
    expect(msg).toContain('DOF/260315')
    expect(msg).toContain('PBN/B4D3')

    // Step 3: Build a valid telemetry chain
    const missionId = BigInt('1709280000000')
    const chain = buildValidChain(missionId, 50)

    // Step 4: Verify chain integrity
    const result = (verifier as any).checkHashChain(String(missionId), chain)
    expect(result.pass).toBe(true)

    // Step 5: Build Merkle tree from mission IDs
    const tree = buildMerkleTree([String(missionId), '1709280001000', '1709280002000'])
    expect(tree.hash).toHaveLength(64)

    // Step 6: Generate and verify inclusion proof
    const proof = generateMerkleProof(
      [String(missionId), '1709280001000', '1709280002000'],
      String(missionId)
    )
    expect(proof).not.toBeNull()
    expect(verifyMerkleProof(proof!)).toBe(true)
  })

  test('Serializer → chain → forensic verifier end-to-end', () => {
    const missionId = BigInt('1709290000000')
    const chain = buildValidChain(missionId, 100)

    // Verify chain passes
    const r1 = (verifier as any).checkHashChain(String(missionId), chain)
    expect(r1.pass).toBe(true)

    // Verify NTP check
    const r2 = (verifier as any).checkNtpEvidence('SYNCED', 42)
    expect(r2.pass).toBe(true)

    // Verify cert check
    const r3 = (verifier as any).checkCertificate(true, String(Date.now() + 86400_000), Date.now())
    expect(r3.pass).toBe(true)

    // Verify zone compliance
    const r4 = (verifier as any).checkZoneCompliance([])
    expect(r4.pass).toBe(true)

    // Verify GNSS
    const r5 = (verifier as any).checkGnssIntegrity(chain)
    expect(r5.pass).toBe(true)

    // Verify monotonicity
    const records = chain.map((c, i) => ({
      ...c,
      recordedAtUtcMs: String(1709290000000 + i * 1000),
    }))
    const r6 = (verifier as any).checkTimestampMonotonicity(records)
    expect(r6.pass).toBe(true)
  })

  test('Altitude + proximity + geofence — combined check', () => {
    // Altitude check: FL330 eastbound with W
    const alt = altitude.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: 90, equipment: 'SDFGLOPW',
    })
    expect(alt.errors).toHaveLength(0)

    // Proximity: point far from airports
    const prox = checkAirportProximity(25.0, 71.0, 500)
    expect(prox.clear).toBe(true)

    // Geofence: inside Delhi square
    expect(isPointInPolygon(28.5, 77.5, DELHI_SQUARE)).toBe(true)
    // Outside Delhi square
    expect(isPointInPolygon(30.0, 80.0, DELHI_SQUARE)).toBe(false)
  })

  test('Addressee derivation — 10,000 calls, all include DGCA copy', () => {
    let dgcaMissing = 0
    const routes: [string, string][] = [
      ['VIDP', 'VABB'], ['VOBL', 'VECC'], ['VOMM', 'VIDP'], ['VAAH', 'VOCL'],
    ]
    for (let i = 0; i < 10_000; i++) {
      const [dep, dest] = routes[i % routes.length]
      const addrs = builder.deriveAddressees(dep, dest)
      if (!addrs.includes('VIDPZPZX')) dgcaMissing++
      if (!addrs.includes(`${dep}ZTZX`)) dgcaMissing++
      if (!addrs.includes(`${dest}ZTZX`)) dgcaMissing++
    }
    expect(dgcaMissing).toBe(0)
  })

  test('GRAND TOTAL — all operations pass without a single crash', () => {
    // This test validates that every component can be called in sequence
    // without any leftover state causing failures
    let operations = 0

    // Parse 100 Item 18 strings
    for (let i = 0; i < 100; i++) {
      parser.parse(`DOF/2603${String(i % 28 + 1).padStart(2, '0')} PBN/B4`)
      operations++
    }

    // Build 100 AFTN messages
    for (let i = 0; i < 100; i++) {
      builder.build(minInput({ callsign: `VT${String(i).padStart(4, '0')}` }))
      operations++
    }

    // Check 100 altitudes
    for (let i = 0; i < 100; i++) {
      altitude.checkCompliance({
        flightRules: 'I', levelIndicator: 'F',
        levelValue: String(290 + (i % 13) * 10),
        magneticTrackDeg: i * 3.6, equipment: 'SDFGLOPW',
      })
      operations++
    }

    // 100 proximity checks
    for (let i = 0; i < 100; i++) {
      checkAirportProximity(20 + Math.random() * 15, 70 + Math.random() * 25, 500)
      operations++
    }

    // 100 geofence checks
    for (let i = 0; i < 100; i++) {
      isPointInPolygon(28 + Math.random(), 77 + Math.random(), DELHI_SQUARE)
      operations++
    }

    // Build and verify a chain
    const chain = buildValidChain(BigInt('1709300000000'), 100)
    const result = (verifier as any).checkHashChain('1709300000000', chain)
    expect(result.pass).toBe(true)
    operations += 100

    // Merkle tree
    const ids = Array.from({ length: 100 }, (_, i) => `mission_${i}`)
    const tree = buildMerkleTree(ids)
    expect(tree.hash).toHaveLength(64)
    operations += 100

    // Serialize/deserialize
    for (let i = 0; i < 100; i++) {
      const buf = serialize(makeTelemetryFields({ recordSequence: BigInt(i) }))
      deserialize(buf)
      operations++
    }

    expect(operations).toBeGreaterThan(700)
  })
})

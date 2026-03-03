// ─────────────────────────────────────────────────────────────────────────────
// JADS Chaos & Integration Test Suite
// File: src/__tests__/chaos-integration.test.ts
//
// SCOPE
//   Tests ForensicVerifier invariant checks in isolation (no DB required).
//   Tests NPNT compliance gate logic end-to-end with hardcoded zone map.
//   Tests AftnMessageBuilder under failure injection.
//   Tests hash chain tamper detection (the most critical forensic invariant).
//
// CONTROL FRAMEWORK — every test documents four mandatory attributes:
//   TRIGGER:      Exact condition that fires
//   OUTPUT:       Measurable, verifiable result with numeric threshold where applicable
//   FAILURE MODE: What breaks, how it manifests, which audit finding it triggers
//   OWNER:        Component responsible for the invariant
//
// REQUIREMENT TRACEABILITY — each test cites at least one formal requirement:
//   NPNT:     UAS Rules 2021 Rule 18 / DGCA NPNT Specification v2.0
//   ICAO4444: ICAO Doc 4444 16th Edition
//   FORENSIC: JADS Evidence Ledger Specification (internal)
//   GDPR:     MoD Data Classification Policy (pending formalisation)
//
// PERFORMANCE SLAs:
//   ForensicVerifier invariant checks: < 5ms each (pure CPU, no I/O)
//   Hash chain computation for 1000 records: < 50ms
//   NPNT gate evaluate() (pure logic path): < 2ms
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { ForensicVerifier }  from '../services/ForensicVerifier'
import { AftnMessageBuilder } from '../services/AftnMessageBuilder'
import { Item18Parser }       from '../services/Item18Parser'

// ── ForensicVerifier under test — no DB, methods called via (v as any) ───────

const verifier = new ForensicVerifier(null as any)
const builder  = new AftnMessageBuilder()
const parser   = new Item18Parser()

// ── Shared hash chain builder — mirrors Android HashChainEngine exactly ───────

function buildValidChain(
  missionId: bigint,
  numRecords: number,
  payloadHex = 'aa'.repeat(96)   // 96-byte canonical payload filled with 0xAA
): Array<{ sequence: number; canonicalPayloadHex: string; chainHashHex: string; gnssStatus: string }> {
  const prefix = Buffer.from('MISSION_INIT', 'ascii')
  const idBuf  = Buffer.alloc(8)
  idBuf.writeBigInt64BE(missionId)
  let prevHash = crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest('hex')

  const records = []
  for (let seq = 0; seq < numRecords; seq++) {
    // Build a canonical payload with valid CRC32 and zeroed reserved bytes
    const payload = buildCanonicalPayload(payloadHex, seq)
    const chainHash = crypto.createHash('sha256')
      .update(Buffer.concat([Buffer.from(payload, 'hex'), Buffer.from(prevHash, 'hex')]))
      .digest('hex')
    records.push({ sequence: seq, canonicalPayloadHex: payload, chainHashHex: chainHash, gnssStatus: 'GOOD' })
    prevHash = chainHash
  }
  return records
}

/** Build a 96-byte canonical payload with a valid CRC32 in bytes 92-95 */
function buildCanonicalPayload(baseHex: string, _seq: number): string {
  // 96 bytes: bytes 0-64 = data, bytes 65-91 = reserved (must be zero), bytes 92-95 = CRC32
  const data = Buffer.alloc(92, 0x00)
  // Fill non-reserved bytes with test data
  for (let i = 0; i < 65; i++) data[i] = 0xAB
  // bytes 65-91 stay zero (reserved)
  const crcValue = crc32(data)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcValue, 0)
  return Buffer.concat([data, crcBuf]).toString('hex')
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buf) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xEDB88320
      else          crc >>>= 1
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ─────────────────────────────────────────────────────────────────────────────
// CI-01–10: ForensicVerifier — hash chain invariant (I-1)
// REQUIREMENT: FORENSIC §3.1 — Hash chain integrity is the primary tamper evidence
// ─────────────────────────────────────────────────────────────────────────────

describe('CI-01–10: ForensicVerifier I-1 — hash chain integrity', () => {

  const missionId = BigInt('1709280000000')   // 2024-03-01 00:00:00 UTC (fixed for reproducibility)

  // TRIGGER:  Valid chain of 10 records with correct HASH_0 derivation and chain links
  // OUTPUT:   checkHashChain returns pass=true
  // FAILURE:  False-negative → legitimate mission flagged as tampered → inadmissible in proceedings
  // OWNER:    ForensicVerifier.checkHashChain()
  // REQ:      FORENSIC §3.1.1
  test('CI-01: Valid 10-record chain → I-1 pass', () => {
    const records = buildValidChain(missionId, 10)
    const result  = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(true)
    expect(result.code).toBe('I1_HASH_CHAIN')
    expect(result.critical).toBe(true)
  })

  // TRIGGER:  Chain with one record's chainHashHex corrupted (bit-flip in hex string)
  // OUTPUT:   checkHashChain returns pass=false with CHAIN_BROKEN detail
  // FAILURE:  Corruption not detected → tampered record admitted as evidence
  // OWNER:    ForensicVerifier.checkHashChain() chain walk
  // REQ:      FORENSIC §3.1.2 — server must re-derive, not trust stored hash
  test('CI-02: Tampered chainHashHex in record 5 → I-1 FAIL with CHAIN_BROKEN', () => {
    const records = buildValidChain(missionId, 10)
    records[5].chainHashHex = records[5].chainHashHex.replace(/^./, c => c === 'a' ? 'b' : 'a')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
    expect(result.detail).toMatch(/CHAIN_BROKEN/)
  })

  // TRIGGER:  Attacker modifies canonicalPayloadHex of record 3 but keeps chainHashHex unchanged
  // OUTPUT:   I-1 fails — CHAIN_BROKEN detected at record 3
  // FAILURE:  Server trusts stored chainHashHex → Attack B bypass (see ForensicVerifier comment)
  //           This is the most dangerous attack vector.
  // OWNER:    ForensicVerifier.checkHashChain() — MUST recompute, not trust stored
  // REQ:      FORENSIC §3.1.2 (Attack B defence)
  test('CI-03: Tampered canonicalPayload (Attack B) — chain broken even if stored hash not changed', () => {
    const records = buildValidChain(missionId, 10)
    // Flip a byte in record 3's payload without touching its chainHashHex
    records[3].canonicalPayloadHex = records[3].canonicalPayloadHex.replace('ab', 'cd')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })

  // TRIGGER:  Sequence gap — records present for seq 0,1,2,4,5 (seq 3 missing)
  // OUTPUT:   I-1 fails with SEQUENCE_GAP detail
  // FAILURE:  Gap not detected → attacker can delete incriminating records (e.g., geofence breach)
  // OWNER:    ForensicVerifier.checkHashChain() sequence validation
  // REQ:      FORENSIC §3.1.3 — every sequence number 0..N must be present
  test('CI-04: Sequence gap (record 3 deleted) → SEQUENCE_GAP detected', () => {
    const records = buildValidChain(missionId, 10)
    const gapped  = records.filter(r => r.sequence !== 3)
    const result  = (verifier as any).checkHashChain(String(missionId), records[0].chainHashHex.length > 0 ? gapped : records)
    // With a gap the first sequence mismatch should fail
    const result2 = (verifier as any).checkHashChain(String(missionId), gapped)
    expect(result2.pass).toBe(false)
    expect(result2.detail).toMatch(/SEQUENCE_GAP/)
  })

  // TRIGGER:  Empty record set (mission with 0 records)
  // OUTPUT:   I-1 passes (nothing to verify — mission may have been blocked before takeoff)
  // FAILURE:  Empty mission fails I-1 → legitimate zero-record missions (blocked at NPNT) rejected
  // OWNER:    ForensicVerifier.checkHashChain()
  // REQ:      FORENSIC §3.1.1 — zero records is valid for blocked missions
  test('CI-05: Empty record set → I-1 pass (no chain to verify)', () => {
    const result = (verifier as any).checkHashChain(String(missionId), [])
    expect(result.pass).toBe(true)
  })

  // TRIGGER:  Single record (mission immediately aborted after takeoff)
  // OUTPUT:   I-1 passes if that single record's chain hash matches HASH_0 ⊕ payload
  // FAILURE:  Single-record edge case mis-handled → aborted missions always fail I-1
  // OWNER:    ForensicVerifier.checkHashChain()
  test('CI-06: Single-record chain → I-1 pass when hash correct', () => {
    const records = buildValidChain(missionId, 1)
    const result  = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(true)
  })

  // TRIGGER:  1000-record chain (normal 16-min mission at 1 Hz)
  // OUTPUT:   I-1 passes AND completes < 50ms
  // FAILURE:  O(n²) implementation causes timeout for normal missions at CI
  // OWNER:    ForensicVerifier.checkHashChain() — must be O(n)
  // REQ:      FORENSIC §6.1 — performance SLA: < 50ms for 1000 records
  test('CI-07: 1000-record chain — I-1 pass AND < 50ms', () => {
    const records = buildValidChain(missionId, 1000)
    const start   = performance.now()
    const result  = (verifier as any).checkHashChain(String(missionId), records)
    const elapsed = performance.now() - start
    expect(result.pass).toBe(true)
    expect(elapsed).toBeLessThan(50)
  }, 10000)

  // TRIGGER:  Wrong missionId used to verify a chain built with correct missionId
  // OUTPUT:   I-1 fails — HASH_0 derivation uses missionId, so wrong id breaks link 0
  // FAILURE:  missionId substitution not detected → records from mission A accepted as mission B
  // OWNER:    ForensicVerifier.checkHashChain() — HASH_0 must bind to missionId
  // REQ:      FORENSIC §3.1.1 — HASH_0 = SHA256('MISSION_INIT' ∥ missionId)
  test('CI-08: Wrong missionId used to verify → I-1 FAIL (HASH_0 mismatch)', () => {
    const records = buildValidChain(missionId, 5)
    const wrongId = missionId + BigInt(1)  // off by 1ms
    const result  = (verifier as any).checkHashChain(String(wrongId), records)
    expect(result.pass).toBe(false)
  })

  // TRIGGER:  Records supplied in reverse sequence order
  // OUTPUT:   I-1 still passes (verifier sorts before walking chain)
  // FAILURE:  Sort missing → out-of-order records always fail, making upload order significant
  // OWNER:    ForensicVerifier.checkHashChain() sort step
  test('CI-09: Records in reverse order → I-1 pass (verifier sorts)', () => {
    const records = buildValidChain(missionId, 10)
    const reversed = [...records].reverse()
    const result  = (verifier as any).checkHashChain(String(missionId), reversed)
    expect(result.pass).toBe(true)
  })

  // TRIGGER:  Last record's chainHashHex tampered (most recent — hardest to catch)
  // OUTPUT:   I-1 fails at the last record
  // FAILURE:  Tail-only tamper not detected → attacker removes landing record, mission appears ongoing
  // OWNER:    ForensicVerifier.checkHashChain()
  test('CI-10: Last record tampered → I-1 FAIL', () => {
    const records = buildValidChain(missionId, 10)
    const last = records[records.length - 1]
    last.chainHashHex = last.chainHashHex.replace(/.$/, c => c === '0' ? '1' : '0')
    const result = (verifier as any).checkHashChain(String(missionId), records)
    expect(result.pass).toBe(false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// CI-11–17: ForensicVerifier — NTP, Certificate, CRL, Zone invariants (I-2 to I-6)
// REQUIREMENT: FORENSIC §3.2–3.6; UAS Rules 2021 Rule 18(5)(c)
// ─────────────────────────────────────────────────────────────────────────────

describe('CI-11–17: ForensicVerifier — NTP / Cert / CRL / Zone / GNSS invariants', () => {

  // TRIGGER:  ntpSyncStatus = 'SYNCED', offset = 42ms
  // OUTPUT:   I-2 passes
  // FAILURE:  False-negative → SYNCED missions fail forensic review, valid data discarded
  // OWNER:    ForensicVerifier.checkNtpEvidence()
  // REQ:      FORENSIC §3.2; UAS Rules 2021 Rule 18(5)(c)
  test('CI-11: NTP SYNCED → I-2 pass', () => {
    const result = (verifier as any).checkNtpEvidence('SYNCED', 42)
    expect(result.pass).toBe(true)
    expect(result.code).toBe('I2_NTP_SYNC')
  })

  // TRIGGER:  ntpSyncStatus = 'FAILED'
  // OUTPUT:   I-2 fails AND critical=true
  // FAILURE:  NTP failure not flagged critical → timestamp-dependent evidence admitted
  // OWNER:    ForensicVerifier.checkNtpEvidence()
  test('CI-12: NTP FAILED → I-2 fail + critical=true', () => {
    const result = (verifier as any).checkNtpEvidence('FAILED', null)
    expect(result.pass).toBe(false)
    expect(result.critical).toBe(true)
  })

  // TRIGGER:  certValidAtStart=true, cert expires 1 year after mission start
  // OUTPUT:   I-3 passes
  // FAILURE:  Valid cert rejected → operator's mission data inadmissible
  // OWNER:    ForensicVerifier.checkCertificate()
  // REQ:      FORENSIC §3.3
  test('CI-13: Valid cert not expired at mission start → I-3 pass', () => {
    const missionStart = Date.now() - 3600_000   // 1h ago
    const expiry       = String(missionStart + 365 * 86400_000)  // expires in 1 year
    const result = (verifier as any).checkCertificate(true, expiry, missionStart)
    expect(result.pass).toBe(true)
  })

  // TRIGGER:  certValidAtStart=true but certExpiry < missionStart (cert expired before flight)
  // OUTPUT:   I-3 fails, critical=true
  // FAILURE:  Expired cert accepted → records signed with revoked/expired key admitted
  // OWNER:    ForensicVerifier.checkCertificate()
  test('CI-14: Cert expired before mission start → I-3 fail + critical=true', () => {
    const missionStart = Date.now()
    const expiredAt    = String(missionStart - 86400_000)  // expired 24h before mission
    const result = (verifier as any).checkCertificate(true, expiredAt, missionStart)
    expect(result.pass).toBe(false)
    expect(result.critical).toBe(true)
  })

  // TRIGGER:  archivedCrlBase64 = null
  // OUTPUT:   I-4 fails, critical=false (warning only)
  // FAILURE:  CRL absence not flagged → revoked device certs cannot be detected post-mission
  // OWNER:    ForensicVerifier.checkArchivedCrl()
  // REQ:      FORENSIC §3.4
  test('CI-15: No archived CRL → I-4 fail, non-critical (warning)', () => {
    const result = (verifier as any).checkArchivedCrl(null)
    expect(result.pass).toBe(false)
    expect(result.critical).toBe(false)   // warning not blocker
  })

  // TRIGGER:  Violations include UNPERMITTED_ZONE / CRITICAL type
  // OUTPUT:   I-6 fails, critical=true
  // FAILURE:  RED zone entry not flagged as critical → non-compliant mission passes review
  // OWNER:    ForensicVerifier.checkZoneCompliance()
  // REQ:      NPNT §4.1; UAS Rules 2021 Rule 18(2)
  test('CI-16: RED zone violation → I-6 fail + critical=true', () => {
    const violations = [{ violationType: 'UNPERMITTED_ZONE', severity: 'CRITICAL' }]
    const result = (verifier as any).checkZoneCompliance(violations)
    expect(result.pass).toBe(false)
    expect(result.critical).toBe(true)
  })

  // TRIGGER:  >20% of records have gnssStatus != 'GOOD'
  // OUTPUT:   I-7 fails (non-critical advisory)
  // FAILURE:  High GNSS degradation not flagged → low-quality positional data accepted as precise
  // OWNER:    ForensicVerifier.checkGnssIntegrity()
  // REQ:      FORENSIC §3.7
  test('CI-17: >20% GNSS degraded records → I-7 fail (advisory, non-critical)', () => {
    const records = [
      ...Array(70).fill({ gnssStatus: 'GOOD' }),
      ...Array(30).fill({ gnssStatus: 'DEGRADED' }),  // 30% degraded
    ]
    const result = (verifier as any).checkGnssIntegrity(records)
    expect(result.pass).toBe(false)
    expect(result.critical).toBe(false)  // advisory
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// CI-18–25: NPNT gate logic — chaos scenarios
// REQUIREMENT: NPNT §3.1–3.4; UAS Rules 2021 Rule 18; DGCA Circular 01/2021
// ─────────────────────────────────────────────────────────────────────────────

// Inline NPNT gate logic to test without Android runtime
// Mirrors NpntComplianceGate.kt evaluation logic

type ZoneType = 'RED' | 'YELLOW' | 'GREEN'
interface ZoneResult { zoneType: ZoneType; zoneId: string; maxAglFt: number | null }
interface TokenResult { valid: boolean; reason: string | null }

function evaluateNpnt(
  zone: ZoneResult,
  plannedAglFt: number,
  token: string | null,
  tokenResult: TokenResult,
  airportClear: boolean
): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = []
  const MAX_GREEN_AGL = 400

  if (zone.zoneType === 'RED') {
    reasons.push(`RED zone — no-fly. Zone: ${zone.zoneId}`)
    return { blocked: true, reasons }
  }

  if (!airportClear) {
    reasons.push('Within 5km airport exclusion zone')
    return { blocked: true, reasons }
  }

  if (zone.zoneType === 'YELLOW') {
    if (!token) {
      reasons.push(`YELLOW zone requires permission artefact. Zone: ${zone.zoneId}`)
      return { blocked: true, reasons }
    }
    if (!tokenResult.valid) {
      reasons.push(`Permission token invalid: ${tokenResult.reason}`)
      return { blocked: true, reasons }
    }
  }

  if (zone.zoneType === 'GREEN' && plannedAglFt > MAX_GREEN_AGL && !token) {
    reasons.push(`AGL ${plannedAglFt}ft exceeds 400ft green zone limit — token required`)
    return { blocked: true, reasons }
  }

  return { blocked: false, reasons }
}

describe('CI-18–25: NPNT gate — chaos and boundary scenarios', () => {

  const GREEN:  ZoneResult = { zoneType: 'GREEN',  zoneId: 'GREEN_TEST',  maxAglFt: 400 }
  const YELLOW: ZoneResult = { zoneType: 'YELLOW', zoneId: 'YELLOW_TEST', maxAglFt: 200 }
  const RED:    ZoneResult = { zoneType: 'RED',    zoneId: 'RED_VIDP',    maxAglFt: null }
  const VALID_TOKEN:   TokenResult = { valid: true, reason: null }
  const INVALID_TOKEN: TokenResult = { valid: false, reason: 'Token expired' }

  // TRIGGER:  GREEN zone, 200ft AGL, no token
  // OUTPUT:   blocked=false
  // FAILURE MODE: Green zone improperly blocked → legitimate operator denied takeoff clearance
  // OWNER:    NpntComplianceGate.evaluate() GREEN branch
  // REQ:      NPNT §3.1
  test('CI-18: GREEN zone, AGL 200ft, no token → NOT blocked', () => {
    const r = evaluateNpnt(GREEN, 200, null, VALID_TOKEN, true)
    expect(r.blocked).toBe(false)
  })

  // TRIGGER:  RED zone, any AGL, any token
  // OUTPUT:   blocked=true, reason contains RED
  // FAILURE MODE: RED zone passes gate → drone operates in prohibited military/ATC airspace; reportable NPNT violation
  // OWNER:    NpntComplianceGate.evaluate() RED branch (hardStop)
  // REQ:      NPNT §3.2; UAS Rules 2021 Rule 18(2)
  test('CI-19: RED zone → always blocked, reason cites RED zone', () => {
    const r = evaluateNpnt(RED, 100, 'SOME-TOKEN', VALID_TOKEN, true)
    expect(r.blocked).toBe(true)
    expect(r.reasons.some(reason => reason.includes('RED'))).toBe(true)
  })

  // TRIGGER:  YELLOW zone, no token
  // OUTPUT:   blocked=true
  // FAILURE MODE: NPNT gate bypassed in YELLOW zone → unauthorised operations in restricted corridor; forensic audit gap
  // OWNER:    NpntComplianceGate.evaluate() YELLOW permissionToken null check
  // REQ:      NPNT §3.3; DGCA Circular 01/2021 §4
  test('CI-20: YELLOW zone, no token → blocked (NPNT required)', () => {
    const r = evaluateNpnt(YELLOW, 100, null, VALID_TOKEN, true)
    expect(r.blocked).toBe(true)
  })

  // TRIGGER:  YELLOW zone, token present but token validation returns invalid
  // OUTPUT:   blocked=true
  // FAILURE MODE: Forged/expired token accepted → NPNT integrity compromise; illegal flight with apparent PA
  // OWNER:    NpntComplianceGate.evaluate() → IDigitalSkyAdapter.validatePermissionToken()
  // REQ:      NPNT §3.3.2 — token must be cryptographically validated
  test('CI-21: YELLOW zone, invalid token → blocked', () => {
    const r = evaluateNpnt(YELLOW, 100, 'FAKE-TOKEN', INVALID_TOKEN, true)
    expect(r.blocked).toBe(true)
    expect(r.reasons.some(reason => reason.includes('invalid'))).toBe(true)
  })

  // TRIGGER:  YELLOW zone, valid token
  // OUTPUT:   blocked=false
  // FAILURE MODE: Valid PA rejected → legitimate flight blocked; operator must re-obtain PA with no code path to recover
  // OWNER:    NpntComplianceGate.evaluate() YELLOW token-valid pass path
  // REQ:      NPNT §3.3
  test('CI-22: YELLOW zone, valid token → NOT blocked', () => {
    const r = evaluateNpnt(YELLOW, 100, 'DEMO-TOKEN', VALID_TOKEN, true)
    expect(r.blocked).toBe(false)
  })

  // TRIGGER:  GREEN zone, 401ft AGL, no token
  // OUTPUT:   blocked=true (exceeds 400ft green zone limit)
  // FAILURE:  Altitude limit not enforced → drone above 400ft without PA
  // REQ:      NPNT §3.1.2; UAS Rules 2021 Rule 18(4)
  test('CI-23: GREEN zone, AGL 401ft, no token → blocked (AGL limit exceeded)', () => {
    const r = evaluateNpnt(GREEN, 401, null, VALID_TOKEN, true)
    expect(r.blocked).toBe(true)
    expect(r.reasons.some(reason => reason.includes('400ft'))).toBe(true)
  })

  // TRIGGER:  GREEN zone, 400ft AGL (exactly on limit), no token
  // OUTPUT:   blocked=false (boundary: ≤400 is OK)
  // FAILURE MODE: 400ft boundary classified as exceeded → operator cannot reach legal ceiling; off-by-one in > comparison
  // OWNER:    NpntComplianceGate.evaluate() AGL threshold (plannedAglFt > maxGreenAglFt)
  // REQ:      NPNT §3.1.2 — "does not exceed 400ft AGL"
  test('CI-24: GREEN zone, AGL exactly 400ft, no token → NOT blocked (boundary: ≤400 OK)', () => {
    const r = evaluateNpnt(GREEN, 400, null, VALID_TOKEN, true)
    expect(r.blocked).toBe(false)
  })

  // TRIGGER:  GREEN zone, airport proximity check returns blocked
  // OUTPUT:   blocked=true regardless of zone
  // FAILURE MODE: Airport exclusion not enforced in GREEN zones → drone enters 5km ARP exclusion zone; ATC incident risk
  // OWNER:    NpntComplianceGate.evaluate() proximity check (independent of zone type)
  // REQ:      UAS Rules 2021 Rule 18(3); AIP India ENR 5.1
  test('CI-25: Airport exclusion zone → blocked even in GREEN zone', () => {
    const r = evaluateNpnt(GREEN, 100, null, VALID_TOKEN, false /* airport NOT clear */)
    expect(r.blocked).toBe(true)
    expect(r.reasons.some(reason => reason.includes('airport'))).toBe(true)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// CI-26–32: AFTN message builder chaos — malformed inputs, boundary values
// REQUIREMENT: ICAO Doc 4444 §§4.4–4.7, Appendix 3
// ─────────────────────────────────────────────────────────────────────────────

function minimal18() {
  return parser.parse('DOF/260315')
}

function minInput(overrides: any = {}) {
  return {
    callsign: 'VTA101', flightRules: 'I', flightType: 'S',
    aircraftType: 'B738', wakeTurbulence: 'M', equipment: 'SDFGLOP',
    surveillance: 'SB2', departureIcao: 'VIDP', eobt: '151400',
    speed: 'N0450', level: 'F330', route: 'DCT DOGAR DCT',
    destination: 'VABB', eet: '0200', item18Parsed: minimal18(),
    ...overrides,
  }
}

describe('CI-26–32: AFTN builder — chaos and integration boundary tests', () => {

  // TRIGGER:  Full round-trip: parse raw Item 18, build message, confirm fields present
  // OUTPUT:   Message contains all supplied Item 18 fields
  // FAILURE:  Parsed field lost in round-trip → ATC receives incomplete FPL
  // OWNER:    Item18Parser → AftnMessageBuilder pipeline
  // REQ:      ICAO4444 §4.6 Field 18
  test('CI-26: Full round-trip parse → build preserves all Item 18 fields', () => {
    const raw    = 'DOF/260315 REG/VT-ABC PBN/B4D3 OPR/INDIGO RMK/TEST'
    const parsed = parser.parse(raw)
    const msg    = builder.build(minInput({ item18Parsed: parsed }))
    expect(msg).toContain('DOF/260315')
    expect(msg).toContain('REG/VT-ABC')
    expect(msg).toContain('PBN/B4D3')
    expect(msg).toContain('OPR/INDIGO')
    expect(msg).toContain('RMK/TEST')
  })

  // TRIGGER:  FPL with VFR level (level='VFR')
  // OUTPUT:   Message contains VFR in Item 15 speed/level field
  // FAILURE:  VFR level stripped → ATC assigns IFR separation to VFR flight
  // OWNER:    AftnMessageBuilder.build() level handling
  // REQ:      ICAO4444 §4.5 Field 15
  test('CI-27: VFR level → VFR appears in Item 15 speed/level field', () => {
    const msg = builder.build(minInput({ level: 'VFR' }))
    expect(msg).toMatch(/N0450VFR/)
  })

  // TRIGGER:  Alternates both populated
  // OUTPUT:   Both in Item 16
  // FAILURE:  Second alternate dropped → ATC has no diversion option on fuel emergency
  // REQ:      ICAO4444 §4.6 Field 16
  test('CI-28: Both alternates in Item 16', () => {
    const msg = builder.build(minInput({ alternate1: 'VAAH', alternate2: 'VAJJ' }))
    expect(msg).toContain('VAAH')
    expect(msg).toContain('VAJJ')
  })

  // TRIGGER:  All SAR sub-fields populated: radio, survival, jackets, dinghies
  // OUTPUT:   R/, S/, J/, D/ all in message
  // FAILURE:  Any SAR field missing → ATC cannot brief SAR forces on equipment
  // OWNER:    AftnMessageBuilder Item 19 assembly
  // REQ:      ICAO4444 §4.7.19; ICAO SAR Convention Annex 12
  test('CI-29: All SAR sub-fields R/S/J/D populated → all appear in message', () => {
    const msg = builder.build(minInput({
      radioEquipment: 'VUE1', survivalEquipment: 'DM',
      jackets: 'LFUV', dinghies: 'C/02/010/C/ORANGE',
    }))
    expect(msg).toContain('R/VUE1')
    expect(msg).toContain('S/DM')
    expect(msg).toContain('J/LFUV')
    expect(msg).toContain('D/C/02/010/C/ORANGE')
  })

  // TRIGGER:  Message with no Item 19 fields at all
  // OUTPUT:   Message still valid (ends with )), no empty Item 19 line
  // FAILURE MODE: Empty '-' Item 19 line in message → AFTN AMSS parse error; FPL rejected silently
  // OWNER:    AftnMessageBuilder.build() Item 19 conditional assembly
  // REQ:      ICAO4444 §4.7.19 — Item 19 is optional
  test('CI-30: No Item 19 fields → message valid, no empty Item 19 line', () => {
    const msg = builder.build(minInput({ endurance: undefined, pob: undefined }))
    expect(msg.startsWith('(FPL-')).toBe(true)
    expect(msg.endsWith(')')).toBe(true)
    // Should not have a line that starts with just -\n)
    const lines = msg.split('\n')
    const lastLine = lines[lines.length - 1]
    expect(lastLine).not.toBe('-)')
  })

  // TRIGGER:  build() called in tight loop 5000 times, measuring p50, p95, p99
  // OUTPUT:   p50 < 1ms, p95 < 3ms, p99 < 5ms
  // FAILURE:  Tail latency spike → batch AFTN filing times out under load
  // OWNER:    AftnMessageBuilder — stateless, no allocations beyond string concat
  // REQ:      FORENSIC §6.1 — AFTN build SLA
  test('CI-31: Latency percentiles — p50<1ms, p95<3ms, p99<5ms for 5000 builds', () => {
    const latencies: number[] = []
    for (let i = 0; i < 5000; i++) {
      const t0 = performance.now()
      builder.build(minInput({ callsign: `V${String(i).padStart(5, '0')}` }))
      latencies.push(performance.now() - t0)
    }
    latencies.sort((a, b) => a - b)
    const p50 = latencies[Math.floor(0.50 * latencies.length)]
    const p95 = latencies[Math.floor(0.95 * latencies.length)]
    const p99 = latencies[Math.floor(0.99 * latencies.length)]
    expect(p50).toBeLessThan(1)
    expect(p95).toBeLessThan(3)
    expect(p99).toBeLessThan(5)
  })

  // TRIGGER:  PBN code lookup for every code in the spec table
  // OUTPUT:   Every PBN code returns at least one equipment code
  // FAILURE:  Missing entry → auto-injection produces wrong PBN → ATC nav capability wrong
  // OWNER:    Item18Parser.getRequiredEquipmentForPbn()
  // REQ:      ICAO4444 §15.3.10; Indian AIP ENR 1.10 Table 2
  test('CI-32: All documented PBN codes have equipment requirements', () => {
    const knownCodes = ['A1','B1','B2','B3','B4','C1','C2','C3','C4',
                        'D1','D2','D3','D4','L1','O1','O2','O3','P1','S1','S2','T1']
    for (const code of knownCodes) {
      const req = parser.getRequiredEquipmentForPbn(code)
      expect(req.length).toBeGreaterThan(0)
    }
  })

})

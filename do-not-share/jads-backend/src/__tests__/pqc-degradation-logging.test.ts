// ─────────────────────────────────────────────────────────────────────────────
// JADS PQC Degradation Logging & Silent Fallback Detection Tests
// File: src/__tests__/pqc-degradation-logging.test.ts
//
// PURPOSE: Prove that when a PQC-capable mission degrades to ECDSA-only,
// the system EXPLICITLY LOGS this condition — it must never be silent.
//
// GAP ADDRESSED: Without these tests, an attacker could:
//   1. Strip all ML-DSA-65 signatures from telemetry records
//   2. The system falls back to ECDSA-only verification
//   3. No log entry records the degradation
//   4. Quantum resistance is silently lost
//
// REQUIREMENT: Any PQC degradation event must produce a detectable signal
// in the forensic report detail string AND in the invariant results.
//
// CONTROL FRAMEWORK:
//   TRIGGER:      PQC-capable drone submits records with missing/stripped PQC sigs
//   OUTPUT:       Detail string contains degradation warning; counts are explicit
//   FAILURE MODE: Silent quantum resistance loss — mission appears secure but isn't
//   OWNER:        ForensicVerifier.checkPqcSignatures()
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { ForensicVerifier } from '../services/ForensicVerifier'
// @ts-ignore — sub-path import
import { ml_dsa65 }        from '@noble/post-quantum/ml-dsa'
import { buildCanonicalPayload } from './helpers/chainBuilders'

const verifier = new ForensicVerifier(null as any)
const checkPqc = (verifier as any).checkPqcSignatures.bind(verifier)

let testKeypair: { publicKey: Uint8Array; secretKey: Uint8Array }

beforeAll(() => {
  // AUDIT FIX: Use deterministic seed for reproducible test failures
  const seed = crypto.createHash('sha256').update('JADS_PQC_DEGRADATION_TEST_SEED_V1').digest()
  testKeypair = ml_dsa65.keygen(seed)
})

function signPayload(payloadHex: string): string {
  const msg = Buffer.from(payloadHex, 'hex')
  const sig = ml_dsa65.sign(testKeypair.secretKey, msg)
  return Buffer.from(sig).toString('hex')
}

function makeRecords(
  count: number,
  options?: { sign?: boolean; signOnly?: number[] }
) {
  return Array.from({ length: count }, (_, seq) => {
    const payloadHex = buildCanonicalPayload(seq)
    let pqcSignatureHex: string | null = null
    if (options?.sign || options?.signOnly?.includes(seq)) {
      pqcSignatureHex = signPayload(payloadHex)
    }
    return { canonicalPayloadHex: payloadHex, pqcSignatureHex, sequence: seq }
  })
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PQC-DL-01–12: PQC degradation logging & silent fallback detection', () => {

  // ── DL-01: Full degradation — PQC key present, ALL sigs stripped ──────────
  // This is the primary attack scenario: attacker strips PQC sigs entirely.
  // The system MUST log that 0 out of N records were PQC-verified.
  test('PQC-DL-01: Full degradation explicitly logs "0 ML-DSA-65 signatures verified"', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(20)  // no PQC sigs at all
    const result = checkPqc(pubHex, records)

    // MUST contain the degradation count
    expect(result.detail).toContain('0 ML-DSA-65 signatures verified')
    // MUST mention how many records lacked PQC
    expect(result.detail).toContain('20 records without PQC signature')
  })

  // ── DL-02: Partial degradation — only 3 of 20 records signed ─────────────
  // Gradual rollout scenario OR partial stripping attack.
  test('PQC-DL-02: Partial degradation logs exact signed/unsigned counts', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(20, { signOnly: [0, 1, 2] })
    const result = checkPqc(pubHex, records)

    expect(result.detail).toContain('3 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('17 records without PQC signature')
  })

  // ── DL-03: Degradation ratio is computable from detail string ─────────────
  // A monitoring system should be able to parse "X verified ... Y without"
  // and compute degradation % = Y / (X+Y).
  test('PQC-DL-03: Degradation ratio is derivable — signed + unsigned = total', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(50, { signOnly: [0, 10, 20, 30, 40] })
    const result = checkPqc(pubHex, records)

    const verifiedMatch = result.detail.match(/(\d+) ML-DSA-65 signatures verified/)
    const unsignedMatch = result.detail.match(/(\d+) records without PQC signature/)

    expect(verifiedMatch).not.toBeNull()
    expect(unsignedMatch).not.toBeNull()

    const verified = parseInt(verifiedMatch![1])
    const unsigned = parseInt(unsignedMatch![1])
    expect(verified + unsigned).toBe(50)
    expect(verified).toBe(5)
    expect(unsigned).toBe(45)
  })

  // ── DL-04: 100% PQC coverage — no degradation warning ────────────────────
  // When all records are signed, the detail string should NOT contain
  // "without PQC signature" — no false alarms.
  test('PQC-DL-04: Full PQC coverage produces no degradation warning', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10, { sign: true })
    const result = checkPqc(pubHex, records)

    expect(result.pass).toBe(true)
    expect(result.detail).toContain('10 ML-DSA-65 signatures verified')
    expect(result.detail).not.toContain('without PQC signature')
  })

  // ── DL-05: Pre-PQC mission has distinct message from degraded mission ─────
  // A pre-PQC mission (no pqcPublicKeyHex) must say "pre-PQC mission",
  // NOT "0 signatures verified". The distinction matters for audit:
  //   - Pre-PQC: legitimate, no PQC capability existed
  //   - Degraded: PQC was available but sigs are missing (suspicious)
  test('PQC-DL-05: Pre-PQC mission message differs from degraded mission', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')

    const prePqcResult = checkPqc(null, makeRecords(10))
    const degradedResult = checkPqc(pubHex, makeRecords(10))

    expect(prePqcResult.detail).toContain('pre-PQC mission')
    expect(prePqcResult.detail).not.toContain('0 ML-DSA-65 signatures verified')

    expect(degradedResult.detail).toContain('0 ML-DSA-65 signatures verified')
    expect(degradedResult.detail).not.toContain('pre-PQC mission')
  })

  // ── DL-06: Degraded mission still passes (Phase 1 advisory) ──────────────
  // Critical: degradation is LOGGED but does NOT block the mission.
  // Phase 1 = advisory. This is correct behavior — blocking would prevent
  // gradual PQC rollout across the drone fleet.
  test('PQC-DL-06: Degraded mission passes (Phase 1 advisory) but is logged', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10)  // all stripped
    const result = checkPqc(pubHex, records)

    expect(result.pass).toBe(true)         // Still passes
    expect(result.critical).toBe(false)     // Advisory only
    // But degradation is visible in the output
    expect(result.detail).toContain('0 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('10 records without PQC signature')
  })

  // ── DL-07: Single-record mission — degradation still detectable ───────────
  test('PQC-DL-07: Single-record degradation is still logged', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(1)
    const result = checkPqc(pubHex, records)

    expect(result.detail).toContain('0 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('1 records without PQC signature')
  })

  // ── DL-08: Last record stripped — partial degradation at tail ─────────────
  // Edge case: attacker strips only the last record's PQC signature.
  test('PQC-DL-08: Single stripped record at tail is detected', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    // Sign all except the last
    const signedSeqs = Array.from({ length: 9 }, (_, i) => i)
    const records = makeRecords(10, { signOnly: signedSeqs })
    const result = checkPqc(pubHex, records)

    expect(result.detail).toContain('9 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('1 records without PQC signature')
  })

  // ── DL-09: First record stripped — partial degradation at head ────────────
  test('PQC-DL-09: Single stripped record at head is detected', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const signedSeqs = Array.from({ length: 9 }, (_, i) => i + 1) // skip seq=0
    const records = makeRecords(10, { signOnly: signedSeqs })
    const result = checkPqc(pubHex, records)

    expect(result.detail).toContain('9 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('1 records without PQC signature')
  })

  // ── DL-10: 100-drone swarm — degradation detection at scale ───────────────
  // Even at swarm scale, each mission's degradation must be independently detectable.
  test('PQC-DL-10: 100 independent missions — degradation detected per-mission', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')

    let degradedCount = 0
    let fullCount = 0

    for (let d = 0; d < 100; d++) {
      // Even drones: fully signed. Odd drones: degraded (no PQC sigs)
      const records = d % 2 === 0
        ? makeRecords(5, { sign: true })
        : makeRecords(5)

      const result = checkPqc(pubHex, records)

      if (d % 2 === 0) {
        expect(result.detail).toContain('5 ML-DSA-65 signatures verified')
        expect(result.detail).not.toContain('without PQC signature')
        fullCount++
      } else {
        expect(result.detail).toContain('0 ML-DSA-65 signatures verified')
        expect(result.detail).toContain('5 records without PQC signature')
        degradedCount++
      }
    }
    expect(fullCount).toBe(50)
    expect(degradedCount).toBe(50)
  })

  // ── DL-11: I-10 code is always I10_PQC_HYBRID regardless of degradation ──
  test('PQC-DL-11: Invariant code is I10_PQC_HYBRID in all scenarios', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')

    // Full PQC
    expect(checkPqc(pubHex, makeRecords(5, { sign: true })).code).toBe('I10_PQC_HYBRID')
    // Degraded
    expect(checkPqc(pubHex, makeRecords(5)).code).toBe('I10_PQC_HYBRID')
    // Pre-PQC
    expect(checkPqc(null, makeRecords(5)).code).toBe('I10_PQC_HYBRID')
  })

  // ── DL-12: Degradation label is always "PQC Hybrid Signature (ML-DSA-65)" ─
  test('PQC-DL-12: Label is consistent across all degradation states', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')

    const label = 'PQC Hybrid Signature (ML-DSA-65)'
    expect(checkPqc(pubHex, makeRecords(5, { sign: true })).label).toBe(label)
    expect(checkPqc(pubHex, makeRecords(5)).label).toBe(label)
    expect(checkPqc(null, makeRecords(5)).label).toBe(label)
  })
})

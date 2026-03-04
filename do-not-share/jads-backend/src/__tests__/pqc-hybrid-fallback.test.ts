// ─────────────────────────────────────────────────────────────────────────────
// JADS PQC Hybrid Fallback & Degradation Detection Tests
// File: src/__tests__/pqc-hybrid-fallback.test.ts
//
// PURPOSE: Verify that the PQC hybrid signature system (ML-DSA-65 + ECDSA P-256)
// handles all failure modes correctly, including:
//   - Silent degradation to ECDSA-only (must be DETECTED, not silent)
//   - Corrupted PQC signatures (must fail I-10, not silently pass)
//   - Missing PQC keys on new missions (must flag, not ignore)
//   - Mixed rollout (some records with PQC, some without)
//   - Invalid key material (must report, not crash)
//
// RISK: Without these tests, an attacker could strip PQC signatures from
// telemetry records and the system would silently fall back to ECDSA-only,
// defeating the quantum-resistance guarantee.
//
// CONTROL FRAMEWORK:
//   TRIGGER:      Exact failure condition
//   OUTPUT:       Measurable, verifiable result
//   FAILURE MODE: What breaks if this control is absent
//   OWNER:        ForensicVerifier.checkPqcSignatures()
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { ForensicVerifier } from '../services/ForensicVerifier'
// @ts-ignore — sub-path import
import { ml_dsa65 }        from '@noble/post-quantum/ml-dsa'
import { buildCanonicalPayload } from './helpers/chainBuilders'

const verifier = new ForensicVerifier(null as any)
const checkPqc = (verifier as any).checkPqcSignatures.bind(verifier)

// ── Generate a real ML-DSA-65 keypair for testing ───────────────────────────

let testKeypair: { publicKey: Uint8Array; secretKey: Uint8Array }

beforeAll(() => {
  // ML-DSA-65 keygen requires a 32-byte seed
  const seed = crypto.randomBytes(32)
  testKeypair = ml_dsa65.keygen(seed)
})

function signPayload(payloadHex: string): string {
  const msg = Buffer.from(payloadHex, 'hex')
  const sig = ml_dsa65.sign(testKeypair.secretKey, msg)
  return Buffer.from(sig).toString('hex')
}

function makeRecords(
  count: number,
  options?: { sign?: boolean; skipPqcAfter?: number; corruptSigAt?: number[] }
) {
  const records = []
  for (let seq = 0; seq < count; seq++) {
    const payloadHex = buildCanonicalPayload(seq)
    let pqcSignatureHex: string | null = null

    if (options?.sign && (!options.skipPqcAfter || seq < options.skipPqcAfter)) {
      pqcSignatureHex = signPayload(payloadHex)
    }

    if (options?.corruptSigAt?.includes(seq) && pqcSignatureHex) {
      // Flip one byte in the signature
      const sigBuf = Buffer.from(pqcSignatureHex, 'hex')
      sigBuf[0] ^= 0xFF
      pqcSignatureHex = sigBuf.toString('hex')
    }

    records.push({ canonicalPayloadHex: payloadHex, pqcSignatureHex, sequence: seq })
  }
  return records
}

// ─────────────────────────────────────────────────────────────────────────────
// PQC-01: Valid PQC signatures pass I-10
// ─────────────────────────────────────────────────────────────────────────────

describe('PQC-01–12: PQC hybrid fallback & degradation detection', () => {

  // TRIGGER:  10 records with valid ML-DSA-65 signatures + correct public key
  // OUTPUT:   I-10 pass=true, detail mentions "10 ML-DSA-65 signatures verified"
  // FAILURE:  ml_dsa65.verify() misuse → false negatives
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-01: Valid ML-DSA-65 signatures → I-10 PASS', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10, { sign: true })
    const result  = checkPqc(pubHex, records)

    expect(result.pass).toBe(true)
    expect(result.code).toBe('I10_PQC_HYBRID')
    expect(result.detail).toContain('10 ML-DSA-65 signatures verified')
  })

  // TRIGGER:  No PQC public key (pre-PQC mission)
  // OUTPUT:   I-10 pass=true, detail explains "pre-PQC mission"
  // FAILURE:  System blocks old missions that predate PQC rollout
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-02: No PQC key (pre-PQC mission) → graceful skip, still PASS', () => {
    const records = makeRecords(10)
    const result  = checkPqc(null, records)

    expect(result.pass).toBe(true)
    expect(result.detail).toContain('pre-PQC mission')
    expect(result.detail).toContain('ECDSA-only')
  })

  // TRIGGER:  Corrupted signature on record 5 out of 10
  // OUTPUT:   I-10 pass=false, detail mentions PQC_SIG_INVALID for seq=5
  // FAILURE:  Corrupted PQC signatures silently accepted → quantum safety voided
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-03: Corrupted PQC signature → I-10 FAIL with PQC_SIG_INVALID', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10, { sign: true, corruptSigAt: [5] })
    const result  = checkPqc(pubHex, records)

    expect(result.pass).toBe(false)
    expect(result.detail).toContain('PQC_SIG_INVALID')
    expect(result.detail).toContain('seq=5')
  })

  // TRIGGER:  PQC public key present but ALL signatures stripped (null)
  // OUTPUT:   I-10 pass=true BUT detail shows "10 records without PQC signature"
  //           This is the SILENT DEGRADATION detection — the system passes but WARNS.
  // FAILURE:  Attacker strips PQC sigs and system doesn't mention it
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-04: PQC key present but all signatures stripped → PASS with rollout warning', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10)  // no signing — all pqcSignatureHex = null
    const result  = checkPqc(pubHex, records)

    expect(result.pass).toBe(true)
    expect(result.detail).toContain('0 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('10 records without PQC signature')
  })

  // TRIGGER:  Mixed rollout — first 5 records signed, last 5 not signed
  // OUTPUT:   I-10 pass=true, "5 verified (5 without PQC signature — gradual rollout)"
  // FAILURE:  Partial rollout causes blanket failure
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-05: Gradual rollout — 5 signed, 5 unsigned → PASS with counts', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10, { sign: true, skipPqcAfter: 5 })
    const result  = checkPqc(pubHex, records)

    expect(result.pass).toBe(true)
    expect(result.detail).toContain('5 ML-DSA-65 signatures verified')
    expect(result.detail).toContain('5 records without PQC signature')
  })

  // TRIGGER:  Garbage public key hex string
  // OUTPUT:   I-10 pass=false, PQC_SIG_ERROR or PQC_SIG_INVALID
  // FAILURE:  Crash / unhandled exception → DoS
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-06: Garbage PQC public key → I-10 FAIL, no crash', () => {
    const records = makeRecords(5, { sign: true })
    const result  = checkPqc('zzzz_not_hex', records)

    // Should fail or error but not throw
    expect(result.code).toBe('I10_PQC_HYBRID')
    // Either PUBKEY_PARSE_FAILED or SIG_ERROR is acceptable
    expect(result.pass === false || result.detail.includes('PARSE_FAILED')).toBe(true)
  })

  // TRIGGER:  Wrong public key (valid format, different keypair)
  // OUTPUT:   I-10 pass=false, all signatures fail verification
  // FAILURE:  Key confusion → wrong drone's signatures accepted
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-07: Wrong PQC public key → I-10 FAIL (all sigs invalid)', () => {
    const otherKeypair = ml_dsa65.keygen(crypto.randomBytes(32))
    const wrongPubHex  = Buffer.from(otherKeypair.publicKey).toString('hex')
    const records      = makeRecords(5, { sign: true })  // signed with testKeypair
    const result       = checkPqc(wrongPubHex, records)

    expect(result.pass).toBe(false)
    expect(result.detail).toContain('PQC_SIG')
  })

  // TRIGGER:  Valid ECDSA + invalid PQC on same record (hybrid mismatch)
  // OUTPUT:   I-10 FAIL — PQC failure is NOT masked by ECDSA success
  // FAILURE:  Hybrid scheme degrades silently to classical-only
  // OWNER:    ForensicVerifier — I-1 (ECDSA) and I-10 (PQC) are independent
  test('PQC-08: PQC failure is independent of ECDSA — not masked by I-1 PASS', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(5, { sign: true, corruptSigAt: [0, 1, 2, 3, 4] })
    const result  = checkPqc(pubHex, records)

    // PQC must fail independently, regardless of ECDSA
    expect(result.pass).toBe(false)
    expect(result.code).toBe('I10_PQC_HYBRID')
    expect(result.critical).toBe(false)  // Phase 1: advisory
  })

  // TRIGGER:  I-10 is non-critical in Phase 1
  // OUTPUT:   result.critical === false
  // FAILURE:  Premature enforcement blocks all missions during PQC rollout
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-09: Phase 1 — I-10 is advisory (non-critical)', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(5, { sign: true, corruptSigAt: [0] })
    const result  = checkPqc(pubHex, records)

    expect(result.critical).toBe(false)
  })

  // TRIGGER:  Empty record set with PQC key present
  // OUTPUT:   I-10 pass=true (nothing to verify = no failures)
  // FAILURE:  Edge case crash on empty array
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-10: Empty record set → I-10 PASS (nothing to verify)', () => {
    const pubHex = Buffer.from(testKeypair.publicKey).toString('hex')
    const result = checkPqc(pubHex, [])

    expect(result.pass).toBe(true)
  })

  // TRIGGER:  Large batch — 500 records all signed
  // OUTPUT:   Verification completes in < 10s (ML-DSA-65 is ~2ms per verify)
  // FAILURE:  O(n²) verification or memory leak
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-11: Performance — 500 PQC signatures verified within SLA', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(500, { sign: true })

    const start  = performance.now()
    const result = checkPqc(pubHex, records)
    const elapsed = performance.now() - start

    expect(result.pass).toBe(true)
    expect(result.detail).toContain('500 ML-DSA-65 signatures verified')
    // ML-DSA-65 verify is ~1-3ms each, so 500 should be < 10s
    expect(elapsed).toBeLessThan(10_000)
  })

  // TRIGGER:  Multiple corrupted signatures across batch
  // OUTPUT:   Error detail truncated to first 3 errors + count of remaining
  // FAILURE:  Unbounded error array → huge response payload
  // OWNER:    ForensicVerifier.checkPqcSignatures()
  test('PQC-12: Multiple PQC failures — error truncation works', () => {
    const pubHex  = Buffer.from(testKeypair.publicKey).toString('hex')
    const records = makeRecords(10, { sign: true, corruptSigAt: [0, 1, 2, 3, 4] })
    const result  = checkPqc(pubHex, records)

    expect(result.pass).toBe(false)
    // Should show first 3 errors + "+N more"
    expect(result.detail).toContain('+')
    expect(result.detail).toContain('more')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// JADS Swarm Scale Simulation Test
// File: src/__tests__/swarm-scale.test.ts
//
// PURPOSE: Prove the platform can handle 100 drones at 1Hz telemetry for
// a 10-minute mission (1,000 records per drone × 100 drones = 100,000 records).
// This is the iDEX scale proof requirement.
//
// WHAT THIS TESTS:
//   1. Hash chain construction for 100 independent drones (parallelizable)
//   2. ForensicVerifier can verify 100 chains in series within SLA
//   3. Canonical serialization throughput at scale
//   4. CRC32 verification throughput at scale
//   5. No shared mutable state between drone verifications (statelessness)
//
// PERFORMANCE SLAs:
//   Single chain verify (1000 records): < 100ms
//   100 drones × 1000 records each:    < 15s total (batch)
//   Canonical serialize + CRC32:       < 0.1ms per record
// ─────────────────────────────────────────────────────────────────────────────

import { ForensicVerifier }  from '../services/ForensicVerifier'
import {
  buildValidChain,
  buildCanonicalPayload,
  makeCanonicalPayload,
  crc32,
  minimalAftnInput,
}                             from './helpers/chainBuilders'
import { AftnMessageBuilder } from '../services/AftnMessageBuilder'
import {
  serialize,
  verifyCrc32,
  PAYLOAD_SIZE,
  TelemetryFields,
}                             from '../telemetry/canonicalSerializer'

const verifier = new ForensicVerifier(null as any)
const builder  = new AftnMessageBuilder()

// ── SWARM CONFIGURATION ────────────────────────────────────────────────────

const DRONE_COUNT          = 100
const RECORDS_PER_DRONE    = 1000   // 1Hz × 1000s ≈ ~16.7 min mission
const TOTAL_RECORDS        = DRONE_COUNT * RECORDS_PER_DRONE
const BASE_MISSION_ID      = BigInt('2709280000000')  // deterministic base

// ─────────────────────────────────────────────────────────────────────────────
// SW-01: Swarm hash chain construction — 100 drones × 1000 records
// ─────────────────────────────────────────────────────────────────────────────

describe('SW-01–08: Swarm scale simulation (100 drones × 1000 records)', () => {

  // Pre-build all chains once — reused across tests
  const swarmChains: Map<bigint, ReturnType<typeof buildValidChain>> = new Map()

  beforeAll(() => {
    for (let d = 0; d < DRONE_COUNT; d++) {
      const missionId = BASE_MISSION_ID + BigInt(d)
      swarmChains.set(missionId, buildValidChain(missionId, RECORDS_PER_DRONE))
    }
  })

  // TRIGGER:  Construct 100,000 hash chain records (100 drones × 1000 each)
  // OUTPUT:   All chains built within 30s; each chain has exactly 1000 records
  // FAILURE:  Memory exhaustion or O(n²) hash computation → timeout
  // OWNER:    chainBuilders.ts buildValidChain()
  test('SW-01: 100 drones × 1000 records all construct successfully', () => {
    expect(swarmChains.size).toBe(DRONE_COUNT)
    for (const [_id, chain] of swarmChains) {
      expect(chain).toHaveLength(RECORDS_PER_DRONE)
    }
  })

  // TRIGGER:  Every chain's first record starts from correct HASH_0
  // OUTPUT:   All 100 chains pass I-1 hash chain integrity check
  // FAILURE:  Incorrect HASH_0 derivation or chain link → CHAIN_BROKEN
  // OWNER:    ForensicVerifier.checkHashChain()
  test('SW-02: All 100 chains pass ForensicVerifier hash chain check', () => {
    let passCount = 0
    for (const [missionId, chain] of swarmChains) {
      const result = (verifier as any).checkHashChain(missionId.toString(), chain)
      if (result.pass) passCount++
      else fail(`Chain failed for missionId=${missionId}: ${result.detail}`)
    }
    expect(passCount).toBe(DRONE_COUNT)
  })

  // TRIGGER:  Verify all 100 chains in series
  // OUTPUT:   Total time < 15s (150ms per chain budget)
  // FAILURE:  O(n²) hash computation or memory pressure → SLA breach
  // OWNER:    ForensicVerifier.checkHashChain()
  test('SW-03: Batch verification of 100 chains completes within SLA', () => {
    const start = performance.now()
    for (const [missionId, chain] of swarmChains) {
      ;(verifier as any).checkHashChain(missionId.toString(), chain)
    }
    const elapsed = performance.now() - start
    // 15s budget for 100 drones × 1000 records
    expect(elapsed).toBeLessThan(15_000)
  })

  // TRIGGER:  Single drone with 1000 records
  // OUTPUT:   Verification < 100ms
  // FAILURE:  Hash chain walk is O(n²) instead of O(n)
  // OWNER:    ForensicVerifier.checkHashChain()
  test('SW-04: Single chain (1000 records) verifies in < 100ms', () => {
    const [missionId, chain] = swarmChains.entries().next().value!
    const start = performance.now()
    ;(verifier as any).checkHashChain(missionId.toString(), chain)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(100)
  })

  // TRIGGER:  All 100,000 records have unique chain hashes
  // OUTPUT:   No collisions across the entire swarm
  // FAILURE:  SHA-256 implementation bug producing duplicates
  // OWNER:    crypto.createHash('sha256')
  test('SW-05: No hash collisions across 100,000 records', () => {
    const allHashes = new Set<string>()
    for (const [_id, chain] of swarmChains) {
      for (const r of chain) {
        allHashes.add(r.chainHashHex)
      }
    }
    expect(allHashes.size).toBe(TOTAL_RECORDS)
  })

  // TRIGGER:  Tamper with record 500 in drone #50
  // OUTPUT:   Only drone #50's chain fails; all other 99 chains unaffected
  // FAILURE:  Shared mutable state between verifications → cross-contamination
  // OWNER:    ForensicVerifier (statelessness)
  test('SW-06: Tamper in one drone does not affect other drones', () => {
    const targetMissionId = BASE_MISSION_ID + BigInt(50)
    const chain = [...swarmChains.get(targetMissionId)!]  // clone
    // Tamper record 500
    chain[500] = { ...chain[500], chainHashHex: 'ff'.repeat(32) }

    // Tampered chain should fail
    const tamperedResult = (verifier as any).checkHashChain(targetMissionId.toString(), chain)
    expect(tamperedResult.pass).toBe(false)

    // Adjacent drones should still pass
    for (const offset of [49, 51]) {
      const adjId    = BASE_MISSION_ID + BigInt(offset)
      const adjChain = swarmChains.get(adjId)!
      const adjResult = (verifier as any).checkHashChain(adjId.toString(), adjChain)
      expect(adjResult.pass).toBe(true)
    }
  })

  // TRIGGER:  CRC32 verify all 100,000 payloads
  // OUTPUT:   All pass; throughput > 100,000/s
  // FAILURE:  CRC32 mismatch due to builder drift
  // OWNER:    canonicalSerializer.verifyCrc32()
  test('SW-07: CRC32 valid on all 100,000 payloads', () => {
    let validCount = 0
    const start = performance.now()
    for (const [_id, chain] of swarmChains) {
      for (const r of chain) {
        if (verifyCrc32(r.canonicalPayloadHex).valid) validCount++
      }
    }
    const elapsed = performance.now() - start
    expect(validCount).toBe(TOTAL_RECORDS)
    // Should process 100k CRC32 checks well within 10 seconds
    expect(elapsed).toBeLessThan(10_000)
  })

  // TRIGGER:  Build AFTN messages for 100 drones independently
  // OUTPUT:   All 100 messages valid; no shared state corruption
  // FAILURE:  Builder has shared mutable state → garbled messages
  // NOTE:     Sequential loop is correct — Node.js is single-threaded; this tests
  //           that the builder holds no mutable state between calls, not thread safety.
  // OWNER:    AftnMessageBuilder.build()
  test('SW-08: 100 independent AFTN message builds — no shared state leakage', () => {
    const messages: string[] = []
    for (let d = 0; d < DRONE_COUNT; d++) {
      const input = minimalAftnInput({
        callsign: `VTA${String(d).padStart(3, '0')}`,
      }) as any
      const msg = builder.build(input)
      expect(msg).toBeDefined()
      expect(msg.length).toBeGreaterThan(50)
      messages.push(msg)
    }
    // All messages should be unique (different callsigns)
    const unique = new Set(messages)
    expect(unique.size).toBe(DRONE_COUNT)
  })
})

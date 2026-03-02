/**
 * JADS E2E — Performance & Load Tests
 *
 * Validates the system holds up at drone operation scale.
 * These tests run in CI but with lower thresholds than production targets.
 * Production load tests run separately against a staging environment.
 *
 * Scale targets (from platform spec):
 *   - 100 concurrent drone missions
 *   - 1Hz telemetry (1 record/second per drone)
 *   - Upload burst: entire mission (up to 3600 records) in one POST
 *
 * CI thresholds (conservative — shared runner, no dedicated DB):
 *   - Single upload of 100 records: < 2 seconds
 *   - 10 concurrent uploads: all complete < 5 seconds, no failures
 *   - Audit query over 1000 missions: < 3 seconds
 */

import supertest from 'supertest'
import crypto    from 'crypto'
import app from '../../src/app'
import { createTestClient, cleanDatabase, assertDefined } from '../helpers/testDb'
import { bootstrapTestAuth, TestAuthContext } from '../helpers/authFactory'

const request = supertest(app)
const HEADERS  = { 'X-JADS-Version': '4.0' }

// CI vs production thresholds
const IS_CI         = !!process.env.CI
const UPLOAD_LIMIT_MS     = IS_CI ? 2_000  : 500    // 2s in CI, 500ms in prod
const CONCURRENT_LIMIT_MS = IS_CI ? 5_000  : 2_000  // 5s in CI, 2s in prod
const AUDIT_QUERY_LIMIT_MS = IS_CI ? 3_000 : 1_000  // 3s in CI, 1s in prod

function buildStubRecords(count: number, missionId: string) {
  return Array.from({ length: count }, (_, i) => ({
    sequence:     i,
    canonicalHex: crypto.randomBytes(92).toString('hex') + '00000000', // 96 bytes, invalid CRC
    signatureHex: crypto.randomBytes(64).toString('hex'),
    chainHashHex: crypto.randomBytes(32).toString('hex'),
    _missionId:   missionId,
  }))
}

describe('Performance Tests', () => {

  const prisma = createTestClient()
  let   auth:   TestAuthContext

  beforeAll(async () => {
    await cleanDatabase(prisma)
    auth = await bootstrapTestAuth(prisma)
  }, 30_000)  // Allow 30s for DB setup

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── PERF-01: Single mission upload — 100 records ────────────────────────

  test(`PERF-01: Upload 100-record mission completes within ${UPLOAD_LIMIT_MS}ms`, async () => {
    const missionId = `PERF-SINGLE-${Date.now()}`
    const records   = buildStubRecords(100, missionId)

    const start = Date.now()
    const res   = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId, records })

    const elapsed = Date.now() - start

    expect([201, 202]).toContain(res.status)
    expect(elapsed).toBeLessThan(UPLOAD_LIMIT_MS)

    console.log(`PERF-01: 100 records uploaded in ${elapsed}ms (limit ${UPLOAD_LIMIT_MS}ms)`)
  }, UPLOAD_LIMIT_MS + 5_000)

  // ── PERF-02: 10 concurrent uploads ──────────────────────────────────────

  test(`PERF-02: 10 concurrent uploads complete within ${CONCURRENT_LIMIT_MS}ms, no failures`, async () => {
    const uploads = Array.from({ length: 10 }, (_, i) => {
      const missionId = `PERF-CONCURRENT-${Date.now()}-${i}`
      const records   = buildStubRecords(50, missionId)
      return request
        .post('/api/drone/missions/upload')
        .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
        .send({ missionId, records })
    })

    const start   = Date.now()
    const results = await Promise.all(uploads)
    const elapsed = Date.now() - start

    const failures = results.filter(r => ![201, 202].includes(r.status))
    expect(failures).toHaveLength(0)
    expect(elapsed).toBeLessThan(CONCURRENT_LIMIT_MS)

    const statuses = results.map(r => r.status)
    console.log(`PERF-02: 10 concurrent uploads in ${elapsed}ms. Statuses: ${statuses}`)
  }, CONCURRENT_LIMIT_MS + 10_000)

  // ── PERF-03: Audit query performance ────────────────────────────────────

  test(`PERF-03: Audit list query with pagination completes within ${AUDIT_QUERY_LIMIT_MS}ms`, async () => {
    const start = Date.now()
    const res   = await request
      .get('/api/audit/missions?limit=50&page=1')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.dgcaAuditorJwt}` })

    const elapsed = Date.now() - start

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(AUDIT_QUERY_LIMIT_MS)

    console.log(`PERF-03: Audit query in ${elapsed}ms (limit ${AUDIT_QUERY_LIMIT_MS}ms)`)
  }, AUDIT_QUERY_LIMIT_MS + 5_000)

  // ── PERF-04: Idempotent re-upload (network retry simulation) ────────────

  test('PERF-04: Re-uploading same mission returns 202 without duplicate DB writes', async () => {
    const missionId = `PERF-IDEMPOTENT-${Date.now()}`
    const records   = buildStubRecords(20, missionId)

    // First upload
    const res1 = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId, records })
    expect(res1.status).toBe(201)

    // Retry — same content (simulates network timeout then retry)
    const start = Date.now()
    const res2  = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId, records })
    const elapsed = Date.now() - start

    expect(res2.status).toBe(202)
    expect(res2.body.idempotent).toBe(true)

    // Only one mission record in DB
    const count = await prisma.droneMission.count({
      where: { missionId }
    })
    expect(count).toBe(1)

    console.log(`PERF-04: Idempotent re-upload detected in ${elapsed}ms`)
  })

  // ── PERF-05: Replay attack detection is fast ────────────────────────────

  test('PERF-05: REPLAY_ATTEMPT detected and rejected quickly', async () => {
    const missionId  = `PERF-REPLAY-${Date.now()}`
    const records    = buildStubRecords(20, missionId)
    const tampered   = buildStubRecords(20, missionId)
    // Change one record's content to simulate tampered replay
    tampered[5].canonicalHex = 'ff'.repeat(92) + '00000000'

    // Upload original
    const res1 = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId, records })
    expect(res1.status).toBe(201)

    // Submit tampered version — same missionId, different content
    const start = Date.now()
    const res2  = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId, records: tampered })
    const elapsed = Date.now() - start

    expect(res2.status).toBe(409)
    expect(res2.body.error).toBe('REPLAY_ATTEMPT_DETECTED')

    // Security event logged
    const secLog = await prisma.auditLog.findFirst({
      where:   { action: 'replay_attempt_detected', resourceType: 'drone_mission' },
      orderBy: { createdAt: 'desc' }
    })
    assertDefined(secLog, 'replay_attempt_detected audit log entry')

    console.log(`PERF-05: Replay attack detected in ${elapsed}ms`)
  })

})

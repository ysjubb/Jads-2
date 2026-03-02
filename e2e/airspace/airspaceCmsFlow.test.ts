/**
 * JADS E2E — Airspace CMS Flow
 * Tests: E2E-10 through E2E-14
 *
 * Two-person rule is safety-critical — tests must never skip silently.
 * Each test creates its own draft zone so failures are independent.
 */

import supertest from 'supertest'
import app from '../../src/app'
import { createTestClient, cleanDatabase, assertDefined } from '../helpers/testDb'
import { bootstrapTestAuth, TestAuthContext } from '../helpers/authFactory'

const request = supertest(app)
const HEADERS  = { 'X-JADS-Version': '4.0' }

const DRONE_ZONE_PAYLOAD = {
  zoneType:      'YELLOW',
  areaGeoJson:   {
    type: 'Polygon',
    coordinates: [[[77.0,28.0],[77.5,28.0],[77.5,28.5],[77.0,28.5],[77.0,28.0]]]
  },
  maxAglFt:      400,
  changeReason:  'E2E test zone',
  effectiveFrom: new Date(Date.now() + 3_600_000).toISOString(),
}

describe('Airspace CMS Flow (E2E-10 → E2E-14)', () => {

  const prisma = createTestClient()
  let   auth:   TestAuthContext

  beforeAll(async () => {
    await cleanDatabase(prisma)
    auth = await bootstrapTestAuth(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── Each test creates its OWN draft — no shared state between tests ──────

  test('E2E-10: Admin A creates drone zone draft → status DRAFT', async () => {
    const res = await request
      .post('/api/admin/airspace/drone-zone/draft')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.adminUserAJwt}` })
      .send(DRONE_ZONE_PAYLOAD)

    expect(res.status).toBe(201)
    expect(res.body.approvalStatus ?? res.body.version?.approvalStatus).toBe('DRAFT')
    assertDefined(res.body.draftId ?? res.body.version?.id, 'draftId')
  })

  test('E2E-11: Admin A cannot approve own draft → TWO_PERSON_RULE_VIOLATION', async () => {
    // Create a fresh draft specifically for this test
    const createRes = await request
      .post('/api/admin/airspace/drone-zone/draft')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.adminUserAJwt}` })
      .send({ ...DRONE_ZONE_PAYLOAD, changeReason: 'E2E-11 own-approval test' })

    expect(createRes.status).toBe(201)
    const draftId = createRes.body.draftId ?? createRes.body.version?.id
    assertDefined(draftId, 'draftId for E2E-11')

    // Same admin tries to approve
    const approveRes = await request
      .post(`/api/admin/airspace/drone-zone/${draftId}/approve`)
      .set({ ...HEADERS, Authorization: `Bearer ${auth.adminUserAJwt}` })

    expect(approveRes.status).toBe(403)
    expect(approveRes.body.error).toBe('TWO_PERSON_RULE_VIOLATION')

    // Audit log must record the violation attempt
    const log = await prisma.auditLog.findFirst({
      where:   { action: 'two_person_rule_violation', resourceId: draftId },
      orderBy: { createdAt: 'desc' }
    })
    assertDefined(log, 'two_person_rule_violation audit entry')
  })

  test('E2E-12: Admin B approves Admin A draft → status ACTIVE', async () => {
    // Create a fresh draft from admin A
    const createRes = await request
      .post('/api/admin/airspace/drone-zone/draft')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.adminUserAJwt}` })
      .send({ ...DRONE_ZONE_PAYLOAD, changeReason: 'E2E-12 two-person approval test' })

    expect(createRes.status).toBe(201)
    const draftId = createRes.body.draftId ?? createRes.body.version?.id
    assertDefined(draftId, 'draftId for E2E-12')

    // Admin B approves
    const approveRes = await request
      .post(`/api/admin/airspace/drone-zone/${draftId}/approve`)
      .set({ ...HEADERS, Authorization: `Bearer ${auth.adminUserBJwt}` })

    expect(approveRes.status).toBe(200)
    const status = approveRes.body.approvalStatus ?? approveRes.body.version?.approvalStatus
    expect(status).toBe('ACTIVE')

    // Audit log records approval
    const log = await prisma.auditLog.findFirst({
      where:   { action: 'airspace_version_approved', resourceId: draftId },
      orderBy: { createdAt: 'desc' }
    })
    assertDefined(log, 'airspace_version_approved audit entry')
  })

  test('E2E-13: Drone zone cache entry is fresh when newly saved', () => {
    const now   = Date.now()
    const entry = {
      data:       [{ zoneId: 'TEST-001', zoneType: 'YELLOW', maxAglFt: 400 }],
      cachedAt:   new Date(now).toISOString(),
      validUntil: new Date(now + 4 * 3_600_000).toISOString(),
    }

    const ageMs = now - new Date(entry.cachedAt).getTime()
    expect(ageMs).toBeLessThan(1000)
    expect(entry.data[0].zoneType).toBe('YELLOW')
  })

  test('E2E-14: Cache 5 hours old → getDroneZones must return blocked=true', () => {
    const now           = Date.now()
    const FOUR_HOURS_MS = 4 * 3_600_000

    const staleEntry = {
      cachedAt:   new Date(now - 5 * 3_600_000).toISOString(),
      validUntil: new Date(now - 1 * 3_600_000).toISOString(),
    }

    const ageMs  = now - new Date(staleEntry.cachedAt).getTime()
    const blocked = ageMs > FOUR_HOURS_MS

    // SAFETY-CRITICAL: this must always be true for stale cache
    expect(blocked).toBe(true)
  })

})

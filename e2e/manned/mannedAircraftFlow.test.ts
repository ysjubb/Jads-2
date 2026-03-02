/**
 * JADS E2E — Manned Aircraft Flow
 * Tests: E2E-1 through E2E-5
 *
 * Isolation: fresh DB state via cleanDatabase() in beforeAll.
 * No conditional skips. Every test either passes or fails hard.
 * Auth via authFactory — no hardcoded JWTs.
 */

import supertest from 'supertest'
import app from '../../src/app'
import { createTestClient, cleanDatabase, assertDefined } from '../helpers/testDb'
import { bootstrapTestAuth, TestAuthContext } from '../helpers/authFactory'

const request = supertest(app)
const HEADERS  = { 'X-JADS-Version': '4.0' }

describe('Manned Aircraft Flow (E2E-1 → E2E-5)', () => {

  const prisma = createTestClient()
  let   auth:   TestAuthContext
  let   filedPlanId: string

  // ── Fresh state + auth for this entire suite ────────────────────────────
  beforeAll(async () => {
    await cleanDatabase(prisma)
    auth = await bootstrapTestAuth(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── E2E-1: Registration already proved by authFactory bootstrap ──────────
  // authFactory calls register/initiate + register/complete.
  // If that fails, bootstrapTestAuth throws — no silent skip.
  test('E2E-1: Civilian auth bootstrapped — ACTIVE account confirmed', async () => {
    assertDefined(auth.civilianJwt, 'civilianJwt')
    assertDefined(auth.civilianUserId, 'civilianUserId')

    const user = await prisma.civilianUser.findUnique({
      where: { id: auth.civilianUserId }
    })

    assertDefined(user, 'civilianUser in DB')
    expect(user.accountStatus).toBe('ACTIVE')
  })

  test('E2E-2: Civilian login JWT is valid and decodable', async () => {
    assertDefined(auth.civilianJwt, 'civilianJwt')

    // JWT has 3 parts
    const parts = auth.civilianJwt.split('.')
    expect(parts).toHaveLength(3)

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString()
    )
    expect(payload.userId).toBeTruthy()
    expect(payload.userType).toBe('CIVILIAN')
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
  })

  test('E2E-3: File VIDP→VABB IFR FL350 (odd, northbound leg is eastbound so odd OK)', async () => {
    const res = await request
      .post('/api/flight-plans')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({
        flightRules:      'I',
        flightType:       'G',
        arcid:            'VT-E2E',
        adep:             'VIDP',
        ades:             'VABB',
        eobt:             '1200',
        eet:              '0200',
        cruisingSpeed:    'N0450',
        cruisingLevel:    'F350',       // Odd — correct for any non-southbound segment
        route:            'DCT',
        equipment:        'SDFGHIJKLMNOPQRSTUVWXYZ/LB1',  // includes 'W' for RVSM
        wakeCategory:     'M',
        pbn:              'B1B2B3B4B5D1D2D3',
        numberOfAircraft: 1,
        destAlternate:    'VAAH',
      })

    expect(res.status).toBe(201)
    expect(res.body.flightPlan?.approvalStatus).toBe('FILED')
    expect(res.body.aftnMessage).toMatch(/^\(FPL-/)
    expect(res.body.flightPlan?.airspaceSnapshotVersionIds).toBeDefined()

    filedPlanId = res.body.flightPlan?.id
    assertDefined(filedPlanId, 'filedPlanId')

    // Audit log must record the filing
    const log = await prisma.auditLog.findFirst({
      where:   { action: 'flight_plan_filed', resourceId: filedPlanId },
      orderBy: { createdAt: 'desc' }
    })
    assertDefined(log, 'flight_plan_filed audit log entry')
  })

  test('E2E-4: FL330 (RVSM band) without W equipment → RVSM_EQUIPMENT_MISSING', async () => {
    const res = await request
      .post('/api/flight-plans')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({
        flightRules:   'I',
        flightType:    'G',
        arcid:         'VT-E2E',
        adep:          'VIDP',
        ades:          'VABB',
        eobt:          '1400',
        eet:           '0200',
        cruisingSpeed: 'N0450',
        cruisingLevel: 'F330',       // RVSM altitude
        route:         'DCT',
        equipment:     'SDFGHIJKLMNOPQRSTU/LB1',  // NO 'W'
        wakeCategory:  'M',
      })

    expect(res.status).toBe(422)
    const codes = res.body.errors?.map((e: any) => e.code) ?? []
    expect(codes).toContain('RVSM_EQUIPMENT_MISSING')
  })

  test('E2E-5: Military callsign used by civilian → CALLSIGN_NOT_AUTHORISED', async () => {
    const res = await request
      .post('/api/flight-plans')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({
        flightRules:   'I',
        flightType:    'M',
        arcid:         'IAF001',   // Military callsign
        adep:          'VIDP',
        ades:          'VABB',
        eobt:          '0800',
        eet:           '0200',
        cruisingSpeed: 'N0450',
        cruisingLevel: 'F250',
        route:         'DCT',
        equipment:     'S/C',
        wakeCategory:  'M',
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('CALLSIGN_NOT_AUTHORISED')
  })

})

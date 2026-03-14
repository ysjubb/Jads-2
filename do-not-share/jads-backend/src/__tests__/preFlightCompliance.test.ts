/**
 * DS-15 — Pre-Flight Compliance Check Tests
 *
 * Tests the POST /api/drone/pre-flight-check endpoint.
 * 8 test cases covering all 6 check codes and verdict logic.
 */

import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ── Mock prisma ─────────────────────────────────────────────────────────────

const mockPAs = new Map<string, any>()

const mockPrisma = {
  civilianUser: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  uINVerificationCache: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  permissionArtefact: {
    findUnique: jest.fn(async ({ where }: any) => {
      return mockPAs.get(where.id) ?? null
    }),
  },
}

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))

// ── Mock env ────────────────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-bytes-long-for-hs256'

jest.mock('../env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-bytes-long-for-hs256',
    NODE_ENV: 'test',
    PORT: 8080,
    JADS_VERSION: '4.0',
  },
}))

// ── Mock constants ──────────────────────────────────────────────────────────

jest.mock('../constants', () => ({
  USER_SESSION_HOURS: 8,
  OTP_EXPIRY_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  BCRYPT_ROUNDS: 10,
  AADHAAR_REVERIFY_DAYS: 365,
  DOMAIN_ROLE_MAP: { AIRCRAFT: ['PILOT'], DRONE: ['DRONE_OPERATOR'] },
  DOMAIN_AUTHORITY_MAP: { AIRCRAFT: ['AAI', 'DGCA'], DRONE: ['DIGITAL_SKY', 'DGCA'] },
  BLOCKED_ROLES: ['PILOT_AND_DRONE'],
}))

// ── Mock DigitalSkyAdapterStub ──────────────────────────────────────────────

jest.mock('../adapters/stubs/DigitalSkyAdapterStub', () => ({
  DigitalSkyAdapterStub: jest.fn().mockImplementation(() => ({
    getDroneRegistration: jest.fn().mockImplementation(async (uin: string) => {
      if (uin === 'UIN-DEMO-001') {
        return {
          uin: 'UIN-DEMO-001',
          manufacturerName: 'JADS Test Manufacturer',
          modelName: 'JADS-Phantom-T1',
          weightCategory: 'SMALL',
          registrationDate: '2024-01-15T00:00:00Z',
          ownerName: 'JADS Demo Operator',
          ownerEntityType: 'ORGANIZATION',
          status: 'REGISTERED',
        }
      }
      if (uin === 'UIN-EXPIRED-001') {
        return {
          uin: 'UIN-EXPIRED-001',
          manufacturerName: 'Test',
          modelName: 'Test',
          weightCategory: 'MICRO',
          registrationDate: '2023-01-01T00:00:00Z',
          ownerName: 'Expired Op',
          ownerEntityType: 'INDIVIDUAL',
          status: 'DEREGISTERED',
        }
      }
      return null
    }),
    ping: jest.fn().mockResolvedValue({ reachable: true, latencyMs: 1 }),
    validatePermissionArtefact: jest.fn().mockResolvedValue(null),
    verifyPilotLicense: jest.fn().mockResolvedValue(null),
    submitFlightLog: jest.fn().mockResolvedValue({ receiptId: 'r1', submittedAt: new Date().toISOString(), accepted: true }),
    validateNpntToken: jest.fn().mockResolvedValue({ valid: false, droneUin: null, paId: null }),
  })),
}))

// ── Mock rate limiter ───────────────────────────────────────────────────────

jest.mock('../middleware/rateLimiter', () => ({
  authLoginRateLimit: (_req: any, _res: any, next: any) => next(),
  missionUploadRateLimit: (_req: any, _res: any, next: any) => next(),
}))

// ── Mock ZoneClassificationService ──────────────────────────────────────────

jest.mock('../services/ZoneClassificationService', () => ({
  classifyPolygon: jest.fn().mockImplementation(async (polygon: any[], _altitudeAGL: number) => {
    // If polygon contains a point near 0,0 → RED (for testing)
    const hasRedPoint = polygon.some((p: any) => p.lat < 1 && p.lat > -1 && p.lng < 1 && p.lng > -1)
    // If polygon contains a point near 28.6,77.2 (Delhi) → YELLOW
    const hasDelhiPoint = polygon.some((p: any) => Math.abs(p.lat - 28.6) < 0.5 && Math.abs(p.lng - 77.2) < 0.5)

    if (hasRedPoint) {
      return {
        primaryZone: 'RED',
        affectedZones: [],
        requiresATCPermission: true,
        atcAuthority: null,
        requiresCentralGovtPermission: true,
        canAutoApprove: false,
        warnings: ['Red zone — restricted airspace'],
      }
    }
    if (hasDelhiPoint) {
      return {
        primaryZone: 'YELLOW',
        affectedZones: [],
        requiresATCPermission: true,
        atcAuthority: 'Delhi ATC',
        requiresCentralGovtPermission: false,
        canAutoApprove: false,
        warnings: ['Yellow zone — controlled airspace near Delhi airport'],
      }
    }
    return {
      primaryZone: 'GREEN',
      affectedZones: [],
      requiresATCPermission: false,
      atcAuthority: null,
      requiresCentralGovtPermission: false,
      canAutoApprove: true,
      warnings: [],
    }
  }),
  LatLng: jest.fn(),
}))

// ── Mock other services ─────────────────────────────────────────────────────

jest.mock('../services/MissionService', () => ({
  MissionService: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../services/ForensicVerifier', () => ({
  ForensicVerifier: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../services/PALifecycleService', () => ({
  PALifecycleService: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../services/YellowZoneRoutingService', () => ({
  YellowZoneRoutingService: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../services/FlightPlanValidationService', () => ({
  FlightPlanValidationService: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../services/DroneNotificationService', () => ({
  DroneNotificationService: jest.fn().mockImplementation(() => ({})),
  getCategoryForType: jest.fn(),
}))
jest.mock('../services/DeviceAttestationService', () => ({
  createDeviceAttestationService: jest.fn().mockReturnValue({
    generateAttestationNonce: jest.fn().mockReturnValue('test-nonce'),
  }),
}))

// ── Import after mocks ──────────────────────────────────────────────────────

import droneRoutes from '../routes/droneRoutes'

// ── Build test app with auth ────────────────────────────────────────────────

function buildTestApp() {
  const app = express()
  app.use(express.json())

  // Simulate auth middleware — inject req.auth from JWT
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), TEST_JWT_SECRET) as any
        ;(req as any).auth = payload
      } catch { /* skip */ }
    }
    next()
  })

  app.use('/api/drone', droneRoutes)
  return app
}

function generateToken(overrides: Record<string, any> = {}): string {
  return jwt.sign({
    userId: 'user-test-1',
    role: 'DRONE_OPERATOR',
    userType: 'CIVILIAN',
    credentialDomain: 'DRONE',
    ...overrides,
  }, TEST_JWT_SECRET, { expiresIn: '8h' })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DS-15: Pre-Flight Compliance Check', () => {
  let app: express.Application
  let token: string

  beforeEach(() => {
    mockPAs.clear()
    jest.clearAllMocks()
    app = buildTestApp()
    token = generateToken()
  })

  test('valid UIN in GREEN zone returns GO verdict', async () => {
    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uinNumber: 'UIN-DEMO-001',
        polygon: [
          { lat: 12.9, lng: 80.2 },
          { lat: 12.91, lng: 80.2 },
          { lat: 12.91, lng: 80.21 },
          { lat: 12.9, lng: 80.21 },
        ],
        altitudeM: 100,
      })

    expect(res.status).toBe(200)
    expect(res.body.verdict).toBe('GO')
    expect(res.body.checks).toHaveLength(6) // 3 pass + 3 skip (no PA)
    expect(res.body.checks[0].code).toBe('UIN_VERIFIED')
    expect(res.body.checks[0].status).toBe('PASS')
    expect(res.body.checks[1].code).toBe('UAOP_VALID')
    expect(res.body.checks[1].status).toBe('PASS')
    expect(res.body.checks[2].code).toBe('ZONE_CLASSIFICATION')
    expect(res.body.checks[2].status).toBe('PASS')
  })

  test('invalid UIN returns NO_GO verdict', async () => {
    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({ uinNumber: 'UIN-FAKE-999' })

    expect(res.status).toBe(200)
    expect(res.body.verdict).toBe('NO_GO')
    expect(res.body.checks[0].code).toBe('UIN_VERIFIED')
    expect(res.body.checks[0].status).toBe('FAIL')
    // UAOP should be SKIP since UIN failed
    expect(res.body.checks[1].code).toBe('UAOP_VALID')
    expect(res.body.checks[1].status).toBe('SKIP')
  })

  test('RED zone returns NO_GO with ZONE_CLASSIFICATION FAIL', async () => {
    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uinNumber: 'UIN-DEMO-001',
        polygon: [
          { lat: 0.1, lng: 0.1 },
          { lat: 0.2, lng: 0.1 },
          { lat: 0.2, lng: 0.2 },
        ],
        altitudeM: 100,
      })

    expect(res.status).toBe(200)
    expect(res.body.verdict).toBe('NO_GO')
    const zoneCheck = res.body.checks.find((c: any) => c.code === 'ZONE_CLASSIFICATION')
    expect(zoneCheck.status).toBe('FAIL')
    expect(zoneCheck.detail).toContain('RED zone')
  })

  test('YELLOW zone returns ADVISORY verdict', async () => {
    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uinNumber: 'UIN-DEMO-001',
        polygon: [
          { lat: 28.5, lng: 77.1 },
          { lat: 28.6, lng: 77.1 },
          { lat: 28.6, lng: 77.2 },
        ],
        altitudeM: 100,
      })

    expect(res.status).toBe(200)
    expect(res.body.verdict).toBe('ADVISORY')
    const zoneCheck = res.body.checks.find((c: any) => c.code === 'ZONE_CLASSIFICATION')
    expect(zoneCheck.status).toBe('WARN')
    expect(zoneCheck.detail).toContain('YELLOW zone')
  })

  test('missing UIN returns 400', async () => {
    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_UIN')
  })

  test('with valid PA returns PA checks as PASS', async () => {
    const now = new Date()
    const start = new Date(now.getTime() - 3600000)   // 1h ago
    const end = new Date(now.getTime() + 3600000)      // 1h from now

    mockPAs.set('pa-valid-1', {
      id: 'pa-valid-1',
      status: 'APPROVED',
      rawPaXml: Buffer.from('<?xml version="1.0"?><PermissionArtefact><Signature xmlns=""></Signature></PermissionArtefact>'),
      paZipHash: 'abc123',
      flightStartTime: start,
      flightEndTime: end,
      geofencePolygon: JSON.stringify([
        { lat: 12.0, lng: 80.0 },
        { lat: 13.0, lng: 80.0 },
        { lat: 13.0, lng: 81.0 },
        { lat: 12.0, lng: 81.0 },
      ]),
    })

    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uinNumber: 'UIN-DEMO-001',
        paId: 'pa-valid-1',
        polygon: [
          { lat: 12.5, lng: 80.5 },
          { lat: 12.6, lng: 80.5 },
          { lat: 12.6, lng: 80.6 },
        ],
        altitudeM: 100,
      })

    expect(res.status).toBe(200)
    // Should have PA checks
    const paSignature = res.body.checks.find((c: any) => c.code === 'PA_SIGNATURE')
    expect(paSignature.status).toBe('PASS')
    const paTimeWindow = res.body.checks.find((c: any) => c.code === 'PA_TIME_WINDOW')
    expect(paTimeWindow.status).toBe('PASS')
    const paGeofence = res.body.checks.find((c: any) => c.code === 'PA_GEOFENCE')
    expect(paGeofence.status).toBe('PASS')
  })

  test('expired PA time window returns NO_GO', async () => {
    const pastStart = new Date(Date.now() - 7200000) // 2h ago
    const pastEnd = new Date(Date.now() - 3600000)   // 1h ago

    mockPAs.set('pa-expired-1', {
      id: 'pa-expired-1',
      status: 'APPROVED',
      rawPaXml: Buffer.from('<PermissionArtefact><Signature></Signature></PermissionArtefact>'),
      paZipHash: 'def456',
      flightStartTime: pastStart,
      flightEndTime: pastEnd,
      geofencePolygon: null,
    })

    const res = await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        uinNumber: 'UIN-DEMO-001',
        paId: 'pa-expired-1',
        altitudeM: 100,
      })

    expect(res.status).toBe(200)
    expect(res.body.verdict).toBe('NO_GO')
    const paTimeWindow = res.body.checks.find((c: any) => c.code === 'PA_TIME_WINDOW')
    expect(paTimeWindow.status).toBe('FAIL')
    expect(paTimeWindow.detail).toContain('expired')
  })

  test('audit log is created on pre-flight check', async () => {
    await request(app)
      .post('/api/drone/pre-flight-check')
      .set('Authorization', `Bearer ${token}`)
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    const auditData = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('pre_flight_check')
    expect(auditData.actorType).toBe('CIVILIAN_USER')
    expect(auditData.resourceType).toBe('compliance_report')
  })
})

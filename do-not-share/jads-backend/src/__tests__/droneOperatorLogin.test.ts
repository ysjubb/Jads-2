/**
 * DS-14 — Drone Operator Login via UIN Tests
 *
 * Tests the POST /api/auth/drone/login endpoint.
 * Operators login with their Digital Sky UIN — no OTP or password needed.
 */

import express from 'express'
import request from 'supertest'

// We test the auth route endpoint directly by importing the router
// But since the route has side effects (prisma, services), we mock them

// Mock prisma
const mockUsers = new Map<string, any>()
let userIdCounter = 0

const mockPrisma = {
  civilianUser: {
    findFirst: jest.fn(async ({ where }: any) => {
      for (const user of mockUsers.values()) {
        if (where.uinNumber && user.uinNumber === where.uinNumber) return user
      }
      return null
    }),
    create: jest.fn(async ({ data }: any) => {
      userIdCounter++
      const user = { id: `user-${userIdCounter}`, ...data, lastLoginAt: null }
      mockUsers.set(user.id, user)
      return user
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const user = mockUsers.get(where.id)
      if (user) Object.assign(user, data)
      return user
    }),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  uINVerificationCache: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
}

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))

// Mock env
jest.mock('../env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-bytes-long-for-hs256',
    NODE_ENV: 'test',
    PORT: 8080,
    JADS_VERSION: '4.0',
  },
}))

// Mock constants
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

// Mock the DigitalSkyAdapterStub
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
      return null
    }),
    ping: jest.fn().mockResolvedValue({ reachable: true, latencyMs: 1 }),
    validatePermissionArtefact: jest.fn().mockResolvedValue(null),
    verifyPilotLicense: jest.fn().mockResolvedValue(null),
    submitFlightLog: jest.fn().mockResolvedValue({ receiptId: 'r1', submittedAt: new Date().toISOString(), accepted: true }),
    validateNpntToken: jest.fn().mockResolvedValue({ valid: false, droneUin: null, paId: null }),
  })),
}))

// Mock rate limiter to not interfere with tests
jest.mock('../middleware/rateLimiter', () => ({
  authLoginRateLimit: (_req: any, _res: any, next: any) => next(),
}))

// Import after mocks
import authRoutes from '../routes/authRoutes'

// Build a minimal test app
function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  return app
}

describe('DS-14: Drone Operator Login via UIN', () => {
  let app: express.Application

  beforeEach(() => {
    mockUsers.clear()
    userIdCounter = 0
    jest.clearAllMocks()
    app = buildTestApp()
  })

  test('valid UIN creates new CivilianUser on first login', async () => {
    const res = await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.uinNumber).toBe('UIN-DEMO-001')
    expect(res.body.droneCategory).toBe('SMALL')
    expect(res.body.operatorId).toBe('JADS Demo Operator')
    expect(res.body.uaopValid).toBe(true)
    expect(res.body.expiresAt).toBeTruthy()

    // Verify user was created
    expect(mockPrisma.civilianUser.create).toHaveBeenCalledTimes(1)
    const createData = mockPrisma.civilianUser.create.mock.calls[0][0].data
    expect(createData.role).toBe('DRONE_OPERATOR')
    expect(createData.credentialDomain).toBe('DRONE')
    expect(createData.issuingAuthority).toBe('DIGITAL_SKY')
    expect(createData.uinNumber).toBe('UIN-DEMO-001')
  })

  test('second login with same UIN returns existing user (no duplicate)', async () => {
    // First login
    await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(mockPrisma.civilianUser.create).toHaveBeenCalledTimes(1)

    // Second login — should find existing
    const res = await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    // create should NOT be called a second time
    expect(mockPrisma.civilianUser.create).toHaveBeenCalledTimes(1)
  })

  test('invalid UIN returns 401 with UIN_NOT_VERIFIED', async () => {
    const res = await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-FAKE-999' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UIN_NOT_VERIFIED')
  })

  test('returned JWT has credentialDomain: DRONE', async () => {
    const res = await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(res.status).toBe(200)
    // Decode JWT payload
    const payload = JSON.parse(Buffer.from(res.body.accessToken.split('.')[1], 'base64').toString())
    expect(payload.credentialDomain).toBe('DRONE')
    expect(payload.role).toBe('DRONE_OPERATOR')
    expect(payload.userType).toBe('CIVILIAN')
  })

  test('missing UIN returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/drone/login')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_UIN')
  })

  test('audit log is created on successful login', async () => {
    await request(app)
      .post('/api/auth/drone/login')
      .send({ uinNumber: 'UIN-DEMO-001' })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    const auditData = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('drone_operator_uin_login')
    expect(auditData.actorType).toBe('CIVILIAN_USER')
  })
})

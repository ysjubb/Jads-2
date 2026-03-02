/**
 * JADS E2E — Auth Factory
 *
 * Creates fresh JWTs for each test run by calling the actual auth endpoints.
 * NO hardcoded JWT strings anywhere in test code.
 * NO process.env.TEST_SUPER_ADMIN_JWT or similar.
 *
 * All credentials come from:
 *   - CI: GitHub Actions secrets (injected as env vars at runtime, never in source)
 *   - Local: .env.test file (gitignored)
 *
 * The factory creates minimal test users programmatically and authenticates
 * them through the real auth flow — same path production uses.
 */

import supertest from 'supertest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import app from '../../src/app'

const request = supertest(app)
const V4_HEADER = { 'X-JADS-Version': '4.0' }

export interface TestAuthContext {
  // Civilian users
  civilianJwt:        string
  civilianUserId:     string

  // Special unit accounts (username+password, no OTP)
  specialUnitJwt:     string
  specialUnitId:      string

  // Admin tokens (signed with ADMIN_JWT_SECRET — separate from user JWT)
  superAdminJwt:      string
  adminUserAJwt:      string   // For two-person-rule tests (person A)
  adminUserBJwt:      string   // For two-person-rule tests (person B)

  // Audit tokens
  dgcaAuditorJwt:     string
  iafAuditorJwt:      string
}

/**
 * Bootstrap all test identities for a suite.
 * Called once in beforeAll — result shared across tests in that suite.
 *
 * Uses the real auth endpoints (stub OTP adapter accepts '000000' in test env).
 */
export async function bootstrapTestAuth(
  prisma: PrismaClient
): Promise<TestAuthContext> {

  // ── Admin users — created directly in DB (no public endpoint for this) ───
  const adminSecret = process.env.ADMIN_JWT_SECRET
  if (!adminSecret) throw new Error('ADMIN_JWT_SECRET must be set')

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET must be set')

  // Create two distinct admin users for two-person-rule tests
  const bcryptRounds = 10
  const adminPwHash  = await bcrypt.hash('TestAdmin!99', bcryptRounds)

  const adminA = await prisma.adminUser.upsert({
    where:  { username: 'e2e_admin_a' },
    update: {},
    create: {
      username:     'e2e_admin_a',
      passwordHash: adminPwHash,
      role:         'PLATFORM_SUPER_ADMIN',
      isActive:     true,
    }
  })

  const adminB = await prisma.adminUser.upsert({
    where:  { username: 'e2e_admin_b' },
    update: {},
    create: {
      username:     'e2e_admin_b',
      passwordHash: adminPwHash,
      role:         'PLATFORM_SUPER_ADMIN',
      isActive:     true,
    }
  })

  // Sign admin tokens directly (same logic as adminRoutes POST /login)
  const ADMIN_SESSION_HOURS = 2
  const superAdminJwt = jwt.sign(
    { adminUserId: adminA.id, role: 'PLATFORM_SUPER_ADMIN' },
    adminSecret,
    { expiresIn: `${ADMIN_SESSION_HOURS}h` }
  )
  const adminUserAJwt = jwt.sign(
    { adminUserId: adminA.id, role: 'PLATFORM_SUPER_ADMIN' },
    adminSecret,
    { expiresIn: `${ADMIN_SESSION_HOURS}h` }
  )
  const adminUserBJwt = jwt.sign(
    { adminUserId: adminB.id, role: 'PLATFORM_SUPER_ADMIN' },
    adminSecret,
    { expiresIn: `${ADMIN_SESSION_HOURS}h` }
  )

  // ── Civilian user — via real auth endpoint ────────────────────────────────
  const { civilianJwt, civilianUserId } = await createCivilianAuth(jwtSecret)

  // ── Special unit account ─────────────────────────────────────────────────
  const { specialUnitJwt, specialUnitId } = await createSpecialUnitAuth(
    prisma, jwtSecret
  )

  // ── Auditor accounts — created in DB, tokens signed directly ─────────────
  const dgcaUser = await prisma.specialUser.upsert({
    where:  { username: 'e2e_dgca_auditor' },
    update: {},
    create: {
      username:           'e2e_dgca_auditor',
      passwordHash:       await bcrypt.hash('DgcaTest!99', bcryptRounds),
      unitName:           'DGCA E2E Test',
      entityCode:         'DGCA',
      unitType:           'UNIT',
      role:               'DGCA_AUDITOR',
      accountStatus:      'ACTIVE',
      credentialsIssuedAt: new Date(),
      forcePasswordChange: false,
      createdBy:          adminA.id,
    }
  })

  const iafUser = await prisma.specialUser.upsert({
    where:  { username: 'e2e_iaf_auditor' },
    update: {},
    create: {
      username:           'e2e_iaf_auditor',
      passwordHash:       await bcrypt.hash('IafTest!99', bcryptRounds),
      unitName:           'IAF E2E Test',
      entityCode:         'IAF',
      unitType:           'SQUADRON',
      role:               'IAF_AUDITOR',
      accountStatus:      'ACTIVE',
      credentialsIssuedAt: new Date(),
      forcePasswordChange: false,
      createdBy:          adminA.id,
    }
  })

  const dgcaAuditorJwt = jwt.sign(
    { userId: dgcaUser.id, userType: 'SPECIAL', entityCode: 'DGCA', role: 'DGCA_AUDITOR' },
    jwtSecret,
    { expiresIn: '12h' }
  )

  const iafAuditorJwt = jwt.sign(
    { userId: iafUser.id, userType: 'SPECIAL', entityCode: 'IAF', role: 'IAF_AUDITOR' },
    jwtSecret,
    { expiresIn: '12h' }
  )

  return {
    civilianJwt,
    civilianUserId,
    specialUnitJwt,
    specialUnitId,
    superAdminJwt,
    adminUserAJwt,
    adminUserBJwt,
    dgcaAuditorJwt,
    iafAuditorJwt,
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function createCivilianAuth(
  jwtSecret: string
): Promise<{ civilianJwt: string; civilianUserId: string }> {

  // Register
  const initRes = await request
    .post('/api/auth/civilian/register/initiate')
    .set(V4_HEADER)
    .send({
      email:        `e2e_pilot_${Date.now()}@jads-test.dev`,
      mobileNumber: '+919800000001',
    })

  if (initRes.status !== 200) {
    throw new Error(`Civilian register/initiate failed: ${initRes.status} ${JSON.stringify(initRes.body)}`)
  }

  const completeRes = await request
    .post('/api/auth/civilian/register/complete')
    .set(V4_HEADER)
    .send({
      userId:     initRes.body.userId,
      emailOtp:   '000000',
      mobileOtp:  '000000',
      aadhaarUid: '999900000001',
      aadhaarOtp: '000000',
    })

  if (completeRes.status !== 201) {
    throw new Error(`Civilian register/complete failed: ${completeRes.status}`)
  }

  // Login
  const loginInit = await request
    .post('/api/auth/civilian/login/initiate')
    .set(V4_HEADER)
    .send({ mobileNumber: '+919800000001' })

  const loginComplete = await request
    .post('/api/auth/civilian/login/complete')
    .set(V4_HEADER)
    .send({ userId: loginInit.body.userId, otp: '000000' })

  if (!loginComplete.body.accessToken) {
    throw new Error('Civilian login failed — no accessToken returned')
  }

  return {
    civilianJwt:    loginComplete.body.accessToken,
    civilianUserId: initRes.body.userId,
  }
}

async function createSpecialUnitAuth(
  prisma: PrismaClient,
  jwtSecret: string
): Promise<{ specialUnitJwt: string; specialUnitId: string }> {

  const bcryptRounds = 10
  const password     = 'SpecialUnit!99'
  const user         = await prisma.specialUser.upsert({
    where:  { username: 'e2e_iaf_45sqn' },
    update: {},
    create: {
      username:            'e2e_iaf_45sqn',
      passwordHash:        await bcrypt.hash(password, bcryptRounds),
      unitName:            '45 Squadron IAF (E2E)',
      entityCode:          'IAF',
      unitType:            'SQUADRON',
      role:                'DRONE_OPERATOR',
      accountStatus:       'ACTIVE',
      credentialsIssuedAt: new Date(),
      forcePasswordChange: false,
      createdBy:           'bootstrap',
    }
  })

  const loginRes = await request
    .post('/api/auth/special/login')
    .set(V4_HEADER)
    .send({ username: 'e2e_iaf_45sqn', password })

  if (!loginRes.body.accessToken) {
    throw new Error(`Special unit login failed: ${JSON.stringify(loginRes.body)}`)
  }

  return {
    specialUnitJwt: loginRes.body.accessToken,
    specialUnitId:  user.id,
  }
}

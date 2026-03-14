import express              from 'express'
import jwt                  from 'jsonwebtoken'
import { CivilianAuthService }   from '../services/CivilianAuthService'
import { SpecialUserAuthService } from '../services/SpecialUserAuthService'
import { UINVerificationService } from '../services/UINVerificationService'
import { DigitalSkyAdapterStub }  from '../adapters/stubs/DigitalSkyAdapterStub'
import { requireAuth }           from '../middleware/authMiddleware'
import { authLoginRateLimit }    from '../middleware/rateLimiter'
import { serializeForJson }      from '../utils/bigintSerializer'
import { createServiceLogger }   from '../logger'
import { env }                   from '../env'
import { USER_SESSION_HOURS }    from '../constants'
import { prisma }                from '../lib/prisma'

const router          = express.Router()
const civilianAuth    = new CivilianAuthService(prisma)
const specialAuth     = new SpecialUserAuthService(prisma)
const dsAdapter       = new DigitalSkyAdapterStub()
const uinVerification = new UINVerificationService(prisma, dsAdapter)
const log             = createServiceLogger('AuthRoutes')

// ── Civilian registration ─────────────────────────────────────────────────────

// POST /api/auth/civilian/register/initiate
router.post('/civilian/register/initiate', async (req, res) => {
  try {
    const { email, mobileNumber, role, credentialDomain, issuingAuthority, pilotLicenceNumber, uinNumber } = req.body
    if (!email || !mobileNumber || !role || !credentialDomain || !issuingAuthority) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', required: ['email','mobileNumber','role','credentialDomain','issuingAuthority'] })
      return
    }
    const result = await civilianAuth.initiateRegistration({ email, mobileNumber, role, credentialDomain, issuingAuthority, pilotLicenceNumber, uinNumber })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'REGISTRATION_FAILED'
    res.status(code === 'EMAIL_OR_MOBILE_ALREADY_REGISTERED' ? 409 : 400).json({ error: code })
  }
})

// POST /api/auth/civilian/register/complete  (verify OTP + Aadhaar in one step)
router.post('/civilian/register/complete', async (req, res) => {
  try {
    const { userId, emailOtp, mobileOtp, aadhaarUid, aadhaarOtp } = req.body
    if (!userId) { res.status(400).json({ error: 'MISSING_USER_ID' }); return }

    if (emailOtp)  await civilianAuth.verifyEmailOtp(userId, emailOtp)
    if (mobileOtp) await civilianAuth.verifyMobileOtp(userId, mobileOtp)
    if (aadhaarUid && aadhaarOtp) {
      await civilianAuth.verifyAadhaarOtp(userId, aadhaarUid, 'stub-txn', aadhaarOtp)
    }
    res.status(201).json({ success: true, userId })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'REGISTER_COMPLETE_FAILED' })
  }
})

// POST /api/auth/verify-email (legacy — keep for existing clients)
router.post('/verify-email', async (req, res) => {
  try {
    const { userId, otp } = req.body
    if (!userId || !otp) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    const result = await civilianAuth.verifyEmailOtp(userId, otp)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'VERIFY_EMAIL_FAILED' })
  }
})

// POST /api/auth/verify-mobile
router.post('/verify-mobile', async (req, res) => {
  try {
    const { userId, otp } = req.body
    if (!userId || !otp) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    const result = await civilianAuth.verifyMobileOtp(userId, otp)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'VERIFY_MOBILE_FAILED' })
  }
})

// POST /api/auth/aadhaar/initiate
router.post('/aadhaar/initiate', async (req, res) => {
  try {
    const { userId, aadhaarNumber } = req.body
    if (!userId || !aadhaarNumber) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    if (!/^\d{12}$/.test(aadhaarNumber)) {
      res.status(400).json({ error: 'AADHAAR_FORMAT_INVALID', message: 'Must be exactly 12 digits' })
      return
    }
    const result = await civilianAuth.initiateAadhaarVerification(userId, aadhaarNumber)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'AADHAAR_INITIATE_FAILED' })
  }
})

// POST /api/auth/aadhaar/verify
router.post('/aadhaar/verify', async (req, res) => {
  try {
    const { userId, aadhaarNumber, transactionId, otp } = req.body
    if (!userId || !aadhaarNumber || !transactionId || !otp) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return
    }
    if (!/^\d{12}$/.test(aadhaarNumber)) { res.status(400).json({ error: 'AADHAAR_FORMAT_INVALID' }); return }
    await civilianAuth.verifyAadhaarOtp(userId, aadhaarNumber, transactionId, otp)
    res.json({ success: true })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'AADHAAR_VERIFY_FAILED' })
  }
})

// ── Civilian login (OTP-based) ────────────────────────────────────────────────

// POST /api/auth/civilian/login/initiate
router.post('/civilian/login/initiate', authLoginRateLimit, async (req, res) => {
  try {
    const { emailOrMobile, mobileNumber } = req.body
    const identifier = emailOrMobile ?? mobileNumber
    if (!identifier) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    const result = await civilianAuth.initiateLogin(identifier)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    const code   = e instanceof Error ? e.message : 'LOGIN_INITIATE_FAILED'
    const status = code === 'USER_NOT_FOUND' ? 404 : code.startsWith('ACCOUNT_') ? 403 : 400
    res.status(status).json({ error: code })
  }
})

// POST /api/auth/civilian/login/complete
router.post('/civilian/login/complete', authLoginRateLimit, async (req, res) => {
  try {
    const { userId, otp } = req.body
    if (!userId || !otp) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    const result = await civilianAuth.completeLogin(userId, otp, req.ip ?? 'unknown')
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'LOGIN_FAILED' })
  }
})

// Legacy paths — redirect to canonical endpoints
router.post('/login/initiate',  (req, res) => { res.redirect(307, '/api/auth/civilian/login/initiate') })
router.post('/login/complete',  (req, res) => { res.redirect(307, '/api/auth/civilian/login/complete') })

// ── Civilian reverification ───────────────────────────────────────────────────

router.post('/reverify/initiate', requireAuth, async (req, res) => {
  try {
    const { aadhaarNumber } = req.body
    if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
      res.status(400).json({ error: 'AADHAAR_FORMAT_INVALID' }); return
    }
    const result = await civilianAuth.initiateReverification(req.auth!.userId, aadhaarNumber)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'REVERIFY_INITIATE_FAILED' })
  }
})

router.post('/reverify/complete', requireAuth, async (req, res) => {
  try {
    const { aadhaarNumber, transactionId, otp } = req.body
    await civilianAuth.completeReverification(req.auth!.userId, aadhaarNumber, transactionId, otp)
    res.json({ success: true, message: 'Aadhaar reverification complete.' })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'REVERIFY_FAILED' })
  }
})

// ── Special user (unit account) — username + password, NO OTP ────────────────

// POST /api/auth/special/login
// Single-step. Username + password. No two-step. No OTP.
router.post('/special/login', authLoginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ error: 'MISSING_CREDENTIALS', required: ['username','password'] })
      return
    }
    const result = await specialAuth.login(username, password, req.ip ?? 'unknown')
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'SPECIAL_LOGIN_FAILED'
    // 401 for wrong creds — same code for wrong user OR wrong password (don't reveal which)
    const status = code === 'INVALID_CREDENTIALS' ? 401
                 : code.startsWith('ACCOUNT_') ? 403
                 : 400
    res.status(status).json({ error: code })
  }
})

// POST /api/auth/special/password/change
// Required on first login (forcePasswordChange = true)
router.post('/special/password/change', requireAuth, async (req, res) => {
  try {
    if (req.auth?.userType !== 'SPECIAL') {
      res.status(403).json({ error: 'FORBIDDEN' }); return
    }
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return
    }
    await specialAuth.changePassword(req.auth!.userId, oldPassword, newPassword)
    res.json({ success: true, message: 'Password changed. Please log in again.' })
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'PASSWORD_CHANGE_FAILED' })
  }
})

// DEPRECATED — kept to return helpful error for old clients using two-step special login
router.post('/special/login/initiate', (_req, res) => {
  res.status(410).json({
    error: 'ENDPOINT_DEPRECATED',
    message: 'Special user auth has changed. Use POST /api/auth/special/login with username + password.',
    newEndpoint: '/api/auth/special/login',
  })
})
router.post('/special/login/complete', (_req, res) => {
  res.status(410).json({
    error: 'ENDPOINT_DEPRECATED',
    message: 'Special user auth has changed. Use POST /api/auth/special/login with username + password.',
    newEndpoint: '/api/auth/special/login',
  })
})

// ── Profile ───────────────────────────────────────────────────────────────────

// GET /api/auth/me — never returns full Aadhaar number
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { userId, userType, entityCode } = req.auth!

    if (userType === 'CIVILIAN') {
      const user = await prisma.civilianUser.findUnique({
        where:  { id: userId },
        select: {
          id: true, email: true, mobileNumber: true, role: true,
          credentialDomain: true, issuingAuthority: true,
          accountStatus: true, verificationStatus: true,
          aadhaarLast4: true, aadhaarNextDueAt: true,
          emailVerifiedAt: true, mobileVerifiedAt: true, aadhaarVerifiedAt: true,
          pilotLicenceNumber: true, uinNumber: true, lastLoginAt: true,
        }
      })
      res.json(serializeForJson({ success: true, user, userType }))

    } else {
      // Special unit account — return unit info, not individual PII
      const user = await prisma.specialUser.findUnique({
        where:  { id: userId },
        select: {
          id: true, username: true, unitName: true, entityCode: true,
          unitType: true, baseLocation: true, role: true,
          credentialDomain: true, issuingAuthority: true,
          accountStatus: true, forcePasswordChange: true,
          credentialsIssuedAt: true, lastLoginAt: true,
        }
      })
      res.json(serializeForJson({ success: true, user, userType, entityCode }))
    }
  } catch (e: unknown) {
    log.error('profile_fetch_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'PROFILE_FETCH_FAILED' })
  }
})

// ── Drone operator login via UIN (DS-14) ─────────────────────────────────────
// Single-step login — no OTP needed because Digital Sky already verified identity.
// POST /api/auth/drone/login
// Body: { uinNumber: string } OR { email: string, uinNumber: string }
router.post('/drone/login', authLoginRateLimit, async (req, res) => {
  try {
    const { uinNumber, email } = req.body as { uinNumber?: string; email?: string }

    if (!uinNumber || typeof uinNumber !== 'string' || uinNumber.trim().length === 0) {
      res.status(400).json({ error: 'MISSING_UIN', detail: 'uinNumber is required' })
      return
    }

    const uin = uinNumber.trim()

    // Step a: Verify UIN against Digital Sky
    const verification = await uinVerification.verifyUIN(uin)
    if (!verification.valid) {
      res.status(401).json({
        error: 'UIN_NOT_VERIFIED',
        detail: verification.advisory ?? `UIN '${uin}' not verified on Digital Sky`,
      })
      return
    }

    // Step b: Find or create CivilianUser linked to this UIN
    let user = await prisma.civilianUser.findFirst({
      where: { uinNumber: uin },
    })

    if (!user) {
      // Create minimal user — verified via Digital Sky
      user = await prisma.civilianUser.create({
        data: {
          role:                'DRONE_OPERATOR',
          credentialDomain:    'DRONE',
          issuingAuthority:    'DIGITAL_SKY',
          verificationStatus:  'VERIFIED',
          accountStatus:       'ACTIVE',
          uinNumber:           uin,
          email:               email ?? null,
        },
      })
      log.info('drone_operator_created_via_uin', { data: { userId: user.id, uin } })
    }

    // Step c: Issue JWT
    const token = jwt.sign(
      {
        userId:           user.id,
        role:             user.role,
        userType:         'CIVILIAN',
        credentialDomain: user.credentialDomain,
      },
      env.JWT_SECRET,
      { expiresIn: `${USER_SESSION_HOURS}h` }
    )
    const expiresAt = new Date(Date.now() + USER_SESSION_HOURS * 3600000).toISOString()

    // Update last login
    await prisma.civilianUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorType:    'CIVILIAN_USER',
        actorId:      user.id,
        actorRole:    user.role,
        action:       'drone_operator_uin_login',
        resourceType: 'user',
        resourceId:   user.id,
        ipAddress:    req.ip ?? 'unknown',
        detailJson:   JSON.stringify({
          uin,
          source: verification.source,
          droneCategory: verification.droneCategory,
          sessionExpiry: expiresAt,
        }),
      },
    })

    log.info('drone_operator_login_complete', { data: { userId: user.id, uin, source: verification.source } })

    res.json({
      accessToken:   token,
      expiresAt,
      operatorId:    verification.operatorId,
      uinNumber:     uin,
      droneCategory: verification.droneCategory,
      uaopValid:     verification.uaopValid,
    })
  } catch (e: unknown) {
    log.error('drone_login_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'DRONE_LOGIN_FAILED' })
  }
})

export default router

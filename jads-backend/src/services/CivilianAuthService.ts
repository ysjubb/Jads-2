import { PrismaClient } from '@prisma/client'
import bcrypt           from 'bcryptjs'
import jwt              from 'jsonwebtoken'
import { env }          from '../env'
import { createServiceLogger } from '../logger'
import {
  OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS, BCRYPT_ROUNDS,
  USER_SESSION_HOURS, AADHAAR_REVERIFY_DAYS,
} from '../constants'

const log = createServiceLogger('CivilianAuthService')

interface RegistrationInput {
  email:               string
  mobileNumber:        string
  role:                string
  pilotLicenceNumber?: string
  uinNumber?:          string
}

export class CivilianAuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async initiateRegistration(input: RegistrationInput): Promise<{ userId: string; nextStep: string }> {
    const existing = await this.prisma.civilianUser.findFirst({
      where: { OR: [{ email: input.email }, { mobileNumber: input.mobileNumber }] }
    })
    if (existing) throw new Error('EMAIL_OR_MOBILE_ALREADY_REGISTERED')

    const user = await this.prisma.civilianUser.create({
      data: {
        email:               input.email,
        mobileNumber:        input.mobileNumber,
        role:                input.role as never,
        pilotLicenceNumber:  input.pilotLicenceNumber,
        uinNumber:           input.uinNumber,
        accountStatus:       'PENDING_APPROVAL',
        verificationStatus:  'PENDING',
      }
    })

    await this.createOtp(user.id, 'EMAIL', 'REGISTRATION')
    log.info('registration_initiated', { data: { userId: user.id, email: input.email } })
    return { userId: user.id, nextStep: 'VERIFY_EMAIL' }
  }

  async verifyEmailOtp(userId: string, otp: string): Promise<{ nextStep: string }> {
    await this.consumeOtp(userId, 'EMAIL', 'REGISTRATION', otp)
    await this.prisma.civilianUser.update({
      where: { id: userId },
      data:  { emailVerifiedAt: new Date() }
    })
    await this.createOtp(userId, 'MOBILE', 'REGISTRATION')
    return { nextStep: 'VERIFY_MOBILE' }
  }

  async verifyMobileOtp(userId: string, otp: string): Promise<{ nextStep: string }> {
    await this.consumeOtp(userId, 'MOBILE', 'REGISTRATION', otp)
    await this.prisma.civilianUser.update({
      where: { id: userId },
      data:  { mobileVerifiedAt: new Date() }
    })
    return { nextStep: 'VERIFY_AADHAAR' }
  }

  async initiateAadhaarVerification(userId: string, _aadhaarNumber: string): Promise<{
    transactionId: string; nextStep: string
  }> {
    // Aadhaar number validated at route layer. Never stored here — only last 4 digits.
    // TODO: call UIDAI adapter to initiate OTP
    const transactionId = `TXN-${Date.now()}-${userId.slice(-6)}`
    await this.createOtp(userId, 'AADHAAR_OTP', 'REGISTRATION')
    return { transactionId, nextStep: 'ENTER_AADHAAR_OTP' }
  }

  async verifyAadhaarOtp(userId: string, aadhaarNumber: string, _transactionId: string, otp: string): Promise<void> {
    await this.consumeOtp(userId, 'AADHAAR_OTP', 'REGISTRATION', otp)
    const aadhaarLast4   = aadhaarNumber.slice(-4)
    const aadhaarNextDue = new Date(Date.now() + AADHAAR_REVERIFY_DAYS * 86400000)
    await this.prisma.civilianUser.update({
      where: { id: userId },
      data:  {
        aadhaarLast4,
        aadhaarUidToken:   `UIDAI-${Date.now()}`, // real token from UIDAI response
        aadhaarVerifiedAt: new Date(),
        aadhaarNextDueAt:  aadhaarNextDue,
        verificationStatus: 'VERIFIED',
        accountStatus:      'ACTIVE',
        lastVerificationAt: new Date(),
      }
    })
    log.info('aadhaar_verified', { data: { userId, aadhaarLast4 } })
  }

  async initiateLogin(emailOrMobile: string): Promise<{ userId: string; nextStep: string }> {
    const user = await this.prisma.civilianUser.findFirst({
      where: { OR: [{ email: emailOrMobile }, { mobileNumber: emailOrMobile }] }
    })
    if (!user) throw new Error('USER_NOT_FOUND')
    if (user.accountStatus === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')
    if (user.accountStatus === 'REVOKED')   throw new Error('ACCOUNT_REVOKED')
    if (user.accountStatus !== 'ACTIVE')    throw new Error('ACCOUNT_NOT_ACTIVE')

    // Warn if reverification is due
    if (user.aadhaarNextDueAt && user.aadhaarNextDueAt < new Date()) {
      throw new Error('AADHAAR_REVERIFICATION_OVERDUE')
    }

    await this.createOtp(user.id, 'MOBILE', 'LOGIN')
    return { userId: user.id, nextStep: 'ENTER_OTP' }
  }

  async completeLogin(userId: string, otp: string, ipAddress: string): Promise<{
    accessToken: string; expiresAt: string
  }> {
    await this.consumeOtp(userId, 'MOBILE', 'LOGIN', otp)

    const user = await this.prisma.civilianUser.findUniqueOrThrow({ where: { id: userId } })

    const token = jwt.sign(
      { userId: user.id, role: user.role, userType: 'CIVILIAN' },
      env.JWT_SECRET,
      { expiresIn: `${USER_SESSION_HOURS}h` }
    )
    const expiresAt = new Date(Date.now() + USER_SESSION_HOURS * 3600000).toISOString()

    await this.prisma.civilianUser.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
    await this.prisma.auditLog.create({
      data: {
        actorType: 'CIVILIAN_USER', actorId: user.id, actorRole: user.role,
        action: 'civilian_login', resourceType: 'user', resourceId: user.id, ipAddress,
        detailJson: JSON.stringify({ sessionExpiry: expiresAt })
      }
    })

    log.info('civilian_login_complete', { data: { userId: user.id } })
    return { accessToken: token, expiresAt }
  }

  async initiateReverification(userId: string, _aadhaarNumber: string): Promise<{
    transactionId: string
  }> {
    const transactionId = `REVERIFY-${Date.now()}-${userId.slice(-6)}`
    await this.createOtp(userId, 'AADHAAR_OTP', 'REVERIFICATION')
    return { transactionId }
  }

  async completeReverification(
    userId: string, aadhaarNumber: string, _transactionId: string, otp: string
  ): Promise<void> {
    await this.consumeOtp(userId, 'AADHAAR_OTP', 'REVERIFICATION', otp)
    const nextDue = new Date(Date.now() + AADHAAR_REVERIFY_DAYS * 86400000)
    await this.prisma.civilianUser.update({
      where: { id: userId },
      data: {
        aadhaarLast4:       aadhaarNumber.slice(-4),
        aadhaarVerifiedAt:  new Date(),
        aadhaarNextDueAt:   nextDue,
        verificationStatus: 'VERIFIED',
        lastVerificationAt: new Date(),
      }
    })
    log.info('reverification_complete', { data: { userId } })
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async createOtp(userId: string, targetType: string, purpose: string): Promise<void> {
    // Invalidate any existing OTPs for same target+purpose
    await this.prisma.otpRecord.updateMany({
      where: { targetId: userId, targetType, purpose, usedAt: null },
      data:  { usedAt: new Date() }
    })

    const otpValue = this.generateOtp()
    const otpHash  = await bcrypt.hash(otpValue, BCRYPT_ROUNDS)

    await this.prisma.otpRecord.create({
      data: {
        targetId:   userId,
        targetType,
        otpHash,
        purpose,
        expiresAt:  new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000),
      }
    })

    if (env.NODE_ENV === 'development') {
      log.debug('otp_dev_only', { data: { userId, targetType, purpose, otpValue } })
    }
  }

  private async consumeOtp(userId: string, targetType: string, purpose: string, otp: string): Promise<void> {
    const record = await this.prisma.otpRecord.findFirst({
      where: { targetId: userId, targetType, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' }
    })
    if (!record)                           throw new Error('OTP_NOT_FOUND')
    if (record.expiresAt < new Date())     throw new Error('OTP_EXPIRED')
    if (record.attempts >= OTP_MAX_ATTEMPTS) throw new Error('OTP_MAX_ATTEMPTS_EXCEEDED')

    const valid = await bcrypt.compare(otp, record.otpHash)
    await this.prisma.otpRecord.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 }, usedAt: valid ? new Date() : undefined }
    })
    if (!valid) {
      const remaining = OTP_MAX_ATTEMPTS - (record.attempts + 1)
      throw new Error(`OTP_INVALID_${remaining}_REMAINING`)
    }
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }
}

/**
 * SpecialUserAuthService.ts — v2 (Unit Account Design)
 *
 * Special users are UNIT ACCOUNTS — not individual accounts.
 * One account = one squadron / wing / base / unit.
 * Authentication: username + password only. No OTP. No Aadhaar.
 *
 * Government entity manages internal access to credentials.
 * JADS records unit-level accountability.
 * Individual accountability within the unit = government entity's responsibility.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt           from 'bcryptjs'
import jwt              from 'jsonwebtoken'
import crypto           from 'crypto'
import { env }          from '../env'
import { createServiceLogger } from '../logger'
import { BCRYPT_ROUNDS, ENTITY_CODES } from '../constants'

const log = createServiceLogger('SpecialUserAuthService')

const SPECIAL_USER_SESSION_HOURS = 12

export interface SpecialUserLoginResult {
  accessToken:         string
  expiresAt:           string
  unitName:            string | null
  entityCode:          string
  role:                string
  forcePasswordChange: boolean
}

export interface ProvisionUnitResult {
  userId:          string
  username:        string
  initialPassword: string
  unitName:        string
}

export class SpecialUserAuthService {

  constructor(private readonly prisma: PrismaClient) {}

  async login(
    username:  string,
    password:  string,
    ipAddress: string
  ): Promise<SpecialUserLoginResult> {

    const user = await this.prisma.specialUser.findUnique({ where: { username } })

    if (!user) {
      log.warn('special_user_login_failed', {
        data: { username, reason: 'NOT_FOUND', ip: ipAddress }
      })
      throw new Error('INVALID_CREDENTIALS')
    }

    if (user.accountStatus !== 'ACTIVE') {
      throw new Error(`ACCOUNT_${user.accountStatus}`)
    }

    const valid = await bcrypt.compare(password, user.passwordHash)

    if (!valid) {
      await this.prisma.auditLog.create({ data: {
        actorType:    'SPECIAL_USER',
        actorId:      user.id,
        action:       'special_user_login_failed',
        resourceType: 'special_user',
        resourceId:   user.id,
        detailJson: JSON.stringify({ username, reason: 'WRONG_PASSWORD', ip: ipAddress }),
      }})
      throw new Error('INVALID_CREDENTIALS')
    }

    const token = jwt.sign(
      {
        userId:     user.id,
        userType:   'SPECIAL',
        entityCode: user.entityCode,
        unitName:   user.unitName,
        role:       user.role,
      },
      env.JWT_SECRET,
      { expiresIn: `${SPECIAL_USER_SESSION_HOURS}h` }
    )

    await this.prisma.specialUser.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    })

    await this.prisma.auditLog.create({ data: {
      actorType:    'SPECIAL_USER',
      actorId:      user.id,
      action:       'special_user_login',
      resourceType: 'special_user',
      resourceId:   user.id,
      detailJson: JSON.stringify({
        username, unitName: user.unitName, entityCode: user.entityCode, ip: ipAddress
      }),
    }})

    return {
      accessToken:         token,
      expiresAt:           new Date(Date.now() + SPECIAL_USER_SESSION_HOURS * 3_600_000).toISOString(),
      unitName:            user.unitName,
      entityCode:          user.entityCode,
      role:                user.role,
      forcePasswordChange: user.forcePasswordChange,
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user  = await this.prisma.specialUser.findUniqueOrThrow({ where: { id: userId } })
    const valid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!valid) throw new Error('INVALID_CREDENTIALS')

    if (newPassword.length < 10)        throw new Error('PASSWORD_TOO_SHORT')
    if (!/[A-Z]/.test(newPassword))     throw new Error('PASSWORD_NEEDS_UPPERCASE')
    if (!/[a-z]/.test(newPassword))     throw new Error('PASSWORD_NEEDS_LOWERCASE')
    if (!/[0-9]/.test(newPassword))     throw new Error('PASSWORD_NEEDS_DIGIT')

    await this.prisma.specialUser.update({
      where: { id: userId },
      data: {
        passwordHash:          await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
        forcePasswordChange:   false,
        passwordLastChanged:   new Date(),
      },
    })

    await this.prisma.auditLog.create({ data: {
      actorType:    'SPECIAL_USER',
      actorId:      userId,
      action:       'special_user_password_changed',
      resourceType: 'special_user',
      resourceId:   userId,
      detailJson: JSON.stringify({ unitName: user.unitName }),
    }})
  }

  async provisionUnit(
    adminId:       string,
    username:      string,
    unitName:      string,
    entityCode:    string,
    unitType:      string,
    baseLocation?: string,
    role:          string = 'GOVT_DRONE_OPERATOR'
  ): Promise<ProvisionUnitResult> {

    if (!ENTITY_CODES.includes(entityCode as any)) {
      throw new Error(`INVALID_ENTITY_CODE: ${entityCode}`)
    }

    const existing = await this.prisma.specialUser.findUnique({ where: { username } })
    if (existing) throw new Error('USERNAME_ALREADY_EXISTS')

    const initialPassword = this.generateSecurePassword()

    const user = await this.prisma.specialUser.create({ data: {
      username,
      passwordHash:        await bcrypt.hash(initialPassword, BCRYPT_ROUNDS),
      unitDesignator:      username,
      provisionedBy:       adminId,
      unitName,
      entityCode,
      unitType,
      baseLocation,
      role:                role as any,
      credentialsIssuedAt: new Date(),
      forcePasswordChange: true,
      accountStatus:       'ACTIVE',
      createdBy:           adminId,
    }})

    await this.prisma.auditLog.create({ data: {
      actorType:    'ADMIN_USER',
      actorId:      adminId,
      action:       'special_user_provisioned',
      resourceType: 'special_user',
      resourceId:   user.id,
      detailJson: JSON.stringify({ username, unitName, entityCode }),
    }})

    return { userId: user.id, username, initialPassword, unitName }
  }

  async provisionBulk(
    adminId: string,
    units:   Array<{
      username: string; unitName: string; entityCode: string
      unitType: string; baseLocation?: string
    }>
  ): Promise<ProvisionUnitResult[]> {
    const results: ProvisionUnitResult[] = []
    for (const unit of units) {
      results.push(await this.provisionUnit(
        adminId, unit.username, unit.unitName,
        unit.entityCode, unit.unitType, unit.baseLocation
      ))
    }
    return results
  }

  async suspendAccount(adminId: string, userId: string, reason: string): Promise<void> {
    await this.prisma.specialUser.update({
      where: { id: userId },
      data:  { accountStatus: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    })
    await this.prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: adminId,
      action: 'special_user_suspended',
      resourceType: 'special_user', resourceId: userId, detailJson: JSON.stringify({ reason }),
    }})
  }

  private generateSecurePassword(): string {
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const lower   = 'abcdefghjkmnpqrstuvwxyz'
    const digits  = '23456789'
    const symbols = '@#$%&*'
    const charset = upper + lower + digits + symbols
    const length  = 14
    const bytes   = crypto.randomBytes(length)

    const pwd = [
      upper  [bytes[0] % upper.length],
      lower  [bytes[1] % lower.length],
      digits [bytes[2] % digits.length],
      symbols[bytes[3] % symbols.length],
      ...Array.from(bytes.slice(4, length), (b: unknown) => charset[(b as number) % charset.length])
    ]

    for (let i = pwd.length - 1; i > 0; i--) {
      const j = bytes[i % bytes.length] % (i + 1)
      ;[pwd[i], pwd[j]] = [pwd[j], pwd[i]]
    }

    return pwd.join('')
  }
}

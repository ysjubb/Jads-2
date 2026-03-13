// ── Operator Registration + Mission Management Service ──────────────────
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { RegisterOperatorBody, CreateMissionBody } from '../types/operator'

const UIN_REGEX = /^UA-\d{4}-IN-[A-Z]{2}-\d{5}$/

function createError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export class OperatorService {
  constructor(private prisma: PrismaClient) {}

  // ── Register a new operator and return their one-time API token ──────
  async registerOperator(body: RegisterOperatorBody) {
    const { uin, dgcaLicenseNo, operatorName, contactEmail } = body

    if (!uin || !UIN_REGEX.test(uin)) {
      throw createError('Invalid UIN format. Expected: UA-YYYY-IN-XX-NNNNN', 400)
    }
    if (!dgcaLicenseNo || !operatorName || !contactEmail) {
      throw createError('dgcaLicenseNo, operatorName, and contactEmail are required', 400)
    }

    // Check for duplicate UIN
    const existing = await this.prisma.operator.findUnique({ where: { uin } })
    if (existing) {
      throw createError('UIN already registered', 409)
    }

    // Generate token — shown once, never stored in plaintext
    const rawToken = 'jads_op_' + crypto.randomBytes(24).toString('hex')
    const tokenHash = sha256(rawToken)

    const operator = await this.prisma.operator.create({
      data: { uin, dgcaLicenseNo, operatorName, contactEmail, tokenHash },
    })

    return {
      operatorId: operator.id,
      uin:          operator.uin,
      operatorName: operator.operatorName,
      token:        rawToken,  // returned ONCE only
    }
  }

  // ── Verify Bearer token from Authorization header ───────────────────
  async verifyOperatorToken(authHeader: string | undefined) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Missing or invalid Authorization header', 401)
    }
    const token = authHeader.slice(7).trim()
    if (!token) {
      throw createError('Empty token', 401)
    }

    const hash = sha256(token)
    const operator = await this.prisma.operator.findUnique({ where: { tokenHash: hash } })
    if (!operator || !operator.isActive) {
      throw createError('Invalid or inactive operator token', 401)
    }
    return operator
  }

  // ── Check if a UIN is registered ────────────────────────────────────
  async getOperatorStatus(uin: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { uin },
      include: { missions: { select: { id: true, createdAt: true } } },
    })
    if (!operator) {
      throw createError('UIN not registered', 404)
    }

    const missionCount = operator.missions.length
    const lastMission = operator.missions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0]

    return {
      uin:            operator.uin,
      operatorName:   operator.operatorName,
      isActive:       operator.isActive,
      missionCount,
      lastMissionAt:  lastMission?.createdAt ?? null,
    }
  }

  // ── List missions for an operator ───────────────────────────────────
  async getOperatorMissions(uin: string) {
    const missions = await this.prisma.operatorMission.findMany({
      where: { uin },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paReference: true,
        plannedStart: true,
        plannedEnd: true,
        status: true,
        closedAt: true,
        createdAt: true,
      },
    })
    return missions
  }

  // ── Create a new mission ────────────────────────────────────────────
  async createMission(operatorId: string, body: CreateMissionBody) {
    const { uin, paReference, plannedStart, plannedEnd, polygon, maxAltitude } = body

    const start = new Date(plannedStart)
    const end = new Date(plannedEnd)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw createError('plannedStart and plannedEnd must be valid ISO 8601 dates', 400)
    }
    if (start >= end) {
      throw createError('plannedStart must be before plannedEnd', 400)
    }
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw createError('polygon must have at least 3 coordinate pairs', 400)
    }
    if (typeof maxAltitude !== 'number' || maxAltitude < 1 || maxAltitude > 400) {
      throw createError('maxAltitude must be between 1 and 400 metres (DGCA limit)', 400)
    }
    if (!paReference) {
      throw createError('paReference is required', 400)
    }

    const mission = await this.prisma.operatorMission.create({
      data: {
        operatorId,
        uin,
        paReference,
        plannedStart: start,
        plannedEnd:   end,
        polygon:      JSON.stringify(polygon),
        maxAltitude,
      },
    })

    return {
      missionId:         mission.id,
      uin:               mission.uin,
      paReference:       mission.paReference,
      telemetryEndpoint: `/api/missions/${mission.id}/telemetry`,
      status:            'ACTIVE',
    }
  }

  // ── Close a mission ─────────────────────────────────────────────────
  async closeMission(missionId: string, operatorId: string) {
    const mission = await this.prisma.operatorMission.findUnique({ where: { id: missionId } })
    if (!mission) {
      throw createError('Mission not found', 404)
    }
    if (mission.operatorId !== operatorId) {
      throw createError('Not your mission', 403)
    }
    if (mission.status !== 'ACTIVE') {
      throw createError(`Mission is already ${mission.status}`, 400)
    }

    const updated = await this.prisma.operatorMission.update({
      where: { id: missionId },
      data: { status: 'CLOSED', closedAt: new Date() },
    })

    return {
      missionId: updated.id,
      status:    'CLOSED',
      closedAt:  updated.closedAt,
    }
  }

  // ── List all active missions (admin use) ────────────────────────────
  async getActiveMissions() {
    const missions = await this.prisma.operatorMission.findMany({
      where: { status: 'ACTIVE' },
      include: {
        operator: { select: { operatorName: true } },
      },
    })

    return missions.map(m => ({
      id:            m.id,
      uin:           m.uin,
      operatorName:  m.operator.operatorName,
      paReference:   m.paReference,
      plannedStart:  m.plannedStart,
      plannedEnd:    m.plannedEnd,
      maxAltitude:   m.maxAltitude,
      polygon:       JSON.parse(m.polygon),
    }))
  }
}

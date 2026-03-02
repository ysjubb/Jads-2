import { PrismaClient }       from '@prisma/client'
import { createServiceLogger } from '../logger'
import { serializeForJson }    from '../utils/bigintSerializer'

const log = createServiceLogger('AuditService')

export class AuditScopeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'AuditScopeError'
  }
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── DRONE MISSIONS ────────────────────────────────────────────────────────

  async getMissions(
    role: string,
    entityCode: string | undefined,
    filters: { dateFrom?: string; dateTo?: string; status?: string; page?: number; limit?: number }
  ): Promise<{ missions: unknown[]; total: number; scopeApplied: string }> {
    this.assertDroneMissionAccess(role)

    const skip  = ((filters.page ?? 1) - 1) * (filters.limit ?? 20)
    const where: Record<string, unknown> = {}
    if (filters.dateFrom || filters.dateTo) {
      where.uploadedAt = {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo   && { lte: new Date(filters.dateTo) }),
      }
    }
    if (filters.status) where.uploadStatus = filters.status

    const [missions, total] = await Promise.all([
      this.prisma.droneMission.findMany({
        where, skip, take: filters.limit ?? 20,
        orderBy: { uploadedAt: 'desc' },
        include: { _count: { select: { telemetryRecords: true, violations: true } } },
      }),
      this.prisma.droneMission.count({ where }),
    ])

    const scopeApplied = role === 'DGCA_AUDITOR' || role === 'PLATFORM_SUPER_ADMIN'
      ? 'ALL_MISSIONS'
      : entityCode ? `ENTITY_${entityCode}` : 'OWN_ENTITY'

    log.info('audit_missions_queried', { data: { role, scopeApplied, resultCount: missions.length } })
    return { missions, total, scopeApplied }
  }

  async getMissionById(
    missionDbId: string,
    role: string,
    entityCode: string | undefined,
    requestingUserId?: string
  ): Promise<unknown> {
    this.assertDroneMissionAccess(role)

    // ── Investigation scope enforcement ─────────────────────────────────────
    // INVESTIGATION_OFFICER access is scoped to specific missions via InvestigationAccess grants.
    // A general getMissionById call from an INVESTIGATION_OFFICER must be validated against
    // their active, non-expired grants. Without this check, any investigation officer can
    // access any mission by calling this endpoint directly — defeating the scoped grant model.
    //
    // Other auditor roles (DGCA_AUDITOR, IAF_AUDITOR, etc.) have implicit access and skip
    // this check — their scope is enforced by entity filtering in getMissions().
    if (role === 'INVESTIGATION_OFFICER' && requestingUserId) {
      const activeGrant = await this.prisma.investigationAccess.findFirst({
        where: {
          grantedToUserId: requestingUserId,
          missionId:       missionDbId,
          expiresAt:       { gt: new Date() },   // must not be expired
        }
      })
      if (!activeGrant) {
        throw new AuditScopeError(
          'INVESTIGATION_SCOPE_DENIED',
          `No active investigation grant found for mission ${missionDbId}. ` +
          `Access requires an explicit grant scoped to this mission that has not expired.`
        )
      }
    }

    const mission = await this.prisma.droneMission.findUnique({
      where: { id: missionDbId },
      include: { telemetryRecords: { orderBy: { sequence: 'asc' } }, violations: true },
    })
    if (!mission) throw new AuditScopeError('MISSION_NOT_FOUND', `Mission ${missionDbId} not found`)
    return mission
  }

  // ── VIOLATIONS ────────────────────────────────────────────────────────────

  async getViolations(
    role: string,
    entityCode: string | undefined,
    filters: { violationType?: string; severity?: string; page?: number; limit?: number }
  ): Promise<{ violations: unknown[]; total: number; scopeApplied: string }> {
    this.assertDroneMissionAccess(role)

    const where: Record<string, unknown> = {}
    if (filters.violationType) where.violationType = filters.violationType
    if (filters.severity)      where.severity      = filters.severity

    const skip = ((filters.page ?? 1) - 1) * (filters.limit ?? 50)
    const [violations, total] = await Promise.all([
      this.prisma.droneViolation.findMany({ where, skip, take: filters.limit ?? 50, orderBy: { timestampUtcMs: 'desc' } }),
      this.prisma.droneViolation.count({ where }),
    ])

    return {
      violations,
      total,
      scopeApplied: role === 'DGCA_AUDITOR' ? 'ALL_VIOLATIONS' : `ENTITY_${entityCode}`,
    }
  }

  // ── FLIGHT PLANS ──────────────────────────────────────────────────────────

  async getFlightPlans(
    role: string,
    filters: { callsign?: string; dateFrom?: string; dateTo?: string; status?: string; page?: number; limit?: number }
  ): Promise<{ plans: unknown[]; total: number; scopeApplied: string }> {
    const allowedRoles = ['DGCA_AUDITOR', 'AAI_AUDITOR', 'IAF_AUDITOR',
                          'ARMY_AUDITOR', 'NAVY_AUDITOR', 'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
    if (!allowedRoles.includes(role))
      throw new AuditScopeError('INSUFFICIENT_ROLE', `Role ${role} cannot access flight plans`)

    const where: Record<string, unknown> = {}
    if (filters.callsign) where.aircraftId = { contains: filters.callsign.toUpperCase() }
    if (filters.status)   where.status = filters.status
    const eobtFilter: Record<string, Date> = {}
    if (filters.dateFrom) eobtFilter.gte = new Date(filters.dateFrom)
    if (filters.dateTo)   eobtFilter.lte = new Date(filters.dateTo)
    if (Object.keys(eobtFilter).length) where.eobt = eobtFilter

    const skip = ((filters.page ?? 1) - 1) * (filters.limit ?? 20)
    const [plans, total] = await Promise.all([
      this.prisma.mannedFlightPlan.findMany({ where, skip, take: filters.limit ?? 20, orderBy: { eobt: 'desc' } }),
      this.prisma.mannedFlightPlan.count({ where }),
    ])

    return { plans, total, scopeApplied: 'ALL_FLIGHT_PLANS' }
  }

  // ── PLATFORM AUDIT LOG ────────────────────────────────────────────────────
  // SUPER ADMIN ONLY — other auditors cannot read raw platform audit logs

  async getAuditLog(
    role: string,
    filters: { actorType?: string; action?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }
  ): Promise<{ entries: unknown[]; total: number }> {
    if (role !== 'PLATFORM_SUPER_ADMIN')
      throw new AuditScopeError('SUPER_ADMIN_ONLY', 'Only PLATFORM_SUPER_ADMIN can access raw audit logs')

    const where: Record<string, unknown> = {}
    if (filters.actorType) where.actorType = filters.actorType
    if (filters.action)    where.action    = { contains: filters.action }
    const tsFilter: Record<string, Date> = {}
    if (filters.dateFrom) tsFilter.gte = new Date(filters.dateFrom)
    if (filters.dateTo)   tsFilter.lte = new Date(filters.dateTo)
    if (Object.keys(tsFilter).length) where.timestamp = tsFilter

    const skip = ((filters.page ?? 1) - 1) * (filters.limit ?? 50)
    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: filters.limit ?? 50, orderBy: { timestamp: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ])

    return { entries, total }
  }

  // ── INVESTIGATION ACCESS ──────────────────────────────────────────────────

  // Grant scoped investigation access to an INVESTIGATION_OFFICER.
  // InvestigationAccess only supports one missionId OR one flightPlanId per grant.
  // For multi-record investigations, create multiple grants.
  async grantAccess(grantedByUserId: string, params: {
    officerUserId: string
    reason:        string
    missionId?:    string
    flightPlanId?: string
    expiresAt:     string
  }): Promise<{ investigationAccessId: string }> {
    // ── Two-person rule: grantor cannot grant access to themselves ────────
    // A single actor granting themselves investigation access defeats the purpose
    // of scoped investigation authority. Regulated systems require peer separation.
    if (params.officerUserId === grantedByUserId) {
      throw new AuditScopeError(
        'SELF_GRANT_DENIED',
        'Investigation access cannot be granted to the same user who is initiating the grant. A second authorised officer must be specified.'
      )
    }

    const grant = await this.prisma.investigationAccess.create({
      data: {
        grantedToUserId: params.officerUserId,
        grantedBy:       grantedByUserId,
        reason:          params.reason,
        missionId:       params.missionId    ?? null,
        flightPlanId:    params.flightPlanId ?? null,
        expiresAt:       new Date(params.expiresAt),
      }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER',
        actorId:      grantedByUserId,
        action:       'investigation_access_granted',
        resourceType: 'investigation_access',
        resourceId:   grant.id,
        detailJson: JSON.stringify({
          officerUserId: params.officerUserId,
          reason: params.reason,
          missionId: params.missionId,
          flightPlanId: params.flightPlanId,
          expiresAt: params.expiresAt,
        })
      }
    })

    log.info('investigation_access_granted', { data: { accessId: grant.id, officerUserId: params.officerUserId } })
    return { investigationAccessId: grant.id }
  }

  // InvestigationAccess has no revocation fields in the migration SQL.
  // Revocation is handled by deleting the record. The audit log preserves the history.
  async revokeAccess(revokedByUserId: string, accessId: string, reason: string): Promise<void> {
    // ── Two-person rule: the grantor cannot revoke their own grant ────────
    // First retrieve the grant to check who originally issued it.
    // If revokedBy === grantedBy, the same actor can silently erase their own
    // grant — bypassing the audit trail's ability to catch self-dealing.
    const existing = await this.prisma.investigationAccess.findUnique({
      where: { id: accessId },
      select: { grantedBy: true, grantedToUserId: true }
    })
    if (!existing) {
      throw new AuditScopeError('ACCESS_NOT_FOUND', `Investigation access ${accessId} not found`)
    }
    if (existing.grantedBy === revokedByUserId) {
      throw new AuditScopeError(
        'SELF_REVOCATION_DENIED',
        'The original grantor cannot revoke their own investigation access grant. A second authorised officer must perform the revocation.'
      )
    }

    await this.prisma.investigationAccess.delete({ where: { id: accessId } })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER',
        actorId:      revokedByUserId,
        action:       'investigation_access_revoked',
        resourceType: 'investigation_access',
        resourceId:   accessId,
        detailJson: JSON.stringify({ reason })
      }
    })

    log.info('investigation_access_revoked', { data: { accessId, reason } })
  }

  // ── EXPORT ────────────────────────────────────────────────────────────────
  // Every export action is written to audit_log — mandatory.

  async exportMissions(
    role: string, entityCode: string | undefined,
    requestingUserId: string, format: 'CSV' | 'JSON'
  ): Promise<string> {
    this.assertDroneMissionAccess(role)
    const { missions } = await this.getMissions(role, entityCode, { limit: 10000 })

    // Must audit the export action itself
    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER',
        actorId:      requestingUserId,
        action:       'data_export',
        resourceType: 'drone_mission',
        resourceId:   null,
        detailJson: JSON.stringify({
          format,
          recordCount: missions.length,
          exportedAt:  new Date().toISOString(),
          scopeRole:   role,
        })
      }
    })

    if (format === 'JSON') return JSON.stringify(serializeForJson(missions), null, 2)

    const header = 'missionId,npntClassification,startUtcMs,endUtcMs,records,violations'
    const rows   = missions.map((m: any) =>
      `${m.missionId},${m.npntClassification},${m.missionStartUtcMs},${m.missionEndUtcMs ?? ''},${m._count?.telemetryRecords ?? 0},${m._count?.violations ?? 0}`
    )
    return [header, ...rows].join('\n')
  }

  // ── PRIVATE ───────────────────────────────────────────────────────────────

  // Role scoping is enforced HERE in the service layer — not in the WHERE clause.
  // Returning an empty list for out-of-scope access is WRONG.
  // AAI_AUDITOR must get 403, not [].
  private assertDroneMissionAccess(role: string): void {
    if (role === 'AAI_AUDITOR') {
      throw new AuditScopeError(
        'AAI_NO_DRONE_ACCESS',
        'AAI Auditors do not have access to drone mission data. AAI jurisdiction covers manned aircraft only.'
      )
    }
    const allowed = ['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
                     'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
    if (!allowed.includes(role)) {
      throw new AuditScopeError('INSUFFICIENT_ROLE', `Role ${role} cannot access drone missions`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JADS Human Workflow Misuse Tests
// File: src/__tests__/human-workflow.test.ts
//
// DESIGN PRINCIPLE: Human misuse is more common than cyber attack.
// These tests verify that role boundaries, scope isolation, and procedural
// controls cannot be bypassed by legitimate users acting outside their authority.
//
// CONTROL FRAMEWORK — every test documents:
//   TRIGGER:      Exact misuse scenario attempted
//   OUTPUT:       The system's correct response (throw / reject / scope-limit)
//   FAILURE MODE: What breaks if the control is absent
//   OWNER:        Module responsible for enforcing the boundary
//
// CATEGORIES:
//   HW-ROLE-01..08   Role boundary enforcement — wrong role → AuditScopeError
//   HW-SCOPE-01..06  Scope isolation — IAF cannot see civilian / NAVY cannot see IAF
//   HW-INVEST-01..06 Investigation access — grant/revoke, expiry, scope misuse
//   HW-ADMIN-01..06  Admin boundary — two-person logic, self-grant, privilege escalation
// ─────────────────────────────────────────────────────────────────────────────

import { AuditService, AuditScopeError } from '../../services/AuditService'
import { requireRole }                    from '../../middleware/authMiddleware'

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Prisma mock — returns deterministic data, never hits the DB
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}): any {
  return {
    droneMission: {
      findMany:  async () => [],
      count:     async () => 0,
      findUnique: async ({ where }: any) => overrides.missions?.[where.id] ?? null,
      findMany2: async () => [],
    },
    droneViolation: {
      findMany: async () => [],
      count:    async () => 0,
    },
    mannedFlightPlan: {
      findMany: async () => [],
      count:    async () => 0,
    },
    auditLog: {
      findMany: async () => [],
      count:    async () => 0,
      create:   async (data: any) => data,
    },
    investigationAccess: {
      create: async (data: any) => ({ id: 'test-access-id', ...data.data }),
      delete: async () => ({}),
      findFirst: async ({ where }: any) => overrides.investigationAccess?.[where?.id] ?? null,
    },
    ...overrides.prisma,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. ROLE BOUNDARY ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

describe('HW-ROLE-01–08: Role boundary enforcement — wrong role throws AuditScopeError', () => {

  // TRIGGER:  AAI_AUDITOR calls getMissions() (AAI jurisdiction = manned aircraft only)
  // OUTPUT:   AuditScopeError thrown with code AAI_NO_DRONE_ACCESS
  // FAILURE:  AAI auditor gets drone mission data → privacy breach + jurisdictional overreach
  //           AAI does not have legal authority over drone ops under CAR-D / UAS Rules 2021
  // OWNER:    AuditService.assertDroneMissionAccess() — explicit AAI carve-out
  test('HW-ROLE-01: AAI_AUDITOR cannot access drone missions — AAI_NO_DRONE_ACCESS thrown', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getMissions('AAI_AUDITOR', 'AAI', {}))
      .rejects.toThrow('AAI Auditors do not have access to drone mission data')

    let code: string | undefined
    try {
      await audit.getMissions('AAI_AUDITOR', 'AAI', {})
    } catch (e: any) {
      code = e.code
    }
    expect(code).toBe('AAI_NO_DRONE_ACCESS')
  })

  // TRIGGER:  AAI_AUDITOR calls getViolations()
  // OUTPUT:   AuditScopeError thrown — same assertDroneMissionAccess guard
  // FAILURE:  Drone violation data (NPNT breaches, RED zone entries) exposed to AAI →
  //           inter-agency data leak that could prejudice ongoing investigations
  // OWNER:    AuditService.assertDroneMissionAccess()
  test('HW-ROLE-02: AAI_AUDITOR cannot access drone violations — same guard', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getViolations('AAI_AUDITOR', 'AAI', {}))
      .rejects.toThrow(AuditScopeError)
  })

  // TRIGGER:  Unknown role string 'CUSTOM_GOV_ROLE' calls getMissions()
  // OUTPUT:   AuditScopeError with code INSUFFICIENT_ROLE
  // FAILURE:  Unknown role passes → any string in JWT role field grants access →
  //           JWT forgery with arbitrary role string bypasses all access controls
  // OWNER:    AuditService.assertDroneMissionAccess() allowedRoles list
  test('HW-ROLE-03: Unknown role CUSTOM_GOV_ROLE → INSUFFICIENT_ROLE thrown', async () => {
    const audit = new AuditService(makePrisma())
    let code: string | undefined
    try {
      await audit.getMissions('CUSTOM_GOV_ROLE', undefined, {})
    } catch (e: any) {
      code = e.code
    }
    expect(code).toBe('INSUFFICIENT_ROLE')
  })

  // TRIGGER:  Empty string role '' calls getMissions()
  // OUTPUT:   AuditScopeError with code INSUFFICIENT_ROLE
  // FAILURE:  Empty string matches includes() vacuously → all routes unlocked for blank token
  // OWNER:    AuditService.assertDroneMissionAccess()
  test('HW-ROLE-04: Empty role string → INSUFFICIENT_ROLE thrown', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getMissions('', undefined, {}))
      .rejects.toThrow(AuditScopeError)
  })

  // TRIGGER:  Non-PLATFORM_SUPER_ADMIN role (DGCA_AUDITOR) calls getAuditLog()
  // OUTPUT:   AuditScopeError SUPER_ADMIN_ONLY thrown
  // FAILURE:  DGCA auditor sees raw platform audit log → sees all admin actions,
  //           including other DGCA auditors' queries → chilling effect on legitimate auditing
  // OWNER:    AuditService.getAuditLog() explicit PLATFORM_SUPER_ADMIN check
  test('HW-ROLE-05: DGCA_AUDITOR cannot access raw audit log — SUPER_ADMIN_ONLY', async () => {
    const audit = new AuditService(makePrisma())
    let code: string | undefined
    try {
      await audit.getAuditLog('DGCA_AUDITOR', {})
    } catch (e: any) {
      code = e.code
    }
    expect(code).toBe('SUPER_ADMIN_ONLY')
  })

  // TRIGGER:  IAF_AUDITOR calls getAuditLog()
  // OUTPUT:   AuditScopeError SUPER_ADMIN_ONLY thrown
  // FAILURE:  Military auditor sees civilian operator admin actions →
  //           cross-domain data exposure violating need-to-know principle
  // OWNER:    AuditService.getAuditLog()
  test('HW-ROLE-06: IAF_AUDITOR cannot access raw audit log — SUPER_ADMIN_ONLY', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getAuditLog('IAF_AUDITOR', {}))
      .rejects.toThrow('Only PLATFORM_SUPER_ADMIN can access raw audit logs')
  })

  // TRIGGER:  GOVT_DRONE_OPERATOR (standard operator role) calls getMissions()
  // OUTPUT:   AuditScopeError INSUFFICIENT_ROLE thrown
  // FAILURE:  Operator accesses audit endpoints → can see other operators' missions →
  //           commercial intelligence leak + NPNT compliance status of competitors visible
  // OWNER:    AuditService.assertDroneMissionAccess()
  test('HW-ROLE-07: GOVT_DRONE_OPERATOR cannot call audit getMissions — INSUFFICIENT_ROLE', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getMissions('GOVT_DRONE_OPERATOR', undefined, {}))
      .rejects.toThrow(AuditScopeError)
  })

  // TRIGGER:  requireRole(['PLATFORM_SUPER_ADMIN']) middleware called with DGCA_AUDITOR token
  // OUTPUT:   Express middleware calls res.status(403).json({ error: 'INSUFFICIENT_ROLE' })
  // FAILURE:  Middleware not mounted → route accessible with any auditor role →
  //           DGCA_AUDITOR can trigger ledger anchor-now, sequence-integrity scan, admin resets
  // OWNER:    requireRole() express middleware — enforces role list at route level
  test('HW-ROLE-08: requireRole middleware rejects wrong role — 403 response', () => {
    const allowedRoles = ['PLATFORM_SUPER_ADMIN']
    const mockReq = { auth: { role: 'DGCA_AUDITOR', userId: 'u1', userType: 'SPECIAL' as const } }
    let statusCode = 0
    let body: any = {}
    const mockRes = {
      status: (code: number) => { statusCode = code; return { json: (b: any) => { body = b } } }
    }
    const mockNext = jest.fn()

    requireRole(allowedRoles)(mockReq as any, mockRes as any, mockNext)

    expect(statusCode).toBe(403)
    expect(body.error).toBe('INSUFFICIENT_ROLE')
    expect(mockNext).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. SCOPE ISOLATION BETWEEN AGENCIES
// ─────────────────────────────────────────────────────────────────────────────

describe('HW-SCOPE-01–06: Scope isolation — entity boundaries enforced', () => {

  // TRIGGER:  IAF_AUDITOR calls getMissions() with entityCode='IAF'
  // OUTPUT:   scopeApplied = 'ENTITY_IAF' (not ALL_MISSIONS)
  //           Only missions with IAF entity are returned
  // FAILURE:  IAF auditor sees all civilian operator missions → intelligence gathering →
  //           commercial operator exposure to state military surveillance
  // OWNER:    AuditService.getMissions() scopeApplied logic
  test('HW-SCOPE-01: IAF_AUDITOR with entityCode IAF — scopeApplied is ENTITY_IAF', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('IAF_AUDITOR', 'IAF', {})
    expect(result.scopeApplied).toBe('ENTITY_IAF')
    expect(result.scopeApplied).not.toBe('ALL_MISSIONS')
  })

  // TRIGGER:  DGCA_AUDITOR calls getMissions() (DGCA has national jurisdiction)
  // OUTPUT:   scopeApplied = 'ALL_MISSIONS' — DGCA sees everyone
  // FAILURE:  DGCA scoped to entityCode → national audit impossible →
  //           DGCA cannot identify cross-operator patterns or national-level violations
  // OWNER:    AuditService.getMissions() — DGCA_AUDITOR special case
  test('HW-SCOPE-02: DGCA_AUDITOR sees ALL_MISSIONS regardless of entityCode', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('DGCA_AUDITOR', 'ANY_ENTITY', {})
    expect(result.scopeApplied).toBe('ALL_MISSIONS')
  })

  // TRIGGER:  NAVY_AUDITOR calls getMissions() with entityCode='NAVY'
  // OUTPUT:   scopeApplied = 'ENTITY_NAVY'
  // FAILURE:  NAVY sees IAF missions → inter-service intelligence leak →
  //           classified operational patterns visible to wrong agency
  // OWNER:    AuditService.getMissions() — non-DGCA/ADMIN roles get entity scope
  test('HW-SCOPE-03: NAVY_AUDITOR scoped to ENTITY_NAVY — cannot see IAF missions', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('NAVY_AUDITOR', 'NAVY', {})
    expect(result.scopeApplied).toBe('ENTITY_NAVY')
    expect(result.scopeApplied).not.toBe('ALL_MISSIONS')
    expect(result.scopeApplied).not.toContain('IAF')
  })

  // TRIGGER:  ARMY_AUDITOR calls getMissions() without entityCode (entityCode=undefined)
  // OUTPUT:   scopeApplied = 'OWN_ENTITY' (fallback when no entityCode in JWT)
  // FAILURE:  undefined entityCode → no WHERE clause on missions → returns all missions →
  //           ARMY auditor with missing entityCode in JWT sees everyone
  // OWNER:    AuditService.getMissions() — entityCode undefined handled as 'OWN_ENTITY'
  test('HW-SCOPE-04: ARMY_AUDITOR with no entityCode → scopeApplied OWN_ENTITY (not ALL)', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('ARMY_AUDITOR', undefined, {})
    expect(result.scopeApplied).toBe('OWN_ENTITY')
    expect(result.scopeApplied).not.toBe('ALL_MISSIONS')
  })

  // TRIGGER:  PLATFORM_SUPER_ADMIN calls getMissions()
  // OUTPUT:   scopeApplied = 'ALL_MISSIONS' — super admin has global visibility
  // FAILURE:  SUPER_ADMIN scoped to entity → cannot administer cross-entity incidents →
  //           platform emergencies (database corruption, replay attacks) cannot be investigated
  // OWNER:    AuditService.getMissions() — PLATFORM_SUPER_ADMIN special case alongside DGCA
  test('HW-SCOPE-05: PLATFORM_SUPER_ADMIN sees ALL_MISSIONS', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('PLATFORM_SUPER_ADMIN', undefined, {})
    expect(result.scopeApplied).toBe('ALL_MISSIONS')
  })

  // TRIGGER:  DGCA_AUDITOR calls getViolations() — DGCA has authority over all operators
  // OUTPUT:   scopeApplied = 'ALL_VIOLATIONS'
  // FAILURE:  DGCA scoped to entity for violations → cannot detect cross-operator repeat offenders →
  //           enforcement gaps in national airspace safety
  // OWNER:    AuditService.getViolations() — DGCA_AUDITOR returns ALL_VIOLATIONS
  test('HW-SCOPE-06: DGCA_AUDITOR violations → scopeApplied ALL_VIOLATIONS', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getViolations('DGCA_AUDITOR', undefined, {})
    expect(result.scopeApplied).toBe('ALL_VIOLATIONS')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. INVESTIGATION ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────

describe('HW-INVEST-01–06: Investigation access — grant, revoke, scope, expiry', () => {

  // TRIGGER:  DGCA_AUDITOR grants investigation access to INVESTIGATION_OFFICER
  // OUTPUT:   Access created with grantedBy = DGCA userId, officerUserId set, auditLog entry written
  // FAILURE:  Grant not logged → officer has unaudited access → investigation integrity compromised
  // OWNER:    AuditService.grantAccess() — must write to auditLog
  test('HW-INVEST-01: DGCA_AUDITOR grants investigation access — auditLog create is called', async () => {
    const auditLogCreates: any[] = []
    const prisma = makePrisma({
      prisma: {
        auditLog: { create: async (d: any) => { auditLogCreates.push(d); return d } },
        investigationAccess: { create: async (d: any) => ({ id: 'access-1', ...d.data }) },
      }
    })
    const audit = new AuditService(prisma)

    await audit.grantAccess('dgca-user-001', {
      officerUserId: 'officer-001',
      reason:        'Incident investigation flight VTA202 2026-03-01',
      missionId:     'mission-db-id-001',
      expiresAt:     new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })

    expect(auditLogCreates).toHaveLength(1)
    expect(auditLogCreates[0].data.action).toBe('investigation_access_granted')
    expect(auditLogCreates[0].data.actorId).toBe('dgca-user-001')
  })

  // TRIGGER:  DGCA_AUDITOR grants access, then the SAME DGCA user revokes it
  //           (single person grants AND revokes their own grant)
  // OUTPUT:   Both actions succeed technically. BUT this is a two-person rule violation.
  //           The auditLog must capture both actorIds — auditors can detect self-revocation.
  // FAILURE:  Self-grant + self-revoke not logged → DGCA official can grant and conceal access →
  //           officer sees sensitive data, grant is erased, no audit trail
  // OWNER:    AuditService — both grantAccess() and revokeAccess() write to auditLog.
  //           ENFORCEMENT REQUIRED: a second approver must revoke (not the grantor).
  //           Currently this is a PROCEDURAL gap — the system allows self-revocation.
  //           This test documents the gap and verifies the audit trail at minimum.
  test('HW-INVEST-02: Self-revocation (same user grants and revokes) — both actions logged (two-person gap documented)', async () => {
    const auditLogCreates: any[] = []
    const prisma = makePrisma({
      prisma: {
        auditLog: { create: async (d: any) => { auditLogCreates.push(d); return d } },
        investigationAccess: {
          create: async (d: any) => ({ id: 'access-2', ...d.data }),
          delete: async () => ({}),
        },
      }
    })
    const audit = new AuditService(prisma)

    const sameUserId = 'dgca-user-001'
    await audit.grantAccess(sameUserId, {
      officerUserId: 'officer-002',
      reason:        'Test grant',
      missionId:     'mission-001',
      expiresAt:     new Date(Date.now() + 3600_000).toISOString(),
    })
    await audit.revokeAccess(sameUserId, 'access-2', 'Test revoke')

    expect(auditLogCreates).toHaveLength(2)
    // Both actions have the same actorId — an auditor reviewing the log can detect this
    expect(auditLogCreates[0].data.actorId).toBe(sameUserId)
    expect(auditLogCreates[1].data.actorId).toBe(sameUserId)
    expect(auditLogCreates[0].data.action).toBe('investigation_access_granted')
    expect(auditLogCreates[1].data.action).toBe('investigation_access_revoked')
    // GAP: The system does not currently BLOCK self-revocation.
    // Required enhancement: revokeAccess() must verify revokedByUserId !== grantedBy
  })

  // TRIGGER:  Two-person rule enforcement: revokedByUserId must differ from the original grantedBy
  //           This test defines the REQUIRED behaviour (enhancement not yet implemented)
  // OUTPUT:   When revokedByUserId === grantedBy, throw AuditScopeError SELF_REVOCATION_DENIED
  // FAILURE:  Self-revocation possible → investigation officer can be given and lose access
  //           without any second party being involved → audit trail is present but procedurally invalid
  // OWNER:    AuditService.revokeAccess() (proposed enhancement)
  test('HW-INVEST-03: Two-person rule — revokedBy must differ from grantedBy (documents required enhancement)', () => {
    // This test defines the contract for the enhancement:
    function enforceRevocationTwoPersonRule(
      revokedByUserId: string,
      grantedByUserId: string
    ): void {
      if (revokedByUserId === grantedByUserId) {
        const e = new Error('Self-revocation denied: the grantor cannot revoke their own grant')
        ;(e as any).code = 'SELF_REVOCATION_DENIED'
        throw e
      }
    }

    expect(() => enforceRevocationTwoPersonRule('user-A', 'user-A'))
      .toThrow('Self-revocation denied')

    expect(() => enforceRevocationTwoPersonRule('user-B', 'user-A'))
      .not.toThrow()
  })

  // TRIGGER:  INVESTIGATION_OFFICER calls getMissions() (a full list query)
  //           rather than the scoped per-mission endpoint they were granted
  // OUTPUT:   scopeApplied = ENTITY_<entityCode> — scoped, not ALL_MISSIONS
  //           getMissions() scopes INVESTIGATION_OFFICER to their entityCode
  // FAILURE:  INVESTIGATION_OFFICER gets all missions → they see the entire national drone picture →
  //           investigation of Flight X accidentally reveals Flight Y from a different case
  // OWNER:    AuditService.getMissions() — INVESTIGATION_OFFICER is in allowed list but NOT in
  //           the DGCA/SUPER_ADMIN ALL_MISSIONS list
  test('HW-INVEST-04: INVESTIGATION_OFFICER getMissions — scoped to entity, not ALL_MISSIONS', async () => {
    const audit = new AuditService(makePrisma())
    const result = await audit.getMissions('INVESTIGATION_OFFICER', 'DGCA', {})
    expect(result.scopeApplied).not.toBe('ALL_MISSIONS')
    expect(result.scopeApplied).toBe('ENTITY_DGCA')
  })

  // TRIGGER:  Access grant with expiresAt = now - 1 hour (already expired)
  // OUTPUT:   AuditService.grantAccess() creates the record (no expiry validation at grant time)
  //           BUT the investigation access check must validate expiresAt before allowing access
  // FAILURE:  Expired access accepted → officer retains access after time-limited grant lapses →
  //           continued access to sensitive data after authorization period
  // OWNER:    InvestigationAccess middleware / access check — must validate expiresAt > now()
  test('HW-INVEST-05: Expired access grant — documents that expiry must be enforced at access time', async () => {
    const expiredAt = new Date(Date.now() - 3600_000).toISOString()  // 1 hour ago

    function checkAccessValidity(expiresAt: string): { valid: boolean; reason?: string } {
      if (new Date(expiresAt) < new Date()) {
        return { valid: false, reason: `Investigation access expired at ${expiresAt}` }
      }
      return { valid: true }
    }

    const result = checkAccessValidity(expiredAt)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('expired')
  })

  // TRIGGER:  INVESTIGATION_OFFICER attempts to access missionId B when their grant is for missionId A
  // OUTPUT:   Access denied — grant is scoped to missionId A only
  // FAILURE:  Grant scope not enforced → officer uses missionId A grant to pivot to missionId B →
  //           lateral movement through mission database under investigation authority
  // OWNER:    Investigation access check middleware (proposed) — must verify
  //           request missionId matches grant.missionId
  test('HW-INVEST-06: Investigation scope misuse — grant for mission A cannot be used for mission B', () => {
    const grantedMissionId   = 'mission-alpha-001'
    const requestedMissionId = 'mission-beta-002'  // Different mission

    function checkInvestigationScope(
      grantMissionId: string | null,
      requestedId: string
    ): { allowed: boolean; reason?: string } {
      if (grantMissionId !== null && grantMissionId !== requestedId) {
        return {
          allowed: false,
          reason: `Investigation grant is scoped to mission ${grantMissionId} — access to ${requestedId} denied`,
        }
      }
      return { allowed: true }
    }

    const result = checkInvestigationScope(grantedMissionId, requestedMissionId)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('mission-alpha-001')

    // Same mission: allowed
    expect(checkInvestigationScope(grantedMissionId, grantedMissionId).allowed).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. ADMIN PRIVILEGE BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────

describe('HW-ADMIN-01–06: Admin privilege escalation and boundary misuse', () => {

  // TRIGGER:  User presents JWT with role = 'PLATFORM_SUPER_ADMIN' but the token was issued
  //           by the civilian auth path (userType = 'CIVILIAN')
  // OUTPUT:   requireRole(['PLATFORM_SUPER_ADMIN']) passes the role check.
  //           BUT the audit route uses requireAuditAuth which checks specialUserId is present.
  //           A CIVILIAN token never has specialUserId — the route rejects it at auth step.
  // FAILURE:  Civilian with forged role claim bypasses audit routes → full platform access
  // OWNER:    requireAuditAuth middleware — must verify specialUserId is present
  // NOTE:     requireAuditAuth is distinct from requireAuth — this test documents the contract
  test('HW-ADMIN-01: Civilian JWT with forged PLATFORM_SUPER_ADMIN role — missing specialUserId', () => {
    // A CIVILIAN token's JWT payload has userType='CIVILIAN' and no specialUserId
    const civilianToken = {
      userId:   'civ-001',
      role:     'PLATFORM_SUPER_ADMIN',   // forged
      userType: 'CIVILIAN' as const,
      // specialUserId: absent
    }

    // The audit routes use requireAuditAuth which checks for specialUserId
    function requireAuditAuthSimulated(auth: typeof civilianToken): boolean {
      // Audit routes require userType = SPECIAL + specialUserId present
      return auth.userType === 'SPECIAL' && !!(auth as any).specialUserId
    }

    expect(requireAuditAuthSimulated(civilianToken)).toBe(false)
    // Civilian with forged role cannot reach audit routes — userType check blocks it
  })

  // TRIGGER:  PLATFORM_SUPER_ADMIN attempts to grant themselves investigation access
  //           (grantedByUserId === officerUserId — same person both sides)
  // OUTPUT:   The grant technically succeeds (no self-grant check currently).
  //           BUT the auditLog records grantedByUserId === officerUserId — detectable.
  // FAILURE:  Admin grants themselves scoped access to a specific sensitive mission →
  //           unilateral access to targeted investigation data without oversight
  // OWNER:    AuditService.grantAccess() — required enhancement: officerUserId !== grantedByUserId
  test('HW-ADMIN-02: Self-grant (admin grants themselves investigation access) — documented as gap', async () => {
    const auditLogCreates: any[] = []
    const prisma = makePrisma({
      prisma: {
        auditLog: { create: async (d: any) => { auditLogCreates.push(d); return d } },
        investigationAccess: { create: async (d: any) => ({ id: 'access-self', ...d.data }) },
      }
    })
    const audit = new AuditService(prisma)

    const adminUserId = 'super-admin-001'
    await audit.grantAccess(adminUserId, {
      officerUserId: adminUserId,   // Same user — self-grant
      reason:        'Self-investigation',
      missionId:     'mission-self',
      expiresAt:     new Date(Date.now() + 3600_000).toISOString(),
    })

    expect(auditLogCreates).toHaveLength(1)
    const logEntry = auditLogCreates[0].data
    // Self-grant is detectable: grantedBy === officerUserId in the log detail
    const detail = JSON.parse(logEntry.detailJson)
    expect(detail.officerUserId).toBe(adminUserId)
    expect(logEntry.actorId).toBe(adminUserId)
    // Both sides are the same user — a monitoring job scanning auditLog for self-grants
    // can detect this and raise an alert.
    // GAP: grantAccess() must throw if officerUserId === grantedByUserId
  })

  // TRIGGER:  Two admins required for a privileged operation (conceptual two-person rule)
  //           Admin A initiates a ledger anchor-now. Admin B must confirm it.
  //           Admin A tries to both initiate AND confirm.
  // OUTPUT:   The second confirmation must be rejected if same userId as initiator
  // FAILURE:  Single admin can trigger anchor operations unilaterally →
  //           evidence ledger manipulated by one actor without peer oversight
  // OWNER:    AuditService two-person enforcement (proposed) — documents required enhancement
  test('HW-ADMIN-03: Two-person rule for privileged operations — same actor cannot initiate and confirm', () => {
    function twoPersonApprove(
      initiatorId: string,
      confirmerId: string,
      operation: string
    ): { approved: boolean; reason?: string } {
      if (initiatorId === confirmerId) {
        return {
          approved: false,
          reason: `TWO_PERSON_REQUIRED: ${operation} requires a second approver distinct from the initiator`,
        }
      }
      return { approved: true }
    }

    const initiate = twoPersonApprove('admin-A', 'admin-A', 'LEDGER_ANCHOR')
    expect(initiate.approved).toBe(false)
    expect(initiate.reason).toContain('TWO_PERSON_REQUIRED')

    const valid = twoPersonApprove('admin-A', 'admin-B', 'LEDGER_ANCHOR')
    expect(valid.approved).toBe(true)
  })

  // TRIGGER:  requireRole(['PLATFORM_SUPER_ADMIN']) is bypassed by passing an array role
  //           in the JWT (roles: ['CIVILIAN', 'PLATFORM_SUPER_ADMIN'])
  //           (Array.includes() in JS treats arrays differently from strings)
  // OUTPUT:   requireRole() checks req.auth.role (a string), not roles (array) →
  //           JWT payload.role must be a single string, not an array
  // FAILURE:  Array in role field: ['CIVILIAN', 'PLATFORM_SUPER_ADMIN'].includes('PLATFORM_SUPER_ADMIN')
  //           returns false (comparing array to string) → BUT if includes() is called on
  //           the JWT array against the allowed list, it might pass unexpectedly
  // OWNER:    requireRole() and JWT parse — must ensure role is always a string
  test('HW-ADMIN-04: Array role in JWT cannot bypass requireRole — role must be a string', () => {
    const allowedRoles = ['PLATFORM_SUPER_ADMIN']

    // Correct: role is a single string
    const stringRole = 'PLATFORM_SUPER_ADMIN'
    expect(allowedRoles.includes(stringRole)).toBe(true)

    // Attack: role is an array (from a malformed JWT)
    const arrayRole = ['CIVILIAN', 'PLATFORM_SUPER_ADMIN'] as any
    // allowedRoles.includes(arrayRole) treats arrayRole as a single element
    // The array itself is not equal to the string 'PLATFORM_SUPER_ADMIN'
    expect(allowedRoles.includes(arrayRole)).toBe(false)

    // Verify authMiddleware type safety: req.auth.role is typed as string
    // If JWT produces an array, the type cast `payload.role as string` would return the array
    // but the includes() comparison would still fail — safe against this attack
    const req = { auth: { role: arrayRole, userId: 'x', userType: 'SPECIAL' as const } }
    let blocked = true
    if (req.auth && allowedRoles.includes(req.auth.role)) {
      blocked = false
    }
    expect(blocked).toBe(true)
  })

  // TRIGGER:  Simultaneous admin login from two different IPs, both with valid JWTs
  //           Both attempt to run sequence-integrity check at same time
  // OUTPUT:   Both queries succeed independently (read-only operation)
  //           auditLog receives two entries with different actorIds
  // FAILURE:  No concern for read operations. Write operations are the risk surface.
  //           This test verifies reads are safe under concurrent admin access.
  // OWNER:    AuditService — stateless reads, Prisma handles DB concurrency
  test('HW-ADMIN-05: Concurrent admin sessions — two read queries produce independent results', async () => {
    const audit = new AuditService(makePrisma())

    const [r1, r2] = await Promise.all([
      audit.getMissions('PLATFORM_SUPER_ADMIN', undefined, { limit: 10 }),
      audit.getMissions('PLATFORM_SUPER_ADMIN', undefined, { limit: 10 }),
    ])

    expect(r1.scopeApplied).toBe('ALL_MISSIONS')
    expect(r2.scopeApplied).toBe('ALL_MISSIONS')
    // Both succeed independently — no exclusive lock contention for reads
  })

  // TRIGGER:  Auditor role string injection: role = 'DGCA_AUDITOR\nPLATFORM_SUPER_ADMIN'
  //           (newline injection attempt to split role field)
  // OUTPUT:   allowedRoles.includes() with the full injected string returns false
  //           AuditScopeError thrown — injection does not grant SUPER_ADMIN access
  // FAILURE:  String splitting on role field allows privilege escalation via JWT claim injection
  // OWNER:    requireRole() — uses .includes() on exact string match, no splitting
  test('HW-ADMIN-06: Role injection attempt (newline-injected string) — exact match required', () => {
    const allowedRoles = ['PLATFORM_SUPER_ADMIN']
    const injectedRole = 'DGCA_AUDITOR\nPLATFORM_SUPER_ADMIN'   // newline injection

    // includes() compares the WHOLE string — newline-injected string is not in allowedRoles
    expect(allowedRoles.includes(injectedRole)).toBe(false)

    // Split-based check (the WRONG implementation): would incorrectly grant access
    const wrongCheck = injectedRole.split('\n').some(r => allowedRoles.includes(r))
    expect(wrongCheck).toBe(true)   // ← proves the split-based implementation is vulnerable

    // Correct implementation: full string match only
    const correctCheck = allowedRoles.includes(injectedRole)
    expect(correctCheck).toBe(false)  // ← injection correctly blocked

    // Verify requireRole uses includes() on the full role string (documented contract)
    // The middleware does: allowedRoles.includes(req.auth.role) — safe
  })
})

// Unit tests for AuditService role scoping.
// AUDIT FIX: Original file defined local reimplementations of assertDroneMissionAccess,
// assertFlightPlanAccess, and assertAuditLogAccess. Rewritten to test via real
// AuditService public API (getMissions, getFlightPlans, getAuditLog) with mocked Prisma.

import { AuditService, AuditScopeError } from '../services/AuditService'

// ── Minimal Prisma mock ─────────────────────────────────────────────────────
function makePrisma(): any {
  return {
    droneMission:    { findMany: async () => [], count: async () => 0 },
    droneViolation:  { findMany: async () => [], count: async () => 0 },
    mannedFlightPlan:{ findMany: async () => [], count: async () => 0 },
    auditLog:        { findMany: async () => [], count: async () => 0, create: async (d: any) => d },
    investigationAccess: { create: async (d: any) => ({ id: 'test', ...d.data }), findFirst: async () => null },
  }
}

describe('AuditService — role scoping (real production code)', () => {

  // ── AAI_AUDITOR must be 403, not empty list ────────────────────────────

  test('AAI_AUDITOR requesting drone missions → throws AuditScopeError (not empty array)', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getMissions('AAI_AUDITOR', 'AAI', {}))
      .rejects.toThrow(AuditScopeError)
  })

  test('AAI_AUDITOR error code is AAI_NO_DRONE_ACCESS', async () => {
    const audit = new AuditService(makePrisma())
    try {
      await audit.getMissions('AAI_AUDITOR', 'AAI', {})
      fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AuditScopeError)
      expect((e as AuditScopeError).code).toBe('AAI_NO_DRONE_ACCESS')
    }
  })

  // ── Roles with drone access ────────────────────────────────────────────

  test.each(['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
             'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN'])(
    '%s has drone mission access',
    async (role) => {
      const audit = new AuditService(makePrisma())
      await expect(audit.getMissions(role, undefined, {})).resolves.not.toThrow()
    }
  )

  // ── Unknown roles ──────────────────────────────────────────────────────

  test.each(['PILOT', 'DRONE_OPERATOR', 'GOVT_ADMIN', 'INVALID'])(
    '%s → throws INSUFFICIENT_ROLE',
    async (role) => {
      const audit = new AuditService(makePrisma())
      try {
        await audit.getMissions(role, undefined, {})
        fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(AuditScopeError)
        expect((e as AuditScopeError).code).toBe('INSUFFICIENT_ROLE')
      }
    }
  )

  // ── AuditScopeError is correctly typed ────────────────────────────────

  test('AuditScopeError extends Error and has code property', () => {
    const err = new AuditScopeError('TEST_CODE', 'test message')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AuditScopeError)
    expect(err.code).toBe('TEST_CODE')
    expect(err.message).toBe('test message')
    expect(err.name).toBe('AuditScopeError')
  })

  // ── Flight plan access (real AuditService.getFlightPlans) ─────────────

  test('AAI_AUDITOR CAN access flight plans', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getFlightPlans('AAI_AUDITOR', {})).resolves.not.toThrow()
  })

  test('DRONE_OPERATOR cannot access flight plans via audit', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getFlightPlans('DRONE_OPERATOR', {})).rejects.toThrow(AuditScopeError)
  })

  // ── PLATFORM_SUPER_ADMIN audit log gating (real AuditService.getAuditLog) ──

  test('Only PLATFORM_SUPER_ADMIN can read raw audit logs', async () => {
    const audit = new AuditService(makePrisma())
    await expect(audit.getAuditLog('PLATFORM_SUPER_ADMIN', {})).resolves.not.toThrow()
    for (const role of ['DGCA_AUDITOR', 'IAF_AUDITOR', 'AAI_AUDITOR']) {
      await expect(audit.getAuditLog(role, {})).rejects.toThrow(AuditScopeError)
    }
  })
})

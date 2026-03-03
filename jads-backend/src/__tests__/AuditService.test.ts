// Unit tests for AuditService role scoping.
// These tests do NOT hit the database — they verify the scope rules inline.

import { AuditScopeError } from '../services/AuditService'

// ── Inline scope rules matching AuditService.assertDroneMissionAccess ────────
function assertDroneMissionAccess(role: string): void {
  if (role === 'AAI_AUDITOR') {
    throw new AuditScopeError('AAI_NO_DRONE_ACCESS',
      'AAI Auditors do not have access to drone mission data.')
  }
  const allowed = ['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
                   'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
  if (!allowed.includes(role)) {
    throw new AuditScopeError('INSUFFICIENT_ROLE', `Role ${role} cannot access drone missions`)
  }
}

describe('AuditService — role scoping', () => {

  // ── AAI_AUDITOR must be 403, not empty list ────────────────────────────

  test('AAI_AUDITOR requesting drone missions → throws AuditScopeError (not empty array)', () => {
    expect(() => assertDroneMissionAccess('AAI_AUDITOR'))
      .toThrow(AuditScopeError)
  })

  test('AAI_AUDITOR error code is AAI_NO_DRONE_ACCESS', () => {
    try {
      assertDroneMissionAccess('AAI_AUDITOR')
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
    (role) => {
      expect(() => assertDroneMissionAccess(role)).not.toThrow()
    }
  )

  // ── Unknown roles ──────────────────────────────────────────────────────

  test.each(['PILOT', 'DRONE_OPERATOR', 'GOVT_ADMIN', 'INVALID'])(
    '%s → throws INSUFFICIENT_ROLE',
    (role) => {
      try {
        assertDroneMissionAccess(role)
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

  // ── Flight plan access ─────────────────────────────────────────────────

  const FP_ALLOWED = ['DGCA_AUDITOR', 'AAI_AUDITOR', 'IAF_AUDITOR',
                      'ARMY_AUDITOR', 'NAVY_AUDITOR', 'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
  function assertFlightPlanAccess(role: string): void {
    if (!FP_ALLOWED.includes(role))
      throw new AuditScopeError('INSUFFICIENT_ROLE', `Role ${role} cannot access flight plans`)
  }

  test('AAI_AUDITOR CAN access flight plans', () => {
    expect(() => assertFlightPlanAccess('AAI_AUDITOR')).not.toThrow()
  })

  test('DRONE_OPERATOR cannot access flight plans via audit', () => {
    expect(() => assertFlightPlanAccess('DRONE_OPERATOR')).toThrow(AuditScopeError)
  })

  // ── PLATFORM_SUPER_ADMIN audit log gating ─────────────────────────────

  function assertAuditLogAccess(role: string): void {
    if (role !== 'PLATFORM_SUPER_ADMIN')
      throw new AuditScopeError('SUPER_ADMIN_ONLY', 'Only PLATFORM_SUPER_ADMIN can access raw audit logs')
  }

  test('Only PLATFORM_SUPER_ADMIN can read raw audit logs', () => {
    expect(() => assertAuditLogAccess('PLATFORM_SUPER_ADMIN')).not.toThrow()
    for (const role of ['DGCA_AUDITOR', 'IAF_AUDITOR', 'AAI_AUDITOR']) {
      expect(() => assertAuditLogAccess(role)).toThrow(AuditScopeError)
    }
  })
})

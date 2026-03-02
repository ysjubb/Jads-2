/**
 * SpecialUserAuth.test.ts
 *
 * Tests for the unit account design (replaces old JADS-ID OTP tests).
 * SpecialUserIdGenerator tests removed — ID generator is now internal/unused.
 */

import { SpecialUserAuthService } from '../../services/SpecialUserAuthService'

// ── Password generator tests (pure logic — no DB) ────────────────────────────
describe('SpecialUserAuthService — password generation', () => {

  // Access private method for testing via type cast
  const svc = new SpecialUserAuthService({} as any)
  const gen = (svc as any).generateSecurePassword.bind(svc)

  test('Generated password is 14 characters', () => {
    const pw = gen()
    expect(pw.length).toBe(14)
  })

  test('Generated password contains uppercase letter', () => {
    const pw = gen()
    expect(/[A-Z]/.test(pw)).toBe(true)
  })

  test('Generated password contains lowercase letter', () => {
    const pw = gen()
    expect(/[a-z]/.test(pw)).toBe(true)
  })

  test('Generated password contains digit', () => {
    const pw = gen()
    expect(/[0-9]/.test(pw)).toBe(true)
  })

  test('Generated password contains symbol from allowed set', () => {
    const pw = gen()
    expect(/[@#$%&*]/.test(pw)).toBe(true)
  })

  test('Does not contain visually ambiguous characters (0, 1, I, O)', () => {
    // Run 20 generations to reduce false-negative probability
    for (let i = 0; i < 20; i++) {
      const pw = gen()
      expect(pw).not.toMatch(/[0O1Il]/)
    }
  })

  test('Two generated passwords are not identical (randomness check)', () => {
    const passwords = new Set(Array.from({ length: 10 }, () => gen()))
    // All 10 should be unique (probability of collision is astronomically low)
    expect(passwords.size).toBe(10)
  })
})

// ── Password complexity validation tests ─────────────────────────────────────
describe('SpecialUserAuthService — password complexity', () => {

  const svc      = new SpecialUserAuthService({} as any)
  const validate = (pw: string) =>
    (svc as any).validatePasswordComplexity?.call(svc, pw)

  // Only run if validatePasswordComplexity is public/accessible
  if (typeof (svc as any).validatePasswordComplexity === 'function') {
    test('Short password throws PASSWORD_TOO_SHORT', () => {
      expect(() => validate('Short1!')).toThrow('PASSWORD_TOO_SHORT')
    })

    test('No uppercase throws PASSWORD_NEEDS_UPPERCASE', () => {
      expect(() => validate('alllowercase123')).toThrow('PASSWORD_NEEDS_UPPERCASE')
    })

    test('No lowercase throws PASSWORD_NEEDS_LOWERCASE', () => {
      expect(() => validate('ALLUPPERCASE123')).toThrow('PASSWORD_NEEDS_LOWERCASE')
    })

    test('No digit throws PASSWORD_NEEDS_DIGIT', () => {
      expect(() => validate('NoDigitsHere!')).toThrow('PASSWORD_NEEDS_DIGIT')
    })

    test('Valid strong password passes', () => {
      expect(() => validate('ValidPass99!')).not.toThrow()
    })
  }
})

// ── Username pattern sanity ───────────────────────────────────────────────────
describe('Special user username conventions', () => {

  // These are not validated by the service itself (any string is valid)
  // but we document the expected naming convention here

  test('IAF squadron format is recognisable', () => {
    const examples = [
      'IAF-45SQN-JAMNAGAR',
      'IAF-WING1-PALAM',
      'ARMY-AAC-NASIK',
      'BSF-AIR-JAMMU',
    ]
    examples.forEach(u => {
      // Convention: ENTITY-UNIT-LOCATION (3 parts, uppercase)
      const parts = u.split('-')
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(u).toBe(u.toUpperCase())
    })
  })
})

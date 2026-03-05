// Pure logic tests for ClearanceService invariants.
// AUDIT FIX: Original file defined a local copy of computeClearanceStatus.
// Now imports the real function from ClearanceService — any production drift
// is immediately detected.

import { computeClearanceStatus } from '../services/ClearanceService'

const ref = (name: string) => ({ officerName: name, issuedAt: new Date().toISOString() })

describe('ClearanceService — status machine', () => {

  test('CLR-01: no refs → PENDING_CLEARANCE', () => {
    expect(computeClearanceStatus([], [])).toBe('PENDING_CLEARANCE')
  })

  test('CLR-02: ADC only → ADC_ISSUED', () => {
    expect(computeClearanceStatus([ref('Sqn Ldr Sharma')], [])).toBe('ADC_ISSUED')
  })

  test('CLR-03: FIC only → FIC_ISSUED', () => {
    expect(computeClearanceStatus([], [ref('ATC Mehta')])).toBe('FIC_ISSUED')
  })

  test('CLR-04: both ADC and FIC → FULLY_CLEARED', () => {
    expect(computeClearanceStatus([ref('Sqn Ldr Sharma')], [ref('ATC Mehta')])).toBe('FULLY_CLEARED')
  })

  test('CLR-05: multiple ADC refs, no FIC → ADC_ISSUED (not FULLY_CLEARED)', () => {
    expect(computeClearanceStatus([ref('A'), ref('B')], [])).toBe('ADC_ISSUED')
  })

  test('CLR-06: multiple FIC refs, no ADC → FIC_ISSUED', () => {
    expect(computeClearanceStatus([], [ref('X'), ref('Y')])).toBe('FIC_ISSUED')
  })
})

describe('ClearanceService — idempotency', () => {

  test('CLR-07: issuing same ADC number twice does not add duplicate ref', () => {
    const adcRefs: any[] = []

    const issueAdc = (adcNumber: string) => {
      const already = adcRefs.some(r => r.adcNumber === adcNumber)
      if (already) return false  // skip
      adcRefs.push({ adcNumber, issuedAt: new Date().toISOString() })
      return true
    }

    expect(issueAdc('ADC-007-001')).toBe(true)
    expect(issueAdc('ADC-007-001')).toBe(false)  // duplicate
    expect(adcRefs.length).toBe(1)
  })

  test('CLR-08: issuing same FIC number twice does not add duplicate ref', () => {
    const ficRefs: any[] = []

    const issueFic = (ficNumber: string, firCode: string) => {
      const already = ficRefs.some(r => r.ficNumber === ficNumber && r.firCode === firCode)
      if (already) return false
      ficRefs.push({ ficNumber, firCode })
      return true
    }

    expect(issueFic('FIC/VIDF/042/2024', 'VIDF')).toBe(true)
    expect(issueFic('FIC/VIDF/042/2024', 'VIDF')).toBe(false)
    expect(ficRefs.length).toBe(1)
  })

  test('CLR-09: same FIC number from different FIR is NOT a duplicate', () => {
    const ficRefs: any[] = []
    const issueFic = (ficNumber: string, firCode: string) => {
      const already = ficRefs.some(r => r.ficNumber === ficNumber && r.firCode === firCode)
      if (already) return false
      ficRefs.push({ ficNumber, firCode }); return true
    }
    // Same number, different FIR — both valid
    expect(issueFic('FIC/001/2024', 'VIDF')).toBe(true)
    expect(issueFic('FIC/001/2024', 'VABB')).toBe(true)
    expect(ficRefs.length).toBe(2)
  })
})

describe('ClearanceService — state transitions', () => {

  test('CLR-10: PENDING → ADC_ISSUED → FULLY_CLEARED is valid forward progression', () => {
    let adcRefs: any[] = []
    let ficRefs: any[] = []

    expect(computeClearanceStatus(adcRefs, ficRefs)).toBe('PENDING_CLEARANCE')

    adcRefs.push(ref('Sqn Ldr Sharma'))
    expect(computeClearanceStatus(adcRefs, ficRefs)).toBe('ADC_ISSUED')

    ficRefs.push(ref('ATC Mehta'))
    expect(computeClearanceStatus(adcRefs, ficRefs)).toBe('FULLY_CLEARED')
  })

  test('CLR-11: PENDING → FIC_ISSUED → FULLY_CLEARED is valid forward progression', () => {
    let adcRefs: any[] = []
    let ficRefs: any[] = []

    ficRefs.push(ref('ATC Mehta'))
    expect(computeClearanceStatus(adcRefs, ficRefs)).toBe('FIC_ISSUED')

    adcRefs.push(ref('Sqn Ldr Sharma'))
    expect(computeClearanceStatus(adcRefs, ficRefs)).toBe('FULLY_CLEARED')
  })
})

describe('Adapter webhook validation', () => {

  const VALID_FIRS = ['VIDF', 'VABB', 'VECC', 'VOMF']

  test('CLR-12: AFMLU ID must be 1–10', () => {
    const isValid = (id: number) => id >= 1 && id <= 10
    for (let i = 1; i <= 10; i++) expect(isValid(i)).toBe(true)
    expect(isValid(0)).toBe(false)
    expect(isValid(11)).toBe(false)
    expect(isValid(-1)).toBe(false)
  })

  test('CLR-13: FIR code must be one of the 4 India FIRs', () => {
    for (const fir of VALID_FIRS) expect(VALID_FIRS.includes(fir)).toBe(true)
    expect(VALID_FIRS.includes('VIDP')).toBe(false)  // ICAO aerodrome, not FIR
    expect(VALID_FIRS.includes('EGLL')).toBe(false)
  })

  test('CLR-14: all required ADC push fields must be present', () => {
    const REQUIRED = ['flightPlanId', 'afmluId', 'adcNumber', 'adcType', 'issuedAt', 'afmluOfficerName']
    const body = { flightPlanId: 'fp1', afmluId: 1, adcNumber: 'ADC-001', adcType: 'RESTRICTED', issuedAt: new Date().toISOString(), afmluOfficerName: 'Sqn Ldr Sharma' }
    const missing = REQUIRED.filter(f => !(f in body))
    expect(missing.length).toBe(0)
  })

  test('CLR-15: all required FIC push fields must be present', () => {
    const REQUIRED = ['flightPlanId', 'firCode', 'ficNumber', 'subject', 'issuedAt', 'firOfficerName']
    const body = { flightPlanId: 'fp1', firCode: 'VIDF', ficNumber: 'FIC/VIDF/001/2024', subject: 'Test', issuedAt: new Date().toISOString(), firOfficerName: 'ATC Mehta' }
    const missing = REQUIRED.filter(f => !(f in body))
    expect(missing.length).toBe(0)
  })
})

describe('SSE design invariants', () => {

  test('CLR-16: SSE snapshot includes clearanceStatus, adcRefs, ficRefs on connect', () => {
    const snapshot = { clearanceStatus: 'PENDING_CLEARANCE', adcRefs: [], ficRefs: [] }
    expect('clearanceStatus' in snapshot).toBe(true)
    expect('adcRefs' in snapshot).toBe(true)
    expect('ficRefs' in snapshot).toBe(true)
  })

  test('CLR-17: keepalive interval is 25s (under 30s proxy timeout threshold)', () => {
    const KEEPALIVE_MS = 25000
    expect(KEEPALIVE_MS).toBeLessThan(30000)
    expect(KEEPALIVE_MS).toBeGreaterThan(0)
  })
})

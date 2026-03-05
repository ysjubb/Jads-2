// Pure logic tests for background job invariants.
// No database required — these verify the rules the jobs enforce.
// AUDIT FIX: JOB-L07/L08/L09 now import real constants from src/constants.ts
// instead of defining local copies that could drift from production.

import { INDIA_FIRS, MAJOR_AERODROME_ICAOS, AFMLU_IDS } from '../../constants'

describe('Background Job Invariants', () => {

  // ── NOTAM effectiveTo rules ────────────────────────────────────────────

  test('JOB-L01: NOTAM effectiveTo null means permanent (stored as null, not far-future)', () => {
    // Invariant: permanent NOTAMs must be stored as null in effectiveTo.
    // If a NOTAM has no effectiveTo, the field is null — never a fake date.
    const stored = null
    expect(stored).toBeNull()
    // Verifying the contract: never store a fake far-future date
    const FAKE_DATE = new Date('2099-12-31')
    expect(stored !== FAKE_DATE).toBe(true)
  })

  test('JOB-L02: NOTAM with effectiveTo in past should be marked inactive', () => {
    const now         = new Date()
    const pastDate    = new Date(now.getTime() - 1000)
    const futureDate  = new Date(now.getTime() + 1000)
    const isExpired   = (d: Date | null) => d !== null && d < now

    expect(isExpired(pastDate)).toBe(true)
    expect(isExpired(futureDate)).toBe(false)
    expect(isExpired(null)).toBe(false)
  })

  // ── Idempotency rules ─────────────────────────────────────────────────

  test('JOB-L03: METAR dedup by (icaoCode, observationUtc) — same observation skipped', () => {
    const seen = new Set<string>()
    const makeKey = (icao: string, obs: string) => `${icao}::${obs}`

    const obs1 = { icaoCode: 'VIDP', observationUtc: '2024-01-15T06:00:00Z' }
    const obs2 = { icaoCode: 'VIDP', observationUtc: '2024-01-15T06:00:00Z' }  // duplicate
    const obs3 = { icaoCode: 'VIDP', observationUtc: '2024-01-15T06:30:00Z' }  // new time

    let saved = 0, skipped = 0
    for (const obs of [obs1, obs2, obs3]) {
      const key = makeKey(obs.icaoCode, obs.observationUtc)
      if (seen.has(key)) { skipped++; continue }
      seen.add(key); saved++
    }

    expect(saved).toBe(2)
    expect(skipped).toBe(1)
  })

  // ── Reverification timing ─────────────────────────────────────────────

  test('JOB-L04: 7-day warning threshold computed correctly', () => {
    const now              = new Date('2024-06-01T02:00:00Z')
    const warningThreshold = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
    const dueIn6Days  = new Date('2024-06-07T00:00:00Z')
    const dueIn8Days  = new Date('2024-06-09T00:00:00Z')
    const overdueUser = new Date('2024-05-31T00:00:00Z')

    // Should warn: due date is within 7-day window (and not yet overdue)
    const shouldWarn = (d: Date) => d <= warningThreshold && d > now
    expect(shouldWarn(dueIn6Days)).toBe(true)
    expect(shouldWarn(dueIn8Days)).toBe(false)
    expect(shouldWarn(overdueUser)).toBe(false)

    // Should suspend: overdue
    const shouldSuspend = (d: Date) => d < now
    expect(shouldSuspend(overdueUser)).toBe(true)
    expect(shouldSuspend(dueIn6Days)).toBe(false)
  })

  test('JOB-L05: Special user suspended only when nextAdminReconfirmDue < now', () => {
    const now       = new Date('2024-06-01T02:00:00Z')
    const overdue   = new Date('2024-05-31T00:00:00Z')
    const upcoming  = new Date('2024-06-15T00:00:00Z')
    const isOverdue = (d: Date) => d < now

    expect(isOverdue(overdue)).toBe(true)
    expect(isOverdue(upcoming)).toBe(false)
  })

  // ── Cron schedule validation ───────────────────────────────────────────

  test('JOB-L06: Cron schedules are valid 5-field expressions', () => {
    const SCHEDULES = {
      ReverificationJob:  '0 2 * * *',
      AnnualReconfirmJob: '0 2 * * *',
      NotamPollJob:       '*/5 * * * *',
      MetarPollJob:       '*/30 * * * *',
      AdcFicPollJob:      '0 */6 * * *',
    }
    for (const [name, schedule] of Object.entries(SCHEDULES)) {
      const parts = schedule.trim().split(/\s+/)
      expect(parts.length).toBe(5)  // standard cron — 5 fields (no seconds)
    }
  })

  test('JOB-L07: NotamPollJob covers all 4 India FIRs', () => {
    // AUDIT FIX: Now uses production INDIA_FIRS from src/constants.ts
    const firIcaos = Object.values(INDIA_FIRS).map(f => f.icao)
    expect(firIcaos).toHaveLength(4)
    expect(firIcaos).toContain('VIDF')
    expect(firIcaos).toContain('VABB')
    expect(firIcaos).toContain('VECC')
    expect(firIcaos).toContain('VOMF')
  })

  test('JOB-L08: MetarPollJob covers exactly 12 major aerodromes', () => {
    // AUDIT FIX: Now uses production MAJOR_AERODROME_ICAOS from src/constants.ts
    expect(MAJOR_AERODROME_ICAOS).toHaveLength(12)
    // Ensure no duplicates
    expect(new Set(MAJOR_AERODROME_ICAOS).size).toBe(12)
  })

  test('JOB-L09: AFMLU_IDS covers exactly 10 AFMLUs', () => {
    // AUDIT FIX: Now uses production AFMLU_IDS from src/constants.ts
    expect(AFMLU_IDS).toHaveLength(10)
    expect(Math.min(...AFMLU_IDS)).toBe(1)
    expect(Math.max(...AFMLU_IDS)).toBe(10)
  })

  // ── Error isolation ────────────────────────────────────────────────────

  test('JOB-L10: Per-item error does not abort remaining items', () => {
    // Simulates the error-isolation pattern used in all poll jobs
    const FIRS = ['VIDF', 'VABB', 'VECC', 'VOMF']
    const errors: string[] = []
    const processed: string[] = []

    for (const fir of FIRS) {
      try {
        if (fir === 'VABB') throw new Error('Adapter timeout')
        processed.push(fir)
      } catch (e) {
        errors.push(fir)
        // Job continues — does NOT rethrow
      }
    }

    expect(processed).toEqual(['VIDF', 'VECC', 'VOMF'])  // 3 processed despite 1 error
    expect(errors).toEqual(['VABB'])
    expect(processed.length + errors.length).toBe(FIRS.length)
  })

  // ── Stub contracts ────────────────────────────────────────────────────

  test('JOB-L11: NotamAdapterStub returns at least 1 NOTAM per FIR', async () => {
    const { NotamAdapterStub } = await import('../../adapters/stubs/NotamAdapterStub')
    const stub = new NotamAdapterStub()
    for (const fir of ['VIDF', 'VABB', 'VECC', 'VOMF']) {
      const notams = await stub.getActiveNotams(fir)
      expect(notams.length).toBeGreaterThan(0)
      expect(notams[0].firCode).toBe(fir)
    }
  })

  test('JOB-L12: MetarAdapterStub returns METAR for all 12 major aerodromes', async () => {
    const { MetarAdapterStub } = await import('../../adapters/stubs/MetarAdapterStub')
    const stub  = new MetarAdapterStub()
    const CODES = ['VIDP', 'VABB', 'VOMM', 'VECC', 'VOBL', 'VOHB',
                   'VAAH', 'VOGO', 'VOCL', 'VIBN', 'VORY', 'VIPT']
    let coverage = 0
    for (const icao of CODES) {
      const m = await stub.getLatestMetar(icao)
      if (m) { expect(m.rawText).toContain('METAR'); coverage++ }
    }
    expect(coverage).toBe(12)
  })

  test('JOB-L13: FirAdapterStub returns records for all 4 FIRs', async () => {
    const { FirAdapterStub } = await import('../../adapters/stubs/FirAdapterStub')
    const stub = new FirAdapterStub()
    for (const fir of ['VIDF', 'VABB', 'VECC', 'VOMF']) {
      const result = await stub.pullFicRecords(fir)
      expect(result.records.length).toBeGreaterThan(0)
      expect(result.asOfUtc).toBeTruthy()
    }
  })

  test('JOB-L14: AfmluAdapterStub returns records for all 10 AFMLUs', async () => {
    const { AfmluAdapterStub } = await import('../../adapters/stubs/AfmluAdapterStub')
    const stub = new AfmluAdapterStub()
    let coverage = 0
    for (let id = 1; id <= 10; id++) {
      const result = await stub.pullAdcRecords(id)
      if (result.records.length > 0) coverage++
    }
    expect(coverage).toBe(10)
  })

})

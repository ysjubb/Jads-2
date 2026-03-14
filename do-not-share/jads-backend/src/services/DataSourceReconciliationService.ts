/**
 * DataSourceReconciliationService.ts
 *
 * Compares AAI eAIP navaid/waypoint data against Jeppesen navaid data.
 * Flags variances to admin for review. Admin can accept or reject each variance.
 *
 * Used as a fact-checker: AAI eAIP is the authoritative Indian source,
 * Jeppesen is the licensed international source. When both provide data
 * for the same navaid, differences are flagged.
 */

import type { IAAIeAIPAdapter, EAIPNavaid } from '../adapters/interfaces/IAAIeAIPAdapter'
import type { IJeppesenAdapter, JeppesenNavaid } from '../adapters/interfaces/IJeppesenAdapter'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('DataSourceReconciliation')

// ── Types ─────────────────────────────────────────────────────────

export type VarianceType =
  | 'POSITION_MISMATCH'
  | 'FREQUENCY_MISMATCH'
  | 'MISSING_IN_AAI'
  | 'MISSING_IN_JEPPESEN'
  | 'TYPE_MISMATCH'
  | 'NAME_MISMATCH'

export type VarianceStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'
export type VarianceSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface DataSourceVariance {
  varianceId:   string
  dataPoint:    string            // navaid/waypoint identifier
  varianceType: VarianceType
  aaiValue:     string | null     // what AAI eAIP says
  jeppesenValue: string | null    // what Jeppesen says
  severity:     VarianceSeverity
  status:       VarianceStatus
  detectedAt:   string            // ISO 8601
  resolvedAt:   string | null
  resolvedBy:   string | null     // admin user ID
  notes:        string | null
}

export interface ReconciliationReport {
  reportId:      string
  generatedAt:   string
  airacCycle:    string
  totalCompared: number
  matchCount:    number
  varianceCount: number
  variances:     DataSourceVariance[]
}

// ── Service ───────────────────────────────────────────────────────

const INDIA_FIRS = ['VIDF', 'VABB', 'VECC', 'VOMF']

// Position mismatch thresholds (degrees)
const POSITION_THRESHOLD_LOW  = 0.001  // ~110m — below this = match
const POSITION_THRESHOLD_HIGH = 0.01   // ~1.1km — above this = HIGH severity

export class DataSourceReconciliationService {
  private variances = new Map<string, DataSourceVariance>()
  private reports: ReconciliationReport[] = []
  private readonly maxReports = 30

  constructor(
    private readonly eaipAdapter: IAAIeAIPAdapter,
    private readonly jeppesenAdapter: IJeppesenAdapter,
  ) {}

  // ── Core reconciliation ───────────────────────────────────────

  async reconcile(): Promise<ReconciliationReport> {
    const now = new Date().toISOString()
    const newVariances: DataSourceVariance[] = []

    // Collect all navaids from both sources across all FIRs
    const eaipNavaids  = new Map<string, EAIPNavaid>()
    const jeppNavaids  = new Map<string, JeppesenNavaid>()

    for (const fir of INDIA_FIRS) {
      try {
        const eaip = await this.eaipAdapter.getNavaids(fir)
        for (const n of eaip) eaipNavaids.set(n.navaidId.toUpperCase(), n)
      } catch (e) {
        log.error('reconcile_eaip_fetch_failed', { data: { fir, error: e instanceof Error ? e.message : String(e) } })
      }

      try {
        const jepp = await this.jeppesenAdapter.getNavaids(fir)
        for (const n of jepp) jeppNavaids.set(n.navaidId.toUpperCase(), n)
      } catch (e) {
        log.error('reconcile_jeppesen_fetch_failed', { data: { fir, error: e instanceof Error ? e.message : String(e) } })
      }
    }

    let totalCompared = 0
    let matchCount    = 0

    // Compare navaids present in both sources
    const allIds = new Set([...eaipNavaids.keys(), ...jeppNavaids.keys()])

    for (const id of allIds) {
      const eaip = eaipNavaids.get(id)
      const jepp = jeppNavaids.get(id)

      if (eaip && jepp) {
        totalCompared++
        const segmentVariances = this.compareNavaid(id, eaip, jepp, now)
        if (segmentVariances.length === 0) {
          matchCount++
        } else {
          newVariances.push(...segmentVariances)
        }
      } else if (eaip && !jepp) {
        // Present in AAI eAIP but missing from Jeppesen
        newVariances.push({
          varianceId:    `VAR-${id}-MISSING_IN_JEPPESEN`,
          dataPoint:     id,
          varianceType:  'MISSING_IN_JEPPESEN',
          aaiValue:      `${eaip.type} ${eaip.name} @ ${eaip.lat.toFixed(4)},${eaip.lon.toFixed(4)}`,
          jeppesenValue: null,
          severity:      'MEDIUM',
          status:        'PENDING',
          detectedAt:    now,
          resolvedAt:    null,
          resolvedBy:    null,
          notes:         null,
        })
      } else if (!eaip && jepp) {
        // Present in Jeppesen but missing from AAI eAIP
        newVariances.push({
          varianceId:    `VAR-${id}-MISSING_IN_AAI`,
          dataPoint:     id,
          varianceType:  'MISSING_IN_AAI',
          aaiValue:      null,
          jeppesenValue: `${jepp.type} ${jepp.name} @ ${jepp.lat.toFixed(4)},${jepp.lon.toFixed(4)}`,
          severity:      'HIGH',
          status:        'PENDING',
          detectedAt:    now,
          resolvedAt:    null,
          resolvedBy:    null,
          notes:         null,
        })
      }
    }

    // Merge new variances with existing (preserve accepted/rejected status)
    for (const v of newVariances) {
      const existing = this.variances.get(v.varianceId)
      if (existing && existing.status !== 'PENDING') {
        // Keep the resolved status from previous reconciliation
        continue
      }
      this.variances.set(v.varianceId, v)
    }

    // Build report
    const report: ReconciliationReport = {
      reportId:      `RECON-${Date.now()}`,
      generatedAt:   now,
      airacCycle:    '2602',
      totalCompared,
      matchCount,
      varianceCount: newVariances.length,
      variances:     newVariances,
    }

    this.reports.push(report)
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports)
    }

    log.info('reconciliation_complete', {
      data: {
        reportId: report.reportId,
        totalCompared, matchCount,
        varianceCount: newVariances.length,
      }
    })

    return report
  }

  // ── Compare a single navaid pair ──────────────────────────────

  private compareNavaid(id: string, eaip: EAIPNavaid, jepp: JeppesenNavaid, now: string): DataSourceVariance[] {
    const variances: DataSourceVariance[] = []

    // Position check
    const latDelta = Math.abs(eaip.lat - jepp.lat)
    const lonDelta = Math.abs(eaip.lon - jepp.lon)

    if (latDelta > POSITION_THRESHOLD_LOW || lonDelta > POSITION_THRESHOLD_LOW) {
      const maxDelta = Math.max(latDelta, lonDelta)
      variances.push({
        varianceId:    `VAR-${id}-POSITION_MISMATCH`,
        dataPoint:     id,
        varianceType:  'POSITION_MISMATCH',
        aaiValue:      `${eaip.lat.toFixed(4)}, ${eaip.lon.toFixed(4)}`,
        jeppesenValue: `${jepp.lat.toFixed(4)}, ${jepp.lon.toFixed(4)}`,
        severity:      maxDelta > POSITION_THRESHOLD_HIGH ? 'HIGH' : 'MEDIUM',
        status:        'PENDING',
        detectedAt:    now,
        resolvedAt:    null,
        resolvedBy:    null,
        notes:         `Delta: lat=${latDelta.toFixed(6)}°, lon=${lonDelta.toFixed(6)}°`,
      })
    }

    // Frequency check
    const eaipFreq = eaip.frequency
    const jeppFreq = jepp.frequency
    if (eaipFreq && jeppFreq && eaipFreq !== jeppFreq) {
      variances.push({
        varianceId:    `VAR-${id}-FREQUENCY_MISMATCH`,
        dataPoint:     id,
        varianceType:  'FREQUENCY_MISMATCH',
        aaiValue:      eaipFreq,
        jeppesenValue: jeppFreq,
        severity:      'MEDIUM',
        status:        'PENDING',
        detectedAt:    now,
        resolvedAt:    null,
        resolvedBy:    null,
        notes:         null,
      })
    }

    // Type check
    if (eaip.type !== jepp.type) {
      variances.push({
        varianceId:    `VAR-${id}-TYPE_MISMATCH`,
        dataPoint:     id,
        varianceType:  'TYPE_MISMATCH',
        aaiValue:      eaip.type,
        jeppesenValue: jepp.type,
        severity:      'MEDIUM',
        status:        'PENDING',
        detectedAt:    now,
        resolvedAt:    null,
        resolvedBy:    null,
        notes:         null,
      })
    }

    // Name check
    if (eaip.name.toLowerCase() !== jepp.name.toLowerCase()) {
      variances.push({
        varianceId:    `VAR-${id}-NAME_MISMATCH`,
        dataPoint:     id,
        varianceType:  'NAME_MISMATCH',
        aaiValue:      eaip.name,
        jeppesenValue: jepp.name,
        severity:      'LOW',
        status:        'PENDING',
        detectedAt:    now,
        resolvedAt:    null,
        resolvedBy:    null,
        notes:         null,
      })
    }

    return variances
  }

  // ── Variance management (admin actions) ────────────────────────

  acceptVariance(varianceId: string, adminUserId: string, notes?: string): DataSourceVariance | null {
    const v = this.variances.get(varianceId)
    if (!v) return null
    v.status     = 'ACCEPTED'
    v.resolvedAt = new Date().toISOString()
    v.resolvedBy = adminUserId
    if (notes) v.notes = notes
    log.info('variance_accepted', { data: { varianceId, adminUserId } })
    return v
  }

  rejectVariance(varianceId: string, adminUserId: string, notes?: string): DataSourceVariance | null {
    const v = this.variances.get(varianceId)
    if (!v) return null
    v.status     = 'REJECTED'
    v.resolvedAt = new Date().toISOString()
    v.resolvedBy = adminUserId
    if (notes) v.notes = notes
    log.info('variance_rejected', { data: { varianceId, adminUserId } })
    return v
  }

  // ── Queries ────────────────────────────────────────────────────

  getLatestReport(): ReconciliationReport | null {
    return this.reports.length > 0 ? this.reports[this.reports.length - 1] : null
  }

  getReports(): ReconciliationReport[] {
    return [...this.reports]
  }

  getVariances(filter?: { status?: VarianceStatus; severity?: VarianceSeverity }): DataSourceVariance[] {
    let result = [...this.variances.values()]
    if (filter?.status)   result = result.filter(v => v.status === filter.status)
    if (filter?.severity) result = result.filter(v => v.severity === filter.severity)
    return result
  }

  getVariance(varianceId: string): DataSourceVariance | null {
    return this.variances.get(varianceId) ?? null
  }

  getVarianceSummary(): { total: number; pending: number; accepted: number; rejected: number; highSeverity: number } {
    const all = [...this.variances.values()]
    return {
      total:        all.length,
      pending:      all.filter(v => v.status === 'PENDING').length,
      accepted:     all.filter(v => v.status === 'ACCEPTED').length,
      rejected:     all.filter(v => v.status === 'REJECTED').length,
      highSeverity: all.filter(v => v.severity === 'HIGH' && v.status === 'PENDING').length,
    }
  }
}

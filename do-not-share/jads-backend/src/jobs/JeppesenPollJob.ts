// Polls Jeppesen NavData daily at 02:00 UTC.
// @dataFlow ONE_WAY — import only. JADS never pushes data back to Jeppesen.
// Uses IJeppesenAdapter — no direct HTTP calls in this file.
// Upserts charts by chartId and navaids by navaidId.
// One aerodrome/FIR failure does not stop the others.

import cron from 'node-cron'
import { PrismaClient }         from '@prisma/client'
import { JeppesenAdapterStub }  from '../adapters/stubs/JeppesenAdapterStub'
import type { IJeppesenAdapter } from '../adapters/interfaces/IJeppesenAdapter'
import { MAJOR_AERODROME_ICAOS } from '../constants'
import { createServiceLogger }   from '../logger'

const log = createServiceLogger('JeppesenPollJob')

const CRON_SCHEDULE = '0 2 * * *'  // Daily at 02:00 UTC
const INDIA_FIRS    = ['VIDF', 'VABB', 'VECC', 'VOMF']

export class JeppesenPollJob {
  private readonly adapter: IJeppesenAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient, adapter?: IJeppesenAdapter) {
    this.adapter = adapter ?? new JeppesenAdapterStub()
  }

  start(): void {
    log.info('jeppesen_poll_job_starting', {
      data: { schedule: CRON_SCHEDULE, aerodromes: MAJOR_AERODROME_ICAOS.length, firs: INDIA_FIRS.length }
    })
    this.runPoll().catch(e =>
      log.error('jeppesen_poll_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runPoll().catch(e =>
        log.error('jeppesen_poll_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('jeppesen_poll_job_stopped', {})
  }

  async runPoll(): Promise<{ chartsUpserted: number; navaidsUpserted: number }> {
    const now             = new Date()
    let chartsUpserted    = 0
    let navaidsUpserted   = 0

    // Check license status first
    try {
      const license = await this.adapter.getLicenseStatus()
      if (!license.valid) {
        log.warn('jeppesen_license_invalid', { data: { expiresAt: license.expiresAt } })
        return { chartsUpserted: 0, navaidsUpserted: 0 }
      }
    } catch (e) {
      log.error('jeppesen_license_check_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    // ── Charts for each aerodrome ────────────────────────────
    for (const icao of MAJOR_AERODROME_ICAOS) {
      try {
        const charts = await this.adapter.getCharts(icao)

        for (const chart of charts) {
          await this.prisma.jeppesenChart.upsert({
            where:  { chartId: chart.chartId },
            create: {
              chartId:       chart.chartId,
              icaoCode:      chart.icaoCode,
              chartType:     chart.chartType,
              procedureName: chart.procedureName,
              revision:      chart.revision,
              effectiveDate: new Date(chart.effectiveDate),
              expiryDate:    chart.expiryDate ? new Date(chart.expiryDate) : null,
              chartDataUrl:  chart.chartDataUrl,
              waypointsJson: chart.waypointsJson,
              isActive:      true,
              lastFetchedAt: now,
            },
            update: {
              revision:      chart.revision,
              effectiveDate: new Date(chart.effectiveDate),
              expiryDate:    chart.expiryDate ? new Date(chart.expiryDate) : null,
              chartDataUrl:  chart.chartDataUrl,
              waypointsJson: chart.waypointsJson,
              isActive:      true,
              lastFetchedAt: now,
            }
          })
          chartsUpserted++
        }
      } catch (e) {
        log.error('jeppesen_chart_poll_failed', {
          data: { icao, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    // ── Navaids for each FIR ─────────────────────────────────
    for (const fir of INDIA_FIRS) {
      try {
        const navaids = await this.adapter.getNavaids(fir)

        for (const nav of navaids) {
          await this.prisma.navaid.upsert({
            where:  { navaidId: nav.navaidId },
            create: {
              navaidId:      nav.navaidId,
              type:          nav.type,
              name:          nav.name,
              lat:           nav.lat,
              lon:           nav.lon,
              frequency:     nav.frequency,
              declination:   nav.declination,
              icaoCode:      nav.icaoCode,
              firCode:       nav.firCode,
              isActive:      true,
              lastFetchedAt: now,
            },
            update: {
              type:          nav.type,
              name:          nav.name,
              lat:           nav.lat,
              lon:           nav.lon,
              frequency:     nav.frequency,
              declination:   nav.declination,
              isActive:      true,
              lastFetchedAt: now,
            }
          })
          navaidsUpserted++
        }
      } catch (e) {
        log.error('jeppesen_navaid_poll_failed', {
          data: { fir, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    log.info('jeppesen_poll_complete', {
      data: { chartsUpserted, navaidsUpserted, ranAt: now.toISOString() }
    })
    return { chartsUpserted, navaidsUpserted }
  }
}

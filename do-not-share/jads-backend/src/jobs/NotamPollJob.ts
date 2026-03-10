// Polls NOTAM data for all 4 Indian FIRs daily at midnight UTC.
// @dataFlow ONE_WAY — import only from government NOTAM source.
// Uses INotamAdapter — no direct HTTP calls in this file.
// All errors are caught per-FIR so one failure doesn't stop others.
// All upserts are idempotent: running twice produces the same DB state.

import cron from 'node-cron'
import { PrismaClient }     from '@prisma/client'
import { NotamAdapterStub } from '../adapters/stubs/NotamAdapterStub'
import type { INotamAdapter } from '../adapters/interfaces/INotamAdapter'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('NotamPollJob')

const CRON_SCHEDULE = '0 0 * * *'  // Daily at midnight UTC
const INDIA_FIRS    = ['VIDF', 'VABB', 'VECC', 'VOMF']

export class NotamPollJob {
  private readonly adapter: INotamAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient, adapter?: INotamAdapter) {
    // Government sets adapter to live implementation; stub by default
    this.adapter = adapter ?? new NotamAdapterStub()
  }

  start(): void {
    log.info('notam_poll_job_starting', { data: { schedule: CRON_SCHEDULE, firs: INDIA_FIRS } })
    // Run immediately on startup so the DB has data before the first cron tick
    this.runPoll().catch(e =>
      log.error('notam_poll_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runPoll().catch(e =>
        log.error('notam_poll_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('notam_poll_job_stopped', {})
  }

  async runPoll(): Promise<{ upserted: number; expired: number; firs: string[] }> {
    const now    = new Date()
    let upserted = 0
    let expired  = 0

    for (const firCode of INDIA_FIRS) {
      try {
        const notams = await this.adapter.getActiveNotams(firCode)

        for (const n of notams) {
          await this.prisma.notamRecord.upsert({
            where:  { notamNumber: n.notamNumber },
            create: {
              notamNumber:   n.notamNumber,
              notamSeries:   n.notamSeries,
              firCode:       n.firCode,
              subject:       n.subject,
              condition:     n.condition,
              traffic:       n.traffic,
              purpose:       n.purpose,
              scope:         n.scope,
              lowerFl:       n.lowerFl,
              upperFl:       n.upperFl,
              areaGeoJson:   n.areaGeoJson,
              effectiveFrom: new Date(n.effectiveFrom),
              effectiveTo:   n.effectiveTo ? new Date(n.effectiveTo) : null,  // null = permanent until cancelled
              rawText:       n.rawText,
              isActive:      true,
              lastFetchedAt: now,
            },
            update: {
              effectiveTo:   n.effectiveTo ? new Date(n.effectiveTo) : null,
              rawText:       n.rawText,
              isActive:      true,
              lastFetchedAt: now,
            }
          })
          upserted++
        }

        // Mark NOTAMs no longer returned by adapter as inactive
        const activeNumbers = notams.map(n => n.notamNumber)
        const expireResult  = await this.prisma.notamRecord.updateMany({
          where: {
            firCode,
            isActive: true,
            NOT: { notamNumber: { in: activeNumbers } },
          },
          data: { isActive: false }
        })
        expired += expireResult.count

      } catch (e) {
        // Per-FIR error: log and continue with next FIR
        log.error('notam_poll_fir_failed', {
          data: { firCode, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    log.info('notam_poll_complete', {
      data: { upserted, expired, firs: INDIA_FIRS, ranAt: now.toISOString() }
    })
    return { upserted, expired, firs: INDIA_FIRS }
  }
}

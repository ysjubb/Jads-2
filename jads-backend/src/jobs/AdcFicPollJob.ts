// Polls FIC records from all 4 FIR offices every 6 hours.
// FIC records change infrequently; 6-hour poll is sufficient.
// Uses IFirAdapter — no direct HTTP calls in this file.
// Idempotent: upsert by ficNumber, expire by effectiveTo < now.

import cron from 'node-cron'
import { PrismaClient }  from '@prisma/client'
import { FirAdapterStub } from '../adapters/stubs/FirAdapterStub'
import type { IFirAdapter } from '../adapters/interfaces/IFirAdapter'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AdcFicPollJob')

const CRON_SCHEDULE = '0 */6 * * *'
const INDIA_FIRS    = ['VIDF', 'VABB', 'VECC', 'VOMF']

export class AdcFicPollJob {
  private readonly firAdapter: IFirAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient, firAdapter?: IFirAdapter) {
    this.firAdapter = firAdapter ?? new FirAdapterStub()
  }

  start(): void {
    log.info('adc_fic_poll_job_starting', { data: { schedule: CRON_SCHEDULE, firs: INDIA_FIRS } })
    this.runPoll().catch(e =>
      log.error('adc_fic_poll_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runPoll().catch(e =>
        log.error('adc_fic_poll_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('adc_fic_poll_job_stopped', {})
  }

  async runPoll(): Promise<{ ficUpserted: number; ficExpired: number }> {
    const now       = new Date()
    let ficUpserted = 0
    let ficExpired  = 0

    for (const firCode of INDIA_FIRS) {
      try {
        const result = await this.firAdapter.pullFicRecords(firCode)

        for (const fic of result.records) {
          await this.prisma.ficRecord.upsert({
            where:  { ficNumber: fic.ficNumber },
            create: {
              ficNumber:     fic.ficNumber,
              firCode:       fic.firCode,
              subject:       fic.subject,
              content:       fic.content,
              category:      fic.category,
              effectiveFrom: new Date(fic.effectiveFrom),
              effectiveTo:   fic.effectiveTo ? new Date(fic.effectiveTo) : null,
              supersedes:    fic.supersedes ?? null,
              issuedBy:      fic.issuedBy,
              issuedAtUtc:   new Date(fic.issuedAtUtc),
              isActive:      true,
              lastFetchedAt: now,
            },
            update: {
              effectiveTo:   fic.effectiveTo ? new Date(fic.effectiveTo) : null,
              isActive:      true,
              lastFetchedAt: now,
            }
          })
          ficUpserted++
        }

        // Expire FICs whose effectiveTo has passed
        const expireResult = await this.prisma.ficRecord.updateMany({
          where: {
            firCode,
            isActive:    true,
            effectiveTo: { lt: now },
          },
          data: { isActive: false }
        })
        ficExpired += expireResult.count

      } catch (e) {
        log.error('adc_fic_poll_fir_failed', {
          data: { firCode, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    log.info('adc_fic_poll_complete', {
      data: { ficUpserted, ficExpired, ranAt: now.toISOString() }
    })
    return { ficUpserted, ficExpired }
  }
}

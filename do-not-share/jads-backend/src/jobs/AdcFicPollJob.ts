// Polls ADC records from AFMLUs and FIC records from FIR offices every 1 minute.
// @dataFlow TWO_WAY — pull ADC zones + FIC records (inbound), push flight plans for clearance (outbound via adapter).
// Uses IAfmluAdapter and IFirAdapter — no direct HTTP calls in this file.
// Idempotent: upsert by adcNumber/ficNumber, expire by effectiveTo < now.

import cron from 'node-cron'
import { PrismaClient }    from '@prisma/client'
import { AfmluAdapterStub } from '../adapters/stubs/AfmluAdapterStub'
import { FirAdapterStub }   from '../adapters/stubs/FirAdapterStub'
import type { IAfmluAdapter } from '../adapters/interfaces/IAfmluAdapter'
import type { IFirAdapter }   from '../adapters/interfaces/IFirAdapter'
import { AFMLU_IDS }        from '../constants'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AdcFicPollJob')

const CRON_SCHEDULE = '* * * * *'  // Every 1 minute
const INDIA_FIRS    = ['VIDF', 'VABB', 'VECC', 'VOMF']

export class AdcFicPollJob {
  private readonly afmluAdapter: IAfmluAdapter
  private readonly firAdapter:   IFirAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(
    private readonly prisma: PrismaClient,
    afmluAdapter?: IAfmluAdapter,
    firAdapter?:   IFirAdapter,
  ) {
    this.afmluAdapter = afmluAdapter ?? new AfmluAdapterStub()
    this.firAdapter   = firAdapter   ?? new FirAdapterStub()
  }

  start(): void {
    log.info('adc_fic_poll_job_starting', { data: { schedule: CRON_SCHEDULE, afmlus: AFMLU_IDS.length, firs: INDIA_FIRS } })
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

  async runPoll(): Promise<{ adcUpserted: number; adcExpired: number; ficUpserted: number; ficExpired: number }> {
    const now         = new Date()
    let adcUpserted   = 0
    let adcExpired    = 0
    let ficUpserted   = 0
    let ficExpired    = 0

    // ── ADC from AFMLUs ──────────────────────────────────────
    for (const afmluId of AFMLU_IDS) {
      try {
        const result  = await this.afmluAdapter.pullAdcRecords(afmluId)

        for (const record of result.records) {
          await this.prisma.adcRecord.upsert({
            where: { afmluId_adcNumber: { afmluId: record.afmluId, adcNumber: record.adcNumber } },
            create: {
              afmluId:          record.afmluId,
              adcNumber:        record.adcNumber,
              adcType:          record.adcType,
              areaGeoJson:      JSON.stringify(record.area),
              lowerFt:          record.verticalLimits.lowerFt,
              lowerRef:         record.verticalLimits.lowerRef,
              upperFt:          record.verticalLimits.upperFt,
              upperRef:         record.verticalLimits.upperRef,
              effectiveFrom:    new Date(record.effectiveFrom),
              effectiveTo:      record.effectiveTo ? new Date(record.effectiveTo) : null,
              activitySchedule: record.activitySchedule,
              contactFrequency: record.contactFrequency,
              remarks:          record.remarks,
              pulledAtUtc:      new Date(record.fetchedAtUtc),
              isActive:         true,
            },
            update: {
              adcType:          record.adcType,
              areaGeoJson:      JSON.stringify(record.area),
              lowerFt:          record.verticalLimits.lowerFt,
              upperFt:          record.verticalLimits.upperFt,
              effectiveTo:      record.effectiveTo ? new Date(record.effectiveTo) : null,
              pulledAtUtc:      new Date(record.fetchedAtUtc),
            }
          })
          adcUpserted++
        }

        // Expire ADC zones whose effectiveTo has passed
        const expireResult = await this.prisma.adcRecord.updateMany({
          where: {
            afmluId,
            isActive:    true,
            effectiveTo: { lt: now },
          },
          data: { isActive: false }
        })
        adcExpired += expireResult.count

      } catch (e) {
        log.error('adc_poll_afmlu_failed', {
          data: { afmluId, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    // ── FIC from FIR offices ─────────────────────────────────
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
      data: { adcUpserted, adcExpired, ficUpserted, ficExpired, ranAt: now.toISOString() }
    })
    return { adcUpserted, adcExpired, ficUpserted, ficExpired }
  }
}

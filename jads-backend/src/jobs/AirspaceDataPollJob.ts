// Polls AFMLU adapters for ADC zone records every 60 minutes.
// Also polls FIR offices for FIC records every 60 minutes (at +15 min offset).
// Uses adapter interfaces — no direct HTTP calls in this file.
// Constructor accepts injected adapters for testability.

import cron from 'node-cron'
import { PrismaClient }     from '@prisma/client'
import { AfmluAdapterStub } from '../adapters/stubs/AfmluAdapterStub'
import { FirAdapterStub }   from '../adapters/stubs/FirAdapterStub'
import { MetarAdapterStub } from '../adapters/stubs/MetarAdapterStub'
import type { IAfmluAdapter } from '../adapters/interfaces/IAfmluAdapter'
import type { IFirAdapter }   from '../adapters/interfaces/IFirAdapter'
import type { IMetarAdapter } from '../adapters/interfaces/IMetarAdapter'
import { AFMLU_IDS, INDIA_FIRS } from '../constants'
import { createServiceLogger }    from '../logger'

const log = createServiceLogger('AirspaceDataPollJob')

const MAJOR_AERODROMES = [
  'VIDP', 'VABB', 'VOMM', 'VECC', 'VOBL', 'VOHB',
  'VAAH', 'VOGO', 'VOCL', 'VIBN', 'VORY', 'VIPT',
] as const

export class AirspaceDataPollJob {
  private lastAdcPull: Map<number, string>  = new Map()
  private lastFirPull: Map<string, string>  = new Map()

  constructor(
    private readonly prisma:        PrismaClient,
    private readonly afmluAdapter:  IAfmluAdapter = new AfmluAdapterStub(),
    private readonly firAdapter:    IFirAdapter   = new FirAdapterStub(),
    private readonly metarAdapter:  IMetarAdapter = new MetarAdapterStub(),
  ) {}

  start(): void {
    // ADC from AFMLUs: every 60 minutes
    cron.schedule('0 * * * *',   () => void this.pollAllAfmlus())
    // FIC from FIR offices: every 60 minutes offset by 15 min
    cron.schedule('15 * * * *',  () => void this.pollAllFirs())
    // METARs: every 30 minutes for major aerodromes
    cron.schedule('*/30 * * * *', () => void this.pollMajorAerodromeMetars())
    log.info('airspace_poll_job_started', {})
  }

  async pollAllAfmlus(): Promise<void> {
    for (const afmluId of AFMLU_IDS) {
      try {
        const sinceUtc = this.lastAdcPull.get(afmluId)
        const result   = sinceUtc
          ? await this.afmluAdapter.pullAdcUpdates(afmluId, sinceUtc)
          : await this.afmluAdapter.pullAdcRecords(afmluId)

        const records = 'records' in result ? result.records : result.newRecords

        for (const record of records) {
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
        }

        if ('withdrawnAdcNumbers' in result) {
          for (const adcNumber of result.withdrawnAdcNumbers) {
            await this.prisma.adcRecord.updateMany({
              where: { afmluId, adcNumber },
              data:  { isActive: false, effectiveTo: new Date() }
            })
          }
        }

        this.lastAdcPull.set(afmluId, result.asOfUtc)
        log.info('afmlu_poll_complete', {
          data: { afmluId, recordCount: records.length, asOfUtc: result.asOfUtc }
        })
      } catch (e) {
        log.error('afmlu_poll_error', {
          data: { afmluId, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }
  }

  async pollAllFirs(): Promise<void> {
    for (const fir of Object.values(INDIA_FIRS)) {
      try {
        const sinceUtc = this.lastFirPull.get(fir.icao)
        const result   = sinceUtc
          ? await this.firAdapter.pullFicUpdates(fir.icao, sinceUtc)
          : await this.firAdapter.pullFicRecords(fir.icao)

        const records = 'records' in result ? result.records : result.newRecords

        for (const record of records) {
          await this.prisma.ficRecord.upsert({
            where:  { ficNumber: record.ficNumber },
            create: {
              ficNumber:     record.ficNumber,
              firCode:       record.firCode,
              subject:       record.subject,
              content:       record.content,
              category:      record.category,
              effectiveFrom: new Date(record.effectiveFrom),
              effectiveTo:   record.effectiveTo ? new Date(record.effectiveTo) : null,
              supersedes:    record.supersedes ?? null,
              issuedBy:      record.issuedBy,
              issuedAtUtc:   new Date(record.issuedAtUtc),
              isActive:      true,
              lastFetchedAt: new Date(),
            },
            update: {
              content:       record.content,
              isActive:      true,
              effectiveTo:   record.effectiveTo ? new Date(record.effectiveTo) : null,
              lastFetchedAt: new Date(),
            }
          })
        }

        if ('expiredFicNumbers' in result) {
          for (const ficNumber of result.expiredFicNumbers) {
            await this.prisma.ficRecord.updateMany({
              where: { ficNumber },
              data:  { isActive: false }
            })
          }
        }

        this.lastFirPull.set(fir.icao, result.asOfUtc)
        log.info('fir_poll_complete', {
          data: { firCode: fir.icao, recordCount: records.length }
        })
      } catch (e) {
        log.error('fir_poll_error', {
          data: { firCode: fir.icao, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }
  }

  async pollMajorAerodromeMetars(): Promise<void> {
    const now = new Date()
    for (const icao of MAJOR_AERODROMES) {
      try {
        const metar = await this.metarAdapter.getLatestMetar(icao)
        if (metar) {
          await this.prisma.metarRecord.create({
            data: {
              icaoCode:       metar.icaoCode,
              rawText:        metar.rawText,
              observationUtc: new Date(metar.observationUtc),
              windDirDeg:     metar.windDirDeg   ?? null,
              windSpeedKt:    metar.windSpeedKt  ?? null,
              windGustKt:     metar.windGustKt   ?? null,
              visibilityM:    metar.visibilityM  ?? null,
              tempC:          metar.tempC        ?? null,
              dewPointC:      metar.dewPointC    ?? null,
              altimeterHpa:   metar.altimeterHpa ?? null,
              isSpeci:        metar.isSpeci,
              fetchedAt:      now,
            }
          })
        }
      } catch (e) {
        log.error('metar_poll_error', {
          data: { icao, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }
    log.info('metar_poll_complete', { data: { aerodromes: MAJOR_AERODROMES.length } })
  }
}

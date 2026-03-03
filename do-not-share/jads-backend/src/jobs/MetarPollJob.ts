// Polls METAR data for 12 major Indian aerodromes every 30 minutes.
// Uses IMetarAdapter — no direct HTTP calls in this file.
// Deduplicates by (icaoCode, observationUtc) to avoid duplicate rows.
// One ICAO failure does not stop the others.

import cron from 'node-cron'
import { PrismaClient }     from '@prisma/client'
import { MetarAdapterStub } from '../adapters/stubs/MetarAdapterStub'
import type { IMetarAdapter } from '../adapters/interfaces/IMetarAdapter'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('MetarPollJob')

const CRON_SCHEDULE = '*/30 * * * *'

// 12 major Indian aerodromes — matches spec constant MAJOR_AERODROME_ICAOS
const POLL_ICAO_CODES = [
  'VIDP', 'VABB', 'VOMM', 'VECC', 'VOBL', 'VOHB',
  'VAAH', 'VOGO', 'VOCL', 'VIBN', 'VORY', 'VIPT',
] as const

export class MetarPollJob {
  private readonly adapter: IMetarAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient, adapter?: IMetarAdapter) {
    this.adapter = adapter ?? new MetarAdapterStub()
  }

  start(): void {
    log.info('metar_poll_job_starting', {
      data: { schedule: CRON_SCHEDULE, aerodromes: POLL_ICAO_CODES.length }
    })
    this.runPoll().catch(e =>
      log.error('metar_poll_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runPoll().catch(e =>
        log.error('metar_poll_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('metar_poll_job_stopped', {})
  }

  async runPoll(): Promise<{ saved: number; skipped: number }> {
    const now   = new Date()
    let saved   = 0
    let skipped = 0

    for (const icao of POLL_ICAO_CODES) {
      try {
        const metar = await this.adapter.getLatestMetar(icao)
        if (!metar) { skipped++; continue }

        const obsTime = new Date(metar.observationUtc)

        // Skip if we already have this exact observation (idempotency)
        const existing = await this.prisma.metarRecord.findFirst({
          where: { icaoCode: icao, observationUtc: obsTime }
        })
        if (existing) { skipped++; continue }

        await this.prisma.metarRecord.create({
          data: {
            icaoCode:       metar.icaoCode,
            rawText:        metar.rawText,
            observationUtc: obsTime,
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
        saved++

      } catch (e) {
        log.error('metar_poll_icao_failed', {
          data: { icao, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    log.info('metar_poll_complete', {
      data: { saved, skipped, total: POLL_ICAO_CODES.length, ranAt: now.toISOString() }
    })
    return { saved, skipped }
  }
}

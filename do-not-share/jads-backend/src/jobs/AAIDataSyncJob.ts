// Syncs aerodrome and airspace data with AAI daily at 03:00 UTC.
// @dataFlow TWO_WAY — pull aerodrome/airspace data (inbound) + push flight status (outbound).
// Uses IAAIDataAdapter — no direct HTTP calls in this file.
// Separate from AFTN flight plan filing (IAftnGateway).

import cron from 'node-cron'
import { PrismaClient }         from '@prisma/client'
import { AAIDataAdapterStub }   from '../adapters/stubs/AAIDataAdapterStub'
import type { IAAIDataAdapter }  from '../adapters/interfaces/IAAIDataAdapter'
import { MAJOR_AERODROME_ICAOS } from '../constants'
import { createServiceLogger }   from '../logger'

const log = createServiceLogger('AAIDataSyncJob')

const CRON_SCHEDULE = '0 3 * * *'  // Daily at 03:00 UTC

export class AAIDataSyncJob {
  private readonly adapter: IAAIDataAdapter
  private task: ReturnType<typeof cron.schedule> | null = null
  private lastSyncUtc: string | null = null

  constructor(private readonly prisma: PrismaClient, adapter?: IAAIDataAdapter) {
    this.adapter = adapter ?? new AAIDataAdapterStub()
  }

  start(): void {
    log.info('aai_data_sync_job_starting', {
      data: { schedule: CRON_SCHEDULE, aerodromes: MAJOR_AERODROME_ICAOS.length }
    })
    this.runSync().catch(e =>
      log.error('aai_data_sync_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runSync().catch(e =>
        log.error('aai_data_sync_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('aai_data_sync_job_stopped', {})
  }

  async runSync(): Promise<{
    aerodromesUpserted: number; airspaceUpdates: number; flightStatusPushed: number
  }> {
    const now                = new Date()
    let aerodromesUpserted   = 0
    let airspaceUpdates      = 0
    let flightStatusPushed   = 0

    // ── INBOUND: Pull aerodrome data ─────────────────────────
    try {
      const aerodromes = await this.adapter.getAllAerodromes()

      for (const ad of aerodromes) {
        try {
          await this.prisma.aerodromeInfo.upsert({
            where:  { icaoCode: ad.icaoCode },
            create: {
              icaoCode:       ad.icaoCode,
              iataCode:       ad.iataCode,
              name:           ad.name,
              city:           ad.city,
              runwaysJson:    JSON.stringify(ad.runways),
              operatingHours: ad.operatingHours,
              elevationFt:    ad.elevationFt,
              refLat:         ad.referencePoint.lat,
              refLon:         ad.referencePoint.lon,
              lastSyncedAt:   now,
            },
            update: {
              iataCode:       ad.iataCode,
              name:           ad.name,
              city:           ad.city,
              runwaysJson:    JSON.stringify(ad.runways),
              operatingHours: ad.operatingHours,
              elevationFt:    ad.elevationFt,
              refLat:         ad.referencePoint.lat,
              refLon:         ad.referencePoint.lon,
              lastSyncedAt:   now,
            }
          })
          aerodromesUpserted++
        } catch (e) {
          log.error('aai_aerodrome_upsert_failed', {
            data: { icaoCode: ad.icaoCode, error: e instanceof Error ? e.message : String(e) }
          })
        }
      }
    } catch (e) {
      log.error('aai_aerodrome_pull_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    // ── INBOUND: Pull airspace updates ───────────────────────
    try {
      const sinceUtc = this.lastSyncUtc ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const updates  = await this.adapter.getAirspaceUpdates(sinceUtc)
      airspaceUpdates = updates.length

      if (updates.length > 0) {
        // Log airspace updates to audit trail for visibility
        await this.prisma.auditLog.create({
          data: {
            actorType:    'SYSTEM',
            actorId:      'AAI_DATA_SYNC_JOB',
            action:       'airspace_updates_received',
            resourceType: 'airspace',
            detailJson:   JSON.stringify({
              updateCount: updates.length,
              updateIds:   updates.map(u => u.updateId),
              syncedAt:    now.toISOString(),
            }),
          },
        })
      }
    } catch (e) {
      log.error('aai_airspace_pull_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    // ── OUTBOUND: Push pending flight status reports ─────────
    try {
      // Find recently filed/cleared flight plans that haven't been reported to AAI yet
      const pendingPlans = await this.prisma.mannedFlightPlan.findMany({
        where: {
          aaiReportedAt: null,
          status:        { in: ['FILED', 'FULLY_CLEARED', 'DEPARTED', 'ARRIVED', 'CANCELLED'] },
        },
        take: 50,
      })

      for (const plan of pendingPlans) {
        try {
          const result = await this.adapter.pushFlightStatus({
            flightPlanId: plan.id,
            callsign:     plan.aircraftId,
            status:       plan.status,
            reportedAt:   now.toISOString(),
          })

          if (result.accepted) {
            await this.prisma.mannedFlightPlan.update({
              where: { id: plan.id },
              data:  { aaiReportedAt: now },
            })
            flightStatusPushed++
          }
        } catch (e) {
          log.error('aai_flight_status_push_failed', {
            data: { flightPlanId: plan.id, error: e instanceof Error ? e.message : String(e) }
          })
        }
      }
    } catch (e) {
      log.error('aai_flight_status_query_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    this.lastSyncUtc = now.toISOString()

    log.info('aai_data_sync_complete', {
      data: { aerodromesUpserted, airspaceUpdates, flightStatusPushed, ranAt: now.toISOString() }
    })
    return { aerodromesUpserted, airspaceUpdates, flightStatusPushed }
  }
}

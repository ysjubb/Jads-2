// CredentialSyncJob — Runs daily at 12:00 UTC.
// Syncs aircraft credentials from AAI/DGCA and drone credentials from DigitalSky/DGCA.
// Updates credentialSyncedAt on matching users. Suspends users whose external
// credential status is REVOKED or SUSPENDED. Logs all operations to AuditLog.

import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'
import type { IAircraftCredentialSyncAdapter } from '../adapters/interfaces/IAircraftCredentialSyncAdapter'
import type { IDroneCredentialSyncAdapter }    from '../adapters/interfaces/IDroneCredentialSyncAdapter'
import { AircraftCredentialSyncAdapterStub }   from '../adapters/stubs/AircraftCredentialSyncAdapterStub'
import { DroneCredentialSyncAdapterStub }      from '../adapters/stubs/DroneCredentialSyncAdapterStub'

const log = createServiceLogger('CredentialSyncJob')

const CRON_SCHEDULE = '0 12 * * *'  // 12:00 UTC daily

export class CredentialSyncJob {
  private task: ReturnType<typeof cron.schedule> | null = null
  private readonly aircraftAdapter: IAircraftCredentialSyncAdapter
  private readonly droneAdapter:    IDroneCredentialSyncAdapter

  constructor(
    private readonly prisma: PrismaClient,
    aircraftAdapter?: IAircraftCredentialSyncAdapter,
    droneAdapter?:    IDroneCredentialSyncAdapter,
  ) {
    this.aircraftAdapter = aircraftAdapter ?? new AircraftCredentialSyncAdapterStub()
    this.droneAdapter    = droneAdapter    ?? new DroneCredentialSyncAdapterStub()
  }

  start(): void {
    log.info('credential_sync_job_started', { data: { schedule: CRON_SCHEDULE } })
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runOnce().catch(e =>
        log.error('credential_sync_job_unhandled', {
          data: { error: e instanceof Error ? e.message : String(e) }
        })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('credential_sync_job_stopped', {})
  }

  async runOnce(): Promise<{
    aircraftSynced: number; droneSynced: number
    aircraftSuspended: number; droneSuspended: number
  }> {
    const now = new Date()
    let aircraftSynced = 0, droneSynced = 0
    let aircraftSuspended = 0, droneSuspended = 0

    // ── Aircraft credential sync ──────────────────────────────────────
    try {
      const aaiResult  = await this.aircraftAdapter.syncFromAAI()
      const dgcaResult = await this.aircraftAdapter.syncFromDGCA()
      const allAircraft = [...aaiResult.credentials, ...dgcaResult.credentials]

      for (const cred of allAircraft) {
        try {
          const match = await this.prisma.civilianUser.findFirst({
            where: {
              credentialDomain: 'AIRCRAFT',
              OR: [
                { credentialExternalId: cred.externalId },
                { dgcaLicenseNumber: cred.licenseNumber },
                { pilotLicenceNumber: cred.licenseNumber },
              ],
            },
          })

          if (match) {
            const updateData: Record<string, unknown> = {
              credentialSyncedAt:   now,
              credentialExternalId: cred.externalId,
            }

            if (cred.status === 'REVOKED' || cred.status === 'SUSPENDED') {
              updateData.accountStatus = 'SUSPENDED'
              aircraftSuspended++
              log.warn('aircraft_credential_suspended', {
                data: { userId: match.id, externalId: cred.externalId, status: cred.status }
              })
            }

            await this.prisma.civilianUser.update({
              where: { id: match.id },
              data:  updateData as any,
            })

            await this.prisma.auditLog.create({
              data: {
                actorType:    'SYSTEM',
                actorId:      'CREDENTIAL_SYNC_JOB',
                action:       'aircraft_credential_synced',
                resourceType: 'civilian_user',
                resourceId:   match.id,
                detailJson:   JSON.stringify({
                  externalId: cred.externalId,
                  authority:  cred.issuingAuthority,
                  status:     cred.status,
                  syncedAt:   now.toISOString(),
                }),
              },
            })
            aircraftSynced++
          }

          // Also check SpecialUser
          const specialMatch = await this.prisma.specialUser.findFirst({
            where: {
              credentialDomain: 'AIRCRAFT',
              credentialExternalId: cred.externalId,
            },
          })

          if (specialMatch) {
            const updateData: Record<string, unknown> = {
              credentialSyncedAt: now,
            }
            if (cred.status === 'REVOKED' || cred.status === 'SUSPENDED') {
              updateData.accountStatus = 'SUSPENDED'
              aircraftSuspended++
            }
            await this.prisma.specialUser.update({
              where: { id: specialMatch.id },
              data:  updateData as any,
            })
            await this.prisma.auditLog.create({
              data: {
                actorType:    'SYSTEM',
                actorId:      'CREDENTIAL_SYNC_JOB',
                action:       'aircraft_credential_synced',
                resourceType: 'special_user',
                resourceId:   specialMatch.id,
                detailJson:   JSON.stringify({
                  externalId: cred.externalId,
                  authority:  cred.issuingAuthority,
                  status:     cred.status,
                  syncedAt:   now.toISOString(),
                }),
              },
            })
            aircraftSynced++
          }
        } catch (e) {
          log.error('aircraft_credential_record_failed', {
            data: { externalId: cred.externalId, error: e instanceof Error ? e.message : String(e) }
          })
        }
      }
    } catch (e) {
      log.error('aircraft_credential_sync_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
      await this.prisma.auditLog.create({
        data: {
          actorType: 'SYSTEM', actorId: 'CREDENTIAL_SYNC_JOB',
          action: 'aircraft_credential_sync_error',
          resourceType: 'credential_sync',
          detailJson: JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
            ranAt: now.toISOString(),
          }),
        },
      })
    }

    // ── Drone credential sync ─────────────────────────────────────────
    try {
      const dsResult   = await this.droneAdapter.syncFromDigitalSky()
      const dgcaResult = await this.droneAdapter.syncFromDGCA()
      const allDrone   = [...dsResult.credentials, ...dgcaResult.credentials]

      for (const cred of allDrone) {
        try {
          const match = await this.prisma.civilianUser.findFirst({
            where: {
              credentialDomain: 'DRONE',
              OR: [
                { credentialExternalId: cred.externalId },
                { uinNumber: cred.licenseNumber },
                { pilotLicenceNumber: cred.licenseNumber },
              ],
            },
          })

          if (match) {
            const updateData: Record<string, unknown> = {
              credentialSyncedAt:   now,
              credentialExternalId: cred.externalId,
            }

            if (cred.status === 'REVOKED' || cred.status === 'SUSPENDED') {
              updateData.accountStatus = 'SUSPENDED'
              droneSuspended++
              log.warn('drone_credential_suspended', {
                data: { userId: match.id, externalId: cred.externalId, status: cred.status }
              })
            }

            await this.prisma.civilianUser.update({
              where: { id: match.id },
              data:  updateData as any,
            })

            await this.prisma.auditLog.create({
              data: {
                actorType:    'SYSTEM',
                actorId:      'CREDENTIAL_SYNC_JOB',
                action:       'drone_credential_synced',
                resourceType: 'civilian_user',
                resourceId:   match.id,
                detailJson:   JSON.stringify({
                  externalId: cred.externalId,
                  authority:  cred.issuingAuthority,
                  status:     cred.status,
                  syncedAt:   now.toISOString(),
                }),
              },
            })
            droneSynced++
          }

          // Also check SpecialUser
          const specialMatch = await this.prisma.specialUser.findFirst({
            where: {
              credentialDomain: 'DRONE',
              credentialExternalId: cred.externalId,
            },
          })

          if (specialMatch) {
            const updateData: Record<string, unknown> = {
              credentialSyncedAt: now,
            }
            if (cred.status === 'REVOKED' || cred.status === 'SUSPENDED') {
              updateData.accountStatus = 'SUSPENDED'
              droneSuspended++
            }
            await this.prisma.specialUser.update({
              where: { id: specialMatch.id },
              data:  updateData as any,
            })
            await this.prisma.auditLog.create({
              data: {
                actorType:    'SYSTEM',
                actorId:      'CREDENTIAL_SYNC_JOB',
                action:       'drone_credential_synced',
                resourceType: 'special_user',
                resourceId:   specialMatch.id,
                detailJson:   JSON.stringify({
                  externalId: cred.externalId,
                  authority:  cred.issuingAuthority,
                  status:     cred.status,
                  syncedAt:   now.toISOString(),
                }),
              },
            })
            droneSynced++
          }
        } catch (e) {
          log.error('drone_credential_record_failed', {
            data: { externalId: cred.externalId, error: e instanceof Error ? e.message : String(e) }
          })
        }
      }
    } catch (e) {
      log.error('drone_credential_sync_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
      await this.prisma.auditLog.create({
        data: {
          actorType: 'SYSTEM', actorId: 'CREDENTIAL_SYNC_JOB',
          action: 'drone_credential_sync_error',
          resourceType: 'credential_sync',
          detailJson: JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
            ranAt: now.toISOString(),
          }),
        },
      })
    }

    const result = { aircraftSynced, droneSynced, aircraftSuspended, droneSuspended }
    log.info('credential_sync_job_complete', {
      data: { ...result, ranAt: now.toISOString() }
    })

    // Summary audit log
    await this.prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM', actorId: 'CREDENTIAL_SYNC_JOB',
        action: 'credential_sync_daily_complete',
        resourceType: 'credential_sync',
        detailJson: JSON.stringify({ ...result, ranAt: now.toISOString() }),
      },
    })

    return result
  }
}

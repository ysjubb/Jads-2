/**
 * DataSourceManagerService.ts
 *
 * Central admin control over all external data source adapters.
 * Provides:
 *   - Unified adapter status view (all 14+ adapters)
 *   - Authoritative source toggle for route planning data
 *   - Manual sync triggers for any registered job
 *   - Integration with DataSourceReconciliationService
 */

import { createServiceLogger } from '../logger'
import type { DataSourceReconciliationService } from './DataSourceReconciliationService'

const log = createServiceLogger('DataSourceManager')

// ── Types ─────────────────────────────────────────────────────────

export type AuthoritativeSource = 'AAI_EAIP' | 'JEPPESEN' | 'EMBEDDED'

export interface AdapterRegistration {
  adapterId:      string
  name:           string
  mode:           'STUB' | 'LIVE'
  dataFlow:       'ONE_WAY' | 'TWO_WAY'
  cronSchedule:   string | null
  lastSyncAt:     string | null
  lastSyncResult: Record<string, number> | null
  live:           boolean
  healthy:        boolean
  latencyMs:      number | null
}

export interface DataSourceConfig {
  routePlanningSource: AuthoritativeSource
}

// ── Static adapter registry (metadata for all known adapters) ────

const ADAPTER_REGISTRY: Array<{
  adapterId: string; name: string; dataFlow: 'ONE_WAY' | 'TWO_WAY'; cronSchedule: string | null
}> = [
  { adapterId: 'aaiEaip',        name: 'AAI eAIP ENR (Routes/Navaids/Fixes)',   dataFlow: 'ONE_WAY', cronSchedule: '0 4 * * *' },
  { adapterId: 'jeppesen',       name: 'Jeppesen NavData (Charts/Navaids)',     dataFlow: 'ONE_WAY', cronSchedule: '0 2 * * *' },
  { adapterId: 'aaiData',        name: 'AAI Data Exchange (Aerodromes)',        dataFlow: 'TWO_WAY', cronSchedule: '0 3 * * *' },
  { adapterId: 'digitalSky',     name: 'DGCA Digital Sky (PA/UIN/RPL)',         dataFlow: 'TWO_WAY', cronSchedule: null },
  { adapterId: 'uidai',          name: 'UIDAI Aadhaar (eKYC)',                  dataFlow: 'ONE_WAY', cronSchedule: null },
  { adapterId: 'afmlu',          name: 'AFMLU (Air Defence Clearance)',         dataFlow: 'TWO_WAY', cronSchedule: '* * * * *' },
  { adapterId: 'aftn',           name: 'AFTN Gateway (Flight Plan Filing)',     dataFlow: 'TWO_WAY', cronSchedule: null },
  { adapterId: 'fir',            name: 'FIR Office (Flight Info Centre)',       dataFlow: 'TWO_WAY', cronSchedule: '* * * * *' },
  { adapterId: 'notamFeed',      name: 'NOTAM Feed',                            dataFlow: 'ONE_WAY', cronSchedule: '0 0 * * *' },
  { adapterId: 'metarFeed',      name: 'METAR Observations',                    dataFlow: 'ONE_WAY', cronSchedule: '*/30 * * * *' },
  { adapterId: 'djiCloud',       name: 'DJI Cloud (Enterprise Drones)',         dataFlow: 'TWO_WAY', cronSchedule: null },
  { adapterId: 'aircraftCreds',  name: 'Aircraft Credential Sync',              dataFlow: 'ONE_WAY', cronSchedule: '0 1 * * *' },
  { adapterId: 'droneCreds',     name: 'Drone Credential Sync',                 dataFlow: 'ONE_WAY', cronSchedule: '0 1 * * *' },
  { adapterId: 'egca',           name: 'eGCA (Electronic Governance)',           dataFlow: 'TWO_WAY', cronSchedule: null },
]

// ── Job interface (minimal — just needs runPoll/runSync + getLastSyncAt) ─

interface SyncableJob {
  runPoll?():  Promise<Record<string, number>>
  runSync?():  Promise<Record<string, number>>
  getLastSyncAt?(): string | null
}

// ── Service ───────────────────────────────────────────────────────

export class DataSourceManagerService {
  private config: DataSourceConfig = {
    routePlanningSource: 'EMBEDDED',
  }

  private jobs = new Map<string, SyncableJob>()
  private lastSyncResults = new Map<string, Record<string, number>>()

  constructor(
    private readonly reconciliationService: DataSourceReconciliationService,
  ) {}

  /** Register jobs from JobScheduler for manual sync support */
  registerJobs(jobs: Record<string, { start(): void; stop(): void } & Partial<SyncableJob>>): void {
    // Map scheduler job names to adapter IDs
    const jobToAdapter: Record<string, string> = {
      aaiEaipPoll:     'aaiEaip',
      jeppesenPoll:    'jeppesen',
      aaiDataSync:     'aaiData',
      notamPoll:       'notamFeed',
      metarPoll:       'metarFeed',
      credentialSync:  'aircraftCreds',
    }

    for (const [jobName, job] of Object.entries(jobs)) {
      const adapterId = jobToAdapter[jobName]
      if (adapterId) {
        this.jobs.set(adapterId, job as SyncableJob)
      }
    }

    log.info('jobs_registered', { data: { count: this.jobs.size, adapterIds: [...this.jobs.keys()] } })
  }

  // ── Adapter status ─────────────────────────────────────────────

  getAllAdapters(): AdapterRegistration[] {
    return ADAPTER_REGISTRY.map(reg => {
      const job = this.jobs.get(reg.adapterId)
      const lastSyncAt = job?.getLastSyncAt?.() ?? null
      const lastSyncResult = this.lastSyncResults.get(reg.adapterId) ?? null

      return {
        adapterId:      reg.adapterId,
        name:           reg.name,
        mode:           'STUB' as const,          // All adapters are STUB until government deploys live
        dataFlow:       reg.dataFlow,
        cronSchedule:   reg.cronSchedule,
        lastSyncAt,
        lastSyncResult,
        live:           false,
        healthy:        true,                       // Stubs are always healthy
        latencyMs:      null,
      }
    })
  }

  getAdapter(adapterId: string): AdapterRegistration | null {
    const all = this.getAllAdapters()
    return all.find(a => a.adapterId === adapterId) ?? null
  }

  // ── Data source configuration ─────────────────────────────────

  getConfig(): DataSourceConfig {
    return { ...this.config }
  }

  setAuthoritativeSource(source: AuthoritativeSource, _adminUserId: string): DataSourceConfig {
    const previous = this.config.routePlanningSource
    this.config.routePlanningSource = source
    log.info('authoritative_source_changed', {
      data: { previous, current: source, adminUserId: _adminUserId }
    })
    return { ...this.config }
  }

  // ── Manual sync ────────────────────────────────────────────────

  async triggerManualSync(adapterId: string, adminUserId: string): Promise<Record<string, number>> {
    const job = this.jobs.get(adapterId)
    if (!job) {
      throw new Error(`No syncable job registered for adapter: ${adapterId}`)
    }

    log.info('manual_sync_triggered', { data: { adapterId, adminUserId } })

    let result: Record<string, number>
    if (job.runPoll) {
      result = await job.runPoll()
    } else if (job.runSync) {
      result = await job.runSync()
    } else {
      throw new Error(`Adapter ${adapterId} does not support manual sync`)
    }

    this.lastSyncResults.set(adapterId, result)
    return result
  }

  /** Check which adapters support manual sync */
  getSyncableAdapters(): string[] {
    return [...this.jobs.keys()]
  }

  // ── Reconciliation passthrough ─────────────────────────────────

  getReconciliationService(): DataSourceReconciliationService {
    return this.reconciliationService
  }
}

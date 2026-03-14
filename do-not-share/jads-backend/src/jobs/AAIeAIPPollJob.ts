// Polls AAI eAIP ENR data daily at 04:00 UTC.
// @dataFlow ONE_WAY — pull ATS routes, navaids, fixes from AAI eAIP (inbound only).
// Runs after JeppesenPollJob (02:00) and AAIDataSyncJob (03:00) so reconciliation
// has both datasets available.
// Uses IAAIeAIPAdapter — no direct HTTP calls in this file.

import cron from 'node-cron'
import { PrismaClient }         from '@prisma/client'
import { AAIeAIPAdapterStub }   from '../adapters/stubs/AAIeAIPAdapterStub'
import type { IAAIeAIPAdapter, EAIPWaypoint, EAIPATSRoute, EAIPNavaid } from '../adapters/interfaces/IAAIeAIPAdapter'
import { createServiceLogger }   from '../logger'

const log = createServiceLogger('AAIeAIPPollJob')

const CRON_SCHEDULE = '0 4 * * *'  // Daily at 04:00 UTC
const INDIA_FIRS    = ['VIDF', 'VABB', 'VECC', 'VOMF']

export class AAIeAIPPollJob {
  private readonly adapter: IAAIeAIPAdapter
  private task: ReturnType<typeof cron.schedule> | null = null

  // In-memory cache — no Prisma tables needed for now
  private _cachedRoutes:    EAIPATSRoute[]               = []
  private _cachedWaypoints: Map<string, EAIPWaypoint[]>  = new Map()
  private _cachedNavaids:   Map<string, EAIPNavaid[]>    = new Map()
  private _lastSyncAt:      string | null                = null
  private _airacCycle:      string | null                = null

  // Optional reconciliation callback — set via setReconciliationCallback()
  private reconciliationCallback: (() => Promise<void>) | null = null

  constructor(
    private readonly prisma: PrismaClient,
    adapter?: IAAIeAIPAdapter,
  ) {
    this.adapter = adapter ?? new AAIeAIPAdapterStub()
  }

  /** Register a callback to run reconciliation after each poll */
  setReconciliationCallback(cb: () => Promise<void>): void {
    this.reconciliationCallback = cb
  }

  start(): void {
    log.info('aai_eaip_poll_starting', { data: { schedule: CRON_SCHEDULE, firs: INDIA_FIRS } })

    // Run immediately on start
    this.runPoll().catch(e =>
      log.error('aai_eaip_poll_startup_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    )

    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runPoll().catch(e =>
        log.error('aai_eaip_poll_cron_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('aai_eaip_poll_stopped', {})
  }

  async runPoll(): Promise<{ routesCached: number; waypointsCached: number; navaidsCached: number }> {
    let routesCached    = 0
    let waypointsCached = 0
    let navaidsCached   = 0

    // 1. Check AIRAC status
    try {
      const status = await this.adapter.getAIRACStatus()
      this._airacCycle = status.cycle
      log.info('aai_eaip_airac_status', { data: { cycle: status.cycle, effective: status.effectiveDate } })
    } catch (e) {
      log.error('aai_eaip_airac_status_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    }

    // 2. Pull ATS routes
    try {
      const routes = await this.adapter.getATSRoutes()
      this._cachedRoutes = routes
      routesCached = routes.length
      log.info('aai_eaip_routes_cached', { data: { count: routes.length } })
    } catch (e) {
      log.error('aai_eaip_routes_pull_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    }

    // 3. Pull waypoints per FIR
    for (const fir of INDIA_FIRS) {
      try {
        const waypoints = await this.adapter.getWaypoints(fir)
        this._cachedWaypoints.set(fir, waypoints)
        waypointsCached += waypoints.length
      } catch (e) {
        log.error('aai_eaip_waypoints_pull_failed', {
          data: { fir, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    // 4. Pull navaids per FIR
    for (const fir of INDIA_FIRS) {
      try {
        const navaids = await this.adapter.getNavaids(fir)
        this._cachedNavaids.set(fir, navaids)
        navaidsCached += navaids.length
      } catch (e) {
        log.error('aai_eaip_navaids_pull_failed', {
          data: { fir, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    this._lastSyncAt = new Date().toISOString()

    log.info('aai_eaip_poll_complete', {
      data: { routesCached, waypointsCached, navaidsCached, syncedAt: this._lastSyncAt }
    })

    // 5. Trigger reconciliation if callback registered
    if (this.reconciliationCallback) {
      try {
        await this.reconciliationCallback()
        log.info('aai_eaip_reconciliation_triggered', {})
      } catch (e) {
        log.error('aai_eaip_reconciliation_failed', {
          data: { error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    return { routesCached, waypointsCached, navaidsCached }
  }

  // ── Getters for cached data ─────────────────────────────────────

  getCachedRoutes():                EAIPATSRoute[]              { return this._cachedRoutes }
  getCachedWaypoints(fir: string):  EAIPWaypoint[]              { return this._cachedWaypoints.get(fir) ?? [] }
  getCachedNavaids(fir: string):    EAIPNavaid[]                { return this._cachedNavaids.get(fir) ?? [] }
  getAllCachedNavaids():            EAIPNavaid[]                 { return [...this._cachedNavaids.values()].flat() }
  getLastSyncAt():                  string | null               { return this._lastSyncAt }
  getAIRACCycle():                  string | null               { return this._airacCycle }
}

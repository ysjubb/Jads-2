// eGCA adapter barrel export and dependency injection wiring.
//
// Usage:
//   import { EGCA_ADAPTER, resolveEgcaAdapter } from '../adapters/egca'
//   const adapter = resolveEgcaAdapter()
//
// Selection logic mirrors the existing adapter pattern in the codebase:
//   - USE_LIVE_ADAPTERS=true AND EGCA_API_BASE_URL set  → EgcaAdapterImpl (live)
//   - Otherwise                                          → EgcaAdapterMock (stub)

import { env }                  from '../../env'
import { createServiceLogger }  from '../../logger'
import type { IEgcaAdapter }    from './EgcaAdapter'
import { EgcaAdapterImpl }      from './EgcaAdapterImpl'
import { EgcaAdapterMock }      from './EgcaAdapterMock'

const log = createServiceLogger('EgcaAdapterDI')

// ── DI token ────────────────────────────────────────────────────────────────
// Symbol token for dependency injection frameworks.
// Services declare a dependency on EGCA_ADAPTER and receive the resolved instance.
export const EGCA_ADAPTER = Symbol.for('IEgcaAdapter')

// ── Singleton cache ─────────────────────────────────────────────────────────
let cachedAdapter: IEgcaAdapter | null = null

/**
 * Resolve the eGCA adapter based on environment configuration.
 * Returns a singleton — safe to call multiple times.
 */
export function resolveEgcaAdapter(): IEgcaAdapter {
  if (cachedAdapter) return cachedAdapter

  if (env.USE_LIVE_ADAPTERS && env.EGCA_API_BASE_URL) {
    log.info('egca_adapter_resolved', { data: { mode: 'LIVE', baseUrl: env.EGCA_API_BASE_URL } })
    cachedAdapter = new EgcaAdapterImpl()
  } else {
    log.info('egca_adapter_resolved', { data: { mode: 'MOCK' } })
    cachedAdapter = new EgcaAdapterMock()
  }

  return cachedAdapter
}

/**
 * Replace the cached adapter instance — used for testing.
 * Callers can inject a custom mock or spy.
 */
export function overrideEgcaAdapter(adapter: IEgcaAdapter): void {
  cachedAdapter = adapter
}

/**
 * Reset the cached adapter — used in test teardown.
 */
export function resetEgcaAdapter(): void {
  cachedAdapter = null
}

// ── Re-exports ──────────────────────────────────────────────────────────────
export type { IEgcaAdapter }                 from './EgcaAdapter'
export { EgcaAdapterImpl }                   from './EgcaAdapterImpl'
export { EgcaAdapterMock }                   from './EgcaAdapterMock'
export { EgcaError }                         from './EgcaError'
export type {
  UINValidationResult,
  RPCValidationResult,
  UAOPValidationResult,
  FlightPermissionPayload,
  FlightPermissionResult,
  PermissionStatus,
  FlightPermission,
  PaginatedResult,
  ZoneClassification,
  LatLng,
  EgcaAuthResult,
}                                            from './types'

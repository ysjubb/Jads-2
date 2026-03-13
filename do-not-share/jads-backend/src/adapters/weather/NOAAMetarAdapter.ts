// Live METAR adapter — NOAA Aviation Weather API (free, no auth required).
// https://aviationweather.gov/api/data/metar
// Caches results for 10 minutes. Returns null on error (never crashes server).

import type { IMetarAdapter, MetarData } from '../interfaces/IMetarAdapter'
import { createServiceLogger } from '../../logger'

const log = createServiceLogger('NOAAMetarAdapter')

// In-memory cache: icaoCode → { data, fetchedAt }
const cache = new Map<string, { data: MetarData; fetchedAt: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR'

export interface ParsedMetar extends MetarData {
  flightCategory: FlightCategory
}

function deriveFlightCategory(visM: number | null, ceilingFt: number | null): FlightCategory {
  const vis = visM ?? 99999
  const ceil = ceilingFt ?? 99999
  if (vis < 1600 || ceil < 500) return 'LIFR'
  if (vis < 5000 || ceil < 1000) return 'IFR'
  if (vis < 8000 || ceil < 3000) return 'MVFR'
  return 'VFR'
}

export class NOAAMetarAdapter implements IMetarAdapter {
  async getLatestMetar(icaoCode: string): Promise<MetarData | null> {
    const cached = cache.get(icaoCode)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data
    }

    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${icaoCode}&format=json&hours=1`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        log.warn('noaa_non_ok', { data: { status: res.status, icaoCode } })
        return null
      }

      const raw = (await res.json()) as any[]
      if (!raw || raw.length === 0) return null

      const latest = raw[0]
      const parsed = this.mapNOAAMetar(latest, icaoCode)
      cache.set(icaoCode, { data: parsed, fetchedAt: Date.now() })
      return parsed
    } catch (e) {
      log.warn('noaa_error', { data: { error: e instanceof Error ? e.message : String(e), icaoCode } })
      return null
    }
  }

  async getMetarHistory(icaoCode: string, hoursBack: number): Promise<MetarData[]> {
    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${icaoCode}&format=json&hours=${hoursBack}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return []

      const raw = (await res.json()) as any[]
      return raw.map(r => this.mapNOAAMetar(r, icaoCode))
    } catch (e) {
      log.warn('noaa_history_error', { data: { error: e instanceof Error ? e.message : String(e), icaoCode } })
      return []
    }
  }

  /** Get METAR with derived flight category. */
  async getCurrentWithCategory(icaoCode: string): Promise<ParsedMetar | null> {
    const metar = await this.getLatestMetar(icaoCode)
    if (!metar) return null
    return {
      ...metar,
      flightCategory: deriveFlightCategory(metar.visibilityM, null),
    }
  }

  /** Get TAF (Terminal Aerodrome Forecast). */
  async getTAF(icaoCode: string): Promise<{ raw: string; validFrom: string; validTo: string } | null> {
    try {
      const url = `https://aviationweather.gov/api/data/taf?ids=${icaoCode}&format=json`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return null

      const raw = (await res.json()) as any[]
      if (!raw || raw.length === 0) return null

      return {
        raw:       raw[0].rawOb ?? raw[0].rawTaf ?? '',
        validFrom: raw[0].validTimeFrom ?? '',
        validTo:   raw[0].validTimeTo ?? '',
      }
    } catch {
      return null
    }
  }

  private mapNOAAMetar(raw: any, icaoCode: string): MetarData {
    return {
      icaoCode,
      rawText:        raw.rawOb ?? raw.rawMetar ?? '',
      observationUtc: raw.reportTime ?? raw.obsTime ?? new Date().toISOString(),
      windDirDeg:     raw.wdir ?? null,
      windSpeedKt:    raw.wspd ?? null,
      windGustKt:     raw.wgst ?? null,
      visibilityM:    raw.visib != null ? raw.visib * 1609.34 : null, // statute miles to meters
      tempC:          raw.temp ?? null,
      dewPointC:      raw.dewp ?? null,
      altimeterHpa:   raw.altim != null ? raw.altim * 33.8639 : null, // inHg to hPa
      isSpeci:        (raw.rawOb ?? '').includes('SPECI'),
    }
  }
}

/** Factory: always returns an adapter (NOAA is free, no auth). */
export function createMetarAdapter(): NOAAMetarAdapter {
  return new NOAAMetarAdapter()
}

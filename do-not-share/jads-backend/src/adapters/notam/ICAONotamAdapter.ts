// Live NOTAM adapter — ICAO API (primary) + Notamify (fallback).
// Government configures env vars to enable live NOTAM data.
// Gracefully returns [] if no API keys are configured.

import type { INotamAdapter, NotamRecord } from '../interfaces/INotamAdapter'
import { env } from '../../env'
import { createServiceLogger } from '../../logger'

const log = createServiceLogger('ICAONotamAdapter')

// In-memory cache: firCode → { data, fetchedAt }
const cache = new Map<string, { data: NotamRecord[]; fetchedAt: number }>()
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

export class ICAONotamAdapter implements INotamAdapter {
  private icaoKey: string
  private notamifyKey: string

  constructor() {
    this.icaoKey = env.ICAO_API_KEY ?? ''
    this.notamifyKey = env.NOTAMIFY_API_KEY ?? ''
  }

  async getActiveNotams(firCode: string): Promise<NotamRecord[]> {
    const cached = cache.get(firCode)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data
    }

    // Try ICAO API first
    if (this.icaoKey) {
      try {
        const url = `https://applications.icao.int/dataservices/api/notams?api_key=${this.icaoKey}&format=json&locations=${firCode}`
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (res.ok) {
          const raw = (await res.json()) as any[]
          const records = raw.map(n => this.mapICAONotam(n, firCode))
          cache.set(firCode, { data: records, fetchedAt: Date.now() })
          return records
        }
        log.warn('icao_api_non_ok', { data: { status: res.status, firCode } })
      } catch (e) {
        log.warn('icao_api_error', { data: { error: e instanceof Error ? e.message : String(e), firCode } })
      }
    }

    // Fallback to Notamify
    if (this.notamifyKey) {
      try {
        const url = `https://api.notamify.com/v1/notams?fir=${firCode}`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.notamifyKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok) {
          const raw = (await res.json()) as any[]
          const records = raw.map(n => this.mapNotamifyNotam(n, firCode))
          cache.set(firCode, { data: records, fetchedAt: Date.now() })
          return records
        }
        log.warn('notamify_api_non_ok', { data: { status: res.status, firCode } })
      } catch (e) {
        log.warn('notamify_api_error', { data: { error: e instanceof Error ? e.message : String(e), firCode } })
      }
    }

    // No keys configured or both failed — graceful empty
    return []
  }

  async getNotam(notamNumber: string): Promise<NotamRecord | null> {
    // ICAO API does not support single-NOTAM lookup efficiently;
    // search all cached data first
    for (const entry of cache.values()) {
      const found = entry.data.find(n => n.notamNumber === notamNumber)
      if (found) return found
    }
    return null
  }

  private mapICAONotam(raw: any, firCode: string): NotamRecord {
    return {
      notamNumber:   raw.id ?? raw.notamNumber ?? 'UNKNOWN',
      notamSeries:   raw.series ?? 'A',
      firCode,
      subject:       raw.subject ?? '',
      condition:     raw.condition ?? '',
      traffic:       raw.traffic ?? '',
      purpose:       raw.purpose ?? '',
      scope:         raw.scope ?? '',
      lowerFl:       raw.lowerLimit ?? null,
      upperFl:       raw.upperLimit ?? null,
      areaGeoJson:   raw.geometry ? JSON.stringify(raw.geometry) : null,
      effectiveFrom: raw.startValidity ?? new Date().toISOString(),
      effectiveTo:   raw.endValidity ?? null,
      rawText:       raw.all ?? raw.message ?? '',
    }
  }

  private mapNotamifyNotam(raw: any, firCode: string): NotamRecord {
    return {
      notamNumber:   raw.number ?? raw.id ?? 'UNKNOWN',
      notamSeries:   raw.series ?? 'A',
      firCode,
      subject:       raw.subject ?? '',
      condition:     raw.condition ?? '',
      traffic:       raw.traffic ?? '',
      purpose:       raw.purpose ?? '',
      scope:         raw.scope ?? '',
      lowerFl:       raw.lower_fl ?? null,
      upperFl:       raw.upper_fl ?? null,
      areaGeoJson:   raw.geometry ? JSON.stringify(raw.geometry) : null,
      effectiveFrom: raw.effective_from ?? new Date().toISOString(),
      effectiveTo:   raw.effective_to ?? null,
      rawText:       raw.raw_text ?? raw.text ?? '',
    }
  }
}

/** Factory: returns live adapter if API keys present, null otherwise. */
export function createNotamAdapter(): ICAONotamAdapter | null {
  const icaoKey = process.env.ICAO_API_KEY ?? ''
  const notamifyKey = process.env.NOTAMIFY_API_KEY ?? ''
  if (icaoKey || notamifyKey) return new ICAONotamAdapter()
  return null
}

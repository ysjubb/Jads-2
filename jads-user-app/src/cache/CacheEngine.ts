import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Frozen cache validity rules (P9) ─────────────────────────────────────────
// Do NOT relax these without a formal safety review.
// Drone zone cache is safety-critical — staleness blocks mission start, not warns.

export const AIRAC_CYCLE_DAYS        = 28    // 28-day AIRAC cycle
export const AIRAC_STALE_WARNING_DAYS = 14   // Show staleness warning after 14 days
export const DRONE_ZONE_CACHE_HOURS  = 4     // HARD LIMIT: >4 hours = mission blocked
export const NOTAM_CACHE_MINUTES     = 60    // Advisory only — mission not blocked
export const METAR_CACHE_MINUTES     = 30    // No offline fallback
export const ADC_FIC_CACHE_HOURS     = 2     // Show staleness warning after 2 hours

interface CacheEntry<T> {
  data:       T
  cachedAt:   string   // ISO-8601 UTC
  validUntil: string   // ISO-8601 UTC
  version:    string   // airacCycle or hash
}

// Type definitions for cached payloads
export interface AiracCacheData {
  waypoints:          unknown[]
  airways:            unknown[]
  transitionAltitudes: unknown[]
  airacCycle:         string
}

export interface DroneZoneCache {
  zoneId:        string
  zoneType:      'RED' | 'YELLOW' | 'GREEN'
  areaGeoJson:   unknown
  maxAglFt:      number | null
}

// ── Typed ADC/FIC record interfaces (P9B) ────────────────────────────────
export interface AdcCacheRecord {
  id:               string
  afmluId:          number
  adcNumber:        string
  adcType:          string
  areaGeoJson:      object
  verticalLimits:   object
  effectiveFrom:    string
  effectiveTo:      string | null
  activitySchedule: string | null
}

export interface FicCacheRecord {
  ficNumber:    string
  firCode:      string
  subject:      string
  content:      string
  category:     string
  effectiveFrom: string
  effectiveTo:   string | null
  issuedBy:     string
  issuedAtUtc:  string
}

export class CacheEngine {

  // ── Key namespaces ──────────────────────────────────────────────────────
  private static KEY_AIRAC       = 'cache:airac:v1'
  private static KEY_DRONE_ZONES = 'cache:drone_zones:v1'
  private static KEY_NOTAMS      = 'cache:notams:v1'
  private static KEY_METAR       = (icao: string) => `cache:metar:${icao}:v1`
  private static KEY_ADC         = 'cache:adc:v1'
  private static KEY_FIC         = (fir: string) => `cache:fic:${fir}:v1`

  // ── AIRAC data ──────────────────────────────────────────────────────────

  async saveAiracData(data: AiracCacheData, airacCycle: string): Promise<void> {
    const entry: CacheEntry<AiracCacheData> = {
      data,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addDays(new Date(), AIRAC_CYCLE_DAYS).toISOString(),
      version:    airacCycle
    }
    await AsyncStorage.setItem(CacheEngine.KEY_AIRAC, JSON.stringify(entry))
  }

  async getAiracData(): Promise<{ data: AiracCacheData; staleDays: number; staleWarning: boolean } | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_AIRAC)
    if (!raw) return null
    const entry      = JSON.parse(raw) as CacheEntry<AiracCacheData>
    const staleDays  = this.daysSince(new Date(entry.cachedAt))
    return {
      data:         entry.data,
      staleDays,
      staleWarning: staleDays >= AIRAC_STALE_WARNING_DAYS
    }
  }

  // ── Drone zones — SAFETY-CRITICAL ──────────────────────────────────────
  // If cache is older than DRONE_ZONE_CACHE_HOURS, blocked=true.
  // MissionController MUST check blocked before allowing mission start.
  // This is not advisory — it is a hard gate equivalent to NPNT.

  async saveDroneZones(zones: DroneZoneCache[]): Promise<void> {
    const entry: CacheEntry<DroneZoneCache[]> = {
      data:       zones,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addHours(new Date(), DRONE_ZONE_CACHE_HOURS).toISOString(),
      version:    new Date().toISOString()
    }
    await AsyncStorage.setItem(CacheEngine.KEY_DRONE_ZONES, JSON.stringify(entry))
  }

  async getDroneZones(): Promise<{
    zones:          DroneZoneCache[]
    cacheAgeHours:  number
    blocked:        boolean    // true if cache > 4 hours — mission cannot proceed
    blockedReason?: string
  } | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_DRONE_ZONES)
    if (!raw) return null
    const entry         = JSON.parse(raw) as CacheEntry<DroneZoneCache[]>
    const cacheAgeHours = this.hoursSince(new Date(entry.cachedAt))
    const blocked       = cacheAgeHours >= DRONE_ZONE_CACHE_HOURS
    return {
      zones: entry.data,
      cacheAgeHours,
      blocked,
      ...(blocked && {
        blockedReason: `Drone zone data is stale (${cacheAgeHours.toFixed(1)}h old). Connect to internet to refresh.`
      })
    }
  }

  // ── NOTAMs ──────────────────────────────────────────────────────────────
  // Advisory only — mission not blocked by stale NOTAMs.

  async saveNotams(notams: unknown[]): Promise<void> {
    const entry: CacheEntry<unknown[]> = {
      data:       notams,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addMinutes(new Date(), NOTAM_CACHE_MINUTES).toISOString(),
      version:    new Date().toISOString()
    }
    await AsyncStorage.setItem(CacheEngine.KEY_NOTAMS, JSON.stringify(entry))
  }

  async getNotams(): Promise<{ notams: unknown[]; ageMinutes: number; staleWarning: boolean } | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_NOTAMS)
    if (!raw) return null
    const entry      = JSON.parse(raw) as CacheEntry<unknown[]>
    const ageMinutes = this.minutesSince(new Date(entry.cachedAt))
    return {
      notams:       entry.data,
      ageMinutes,
      staleWarning: ageMinutes >= NOTAM_CACHE_MINUTES
    }
  }

  // ── METARs ──────────────────────────────────────────────────────────────
  // No offline fallback — always show current or nothing.

  async saveMetar(icao: string, metar: unknown): Promise<void> {
    const entry: CacheEntry<unknown> = {
      data:       metar,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addMinutes(new Date(), METAR_CACHE_MINUTES).toISOString(),
      version:    icao
    }
    await AsyncStorage.setItem(CacheEngine.KEY_METAR(icao), JSON.stringify(entry))
  }

  async getMetar(icao: string): Promise<unknown | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_METAR(icao))
    if (!raw) return null
    const entry      = JSON.parse(raw) as CacheEntry<unknown>
    const ageMinutes = this.minutesSince(new Date(entry.cachedAt))
    // No offline fallback — return null if stale
    if (ageMinutes >= METAR_CACHE_MINUTES) return null
    return entry.data
  }

  // ── ADC data — 60-min validity, stale warning at 2 hours ───────────────
  // getAdc().asOfLabel is shown next to the ADC map layer in the user app:
  //   "as of HH:MM" — always visible so users know the age of airspace data.
  // isVeryStale triggers a prominent UI warning (not a mission block).

  async saveAdc(records: AdcCacheRecord[]): Promise<void> {
    const entry: CacheEntry<AdcCacheRecord[]> = {
      data:       records,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addMinutes(new Date(), 60).toISOString(),
      version:    'adc'
    }
    await AsyncStorage.setItem(CacheEngine.KEY_ADC, JSON.stringify(entry))
  }

  async getAdc(): Promise<{
    records:     AdcCacheRecord[]
    ageMinutes:  number
    isStale:     boolean       // > 60 min
    isVeryStale: boolean       // > 120 min — show prominent warning in UI
    asOfLabel:   string        // "as of HH:MM" displayed next to ADC map layer
  } | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_ADC)
    if (!raw) return null
    const entry      = JSON.parse(raw) as CacheEntry<AdcCacheRecord[]>
    const ageMinutes = this.minutesSince(new Date(entry.cachedAt))
    const d          = new Date(entry.cachedAt)
    const asOfLabel  = `as of ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    return {
      records:     entry.data,
      ageMinutes,
      isStale:     ageMinutes > 60,
      isVeryStale: ageMinutes > 120,
      asOfLabel
    }
  }

  // ── FIC data — 60-min validity per FIR ─────────────────────────────────
  // Keyed per FIR code so VIDF, VABB, VECC, VOMF are cached independently.

  async saveFic(firCode: string, records: FicCacheRecord[]): Promise<void> {
    const entry: CacheEntry<FicCacheRecord[]> = {
      data:       records,
      cachedAt:   new Date().toISOString(),
      validUntil: this.addMinutes(new Date(), 60).toISOString(),
      version:    firCode
    }
    await AsyncStorage.setItem(CacheEngine.KEY_FIC(firCode), JSON.stringify(entry))
  }

  async getFic(firCode: string): Promise<{
    records:    FicCacheRecord[]
    ageMinutes: number
    isStale:    boolean
    asOfLabel:  string
  } | null> {
    const raw = await AsyncStorage.getItem(CacheEngine.KEY_FIC(firCode))
    if (!raw) return null
    const entry      = JSON.parse(raw) as CacheEntry<FicCacheRecord[]>
    const ageMinutes = this.minutesSince(new Date(entry.cachedAt))
    const d          = new Date(entry.cachedAt)
    const asOfLabel  = `as of ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    return {
      records: entry.data,
      ageMinutes,
      isStale: ageMinutes > 60,
      asOfLabel
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private addDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * 86400000)
  }
  private addHours(d: Date, hours: number): Date {
    return new Date(d.getTime() + hours * 3600000)
  }
  private addMinutes(d: Date, mins: number): Date {
    return new Date(d.getTime() + mins * 60000)
  }
  private daysSince(d: Date): number {
    return (Date.now() - d.getTime()) / 86400000
  }
  private hoursSince(d: Date): number {
    return (Date.now() - d.getTime()) / 3600000
  }
  private minutesSince(d: Date): number {
    return (Date.now() - d.getTime()) / 60000
  }
}

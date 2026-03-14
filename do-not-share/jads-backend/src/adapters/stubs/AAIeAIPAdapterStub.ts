// Stub implementation of IAAIeAIPAdapter.
// Returns deterministic Indian ATS route network data from embedded RoutePlanningService arrays.
// Government replaces this with a live adapter that polls aim-india.aai.aero eAIP.
// This stub must never make network calls.
//
// DELIBERATE DISCREPANCIES vs JeppesenAdapterStub (for reconciliation testing):
//   1. DPN (Delhi VOR) — frequency 116.10 in Jeppesen, 116.15 here (FREQUENCY_MISMATCH)
//   2. GOA (Goa VOR) — lat 15.3800 in Jeppesen, 15.3808 here (POSITION_MISMATCH — slight)
//   3. MAA (Chennai VOR) — frequency 115.90 in Jeppesen, 112.50 here (FREQUENCY_MISMATCH)
//   4. BPL navaid present in eAIP but missing from Jeppesen (MISSING_IN_JEPPESEN)

import type {
  IAAIeAIPAdapter, EAIPWaypoint, EAIPATSRoute, EAIPNavaid, AIRACStatus,
} from '../interfaces/IAAIeAIPAdapter'
import { ATS_WAYPOINTS, ATS_ROUTES } from '../../services/RoutePlanningService'

const AIRAC_CYCLE = '2602'

// ── FIR bounding boxes for waypoint assignment ───────────────────

const FIR_BOXES: Array<{ firCode: string; latMin: number; latMax: number; lonMin: number; lonMax: number }> = [
  { firCode: 'VIDF', latMin: 22, latMax: 37.5, lonMin: 68, lonMax: 80 },
  { firCode: 'VABB', latMin: 8,  latMax: 22,   lonMin: 65, lonMax: 77 },
  { firCode: 'VECC', latMin: 18, latMax: 30,   lonMin: 80, lonMax: 98 },
  { firCode: 'VOMF', latMin: 6,  latMax: 20,   lonMin: 73, lonMax: 85 },
]

function assignFir(lat: number, lon: number): string {
  for (const fir of FIR_BOXES) {
    if (lat >= fir.latMin && lat < fir.latMax && lon >= fir.lonMin && lon < fir.lonMax) return fir.firCode
  }
  return 'VIDF' // fallback
}

// ── Transform embedded ATS_WAYPOINTS → EAIPWaypoint[] ────────────

function buildWaypoints(): EAIPWaypoint[] {
  return ATS_WAYPOINTS.map(w => ({
    identifier:  w.identifier,
    type:        w.type === 'AERODROME' ? 'FIX' as const
               : w.type === 'REPORTING_POINT' ? 'FIX' as const
               : w.type === 'COORDINATE' ? 'FIX' as const
               : w.type as EAIPWaypoint['type'],
    name:        w.name || w.identifier,
    lat:         w.lat,
    lon:         w.lon,
    freqMhz:    w.freqMhz ?? null,
    firCode:    assignFir(w.lat, w.lon),
    airacCycle: AIRAC_CYCLE,
  }))
}

// ── Transform embedded ATS_ROUTES → EAIPATSRoute[] ───────────────

function buildRoutes(): EAIPATSRoute[] {
  return ATS_ROUTES.map(r => ({
    designator:       r.designator,
    waypointSequence: r.waypoints.map(w => w.identifier),
    direction:        r.direction,
    minFl:            r.minFl,
    maxFl:            r.maxFl,
    routeType:        r.minFl >= 245 ? 'UPPER' as const : r.maxFl <= 245 ? 'LOWER' as const : 'BOTH' as const,
    airacCycle:       AIRAC_CYCLE,
  }))
}

// ── Navaids (VOR/NDB from waypoints + deliberate discrepancies) ──

function buildNavaids(): Map<string, EAIPNavaid[]> {
  const byFir = new Map<string, EAIPNavaid[]>()

  // Navaids from ATS_WAYPOINTS (VOR type only)
  for (const w of ATS_WAYPOINTS) {
    if (w.type !== 'VOR') continue
    const firCode = assignFir(w.lat, w.lon)
    const list = byFir.get(firCode) ?? []

    // Apply deliberate discrepancies for reconciliation testing
    let freq = w.freqMhz ? `${w.freqMhz.toFixed(2)}` : null

    // Discrepancy 1: DPN (Delhi VOR) — Jeppesen says 116.10, eAIP says 116.15
    if (w.identifier === 'DPN') freq = '116.15'

    // Discrepancy 3: MAA (Chennai VOR) — Jeppesen says 115.90, eAIP says 112.50
    // (MAA is not a VOR waypoint in ATS_WAYPOINTS, handled separately below)

    list.push({
      navaidId:    w.identifier,
      type:        'VOR',
      name:        w.name || w.identifier,
      lat:         w.lat,
      lon:         w.lon,
      frequency:   freq,
      declination: null,
      icaoCode:    null,
      firCode,
      airacCycle:  AIRAC_CYCLE,
    })
    byFir.set(firCode, list)
  }

  // Add major airport VOR/DME navaids that overlap with Jeppesen stub
  const airportNavaids: Array<{
    id: string; type: EAIPNavaid['type']; name: string; lat: number; lon: number;
    freq: string; fir: string; icao: string
  }> = [
    // DPN — frequency deliberately different from Jeppesen (116.10 vs 116.15)
    { id: 'DPN', type: 'VOR/DME', name: 'Delhi VOR',       lat: 28.5665, lon: 77.1031, freq: '116.15', fir: 'VIDF', icao: 'VIDP' },
    // BBB — matches Jeppesen exactly
    { id: 'BBB', type: 'VOR/DME', name: 'Mumbai VOR',      lat: 19.0896, lon: 72.8656, freq: '116.50', fir: 'VABB', icao: 'VABB' },
    // GOA — lat deliberately different (15.3808 vs 15.3800 in Jeppesen) — POSITION_MISMATCH
    { id: 'GOA', type: 'VOR',     name: 'Goa VOR',         lat: 15.3808, lon: 73.8314, freq: '112.30', fir: 'VABB', icao: 'VAGO' },
    // CCU — matches Jeppesen exactly
    { id: 'CCU', type: 'VOR/DME', name: 'Kolkata VOR',     lat: 22.6547, lon: 88.4467, freq: '113.30', fir: 'VECC', icao: 'VECC' },
    // MAA — frequency deliberately different from Jeppesen (115.90 vs 112.50)
    { id: 'MAA', type: 'VOR/DME', name: 'Chennai VOR',     lat: 12.9941, lon: 80.1709, freq: '112.50', fir: 'VOMF', icao: 'VOMM' },
    // BLR — matches Jeppesen exactly
    { id: 'BLR', type: 'VOR/DME', name: 'Bangalore VOR',   lat: 13.1986, lon: 77.7066, freq: '114.50', fir: 'VOMF', icao: 'VOBL' },
    // BPL — present in eAIP but NOT in Jeppesen (MISSING_IN_JEPPESEN)
    { id: 'BPL', type: 'VOR',     name: 'Bhopal VOR',      lat: 23.2867, lon: 77.3372, freq: '113.70', fir: 'VIDF', icao: 'VABP' },
  ]

  for (const n of airportNavaids) {
    const list = byFir.get(n.fir) ?? []
    // Skip if already added from ATS_WAYPOINTS
    if (!list.some(x => x.navaidId === n.id)) {
      list.push({
        navaidId:    n.id,
        type:        n.type,
        name:        n.name,
        lat:         n.lat,
        lon:         n.lon,
        frequency:   n.freq,
        declination: null,
        icaoCode:    n.icao,
        firCode:     n.fir,
        airacCycle:  AIRAC_CYCLE,
      })
      byFir.set(n.fir, list)
    }
  }

  return byFir
}

// ── Cached data ──────────────────────────────────────────────────

const cachedWaypoints = buildWaypoints()
const cachedRoutes    = buildRoutes()
const cachedNavaids   = buildNavaids()

// ── Stub class ───────────────────────────────────────────────────

export class AAIeAIPAdapterStub implements IAAIeAIPAdapter {

  async getWaypoints(firCode: string): Promise<EAIPWaypoint[]> {
    return cachedWaypoints.filter(w => w.firCode === firCode)
  }

  async getATSRoutes(): Promise<EAIPATSRoute[]> {
    return cachedRoutes
  }

  async getNavaids(firCode: string): Promise<EAIPNavaid[]> {
    return cachedNavaids.get(firCode) ?? []
  }

  async getAIRACStatus(): Promise<AIRACStatus> {
    return {
      cycle:             '2602',
      effectiveDate:     '2026-02-20T00:00:00Z',
      nextCycle:         '2603',
      nextEffectiveDate: '2026-03-20T00:00:00Z',
    }
  }

  async ping(): Promise<{ connected: boolean; latencyMs: number }> {
    return { connected: true, latencyMs: 5 }
  }
}

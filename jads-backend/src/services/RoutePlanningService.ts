/**
 * RoutePlanningService.ts
 *
 * Route planning with:
 *   - ATS airway/waypoint dataset (embedded, AIRAC-versioned)
 *   - Segment-by-segment analysis (track, EET, semicircular parity)
 *   - Direct routing (DCT) — default for special users
 *   - Mixed routing (airways + DCT)
 *   - AFTN route string generation
 *
 * Used by the user app route planning tab.
 * Segment semicircular rule validation is the primary safety output —
 * tells the pilot BEFORE filing whether the FL is correct for each segment.
 */

import { createServiceLogger }     from '../logger'
import { toAftnSignificantPoint }  from '../utils/coordinateParser'

const log = createServiceLogger('RoutePlanningService')

// ── Types ─────────────────────────────────────────────────────────────────────

export type RouteMode    = 'AIRWAYS' | 'DIRECT' | 'MIXED'
export type FlParity     = 'ODD' | 'EVEN'
export type WaypointType = 'VOR' | 'NDB' | 'FIX' | 'REPORTING_POINT' | 'AERODROME' | 'COORDINATE'

export interface AtsWaypoint {
  identifier: string
  type:       WaypointType
  lat:        number
  lon:        number
  freqMhz?:  number
  name?:     string
}

export interface AtsRoute {
  designator: string    // L301, G204, B466, W40
  waypoints:  AtsWaypoint[]
  direction:  'BOTH' | 'FORWARD_ONLY' | 'REVERSE_ONLY'
  minFl:      number
  maxFl:      number
}

export interface RouteSegment {
  from:           AtsWaypoint
  to:             AtsWaypoint
  routeType:      'AIRWAY' | 'DIRECT'
  airwayId?:      string
  // Computed
  trueTrackDeg:   number
  magneticTrackDeg: number
  distanceNm:     number
  requiredParity: FlParity
  eetMinutes:     number
}

export interface SegmentValidationResult {
  segment:        string    // "GANDO→PAKER"
  magneticTrack:  number
  requiredParity: FlParity
  compliant:      boolean
  suggestion?:    string    // "Use FL320 or FL340 (even FL required for this track)"
}

export interface PlannedRoute {
  mode:                 RouteMode
  waypoints:            AtsWaypoint[]
  segments:             RouteSegment[]
  totalEet:      number
  estimatedTotalEet:    string          // "HH:MM"
  firSequence:          FirCrossing[]
  semicircularResults:  SegmentValidationResult[]
  aftnRouteString:      string
  allSegmentsCompliant: boolean
}

export interface FirCrossing {
  firCode:       string
  firName:       string
  entryWaypoint: string
}

// ── India FIR assignment (simplified — full polygon check in FirGeometryEngine) ─

const FIR_ASSIGNMENT: Array<{
  firCode: string; firName: string;
  latMin: number; latMax: number; lonMin: number; lonMax: number;
}> = [
  { firCode: 'VIDF', firName: 'Delhi FIR',   latMin: 22, latMax: 37.5, lonMin: 68, lonMax: 80 },
  { firCode: 'VABB', firName: 'Mumbai FIR',  latMin: 8,  latMax: 22,   lonMin: 65, lonMax: 77 },
  { firCode: 'VECC', firName: 'Kolkata FIR', latMin: 18, latMax: 30,   lonMin: 80, lonMax: 98 },
  { firCode: 'VOMF', firName: 'Chennai FIR', latMin: 6,  latMax: 20,   lonMin: 73, lonMax: 85 },
]

function assignFir(lat: number, lon: number): { firCode: string; firName: string } {
  for (const fir of FIR_ASSIGNMENT) {
    if (lat >= fir.latMin && lat < fir.latMax && lon >= fir.lonMin && lon < fir.lonMax) {
      return { firCode: fir.firCode, firName: fir.firName }
    }
  }
  return { firCode: 'VIDF', firName: 'Delhi FIR' } // fallback
}

// ── Key Indian ATS waypoints (subset — full dataset in production) ────────────

export const ATS_WAYPOINTS: AtsWaypoint[] = [
  // VORs
  { identifier: 'VNS',   type: 'VOR', lat: 25.4522, lon: 82.8593, freqMhz: 113.2, name: 'Varanasi VOR' },
  { identifier: 'ATL',   type: 'VOR', lat: 23.8434, lon: 86.4222, freqMhz: 112.8, name: 'Asansol VOR' },
  { identifier: 'ATA',   type: 'VOR', lat: 28.0000, lon: 73.0000, freqMhz: 114.5, name: 'Aimer VOR' },
  { identifier: 'ISK',   type: 'VOR', lat: 20.0006, lon: 73.8078, freqMhz: 110.4, name: 'Nasik VOR' },
  // Reporting points
  { identifier: 'GANDO', type: 'FIX', lat: 27.3861, lon: 77.7125, name: 'GANDO' },
  { identifier: 'PAKER', type: 'FIX', lat: 26.0000, lon: 77.0000, name: 'PAKER' },
  { identifier: 'BUBIM', type: 'FIX', lat: 23.5000, lon: 75.5000, name: 'BUBIM' },
  { identifier: 'IGARI', type: 'FIX', lat: 22.0000, lon: 74.2000, name: 'IGARI' },
  { identifier: 'TATIM', type: 'FIX', lat: 21.0000, lon: 73.5000, name: 'TATIM' },
  { identifier: 'SULOM', type: 'FIX', lat: 19.8000, lon: 73.2000, name: 'SULOM' },
  // Aerodromes as waypoints
  { identifier: 'VIDP', type: 'AERODROME', lat: 28.5665, lon: 77.1031, name: 'Delhi' },
  { identifier: 'VABB', type: 'AERODROME', lat: 19.0896, lon: 72.8656, name: 'Mumbai' },
  { identifier: 'VECC', type: 'AERODROME', lat: 22.6547, lon: 88.4467, name: 'Kolkata' },
  { identifier: 'VOMM', type: 'AERODROME', lat: 12.9900, lon: 80.1693, name: 'Chennai' },
  { identifier: 'VOBL', type: 'AERODROME', lat: 13.1986, lon: 77.7066, name: 'Bengaluru' },
  { identifier: 'VOHS', type: 'AERODROME', lat: 17.2403, lon: 78.4294, name: 'Hyderabad' },
  { identifier: 'VAAH', type: 'AERODROME', lat: 23.0772, lon: 72.6347, name: 'Ahmedabad' },
]

// Key Indian ATS routes
export const ATS_ROUTES: AtsRoute[] = [
  {
    designator: 'L301',
    direction:  'BOTH',
    minFl: 100, maxFl: 460,
    waypoints: [
      ATS_WAYPOINTS.find(w => w.identifier === 'VIDP')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'GANDO')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'PAKER')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'IGARI')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'TATIM')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'VABB')!,
    ].filter(Boolean) as AtsWaypoint[],
  },
  {
    designator: 'G204',
    direction:  'BOTH',
    minFl: 90, maxFl: 460,
    waypoints: [
      ATS_WAYPOINTS.find(w => w.identifier === 'VIDP')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'VNS')!,
      ATS_WAYPOINTS.find(w => w.identifier === 'VECC')!,
    ].filter(Boolean) as AtsWaypoint[],
  },
]

// ── Main service ──────────────────────────────────────────────────────────────

export class RoutePlanningService {

  /**
   * Build a planned route from a list of waypoints.
   * routeType array must match waypoints.length - 1 (one per segment).
   */
  planRoute(
    waypoints:   AtsWaypoint[],
    routeTypes:  Array<{ type: 'AIRWAY' | 'DIRECT'; airwayId?: string }>,
    groundspeedKts: number,
    flightLevel:    number
  ): PlannedRoute {

    if (waypoints.length < 2) {
      throw new Error('Route requires at least departure and destination waypoints')
    }

    const segments: RouteSegment[] = []
    const firsSeen  = new Set<string>()
    const firSeq:   FirCrossing[]  = []

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from     = waypoints[i]
      const to       = waypoints[i + 1]
      const routeInfo = routeTypes[i] ?? { type: 'DIRECT' as const }

      const trueTrack = greatCircleBearing(from.lat, from.lon, to.lat, to.lon)
      const magVar    = getMagneticVariation(from.lat, from.lon)
      const magTrack  = (trueTrack + magVar + 360) % 360
      const distNm    = haversineNm(from.lat, from.lon, to.lat, to.lon)
      const eetMin    = groundspeedKts > 0 ? (distNm / groundspeedKts) * 60 : 0

      segments.push({
        from,
        to,
        routeType:        routeInfo.type,
        airwayId:         routeInfo.airwayId,
        trueTrackDeg:     trueTrack,
        magneticTrackDeg: magTrack,
        distanceNm:       distNm,
        requiredParity:   magTrack < 180 ? 'ODD' : 'EVEN',
        eetMinutes:       eetMin,
      })

      // FIR sequence
      const midLat = (from.lat + to.lat) / 2
      const midLon = (from.lon + to.lon) / 2
      const fir    = assignFir(midLat, midLon)
      if (!firsSeen.has(fir.firCode)) {
        firsSeen.add(fir.firCode)
        firSeq.push({ ...fir, entryWaypoint: from.identifier })
      }
    }

    // Semicircular validation
    const semicircularResults: SegmentValidationResult[] = segments.map(seg => {
      const isOdd    = flightLevel % 2 !== 0
      const compliant = (seg.requiredParity === 'ODD' && isOdd) ||
                        (seg.requiredParity === 'EVEN' && !isOdd)
      return {
        segment:        `${seg.from.identifier}→${seg.to.identifier}`,
        magneticTrack:  Math.round(seg.magneticTrackDeg),
        requiredParity: seg.requiredParity,
        compliant,
        suggestion:     !compliant
          ? `Track ${Math.round(seg.magneticTrackDeg)}°M requires ${seg.requiredParity} FL. ` +
            `Use FL${flightLevel % 2 !== 0 ? flightLevel - 1 : flightLevel + 1} or ` +
            `FL${flightLevel % 2 !== 0 ? flightLevel + 1 : flightLevel - 1}.`
          : undefined,
      }
    })

    const totalDistNm  = segments.reduce((s, seg) => s + seg.distanceNm, 0)
    const totalEetMin  = segments.reduce((s, seg) => s + seg.eetMinutes, 0)
    const hh           = Math.floor(totalEetMin / 60)
    const mm           = Math.round(totalEetMin % 60)

    return {
      mode:                 this.detectMode(routeTypes),
      waypoints,
      segments,
      totalEet:      Math.round(totalDistNm),
      estimatedTotalEet:    `${String(hh).padStart(2,'0')}${String(mm).padStart(2,'0')}`,
      firSequence:          firSeq,
      semicircularResults,
      aftnRouteString:      this.buildAftnRouteString(segments),
      allSegmentsCompliant: semicircularResults.every(r => r.compliant),
    }
  }

  /** Build a simple direct route (DCT) — default for special users */
  planDirectRoute(
    from:           AtsWaypoint,
    to:             AtsWaypoint,
    intermediates:  AtsWaypoint[],
    groundspeedKts: number,
    flightLevel:    number
  ): PlannedRoute {
    const allWaypoints = [from, ...intermediates, to]
    const routeTypes   = allWaypoints.slice(0, -1).map(() => ({ type: 'DIRECT' as const }))
    return this.planRoute(allWaypoints, routeTypes, groundspeedKts, flightLevel)
  }

  /** Build AFTN route string from segments */
  buildAftnRouteString(segments: RouteSegment[]): string {
    const parts: string[] = []

    for (const seg of segments) {
      if (seg.routeType === 'DIRECT') {
        parts.push('DCT')
        parts.push(waypointToAftnId(seg.to))
      } else {
        if (seg.airwayId) parts.push(seg.airwayId)
        parts.push(waypointToAftnId(seg.to))
      }
    }

    return parts.join(' ')
  }

  private detectMode(routeTypes: Array<{ type: string }>): RouteMode {
    const hasAirway = routeTypes.some(r => r.type === 'AIRWAY')
    const hasDirect = routeTypes.some(r => r.type === 'DIRECT')
    if (hasAirway && hasDirect) return 'MIXED'
    if (hasAirway)              return 'AIRWAYS'
    return 'DIRECT'
  }
}

// ── Geo helpers ───────────────────────────────────────────────────────────────

function greatCircleBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const dLon = toRad(lon2 - lon1)
  const y    = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x    = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
               Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 3440.065  // Earth radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// India magnetic variation (simplified — ranges ~-1° to +2°)
function getMagneticVariation(lat: number, lon: number): number {
  // Linear approximation across India — full WMM lookup in production
  const variation = -0.5 + (lat - 20) * 0.05 + (lon - 80) * 0.02
  return Math.max(-2, Math.min(3, variation))
}

function waypointToAftnId(wp: AtsWaypoint): string {
  if (wp.type === 'AERODROME') return wp.identifier
  if (wp.type === 'VOR' || wp.type === 'NDB') return wp.identifier
  if (wp.type === 'FIX' || wp.type === 'REPORTING_POINT') return wp.identifier
  // Coordinate waypoint
  return toAftnSignificantPoint(wp.lat, wp.lon)
}

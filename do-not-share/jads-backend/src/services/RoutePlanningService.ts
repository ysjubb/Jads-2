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

// ── Indian ATS waypoints — major trunk route network ─────────────────────────

export const ATS_WAYPOINTS: AtsWaypoint[] = [
  // ── VOR/DME navaids ─────────────────────────────────────────────────────────
  { identifier: 'VNS',   type: 'VOR', lat: 25.4522, lon: 82.8593, freqMhz: 113.2, name: 'Varanasi VOR' },
  { identifier: 'ATL',   type: 'VOR', lat: 23.8434, lon: 86.4222, freqMhz: 112.8, name: 'Asansol VOR' },
  { identifier: 'ATA',   type: 'VOR', lat: 28.0000, lon: 73.0000, freqMhz: 114.5, name: 'Aimer VOR' },
  { identifier: 'ISK',   type: 'VOR', lat: 20.0006, lon: 73.8078, freqMhz: 110.4, name: 'Nasik VOR' },
  { identifier: 'BPL',   type: 'VOR', lat: 23.2867, lon: 77.3372, freqMhz: 113.7, name: 'Bhopal VOR' },
  { identifier: 'JLR',   type: 'VOR', lat: 23.1778, lon: 80.0521, freqMhz: 114.1, name: 'Jabalpur VOR' },
  { identifier: 'NGP',   type: 'VOR', lat: 21.0922, lon: 79.0472, freqMhz: 113.0, name: 'Nagpur VOR' },
  { identifier: 'RJT',   type: 'VOR', lat: 22.3092, lon: 70.7794, freqMhz: 112.1, name: 'Rajkot VOR' },

  // ── Reporting points / fixes — L301 (Delhi→Mumbai) ─────────────────────────
  { identifier: 'GANDO', type: 'FIX', lat: 27.3861, lon: 77.7125, name: 'GANDO' },
  { identifier: 'PAKER', type: 'FIX', lat: 26.0000, lon: 77.0000, name: 'PAKER' },
  { identifier: 'BUBIM', type: 'FIX', lat: 23.5000, lon: 75.5000, name: 'BUBIM' },
  { identifier: 'IGARI', type: 'FIX', lat: 22.0000, lon: 74.2000, name: 'IGARI' },
  { identifier: 'TATIM', type: 'FIX', lat: 21.0000, lon: 73.5000, name: 'TATIM' },
  { identifier: 'SULOM', type: 'FIX', lat: 19.8000, lon: 73.2000, name: 'SULOM' },

  // ── Fixes — W1 (Delhi→Ahmedabad→Bangalore) ────────────────────────────────
  { identifier: 'BETRA', type: 'FIX', lat: 27.5000, lon: 76.0000, name: 'BETRA' },
  { identifier: 'PARAR', type: 'FIX', lat: 25.8000, lon: 74.2000, name: 'PARAR' },
  { identifier: 'GULAB', type: 'FIX', lat: 20.5000, lon: 76.5000, name: 'GULAB' },
  { identifier: 'LOTAV', type: 'FIX', lat: 17.8000, lon: 77.2000, name: 'LOTAV' },
  { identifier: 'ADKAL', type: 'FIX', lat: 15.5000, lon: 77.5000, name: 'ADKAL' },

  // ── Fixes — W15 (Delhi→Hyderabad→Chennai) ──────────────────────────────────
  { identifier: 'AGNIK', type: 'FIX', lat: 26.8000, lon: 78.0000, name: 'AGNIK' },
  { identifier: 'IBOVI', type: 'FIX', lat: 23.0000, lon: 78.5000, name: 'IBOVI' },
  { identifier: 'PESOT', type: 'FIX', lat: 14.8000, lon: 79.5000, name: 'PESOT' },

  // ── Fixes — A791 (Mumbai→Chennai) ──────────────────────────────────────────
  { identifier: 'PEDAM', type: 'FIX', lat: 18.0000, lon: 75.5000, name: 'PEDAM' },
  { identifier: 'TELEM', type: 'FIX', lat: 14.5000, lon: 78.0000, name: 'TELEM' },

  // ── Fixes — G450 (Mumbai→Kolkata) ──────────────────────────────────────────
  { identifier: 'BUBOS', type: 'FIX', lat: 20.5000, lon: 77.0000, name: 'BUBOS' },
  { identifier: 'POLER', type: 'FIX', lat: 21.5000, lon: 83.0000, name: 'POLER' },

  // ── Fixes — W34 (Delhi→Goa) ────────────────────────────────────────────────
  { identifier: 'LALUT', type: 'FIX', lat: 25.5000, lon: 76.0000, name: 'LALUT' },
  { identifier: 'NIKAB', type: 'FIX', lat: 21.5000, lon: 74.5000, name: 'NIKAB' },

  // ── Fixes — B345 (Kolkata→Bangalore) ───────────────────────────────────────
  { identifier: 'RUDRA', type: 'FIX', lat: 19.0000, lon: 83.5000, name: 'RUDRA' },
  { identifier: 'DOMIL', type: 'FIX', lat: 16.0000, lon: 80.0000, name: 'DOMIL' },

  // ── Aerodromes as waypoints ────────────────────────────────────────────────
  { identifier: 'VIDP', type: 'AERODROME', lat: 28.5665, lon: 77.1031, name: 'Delhi' },
  { identifier: 'VABB', type: 'AERODROME', lat: 19.0896, lon: 72.8656, name: 'Mumbai' },
  { identifier: 'VECC', type: 'AERODROME', lat: 22.6547, lon: 88.4467, name: 'Kolkata' },
  { identifier: 'VOMM', type: 'AERODROME', lat: 12.9900, lon: 80.1693, name: 'Chennai' },
  { identifier: 'VOBL', type: 'AERODROME', lat: 13.1986, lon: 77.7066, name: 'Bengaluru' },
  { identifier: 'VOHS', type: 'AERODROME', lat: 17.2403, lon: 78.4294, name: 'Hyderabad' },
  { identifier: 'VAAH', type: 'AERODROME', lat: 23.0772, lon: 72.6347, name: 'Ahmedabad' },
  { identifier: 'VAGO', type: 'AERODROME', lat: 15.3808, lon: 73.8314, name: 'Goa' },
  { identifier: 'VIJP', type: 'AERODROME', lat: 26.8242, lon: 75.8122, name: 'Jaipur' },
  { identifier: 'VILK', type: 'AERODROME', lat: 26.7606, lon: 80.8893, name: 'Lucknow' },
  { identifier: 'VIAR', type: 'AERODROME', lat: 32.1614, lon: 76.2635, name: 'Kangra' },
  { identifier: 'VOCL', type: 'AERODROME', lat: 11.1368, lon: 75.9553, name: 'Calicut' },
  { identifier: 'VOCI', type: 'AERODROME', lat:  9.9471, lon: 76.2673, name: 'Cochin' },
]

/** Resolve a waypoint by identifier from the static dataset */
export function resolveWaypoint(id: string): AtsWaypoint | undefined {
  return ATS_WAYPOINTS.find(w => w.identifier === id)
}

// ── Indian ATS routes — major trunk airways ──────────────────────────────────

const wp = (id: string) => ATS_WAYPOINTS.find(w => w.identifier === id)!

export const ATS_ROUTES: AtsRoute[] = [
  // L301: Delhi → Mumbai (primary trunk)
  {
    designator: 'L301', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('GANDO'), wp('PAKER'), wp('IGARI'), wp('TATIM'), wp('VABB')],
  },
  // G204: Delhi → Kolkata
  {
    designator: 'G204', direction: 'BOTH', minFl: 90, maxFl: 460,
    waypoints: [wp('VIDP'), wp('VNS'), wp('VECC')],
  },
  // W1: Delhi → Ahmedabad → Bangalore
  {
    designator: 'W1', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('BETRA'), wp('PARAR'), wp('VAAH'), wp('GULAB'), wp('LOTAV'), wp('ADKAL'), wp('VOBL')],
  },
  // W15: Delhi → Hyderabad → Chennai
  {
    designator: 'W15', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('AGNIK'), wp('IBOVI'), wp('VOHS'), wp('PESOT'), wp('VOMM')],
  },
  // A791: Mumbai → Chennai
  {
    designator: 'A791', direction: 'BOTH', minFl: 150, maxFl: 460,
    waypoints: [wp('VABB'), wp('ISK'), wp('PEDAM'), wp('TELEM'), wp('VOMM')],
  },
  // G450: Mumbai → Kolkata
  {
    designator: 'G450', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VABB'), wp('BUBOS'), wp('NGP'), wp('POLER'), wp('VECC')],
  },
  // W34: Delhi → Goa
  {
    designator: 'W34', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('LALUT'), wp('BUBIM'), wp('NIKAB'), wp('VAGO')],
  },
  // B345: Kolkata → Bangalore
  {
    designator: 'B345', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VECC'), wp('RUDRA'), wp('DOMIL'), wp('VOBL')],
  },
]

// ── Main service ──────────────────────────────────────────────────────────────

export class RoutePlanningService {

  /**
   * Find the best airway route between two aerodromes using BFS graph search.
   * Returns the airway + waypoint chain, or null if no published route exists.
   */
  findRoute(adepIcao: string, adesIcao: string): { airway: AtsRoute; waypoints: AtsWaypoint[]; reversed: boolean } | null {
    // Direct match: find an airway that contains both ADEP and ADES
    for (const route of ATS_ROUTES) {
      const idxDep  = route.waypoints.findIndex(w => w.identifier === adepIcao)
      const idxDest = route.waypoints.findIndex(w => w.identifier === adesIcao)
      if (idxDep >= 0 && idxDest >= 0) {
        const forward = idxDep < idxDest
        if (forward && route.direction !== 'REVERSE_ONLY') {
          return { airway: route, waypoints: route.waypoints.slice(idxDep, idxDest + 1), reversed: false }
        }
        if (!forward && route.direction !== 'FORWARD_ONLY') {
          return { airway: route, waypoints: route.waypoints.slice(idxDest, idxDep + 1).reverse(), reversed: true }
        }
      }
    }

    // BFS across airways: find multi-airway connections via shared waypoints
    // Build adjacency: waypoint identifier → list of { airway, waypoints, direction to dest }
    type Node = { wpId: string; path: Array<{ airway: AtsRoute; waypoints: AtsWaypoint[]; reversed: boolean }> }
    const visited = new Set<string>()
    const queue: Node[] = [{ wpId: adepIcao, path: [] }]
    visited.add(adepIcao)

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.path.length > 3) continue // max 3 airway hops

      for (const route of ATS_ROUTES) {
        const idxCurrent = route.waypoints.findIndex(w => w.identifier === current.wpId)
        if (idxCurrent < 0) continue

        // Check if ADES is on this airway
        const idxDest = route.waypoints.findIndex(w => w.identifier === adesIcao)
        if (idxDest >= 0) {
          const forward = idxCurrent < idxDest
          if ((forward && route.direction !== 'REVERSE_ONLY') || (!forward && route.direction !== 'FORWARD_ONLY')) {
            const wps = forward
              ? route.waypoints.slice(idxCurrent, idxDest + 1)
              : route.waypoints.slice(idxDest, idxCurrent + 1).reverse()
            const finalPath = [...current.path, { airway: route, waypoints: wps, reversed: !forward }]
            // Return the first (shortest) match — combine into single waypoint chain
            const combined: AtsWaypoint[] = []
            for (const seg of finalPath) {
              for (let i = 0; i < seg.waypoints.length; i++) {
                if (i === 0 && combined.length > 0 && combined[combined.length - 1].identifier === seg.waypoints[0].identifier) continue
                combined.push(seg.waypoints[i])
              }
            }
            return { airway: finalPath[0].airway, waypoints: combined, reversed: false }
          }
        }

        // Extend BFS to all waypoints on this airway reachable from current position
        for (let i = 0; i < route.waypoints.length; i++) {
          if (i === idxCurrent) continue
          const wpId = route.waypoints[i].identifier
          if (visited.has(wpId)) continue
          const forward = idxCurrent < i
          if ((forward && route.direction === 'REVERSE_ONLY') || (!forward && route.direction === 'FORWARD_ONLY')) continue

          visited.add(wpId)
          const wps = forward
            ? route.waypoints.slice(idxCurrent, i + 1)
            : route.waypoints.slice(i, idxCurrent + 1).reverse()
          queue.push({ wpId, path: [...current.path, { airway: route, waypoints: wps, reversed: !forward }] })
        }
      }
    }

    return null
  }

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

export function greatCircleBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const dLon = toRad(lon2 - lon1)
  const y    = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x    = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
               Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 3440.065  // Earth radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// India magnetic variation (simplified — ranges ~-1° to +2°)
export function getMagneticVariation(lat: number, lon: number): number {
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

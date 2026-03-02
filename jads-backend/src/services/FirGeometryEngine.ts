// FIR Geometry Engine — determines which India FIRs a route crosses in order
// and computes EET per FIR segment.
//
// INVARIANTS:
//   - Four India FIRs only: VIDF, VABB, VECC, VOMF
//   - FIR boundaries are STATIC constants (IndiaFirBoundaries.ts) — not DB queries
//   - FIR sequence is in route order, not alphabetical
//   - Ray casting — no external geospatial library
//   - EET per FIR uses groundspeedKts from RouteSemanticEngine

import { INDIA_FIR_BOUNDARIES, FirBoundary } from '../data/IndiaFirBoundaries'
import type { RouteLeg }                       from './RouteSemanticEngine'
import { createServiceLogger }                 from '../logger'

const log = createServiceLogger('FirGeometryEngine')

export interface FirCrossing {
  firCode:    string
  firName:    string
  callsign:   string
  entryPoint: string
  exitPoint:  string
  distanceNm: number
  eetMinutes: number
}

export interface FirSequenceResult {
  crossings:     FirCrossing[]
  totalFirs:     number
  eetPerFirJson: string
}

export class FirGeometryEngine {

  computeFirSequence(
    routeLegs:      RouteLeg[],
    groundspeedKts: number,
    depIcao:        string,
    destIcao:       string
  ): FirSequenceResult {
    if (routeLegs.length === 0 || groundspeedKts <= 0) {
      return { crossings: [], totalFirs: 0, eetPerFirJson: '[]' }
    }

    // Walk each leg, classify midpoint into a FIR, track transitions
    const firSegments: Array<{
      firCode: string; firName: string; callsign: string
      entryPointId: string; exitPointId: string; distNm: number
    }> = []

    let currentFir:           FirBoundary | null = null
    let currentSegmentStart:  string             = depIcao
    let currentSegmentDist:   number             = 0

    for (const leg of routeLegs) {
      const midLat = (leg.from.latDeg + leg.to.latDeg) / 2
      const midLon = (leg.from.lonDeg + leg.to.lonDeg) / 2
      const legFir = this.pointInFir(midLat, midLon)

      if (legFir === null) continue   // Oceanic / outside India

      if (currentFir === null) {
        currentFir           = legFir
        currentSegmentStart  = leg.from.identifier
        currentSegmentDist   = leg.distanceNm
      } else if (legFir.firCode !== currentFir.firCode) {
        // FIR transition — close previous segment
        firSegments.push({
          firCode:      currentFir.firCode,
          firName:      currentFir.firName,
          callsign:     currentFir.callsign,
          entryPointId: currentSegmentStart,
          exitPointId:  leg.from.identifier,
          distNm:       currentSegmentDist
        })
        currentFir           = legFir
        currentSegmentStart  = leg.from.identifier
        currentSegmentDist   = leg.distanceNm
      } else {
        currentSegmentDist  += leg.distanceNm
      }
    }

    if (currentFir !== null) {
      firSegments.push({
        firCode:      currentFir.firCode,
        firName:      currentFir.firName,
        callsign:     currentFir.callsign,
        entryPointId: currentSegmentStart,
        exitPointId:  destIcao,
        distNm:       currentSegmentDist
      })
    }

    const crossings: FirCrossing[] = firSegments.map(seg => ({
      firCode:    seg.firCode,
      firName:    seg.firName,
      callsign:   seg.callsign,
      entryPoint: seg.entryPointId,
      exitPoint:  seg.exitPointId,
      distanceNm: Math.round(seg.distNm),
      eetMinutes: groundspeedKts > 0 ? Math.round((seg.distNm / groundspeedKts) * 60) : 0
    }))

    log.info('fir_sequence_computed', {
      data: {
        dep: depIcao, dest: destIcao,
        firCount: crossings.length,
        sequence: crossings.map(c => c.firCode).join(' → ')
      }
    })

    return {
      crossings,
      totalFirs:     crossings.length,
      eetPerFirJson: JSON.stringify(crossings.map(c => ({
        firCode:    c.firCode,
        eetMinutes: c.eetMinutes,
        distNm:     c.distanceNm
      })))
    }
  }

  // Returns the FIR containing the point, or null if outside all India FIRs
  pointInFir(latDeg: number, lonDeg: number): FirBoundary | null {
    for (const fir of INDIA_FIR_BOUNDARIES) {
      if (this.isPointInPolygon(latDeg, lonDeg, fir.polygon)) return fir
    }
    return null
  }

  // Ray casting algorithm — correct for convex and concave polygons
  isPointInPolygon(
    lat:     number,
    lon:     number,
    polygon: Array<{ lat: number; lon: number }>
  ): boolean {
    let inside = false
    const n    = polygon.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].lon, yi = polygon[i].lat
      const xj = polygon[j].lon, yj = polygon[j].lat
      const intersect = ((yi > lat) !== (yj > lat)) &&
                        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }
}

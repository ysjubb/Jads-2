/**
 * DS-07 — Drone FIR Boundary Detection Service
 *
 * Detects which Indian FIR(s) a drone fly area falls within.
 * Uses the 4 GeoJSON FIR boundary files from Digital Sky:
 *   - VIDF (Delhi)
 *   - VABB (Mumbai)  — note: DS uses VABF in some contexts
 *   - VECC (Kolkata) — note: DS uses VECF in some contexts
 *   - VOMF (Chennai)
 *
 * Per DS contract §10, this is used by:
 *   - FlyDronePermissionService: set fir field on application
 *   - RoutePlanningService: FIR crossings for manned flights
 *   - DataSourceReconciliationService: per-FIR data filtering
 *
 * Algorithm: ray-casting point-in-polygon for each FIR boundary.
 * Checks every vertex of the fly area polygon, plus centroid.
 */

import { createServiceLogger } from '../logger'
import { FirGeometryEngine } from './FirGeometryEngine'
import { INDIA_FIR_BOUNDARIES, FirBoundary } from '../data/IndiaFirBoundaries'

const log = createServiceLogger('DroneFirDetectionService')

// ── Types ──────────────────────────────────────────────────────────────

export interface DroneFirResult {
  /** Primary FIR (by centroid) */
  primaryFir:        string
  primaryFirName:    string
  primaryFirCallsign: string
  /** All FIRs the polygon touches */
  affectedFirs:      Array<{
    firCode:   string
    firName:   string
    callsign:  string
    vertexCount: number
  }>
  /** Whether polygon spans multiple FIRs */
  crossesFirBoundary: boolean
  /** Total vertices analyzed */
  totalVertices:     number
}

// ── Service ────────────────────────────────────────────────────────────

export class DroneFirDetectionService {
  private firEngine = new FirGeometryEngine()

  /**
   * Detect FIR(s) for a drone fly area polygon.
   *
   * @param flyArea  Polygon vertices (lat/lon)
   */
  detectFir(flyArea: Array<{ latitude: number; longitude: number }>): DroneFirResult {
    if (flyArea.length === 0) {
      return {
        primaryFir: 'UNKNOWN', primaryFirName: 'Unknown',
        primaryFirCallsign: 'Unknown', affectedFirs: [],
        crossesFirBoundary: false, totalVertices: 0,
      }
    }

    // Check each vertex
    const firHits: Map<string, { boundary: FirBoundary; count: number }> = new Map()

    for (const pt of flyArea) {
      const fir = this.firEngine.pointInFir(pt.latitude, pt.longitude)
      if (fir) {
        const existing = firHits.get(fir.firCode)
        if (existing) {
          existing.count++
        } else {
          firHits.set(fir.firCode, { boundary: fir, count: 1 })
        }
      }
    }

    // Check centroid
    const centroid = this.computeCentroid(flyArea)
    const centroidFir = this.firEngine.pointInFir(centroid.latitude, centroid.longitude)

    // Determine primary FIR (by centroid, fallback to most vertices)
    let primaryFir: FirBoundary | null = centroidFir
    if (!primaryFir && firHits.size > 0) {
      // Use FIR with most vertex hits
      let maxCount = 0
      for (const { boundary, count } of firHits.values()) {
        if (count > maxCount) {
          maxCount = count
          primaryFir = boundary
        }
      }
    }

    const affectedFirs = Array.from(firHits.values()).map(h => ({
      firCode: h.boundary.firCode,
      firName: h.boundary.firName,
      callsign: h.boundary.callsign,
      vertexCount: h.count,
    }))

    const result: DroneFirResult = {
      primaryFir: primaryFir?.firCode ?? 'UNKNOWN',
      primaryFirName: primaryFir?.firName ?? 'Unknown',
      primaryFirCallsign: primaryFir?.callsign ?? 'Unknown',
      affectedFirs,
      crossesFirBoundary: firHits.size > 1,
      totalVertices: flyArea.length,
    }

    log.info('fir_detection_complete', {
      data: {
        primaryFir: result.primaryFir,
        affectedCount: affectedFirs.length,
        crosses: result.crossesFirBoundary,
      }
    })

    return result
  }

  /**
   * Simple point-based FIR lookup (for single coordinates).
   */
  detectFirForPoint(latitude: number, longitude: number): {
    firCode: string; firName: string; callsign: string
  } | null {
    const fir = this.firEngine.pointInFir(latitude, longitude)
    if (!fir) return null
    return { firCode: fir.firCode, firName: fir.firName, callsign: fir.callsign }
  }

  /**
   * Get all available FIR boundaries.
   */
  getAllFirs(): Array<{ firCode: string; firName: string; callsign: string; vertexCount: number }> {
    return INDIA_FIR_BOUNDARIES.map(fir => ({
      firCode: fir.firCode,
      firName: fir.firName,
      callsign: fir.callsign,
      vertexCount: fir.polygon.length,
    }))
  }

  // ── Private ──────────────────────────────────────────────────────────

  private computeCentroid(
    points: Array<{ latitude: number; longitude: number }>
  ): { latitude: number; longitude: number } {
    const sum = points.reduce(
      (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
      { latitude: 0, longitude: 0 }
    )
    return {
      latitude: sum.latitude / points.length,
      longitude: sum.longitude / points.length,
    }
  }
}

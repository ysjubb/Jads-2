// Route Semantic Engine — tokenises ICAO Item 15 route string, looks up
// waypoints and airways from versioned airspace DB, computes leg-by-leg
// distances, TAS, magnetic track, and total EET.
//
// FROZEN CONSTANTS — do not change:
//   EARTH_RADIUS_NM      = 3440.065   (changes produce distance errors)
//   MACH_TO_KTAS_AT_FL350 = 666.739   (breaks EET consistency if changed)
//   Magnetic track = trueTrack - magneticVariation (easterly variation subtracted)

import { PrismaClient }                            from '@prisma/client'
import { AirspaceVersioningService, WaypointData } from './AirspaceVersioningService'
import { createServiceLogger }                      from '../logger'
import {
  EARTH_RADIUS_NM,
  MACH_TO_KTAS_AT_FL350,
  KMH_TO_KTAS,
} from '../constants'

const log = createServiceLogger('RouteSemanticEngine')

export interface RoutePoint {
  type:        'WAYPOINT' | 'AERODROME' | 'COORDINATE' | 'DCT'
  identifier:  string
  latDeg:      number
  lonDeg:      number
  versionId?:  string
}

export interface RouteLeg {
  from:               RoutePoint
  to:                 RoutePoint
  airway?:            string
  distanceNm:         number
  trueTrackDeg:       number
  magneticTrackDeg:   number
  magneticVariation:  number
}

export interface RouteValidationResult {
  valid:             boolean
  legs:              RouteLeg[]
  errors:            Array<{ field: string; code: string; message: string }>
  warnings:          Array<{ field: string; code: string; message: string }>
  usedVersionIds:    string[]
  totalEet:   number
  cruiseTasKts:      number
  groundspeedKts:    number
  magneticTrackDeg:  number | null
  totalEetMinutes:   number
}

export class RouteSemanticEngine {
  constructor(
    private readonly prisma:           PrismaClient,
    private readonly airspaceService:  AirspaceVersioningService
  ) {}

  async validateAndCompute(params: {
    departureIcao:   string
    destinationIcao: string
    routeString:     string
    speedIndicator:  'N' | 'K' | 'M'
    speedValue:      string
    depLatDeg?:      number
    depLonDeg?:      number
    depMagVar?:      number
    destLatDeg?:     number
    destLonDeg?:     number
  }): Promise<RouteValidationResult> {
    const errors:         Array<{ field: string; code: string; message: string }> = []
    const warnings:       Array<{ field: string; code: string; message: string }> = []
    const usedVersionIds: string[] = []
    const legs:           RouteLeg[] = []

    const cruiseTasKts = this.computeTas(params.speedIndicator, params.speedValue)

    const routePoints = await this.parseRouteIntoPoints(
      params.departureIcao, params.destinationIcao,
      params.routeString,
      params.depLatDeg, params.depLonDeg,
      params.destLatDeg, params.destLonDeg,
      errors, warnings, usedVersionIds
    )

    let totalEet = 0

    for (let i = 0; i < routePoints.length - 1; i++) {
      const from = routePoints[i]
      const to   = routePoints[i + 1]

      if (from.type === 'DCT' || to.type === 'DCT') continue

      const distanceNm      = this.haversineNm(from.latDeg, from.lonDeg, to.latDeg, to.lonDeg)
      const trueTrackDeg    = this.trueBearing(from.latDeg, from.lonDeg, to.latDeg, to.lonDeg)
      const magVar          = params.depMagVar ?? 0
      const magneticTrackDeg = this.applyMagneticVariation(trueTrackDeg, magVar)

      legs.push({ from, to, distanceNm, trueTrackDeg, magneticTrackDeg, magneticVariation: magVar })
      totalEet += distanceNm
    }

    // Overall dep→dest magnetic track (great circle)
    let magneticTrackDeg: number | null = null
    if (params.depLatDeg !== undefined && params.depLonDeg !== undefined &&
        params.destLatDeg !== undefined && params.destLonDeg !== undefined) {
      const trueTrack  = this.trueBearing(
        params.depLatDeg, params.depLonDeg,
        params.destLatDeg, params.destLonDeg
      )
      magneticTrackDeg = this.applyMagneticVariation(trueTrack, params.depMagVar ?? 0)
    }

    const groundspeedKts  = cruiseTasKts   // No wind correction offline
    const totalEetMinutes = totalEet > 0
      ? Math.round((totalEet / groundspeedKts) * 60)
      : 0

    log.info('route_computed', {
      data: {
        departure: params.departureIcao, destination: params.destinationIcao,
        totalEet: Math.round(totalEet),
        cruiseTasKts, totalEetMinutes, legCount: legs.length
      }
    })

    return {
      valid: errors.length === 0,
      legs, errors, warnings, usedVersionIds,
      totalEet, cruiseTasKts, groundspeedKts,
      magneticTrackDeg, totalEetMinutes
    }
  }

  // ── Route parser ──────────────────────────────────────────────────────────

  private async parseRouteIntoPoints(
    departureIcao: string, destinationIcao: string,
    routeString:   string,
    depLat?: number, depLon?: number,
    destLat?: number, destLon?: number,
    errors: any[], warnings: any[],
    usedVersionIds: string[]
  ): Promise<RoutePoint[]> {
    const points: RoutePoint[] = []
    const tokens = routeString.trim().toUpperCase().split(/\s+/).filter(Boolean)

    if (depLat !== undefined && depLon !== undefined) {
      points.push({ type: 'AERODROME', identifier: departureIcao, latDeg: depLat, lonDeg: depLon })
    }

    let i = 0
    while (i < tokens.length) {
      const token = tokens[i]

      if (token === 'DCT')                { i++; continue }
      if (token === 'VFR' || token === 'IFR') { i++; continue }

      // Speed/level change marker e.g. N0450F330
      if (/^[NKM]\d{3,4}[AFMS]\d{3,5}$/.test(token)) { i++; continue }

      // Coordinate: 2835N07706E or 2835N
      if (/^\d{2,4}[NS]\d{3,5}[EW]?$/.test(token)) {
        const coord = this.parseCoordinate(token)
        if (coord) {
          points.push({ type: 'COORDINATE', identifier: token, latDeg: coord.lat, lonDeg: coord.lon })
        } else {
          warnings.push({ field: 'route', code: 'COORDINATE_PARSE_FAILED',
            message: `Could not parse coordinate '${token}'` })
        }
        i++; continue
      }

      // Airway designator: A461, W5, L301, M300, N500, G, R, T
      if (/^[A-Z]\d{1,3}$/.test(token)) {
        const nextToken = tokens[i + 1]
        const airwayData = await this.airspaceService.getActiveAirway(token)
        if (!airwayData) {
          errors.push({ field: 'route', code: 'AIRWAY_NOT_FOUND',
            message: `Airway '${token}' not found in current airspace database. ` +
                     `Verify against current AIRAC charts.` })
        } else if (airwayData.versionId) {
          usedVersionIds.push(airwayData.versionId)
        }

        // Exit waypoint follows airway
        if (nextToken && /^[A-Z]{2,5}$/.test(nextToken)) {
          const exitWpt = await this.lookupWaypoint(nextToken, usedVersionIds)
          if (exitWpt) {
            points.push({ type: 'WAYPOINT', identifier: nextToken,
                          latDeg: exitWpt.latDeg, lonDeg: exitWpt.lonDeg,
                          versionId: exitWpt.versionId })
            i += 2; continue
          }
        }
        i++; continue
      }

      // Named waypoint: 2-5 uppercase letters
      if (/^[A-Z]{2,5}$/.test(token)) {
        const wpt = await this.lookupWaypoint(token, usedVersionIds)
        if (wpt) {
          points.push({ type: 'WAYPOINT', identifier: token,
                        latDeg: wpt.latDeg, lonDeg: wpt.lonDeg, versionId: wpt.versionId })
        } else {
          warnings.push({ field: 'route', code: 'WAYPOINT_NOT_FOUND',
            message: `Waypoint '${token}' not found in airspace database. ` +
                     `Verify against current AIRAC charts.` })
        }
        i++; continue
      }

      warnings.push({ field: 'route', code: 'UNRECOGNISED_ROUTE_TOKEN',
        message: `'${token}' is not a recognised route element (ICAO Doc 4444 Item 15)` })
      i++
    }

    if (destLat !== undefined && destLon !== undefined) {
      points.push({ type: 'AERODROME', identifier: destinationIcao, latDeg: destLat, lonDeg: destLon })
    }

    return points
  }

  // ── Geodesic ──────────────────────────────────────────────────────────────

  haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R    = EARTH_RADIUS_NM   // Must be 3440.065
    const dLat = this.toRad(lat2 - lat1)
    const dLon = this.toRad(lon2 - lon1)
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                 Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
  }

  trueBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const φ1 = this.toRad(lat1), φ2 = this.toRad(lat2)
    const Δλ = this.toRad(lon2 - lon1)
    const y   = Math.sin(Δλ) * Math.cos(φ2)
    const x   = Math.cos(φ1) * Math.sin(φ2) -
                Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    return ((this.toDeg(Math.atan2(y, x)) + 360) % 360)
  }

  // Easterly variation (positive) is subtracted from true track — ICAO Annex 2 convention
  applyMagneticVariation(trueTrackDeg: number, magneticVariationDeg: number): number {
    return ((trueTrackDeg - magneticVariationDeg) + 360) % 360
  }

  computeTas(indicator: string, value: string): number {
    const num = parseInt(value)
    switch (indicator) {
      case 'N': return num
      case 'K': return Math.round(num * KMH_TO_KTAS)
      case 'M': return Math.round(num * MACH_TO_KTAS_AT_FL350 / 100)
      default:  return num
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parseCoordinate(token: string): { lat: number; lon: number } | null {
    const m = token.match(/^(\d{2,4})([NS])(\d{3,5})?([EW])?$/)
    if (!m) return null

    const latRaw = m[1], latHemi = m[2]
    const lonRaw = m[3], lonHemi = m[4]

    const latDeg = latRaw.length === 2
      ? parseInt(latRaw)
      : parseInt(latRaw.substring(0, 2)) + parseInt(latRaw.substring(2)) / 60
    const lat = latHemi === 'S' ? -latDeg : latDeg

    if (!lonRaw || !lonHemi) return { lat, lon: 0 }

    const lonDeg = lonRaw.length === 3
      ? parseInt(lonRaw)
      : parseInt(lonRaw.substring(0, 3)) + parseInt(lonRaw.substring(3)) / 60
    const lon = lonHemi === 'W' ? -lonDeg : lonDeg

    return { lat, lon }
  }

  private async lookupWaypoint(
    icaoId: string, usedVersionIds: string[]
  ): Promise<(WaypointData & { versionId: string }) | null> {
    const all   = await this.airspaceService.getAllActiveWaypoints()
    const match = all.find(w => w.icaoId === icaoId)
    if (match?.versionId) usedVersionIds.push(match.versionId)
    return match ?? null
  }

  private toRad(deg: number): number { return deg * Math.PI / 180 }
  private toDeg(rad: number): number { return rad * 180 / Math.PI }
}

// Pre-Flight Deconfliction Engine — detects geographic, altitude, and temporal
// overlaps between AircraftFlightPlan routes and drone operation polygons.
// All outputs are ADVISORY only — JADS is a compliance intermediary.

import { PrismaClient } from '@prisma/client'
import { routeToCoords } from '../data/indianWaypoints'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('DeconflictionEngine')

export interface ConflictAdvisory {
  type:          'FPL_VS_DRONE'
  severity:      'ADVISORY'
  fplId:         string
  droneRecordId: string
  description:   string
  geoOverlap:    boolean
  altOverlap:    boolean
  timeOverlap:   boolean
  raisedAt:      string
}

// Route buffer distance in degrees (~610m at Indian latitudes ≈ 0.0055°)
const ROUTE_BUFFER_DEG = 0.0055
// Altitude buffer in meters (76m per plan)
const ALTITUDE_BUFFER_M = 76
// Time overlap window in ms (±30 min)
const TIME_WINDOW_MS = 30 * 60 * 1000

/** Simple point-in-polygon (ray casting). */
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/** Check if a line segment (from p1 to p2) passes within bufferDeg of a polygon. */
function segmentNearPolygon(
  p1: { lat: number; lon: number },
  p2: { lat: number; lon: number },
  polygon: number[][],
  bufferDeg: number
): boolean {
  // Check if either endpoint is inside the polygon
  if (pointInPolygon([p1.lon, p1.lat], polygon)) return true
  if (pointInPolygon([p2.lon, p2.lat], polygon)) return true

  // Sample points along the segment and check proximity
  const steps = Math.max(5, Math.ceil(
    Math.sqrt((p2.lat - p1.lat) ** 2 + (p2.lon - p1.lon) ** 2) / bufferDeg
  ))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const lat = p1.lat + (p2.lat - p1.lat) * t
    const lon = p1.lon + (p2.lon - p1.lon) * t
    if (pointInPolygon([lon, lat], polygon)) return true

    // Check proximity to polygon edges
    for (let i = 0; i < polygon.length - 1; i++) {
      const dx = polygon[i][0] - lon
      const dy = polygon[i][1] - lat
      if (Math.sqrt(dx * dx + dy * dy) < bufferDeg) return true
    }
  }
  return false
}

/** Convert cruising level string to meters. */
function cruisingLevelToMeters(level: string): number {
  const upper = level.toUpperCase().trim()
  if (upper.startsWith('FL')) {
    return parseInt(upper.slice(2)) * 30.48 // FL = hundreds of feet → meters
  }
  if (upper.startsWith('A')) {
    return parseInt(upper.slice(1)) * 30.48 // Altitude in hundreds of feet
  }
  // Try raw number (assume feet)
  const num = parseInt(upper)
  if (!isNaN(num)) return num * 0.3048
  return 0
}

export class DeconflictionEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Check conflicts for a triggering record.
   * If triggered by FPL, checks against drone operation plans.
   * If triggered by DRONE, checks against AircraftFlightPlans.
   */
  async checkConflicts(
    triggeredBy: 'FPL' | 'DRONE',
    recordId: string
  ): Promise<ConflictAdvisory[]> {
    if (triggeredBy === 'FPL') {
      return this.checkFPLvsDrone(recordId)
    } else {
      return this.checkDroneVsFPL(recordId)
    }
  }

  private async checkFPLvsDrone(fplId: string): Promise<ConflictAdvisory[]> {
    const fpl = await this.prisma.aircraftFlightPlan.findUnique({ where: { id: fplId } })
    if (!fpl) return []

    const fplStart = new Date(fpl.eobt.getTime() - TIME_WINDOW_MS)
    const fplEnd = new Date(fpl.eobt.getTime() + fpl.eet * 60 * 1000 + TIME_WINDOW_MS)
    const fplAltM = cruisingLevelToMeters(fpl.cruisingLevel)
    const routeCoords = routeToCoords(fpl.route)

    // Add departure/destination if resolved
    const depCoord = routeToCoords(fpl.departure)
    const destCoord = routeToCoords(fpl.destination)
    const allCoords = [...depCoord, ...routeCoords, ...destCoord]

    if (allCoords.length < 2) {
      log.warn('insufficient_route_coords', { data: { fplId, coordCount: allCoords.length } })
      return []
    }

    // Find drone operation plans with overlapping time
    const dronePlans = await this.prisma.droneOperationPlan.findMany({
      where: {
        status: 'APPROVED',
        plannedStartUtc: { lte: fplEnd },
        plannedEndUtc:   { gte: fplStart },
      },
    })

    const advisories: ConflictAdvisory[] = []

    for (const dp of dronePlans) {
      let polygon: number[][]
      try {
        polygon = JSON.parse(dp.areaGeoJson as string)
      } catch (e) {
        log.warn('deconfliction_geojson_parse_failed', {
          data: { droneRecordId: dp.id, error: e instanceof Error ? e.message : String(e) },
        })
        continue
      }

      // Geographic check: does the route pass near/through the drone polygon?
      let geoOverlap = false
      for (let i = 0; i < allCoords.length - 1; i++) {
        if (segmentNearPolygon(allCoords[i], allCoords[i + 1], polygon, ROUTE_BUFFER_DEG)) {
          geoOverlap = true
          break
        }
      }

      // Altitude check: FPL cruising level vs drone max altitude + buffer
      const droneMaxAltM = dp.maxAltitudeAglM ?? 120
      const altOverlap = fplAltM <= (droneMaxAltM + ALTITUDE_BUFFER_M)

      // Temporal check: window intersection > 0
      const dpStart = dp.plannedStartUtc.getTime()
      const dpEnd = dp.plannedEndUtc.getTime()
      const timeOverlap = dpStart < fplEnd.getTime() && dpEnd > fplStart.getTime()

      // All three must be true for a conflict advisory
      if (geoOverlap && altOverlap && timeOverlap) {
        advisories.push({
          type:          'FPL_VS_DRONE',
          severity:      'ADVISORY',
          fplId,
          droneRecordId: dp.id,
          description:   `Aircraft ${fpl.callsign} route ${fpl.departure}-${fpl.destination} ` +
                         `at ${fpl.cruisingLevel} may conflict with drone operation ` +
                         `(UIN: ${dp.uinNumber ?? 'N/A'}, max alt: ${droneMaxAltM}m)`,
          geoOverlap,
          altOverlap,
          timeOverlap,
          raisedAt:      new Date().toISOString(),
        })
      }
    }

    // Write audit log if advisories raised
    if (advisories.length > 0) {
      await this.writeAuditLog('SYSTEM', 'deconfliction_advisory_raised', fplId, {
        count: advisories.length,
        triggeredBy: 'FPL',
        droneRecordIds: advisories.map(a => a.droneRecordId),
      })
    }

    return advisories
  }

  private async checkDroneVsFPL(droneId: string): Promise<ConflictAdvisory[]> {
    const dp = await this.prisma.droneOperationPlan.findUnique({ where: { id: droneId } })
    if (!dp) return []

    let polygon: number[][]
    try {
      polygon = JSON.parse(dp.areaGeoJson as string)
    } catch (e) {
      log.warn('deconfliction_geojson_parse_failed', {
        data: { droneRecordId: droneId, error: e instanceof Error ? e.message : String(e) },
      })
      return []
    }

    const dpStart = new Date(dp.plannedStartUtc.getTime() - TIME_WINDOW_MS)
    const dpEnd = new Date(dp.plannedEndUtc.getTime() + TIME_WINDOW_MS)
    const droneMaxAltM = dp.maxAltitudeAglM ?? 120

    // Find FPLs with overlapping time
    const fpls = await this.prisma.aircraftFlightPlan.findMany({
      where: {
        status: { in: ['FILED', 'ACTIVE'] },
        eobt: { lte: dpEnd },
      },
    })

    const advisories: ConflictAdvisory[] = []

    for (const fpl of fpls) {
      const fplEnd = new Date(fpl.eobt.getTime() + fpl.eet * 60 * 1000)
      if (fplEnd < dpStart) continue

      const fplAltM = cruisingLevelToMeters(fpl.cruisingLevel)
      const altOverlap = fplAltM <= (droneMaxAltM + ALTITUDE_BUFFER_M)

      const routeCoords = routeToCoords(fpl.route)
      const depCoord = routeToCoords(fpl.departure)
      const destCoord = routeToCoords(fpl.destination)
      const allCoords = [...depCoord, ...routeCoords, ...destCoord]

      if (allCoords.length < 2) continue

      let geoOverlap = false
      for (let i = 0; i < allCoords.length - 1; i++) {
        if (segmentNearPolygon(allCoords[i], allCoords[i + 1], polygon, ROUTE_BUFFER_DEG)) {
          geoOverlap = true
          break
        }
      }

      const timeOverlap = dp.plannedStartUtc.getTime() < fplEnd.getTime() &&
                          dp.plannedEndUtc.getTime() > fpl.eobt.getTime()

      if (geoOverlap && altOverlap && timeOverlap) {
        advisories.push({
          type:          'FPL_VS_DRONE',
          severity:      'ADVISORY',
          fplId:         fpl.id,
          droneRecordId: droneId,
          description:   `Drone operation (UIN: ${dp.uinNumber ?? 'N/A'}, max alt: ${droneMaxAltM}m) ` +
                         `may conflict with aircraft ${fpl.callsign} ` +
                         `route ${fpl.departure}-${fpl.destination} at ${fpl.cruisingLevel}`,
          geoOverlap,
          altOverlap,
          timeOverlap,
          raisedAt:      new Date().toISOString(),
        })
      }
    }

    if (advisories.length > 0) {
      await this.writeAuditLog('SYSTEM', 'deconfliction_advisory_raised', droneId, {
        count: advisories.length,
        triggeredBy: 'DRONE',
        fplIds: advisories.map(a => a.fplId),
      })
    }

    return advisories
  }

  private async writeAuditLog(actorId: string, action: string, resourceId: string, meta: Record<string, unknown>) {
    try {
      const sequenceResult = await this.prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('audit_log_sequence')`
      const seq = sequenceResult[0]?.nextval ?? BigInt(0)

      // rowHash is auto-computed by PostgreSQL BEFORE INSERT trigger (trg_audit_log_row_hash)
      await this.prisma.auditLog.create({
        data: {
          sequenceNumber: seq,
          actorId,
          actorType: 'SYSTEM',
          action,
          resourceType: 'Deconfliction',
          resourceId,
          detailJson: JSON.stringify(meta),
        },
      })
    } catch (e) {
      log.error('audit_log_write_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    }
  }
}

// Conflict Detection Service — detects airspace conflicts between manned flight
// plans and drone operation plans.
//
// ALTITUDE REFERENCE HANDLING:
//   Drone plans:  meters AGL (above ground level)
//   Flight plans: feet AMSL or Flight Levels (1013.25 hPa standard)
//   Conversion:   droneAmslFt = groundElevationFt + (aglM × 3.28084)
//   Ground elevation: nearest aerodrome from indiaAIP or proximity dataset
//
// INVARIANTS:
//   - Never compare AGL directly to AMSL/FL — always convert to common reference
//   - Every conflict result includes BOTH AGL and AMSL values so the user sees both
//   - Ground elevation source is always documented in the result
//   - When no nearby aerodrome (>50km), use 0ft (sea level) as conservative default

import type { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'
import { INDIA_AIP_AERODROMES } from './indiaAIP'
import { haversineKm, INDIAN_AERODROMES_PROXIMITY } from './AirportProximityGate'
import { FirGeometryEngine } from './FirGeometryEngine'
import type { RouteLeg } from './RouteSemanticEngine'
import type { IAfmluAdapter, AdcConflictAlert } from '../adapters/interfaces/IAfmluAdapter'
import type { IFirAdapter, FicConflictAlert } from '../adapters/interfaces/IFirAdapter'
import type { IAAIDataAdapter, AaiConflictAlert } from '../adapters/interfaces/IAAIDataAdapter'

const log = createServiceLogger('ConflictDetectionService')

const M_TO_FT = 3.28084
const VERTICAL_BUFFER_FT = 500     // Minimum vertical separation standard
const VERTICAL_WARNING_FT = 1000   // Warning threshold
const PROXIMITY_KM = 10            // Geographic proximity for INFO alerts
const MAX_ELEVATION_SEARCH_KM = 50 // Beyond this, use sea level default

// ── Types ───────────────────────────────────────────────────────────────────

export type ConflictSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface AirspaceConflict {
  severity:               ConflictSeverity
  code:                   string
  message:                string
  overlapStartUtc:        string
  overlapEndUtc:          string
  conflictingPlanType:    'MANNED_FLIGHT' | 'DRONE_OPERATION'
  conflictingPlanId:      string
  conflictingPlanDbId:    string
  droneAltitudeAglM:      { min: number; max: number }
  droneAltitudeAmslFt:    { min: number; max: number }
  flightAltitudeAmslFt:   number
  flightAltitudeRef:      string
  groundElevationFt:      number
  elevationSource:        string
  geographicOverlap:      string
  separationKm:           number | null
}

export interface ConflictCheckResult {
  hasConflicts:   boolean
  conflicts:      AirspaceConflict[]
  checkedAt:      string
  summary: {
    critical:           number
    warning:            number
    info:               number
    dronePlansChecked:  number
    flightPlansChecked: number
  }
}

// ── Ground elevation lookup ─────────────────────────────────────────────────

interface ElevationResult { elevationFt: number; source: string; icao: string }

function getGroundElevation(lat: number, lon: number): ElevationResult {
  let bestDist = Infinity
  let bestElev = 0
  let bestSource = 'sea level default (no nearby aerodrome)'
  let bestIcao = 'NONE'

  // Check 127 AIP aerodromes (have elevation but no lat/lon in export — use proximity dataset)
  for (const prox of INDIAN_AERODROMES_PROXIMITY) {
    const dist = haversineKm(lat, lon, prox.arpLat, prox.arpLon)
    if (dist < bestDist) {
      bestDist = dist
      // Get elevation from AIP data if available, otherwise estimate
      const aip = INDIA_AIP_AERODROMES[prox.icaoCode]
      bestElev = aip?.elevation ?? 0
      bestSource = `${prox.icaoCode} (${prox.name}, ${bestElev}ft AMSL, ${dist.toFixed(1)}km away)`
      bestIcao = prox.icaoCode
    }
  }

  // Also check AIP aerodromes that have coordinates in the proximity dataset
  // (already covered above since INDIAN_AERODROMES_PROXIMITY has lat/lon)

  if (bestDist > MAX_ELEVATION_SEARCH_KM) {
    // Conservative: assume sea level (0ft). This OVERESTIMATES drone AMSL altitude,
    // making us MORE likely to flag a conflict — the safe direction.
    return { elevationFt: 0, source: `sea level default (nearest aerodrome ${bestIcao} is ${bestDist.toFixed(0)}km away)`, icao: bestIcao }
  }

  return { elevationFt: bestElev, source: bestSource, icao: bestIcao }
}

// ── Parse flight plan cruising level to feet AMSL ───────────────────────────

function parseCruisingLevelToFt(cruisingLevel: string): { amslFt: number; ref: string } | null {
  if (!cruisingLevel || cruisingLevel === 'VFR') return null
  const s = cruisingLevel.trim().toUpperCase()

  // F330 → FL330 → 33,000ft
  if (s.startsWith('F')) {
    const fl = parseInt(s.slice(1))
    if (!isNaN(fl)) return { amslFt: fl * 100, ref: `FL${fl}` }
  }
  // A045 → 4,500ft QNH (≈ AMSL)
  if (s.startsWith('A')) {
    const alt = parseInt(s.slice(1))
    if (!isNaN(alt)) return { amslFt: alt * 100, ref: `A${s.slice(1)}` }
  }
  // S0900 → metric, convert to feet
  if (s.startsWith('S')) {
    const m = parseInt(s.slice(1))
    if (!isNaN(m)) return { amslFt: Math.round(m * M_TO_FT), ref: `S${s.slice(1)}` }
  }

  return null
}

// ── Drone area center point ─────────────────────────────────────────────────

function getDroneAreaCenter(plan: any): { lat: number; lon: number } | null {
  if (plan.centerLatDeg != null && plan.centerLonDeg != null) {
    return { lat: plan.centerLatDeg, lon: plan.centerLonDeg }
  }
  if (plan.areaGeoJson) {
    try {
      const geo = JSON.parse(plan.areaGeoJson)
      if (geo.type === 'Polygon' && geo.coordinates?.[0]?.length > 0) {
        const ring = geo.coordinates[0]
        let latSum = 0, lonSum = 0
        for (const pt of ring) { lonSum += pt[0]; latSum += pt[1] }
        return { lat: latSum / ring.length, lon: lonSum / ring.length }
      }
    } catch { /* ignore parse errors */ }
  }
  return null
}

// ── Geographic overlap check ────────────────────────────────────────────────

function checkGeographicOverlap(
  droneCenter: { lat: number; lon: number },
  droneRadiusKm: number,
  dronePolygon: Array<{ lat: number; lon: number }> | null,
  routeLegs: Array<{ from: { latDeg: number; lonDeg: number; identifier?: string }; to: { latDeg: number; lonDeg: number; identifier?: string } }>,
  firEngine: FirGeometryEngine,
): { overlaps: boolean; description: string; minDistKm: number } {
  let minDist = Infinity
  let overlapDesc = ''

  for (const leg of routeLegs) {
    // Check waypoints
    for (const wp of [leg.from, leg.to]) {
      const dist = haversineKm(droneCenter.lat, droneCenter.lon, wp.latDeg, wp.lonDeg)
      if (dist < minDist) minDist = dist

      // Circle check
      if (dist <= droneRadiusKm) {
        overlapDesc = `Waypoint ${wp.identifier ?? '?'} (${wp.latDeg.toFixed(4)}, ${wp.lonDeg.toFixed(4)}) is within drone operation area`
        return { overlaps: true, description: overlapDesc, minDistKm: dist }
      }

      // Polygon check
      if (dronePolygon && firEngine.isPointInPolygon(wp.latDeg, wp.lonDeg, dronePolygon)) {
        overlapDesc = `Waypoint ${wp.identifier ?? '?'} (${wp.latDeg.toFixed(4)}, ${wp.lonDeg.toFixed(4)}) is inside drone operation polygon`
        return { overlaps: true, description: overlapDesc, minDistKm: 0 }
      }
    }

    // Check leg midpoint
    const midLat = (leg.from.latDeg + leg.to.latDeg) / 2
    const midLon = (leg.from.lonDeg + leg.to.lonDeg) / 2
    const midDist = haversineKm(droneCenter.lat, droneCenter.lon, midLat, midLon)
    if (midDist < minDist) minDist = midDist

    if (midDist <= droneRadiusKm) {
      overlapDesc = `Route leg ${leg.from.identifier ?? '?'}→${leg.to.identifier ?? '?'} midpoint passes through drone area`
      return { overlaps: true, description: overlapDesc, minDistKm: midDist }
    }
    if (dronePolygon && firEngine.isPointInPolygon(midLat, midLon, dronePolygon)) {
      overlapDesc = `Route leg ${leg.from.identifier ?? '?'}→${leg.to.identifier ?? '?'} midpoint is inside drone polygon`
      return { overlaps: true, description: overlapDesc, minDistKm: 0 }
    }
  }

  return {
    overlaps: false,
    description: `Nearest route point is ${minDist.toFixed(1)}km from drone area`,
    minDistKm: minDist,
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

export class ConflictDetectionService {
  private firEngine = new FirGeometryEngine()

  constructor(
    private readonly prisma:        PrismaClient,
    private readonly afmluAdapter?: IAfmluAdapter,
    private readonly firAdapter?:   IFirAdapter,
    private readonly aaiAdapter?:   IAAIDataAdapter,
  ) {}

  // ── Check drone plan against active flight plans ──────────────────────────

  async checkDronePlanConflicts(dronePlan: any): Promise<ConflictCheckResult> {
    const now = new Date()
    const conflicts: AirspaceConflict[] = []

    const droneCenter = getDroneAreaCenter(dronePlan)
    if (!droneCenter) {
      log.warn('drone_plan_no_center', { data: { planId: dronePlan.planId ?? dronePlan.id } })
      return this.emptyResult(0)
    }

    const droneStart = new Date(dronePlan.plannedStartUtc)
    const droneEnd = new Date(dronePlan.plannedEndUtc)

    // Get ground elevation at drone site
    const elevation = getGroundElevation(droneCenter.lat, droneCenter.lon)
    const droneMinAmslFt = Math.round(elevation.elevationFt + (dronePlan.minAltitudeAglM ?? 0) * M_TO_FT)
    const droneMaxAmslFt = Math.round(elevation.elevationFt + dronePlan.maxAltitudeAglM * M_TO_FT)

    // Drone area geometry
    const droneRadiusKm = dronePlan.radiusM ? dronePlan.radiusM / 1000 : 5 // default 5km if polygon
    let dronePolygon: Array<{ lat: number; lon: number }> | null = null
    if (dronePlan.areaGeoJson) {
      try {
        const geo = JSON.parse(dronePlan.areaGeoJson)
        if (geo.type === 'Polygon' && geo.coordinates?.[0]) {
          dronePolygon = geo.coordinates[0].map((pt: number[]) => ({ lat: pt[1], lon: pt[0] }))
        }
      } catch { /* ignore */ }
    }

    // Query flight plans that overlap in time
    const flightPlans = await this.prisma.mannedFlightPlan.findMany({
      where: {
        status: { in: ['VALIDATED', 'FILED'] },
        eobt: { lte: droneEnd },
      },
    })

    let flightPlansChecked = 0
    for (const fp of flightPlans) {
      // Compute flight plan end time
      const fpStart = new Date(fp.eobt)
      const fpEetMin = parseInt(fp.totalEet ?? fp.eet ?? '0') || 60
      const fpEnd = new Date(fpStart.getTime() + fpEetMin * 60000)

      // Time overlap check
      if (fpEnd < droneStart || fpStart > droneEnd) continue
      flightPlansChecked++

      const overlapStart = new Date(Math.max(droneStart.getTime(), fpStart.getTime()))
      const overlapEnd = new Date(Math.min(droneEnd.getTime(), fpEnd.getTime()))

      // Parse flight altitude
      const flightAlt = parseCruisingLevelToFt(fp.cruisingLevel)
      if (!flightAlt) continue

      // Altitude comparison — both in AMSL now
      const verticalSepFt = Math.min(
        Math.abs(flightAlt.amslFt - droneMaxAmslFt),
        Math.abs(flightAlt.amslFt - droneMinAmslFt),
      )
      const altitudeOverlap = flightAlt.amslFt >= (droneMinAmslFt - VERTICAL_BUFFER_FT) &&
                              flightAlt.amslFt <= (droneMaxAmslFt + VERTICAL_BUFFER_FT)
      const altitudeWarning = flightAlt.amslFt >= (droneMinAmslFt - VERTICAL_WARNING_FT) &&
                              flightAlt.amslFt <= (droneMaxAmslFt + VERTICAL_WARNING_FT)

      // Geographic overlap — extract route legs from validation result
      let routeLegs: Array<{ from: { latDeg: number; lonDeg: number; identifier?: string }; to: { latDeg: number; lonDeg: number; identifier?: string } }> = []
      if (fp.validationResultJson) {
        try {
          const vr = JSON.parse(fp.validationResultJson)
          if (vr.routeLegs) routeLegs = vr.routeLegs
        } catch { /* ignore */ }
      }

      const geoCheck = routeLegs.length > 0
        ? checkGeographicOverlap(droneCenter, droneRadiusKm, dronePolygon, routeLegs, this.firEngine)
        : { overlaps: false, description: 'No route geometry available', minDistKm: null as number | null }

      // Severity determination
      let severity: ConflictSeverity
      let code: string
      if (altitudeOverlap && geoCheck.overlaps) {
        severity = 'CRITICAL'
        code = 'ALTITUDE_AND_GEOGRAPHIC_OVERLAP'
      } else if (altitudeWarning && geoCheck.overlaps) {
        severity = 'WARNING'
        code = 'GEOGRAPHIC_OVERLAP_ALTITUDE_PROXIMITY'
      } else if (altitudeOverlap && geoCheck.minDistKm != null && geoCheck.minDistKm <= PROXIMITY_KM) {
        severity = 'WARNING'
        code = 'ALTITUDE_OVERLAP_GEOGRAPHIC_PROXIMITY'
      } else if (geoCheck.overlaps) {
        severity = 'INFO'
        code = 'GEOGRAPHIC_OVERLAP_ALTITUDE_SEPARATED'
      } else if (geoCheck.minDistKm != null && geoCheck.minDistKm <= PROXIMITY_KM && altitudeWarning) {
        severity = 'INFO'
        code = 'PROXIMITY_ADVISORY'
      } else {
        continue // No conflict
      }

      const fpIdStr = fp.flightPlanId != null ? String(fp.flightPlanId) : fp.id
      const conflict: AirspaceConflict = {
        severity,
        code,
        message: this.buildMessage(severity, code, fp.aircraftId, flightAlt, droneMinAmslFt, droneMaxAmslFt, dronePlan, elevation, overlapStart, overlapEnd, geoCheck),
        overlapStartUtc: overlapStart.toISOString(),
        overlapEndUtc: overlapEnd.toISOString(),
        conflictingPlanType: 'MANNED_FLIGHT',
        conflictingPlanId: fp.aircraftId ?? fpIdStr,
        conflictingPlanDbId: fp.id,
        droneAltitudeAglM: { min: dronePlan.minAltitudeAglM ?? 0, max: dronePlan.maxAltitudeAglM },
        droneAltitudeAmslFt: { min: droneMinAmslFt, max: droneMaxAmslFt },
        flightAltitudeAmslFt: flightAlt.amslFt,
        flightAltitudeRef: flightAlt.ref,
        groundElevationFt: elevation.elevationFt,
        elevationSource: elevation.source,
        geographicOverlap: geoCheck.description,
        separationKm: geoCheck.minDistKm,
      }
      conflicts.push(conflict)
    }

    // Push alerts to external systems for CRITICAL/WARNING conflicts
    await this.pushAdapterAlerts(dronePlan, conflicts, droneCenter)

    const result: ConflictCheckResult = {
      hasConflicts: conflicts.length > 0,
      conflicts,
      checkedAt: now.toISOString(),
      summary: {
        critical: conflicts.filter(c => c.severity === 'CRITICAL').length,
        warning: conflicts.filter(c => c.severity === 'WARNING').length,
        info: conflicts.filter(c => c.severity === 'INFO').length,
        dronePlansChecked: 0,
        flightPlansChecked,
      },
    }

    if (conflicts.length > 0) {
      log.warn('conflicts_detected', {
        data: {
          dronePlan: dronePlan.planId ?? dronePlan.id,
          critical: result.summary.critical,
          warning: result.summary.warning,
          info: result.summary.info,
        }
      })
    }

    return result
  }

  // ── Check flight plan against active drone plans ──────────────────────────

  async checkFlightPlanConflicts(
    routeLegs:   RouteLeg[],
    altitudeFt:  number,
    eobt:        Date,
    eetMinutes:  number,
    callsign:    string,
    cruisingLevelRef: string,
  ): Promise<ConflictCheckResult> {
    const now = new Date()
    const conflicts: AirspaceConflict[] = []
    const fpStart = eobt
    const fpEnd = new Date(eobt.getTime() + eetMinutes * 60000)

    // Query active drone plans that overlap time window
    const dronePlans = await this.prisma.droneOperationPlan.findMany({
      where: {
        status: { in: ['SUBMITTED', 'APPROVED'] },
        plannedStartUtc: { lte: fpEnd },
        plannedEndUtc: { gte: fpStart },
      },
    })

    let dronePlansChecked = 0
    for (const dp of dronePlans) {
      dronePlansChecked++
      const droneCenter = getDroneAreaCenter(dp)
      if (!droneCenter) continue

      const droneStart = new Date(dp.plannedStartUtc)
      const droneEnd = new Date(dp.plannedEndUtc)
      const overlapStart = new Date(Math.max(fpStart.getTime(), droneStart.getTime()))
      const overlapEnd = new Date(Math.min(fpEnd.getTime(), droneEnd.getTime()))

      // Ground elevation at drone site
      const elevation = getGroundElevation(droneCenter.lat, droneCenter.lon)
      const droneMinAmslFt = Math.round(elevation.elevationFt + (dp.minAltitudeAglM ?? 0) * M_TO_FT)
      const droneMaxAmslFt = Math.round(elevation.elevationFt + dp.maxAltitudeAglM * M_TO_FT)

      // Altitude check
      const altitudeOverlap = altitudeFt >= (droneMinAmslFt - VERTICAL_BUFFER_FT) &&
                              altitudeFt <= (droneMaxAmslFt + VERTICAL_BUFFER_FT)
      const altitudeWarning = altitudeFt >= (droneMinAmslFt - VERTICAL_WARNING_FT) &&
                              altitudeFt <= (droneMaxAmslFt + VERTICAL_WARNING_FT)

      // Geographic check
      const droneRadiusKm = dp.radiusM ? dp.radiusM / 1000 : 5
      let dronePolygon: Array<{ lat: number; lon: number }> | null = null
      if (dp.areaGeoJson) {
        try {
          const geo = JSON.parse(dp.areaGeoJson)
          if (geo.type === 'Polygon' && geo.coordinates?.[0]) {
            dronePolygon = geo.coordinates[0].map((pt: number[]) => ({ lat: pt[1], lon: pt[0] }))
          }
        } catch { /* ignore */ }
      }

      const mappedLegs = routeLegs.map(l => ({
        from: { latDeg: l.from.latDeg, lonDeg: l.from.lonDeg, identifier: l.from.identifier },
        to: { latDeg: l.to.latDeg, lonDeg: l.to.lonDeg, identifier: l.to.identifier },
      }))
      const geoCheck = checkGeographicOverlap(droneCenter, droneRadiusKm, dronePolygon, mappedLegs, this.firEngine)

      // Severity
      let severity: ConflictSeverity
      let code: string
      if (altitudeOverlap && geoCheck.overlaps) {
        severity = 'CRITICAL'
        code = 'ALTITUDE_AND_GEOGRAPHIC_OVERLAP'
      } else if (altitudeWarning && geoCheck.overlaps) {
        severity = 'WARNING'
        code = 'GEOGRAPHIC_OVERLAP_ALTITUDE_PROXIMITY'
      } else if (altitudeOverlap && geoCheck.minDistKm <= PROXIMITY_KM) {
        severity = 'WARNING'
        code = 'ALTITUDE_OVERLAP_GEOGRAPHIC_PROXIMITY'
      } else if (geoCheck.overlaps) {
        severity = 'INFO'
        code = 'GEOGRAPHIC_OVERLAP_ALTITUDE_SEPARATED'
      } else {
        continue
      }

      conflicts.push({
        severity,
        code,
        message: `Drone plan ${dp.planId} (${dp.minAltitudeAglM ?? 0}–${dp.maxAltitudeAglM}m AGL = ${droneMinAmslFt}–${droneMaxAmslFt}ft AMSL) ` +
                 `conflicts with flight at ${cruisingLevelRef} (${altitudeFt}ft AMSL). ` +
                 `Ground elevation: ${elevation.elevationFt}ft from ${elevation.icao}. ` +
                 `Time: ${overlapStart.toISOString().slice(11, 16)}–${overlapEnd.toISOString().slice(11, 16)}Z. ` +
                 geoCheck.description,
        overlapStartUtc: overlapStart.toISOString(),
        overlapEndUtc: overlapEnd.toISOString(),
        conflictingPlanType: 'DRONE_OPERATION',
        conflictingPlanId: dp.planId,
        conflictingPlanDbId: dp.id,
        droneAltitudeAglM: { min: dp.minAltitudeAglM ?? 0, max: dp.maxAltitudeAglM },
        droneAltitudeAmslFt: { min: droneMinAmslFt, max: droneMaxAmslFt },
        flightAltitudeAmslFt: altitudeFt,
        flightAltitudeRef: cruisingLevelRef,
        groundElevationFt: elevation.elevationFt,
        elevationSource: elevation.source,
        geographicOverlap: geoCheck.description,
        separationKm: geoCheck.minDistKm,
      })
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      checkedAt: now.toISOString(),
      summary: {
        critical: conflicts.filter(c => c.severity === 'CRITICAL').length,
        warning: conflicts.filter(c => c.severity === 'WARNING').length,
        info: conflicts.filter(c => c.severity === 'INFO').length,
        dronePlansChecked,
        flightPlansChecked: 0,
      },
    }
  }

  // ── Push alerts to external adapters ──────────────────────────────────────

  private async pushAdapterAlerts(
    dronePlan: any,
    conflicts: AirspaceConflict[],
    droneCenter: { lat: number; lon: number },
  ): Promise<void> {
    const criticalOrWarning = conflicts.filter(c => c.severity === 'CRITICAL' || c.severity === 'WARNING')
    if (criticalOrWarning.length === 0) return

    const dronePlanId = dronePlan.planId ?? dronePlan.id

    for (const conflict of criticalOrWarning) {
      const alertId = `CONFLICT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const detectedAtUtc = new Date().toISOString()

      // Determine FIR for this conflict
      const fir = this.firEngine.pointInFir(droneCenter.lat, droneCenter.lon)

      // Push to AFMLU adapter
      if (this.afmluAdapter) {
        try {
          const adcAlert: AdcConflictAlert = {
            alertId,
            dronePlanId,
            flightPlanId: conflict.conflictingPlanId,
            callsign: conflict.conflictingPlanId,
            severity: conflict.severity as 'CRITICAL' | 'WARNING',
            droneAltitudeAglM: conflict.droneAltitudeAglM,
            droneAltitudeAmslFt: conflict.droneAltitudeAmslFt,
            flightAltitudeAmslFt: conflict.flightAltitudeAmslFt,
            overlapStartUtc: conflict.overlapStartUtc,
            overlapEndUtc: conflict.overlapEndUtc,
            areaDescription: conflict.geographicOverlap,
            groundElevationFt: conflict.groundElevationFt,
            detectedAtUtc,
          }
          await this.afmluAdapter.pushConflictAlert(1, adcAlert)
        } catch (e) {
          log.warn('afmlu_conflict_push_failed', { data: { alertId, error: String(e) } })
        }
      }

      // Push to FIR adapter
      if (this.firAdapter && fir) {
        try {
          const ficAlert: FicConflictAlert = {
            alertId,
            dronePlanId,
            flightPlanId: conflict.conflictingPlanId,
            callsign: conflict.conflictingPlanId,
            firCode: fir.firCode,
            severity: conflict.severity as 'CRITICAL' | 'WARNING',
            droneAltitudeAglM: conflict.droneAltitudeAglM,
            droneAltitudeAmslFt: conflict.droneAltitudeAmslFt,
            flightAltitudeAmslFt: conflict.flightAltitudeAmslFt,
            overlapStartUtc: conflict.overlapStartUtc,
            overlapEndUtc: conflict.overlapEndUtc,
            areaDescription: conflict.geographicOverlap,
            groundElevationFt: conflict.groundElevationFt,
            detectedAtUtc,
          }
          await this.firAdapter.pushConflictAlert(ficAlert)
        } catch (e) {
          log.warn('fir_conflict_push_failed', { data: { alertId, firCode: fir.firCode, error: String(e) } })
        }
      }

      // Push to AAI adapter — if near an AAI-managed aerodrome
      if (this.aaiAdapter) {
        const elevation = getGroundElevation(droneCenter.lat, droneCenter.lon)
        try {
          const aaiAlert: AaiConflictAlert = {
            alertId,
            dronePlanId,
            flightPlanId: conflict.conflictingPlanId,
            callsign: conflict.conflictingPlanId,
            nearestAerodrome: elevation.icao,
            severity: conflict.severity as 'CRITICAL' | 'WARNING',
            droneAltitudeAglM: conflict.droneAltitudeAglM,
            droneAltitudeAmslFt: conflict.droneAltitudeAmslFt,
            flightAltitudeAmslFt: conflict.flightAltitudeAmslFt,
            overlapStartUtc: conflict.overlapStartUtc,
            overlapEndUtc: conflict.overlapEndUtc,
            areaDescription: conflict.geographicOverlap,
            groundElevationFt: conflict.groundElevationFt,
            detectedAtUtc,
          }
          await this.aaiAdapter.pushConflictAlert(aaiAlert)
        } catch (e) {
          log.warn('aai_conflict_push_failed', { data: { alertId, error: String(e) } })
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildMessage(
    severity: ConflictSeverity, code: string, callsign: string | null,
    flightAlt: { amslFt: number; ref: string },
    droneMinAmslFt: number, droneMaxAmslFt: number,
    dronePlan: any, elevation: ElevationResult,
    overlapStart: Date, overlapEnd: Date,
    geoCheck: { description: string },
  ): string {
    const cs = callsign ?? 'UNKNOWN'
    const timeStr = `${overlapStart.toISOString().slice(11, 16)}–${overlapEnd.toISOString().slice(11, 16)}Z`
    const droneAglStr = `${dronePlan.minAltitudeAglM ?? 0}–${dronePlan.maxAltitudeAglM}m AGL`
    const droneAmslStr = `${droneMinAmslFt}–${droneMaxAmslFt}ft AMSL`
    const flightStr = `${flightAlt.ref} (${flightAlt.amslFt}ft AMSL)`

    return `${severity}: Flight ${cs} at ${flightStr} conflicts with drone operation ` +
           `at ${droneAglStr} (= ${droneAmslStr}, ground ${elevation.elevationFt}ft from ${elevation.icao}). ` +
           `Time window: ${timeStr}. ${geoCheck.description}`
  }

  private emptyResult(flightPlansChecked: number): ConflictCheckResult {
    return {
      hasConflicts: false, conflicts: [], checkedAt: new Date().toISOString(),
      summary: { critical: 0, warning: 0, info: 0, dronePlansChecked: 0, flightPlansChecked },
    }
  }
}

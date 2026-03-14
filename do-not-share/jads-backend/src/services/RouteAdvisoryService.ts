/**
 * RouteAdvisoryService.ts
 *
 * Advisory-only route recommendation system for pilots filing flight plans.
 * Provides:
 *   - Best published airway route between ADEP/ADES (or "no recommendation")
 *   - Segment-by-segment breakdown (distance, magnetic track, EET)
 *   - Flight level advisory (semicircular rule compliance)
 *   - Mandatory reporting points along the route
 *   - FIR crossings with entry/exit points
 *   - Direct route comparison (distance + EET)
 *
 * This is ADVISORY ONLY — the pilot always has final choice to fly direct
 * at any height. Advisory failure never blocks flight plan filing.
 */

import { createServiceLogger } from '../logger'
import {
  RoutePlanningService,
  AtsWaypoint,
  ATS_WAYPOINTS,
  resolveWaypoint,
  greatCircleBearing,
  haversineNm,
  getMagneticVariation,
} from './RoutePlanningService'
import { AltitudeComplianceEngine } from './AltitudeComplianceEngine'
import { INDIA_AIP_AERODROMES } from './indiaAIP'

const log = createServiceLogger('RouteAdvisoryService')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RouteAdvisoryInput {
  adep:           string   // ICAO 4-letter code
  ades:           string   // ICAO 4-letter code
  cruisingLevel:  string   // "F350", "VFR", "A045"
  cruisingSpeed:  string   // "N0480"
  flightRules?:   string   // "I", "V", "Y", "Z" — determines IFR/VFR route recommendation
}

export interface RouteAdvisorySegment {
  from:              string
  to:                string
  airway:            string
  distanceNm:        number
  magneticTrackDeg:  number
  eetMinutes:        number
}

export interface RouteAdvisory {
  hasRecommendation: boolean

  /** 'IFR' = published airway recommended, 'VFR' = direct route recommended with corridor advisory */
  routeType: 'IFR' | 'VFR'

  recommended: {
    routeString:    string
    airwayName:     string
    waypoints:      Array<{ identifier: string; name: string; type: string; lat: number; lon: number }>
    segments:       RouteAdvisorySegment[]
    totalDistanceNm: number
    totalEetMinutes: number
  } | null

  flightLevelAdvisory: {
    requestedLevel:    string
    magneticTrackDeg:  number
    isCompliant:       boolean
    recommendedLevel:  string
    direction:         'EASTBOUND' | 'WESTBOUND'
    rule:              string
  }

  /** VFR-specific advisory (null for IFR flights) */
  vfrAdvisory: {
    corridorNote:     string   // VFR corridor advisory text
    maxAltitude:      string   // e.g. "FL150" or "A045"
    requiresSpecialVfr: boolean // True if near controlled airspace
  } | null

  reportingPoints: Array<{ identifier: string; name: string; distanceFromDepNm: number }>

  firCrossings: Array<{
    firCode:      string
    firName:      string
    entryPoint:   string
    exitPoint:    string
    distanceNm:   number
    eetMinutes:   number
  }>

  directRoute: {
    routeString:     string
    totalDistanceNm: number
    totalEetMinutes: number
  }
}

// ── FIR assignment (simplified bounding boxes) ────────────────────────────────

const FIR_BOXES: Array<{ firCode: string; firName: string; latMin: number; latMax: number; lonMin: number; lonMax: number }> = [
  { firCode: 'VIDF', firName: 'Delhi FIR',   latMin: 22,  latMax: 37.5, lonMin: 68, lonMax: 80 },
  { firCode: 'VABB', firName: 'Mumbai FIR',  latMin: 8,   latMax: 22,   lonMin: 65, lonMax: 77 },
  { firCode: 'VECC', firName: 'Kolkata FIR', latMin: 18,  latMax: 30,   lonMin: 80, lonMax: 98 },
  { firCode: 'VOMF', firName: 'Chennai FIR', latMin: 6,   latMax: 20,   lonMin: 73, lonMax: 85 },
]

function assignFir(lat: number, lon: number): { firCode: string; firName: string } {
  for (const fir of FIR_BOXES) {
    if (lat >= fir.latMin && lat < fir.latMax && lon >= fir.lonMin && lon < fir.lonMax) {
      return { firCode: fir.firCode, firName: fir.firName }
    }
  }
  return { firCode: 'VIDF', firName: 'Delhi FIR' }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RouteAdvisoryService {

  private routeService   = new RoutePlanningService()
  private altitudeEngine = new AltitudeComplianceEngine()

  generateAdvisory(input: RouteAdvisoryInput): RouteAdvisory {
    const { adep, ades, cruisingLevel, cruisingSpeed, flightRules } = input

    // Determine if this is a VFR flight
    const isVfr = flightRules === 'V' || cruisingLevel === 'VFR'

    // 1. Resolve ADEP/ADES coordinates
    const depCoords = this.resolveAerodrome(adep)
    const destCoords = this.resolveAerodrome(ades)

    if (!depCoords || !destCoords) {
      log.warn('advisory_aerodrome_not_found', { data: { adep, ades, depFound: !!depCoords, destFound: !!destCoords } })
      return this.buildNoRecommendation(adep, ades, depCoords, destCoords, cruisingLevel, cruisingSpeed, isVfr)
    }

    // 2. Parse speed for EET calculation
    const groundspeedKts = this.parseSpeed(cruisingSpeed)

    // 3. Direct route (always computed for comparison)
    const directDistNm = haversineNm(depCoords.lat, depCoords.lon, destCoords.lat, destCoords.lon)
    const directEetMin = groundspeedKts > 0 ? (directDistNm / groundspeedKts) * 60 : 0
    const directRoute = {
      routeString: `${adep} DCT ${ades}`,
      totalDistanceNm: Math.round(directDistNm),
      totalEetMinutes: Math.round(directEetMin),
    }

    // 4. Magnetic track for the overall route (dep→dest)
    const trueTrack = greatCircleBearing(depCoords.lat, depCoords.lon, destCoords.lat, destCoords.lon)
    const magVar = getMagneticVariation(depCoords.lat, depCoords.lon)
    const overallMagTrack = (trueTrack + magVar + 360) % 360

    // 5. Flight level advisory
    const flightLevelAdvisory = this.buildFlightLevelAdvisory(cruisingLevel, overallMagTrack)

    // 6. Try to find published airway route
    const found = this.routeService.findRoute(adep, ades)

    // 6a. VFR flights — recommend direct route with VFR corridor advisory
    if (isVfr) {
      const firCrossings = this.computeFirCrossings(
        [{ identifier: adep, lat: depCoords.lat, lon: depCoords.lon },
         { identifier: ades, lat: destCoords.lat, lon: destCoords.lon }],
        groundspeedKts
      )

      const vfrAdvisory = this.buildVfrAdvisory(adep, ades, depCoords, destCoords, cruisingLevel)

      log.info('advisory_generated_vfr', {
        data: { adep, ades, distNm: Math.round(directDistNm), routeType: 'VFR' }
      })

      return {
        hasRecommendation: true,
        routeType: 'VFR' as const,
        recommended: null,
        flightLevelAdvisory,
        vfrAdvisory,
        reportingPoints: [],
        firCrossings,
        directRoute,
      }
    }

    if (!found) {
      // No published route — return advisory with direct route info only
      const firCrossings = this.computeFirCrossings(
        [{ identifier: adep, lat: depCoords.lat, lon: depCoords.lon },
         { identifier: ades, lat: destCoords.lat, lon: destCoords.lon }],
        groundspeedKts
      )

      return {
        hasRecommendation: false,
        routeType: 'IFR' as const,
        recommended: null,
        flightLevelAdvisory,
        vfrAdvisory: null,
        reportingPoints: [],
        firCrossings,
        directRoute,
      }
    }

    // 7. Build recommended route details
    const waypoints = found.waypoints
    const segments: RouteAdvisorySegment[] = []
    let totalDist = 0

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]
      const dist = haversineNm(from.lat, from.lon, to.lat, to.lon)
      const tt = greatCircleBearing(from.lat, from.lon, to.lat, to.lon)
      const mv = getMagneticVariation(from.lat, from.lon)
      const mt = (tt + mv + 360) % 360
      const eet = groundspeedKts > 0 ? (dist / groundspeedKts) * 60 : 0

      segments.push({
        from: from.identifier,
        to: to.identifier,
        airway: found.airway.designator,
        distanceNm: Math.round(dist),
        magneticTrackDeg: Math.round(mt),
        eetMinutes: Math.round(eet),
      })
      totalDist += dist
    }

    const totalEet = groundspeedKts > 0 ? (totalDist / groundspeedKts) * 60 : 0

    // 8. Build AFTN route string: "GANDO L301 PAKER L301 IGARI L301 TATIM"
    const routeParts: string[] = []
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      if (wp.identifier !== adep && wp.identifier !== ades) {
        routeParts.push(wp.identifier)
        routeParts.push(found.airway.designator)
      }
    }
    // Remove trailing airway designator
    if (routeParts.length > 0 && routeParts[routeParts.length - 1] === found.airway.designator) {
      routeParts.pop()
    }
    const routeString = routeParts.join(' ')

    // 9. Reporting points (any FIX/VOR along the route, excluding aerodromes)
    const reportingPoints: Array<{ identifier: string; name: string; distanceFromDepNm: number }> = []
    let cumDist = 0
    for (let i = 1; i < waypoints.length; i++) {
      cumDist += haversineNm(waypoints[i - 1].lat, waypoints[i - 1].lon, waypoints[i].lat, waypoints[i].lon)
      if (waypoints[i].type !== 'AERODROME') {
        reportingPoints.push({
          identifier: waypoints[i].identifier,
          name: waypoints[i].name || waypoints[i].identifier,
          distanceFromDepNm: Math.round(cumDist),
        })
      }
    }

    // 10. FIR crossings
    const wpCoords = waypoints.map(w => ({ identifier: w.identifier, lat: w.lat, lon: w.lon }))
    const firCrossings = this.computeFirCrossings(wpCoords, groundspeedKts)

    const recommended = {
      routeString,
      airwayName: found.airway.designator,
      waypoints: waypoints.map(w => ({
        identifier: w.identifier,
        name: w.name || w.identifier,
        type: w.type,
        lat: w.lat,
        lon: w.lon,
      })),
      segments,
      totalDistanceNm: Math.round(totalDist),
      totalEetMinutes: Math.round(totalEet),
    }

    log.info('advisory_generated', {
      data: { adep, ades, airway: found.airway.designator, distNm: Math.round(totalDist), segments: segments.length }
    })

    return {
      hasRecommendation: true,
      routeType: 'IFR' as const,
      recommended,
      flightLevelAdvisory,
      vfrAdvisory: null,
      reportingPoints,
      firCrossings,
      directRoute,
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveAerodrome(icao: string): { lat: number; lon: number } | null {
    // Try indiaAIP first (127 aerodromes)
    const aip = INDIA_AIP_AERODROMES[icao]
    if (aip) return { lat: aip.latDeg, lon: aip.lonDeg }

    // Fallback to ATS_WAYPOINTS
    const wp = resolveWaypoint(icao)
    if (wp) return { lat: wp.lat, lon: wp.lon }

    return null
  }

  private parseSpeed(cruisingSpeed: string): number {
    // "N0480" → 480 kts, "K0890" → 890 km/h → ~480 kts
    if (!cruisingSpeed || cruisingSpeed.length < 2) return 240 // default
    const indicator = cruisingSpeed.charAt(0)
    const value = parseInt(cruisingSpeed.substring(1)) || 0
    if (indicator === 'N') return value         // knots
    if (indicator === 'K') return value * 0.5399 // km/h → kts
    if (indicator === 'M') return value * 600    // Mach → rough kts (M080 → 480)
    return value || 240
  }

  private buildFlightLevelAdvisory(cruisingLevel: string, magneticTrackDeg: number) {
    const isEastbound = magneticTrackDeg >= 0 && magneticTrackDeg < 180
    const direction: 'EASTBOUND' | 'WESTBOUND' = isEastbound ? 'EASTBOUND' : 'WESTBOUND'

    // Parse level
    let fl = 0
    let levelIndicator = 'VFR'
    if (cruisingLevel === 'VFR') {
      return {
        requestedLevel: cruisingLevel,
        magneticTrackDeg: Math.round(magneticTrackDeg),
        isCompliant: true,
        recommendedLevel: 'VFR',
        direction,
        rule: 'VFR — hemispherical rule advisory only. No mandatory FL assignment.',
      }
    }

    levelIndicator = cruisingLevel.charAt(0)
    fl = parseInt(cruisingLevel.substring(1)) || 0

    // Check semicircular rule
    const flIsOdd = (fl / 10) % 2 !== 0 // FL310 = 31 → odd, FL320 = 32 → even
    const isCompliant = isEastbound ? flIsOdd : !flIsOdd

    // Recommend nearest correct FL
    let recommendedLevel = cruisingLevel
    if (!isCompliant && fl > 0) {
      if (isEastbound) {
        // Need odd: FL310, 330, 350...
        const nearestOdd = fl % 20 === 0 ? fl + 10 : fl - 10 + 20
        recommendedLevel = `F${nearestOdd}`
      } else {
        // Need even: FL320, 340, 360...
        const nearestEven = fl % 20 === 10 ? fl + 10 : fl
        recommendedLevel = `F${nearestEven}`
      }
    }

    const ruleText = isEastbound
      ? `Magnetic track ${Math.round(magneticTrackDeg)}° (eastbound 000-179°) requires ODD flight levels: FL310, FL330, FL350, FL370, FL390.`
      : `Magnetic track ${Math.round(magneticTrackDeg)}° (westbound 180-359°) requires EVEN flight levels: FL300, FL320, FL340, FL360, FL380.`

    return {
      requestedLevel: cruisingLevel,
      magneticTrackDeg: Math.round(magneticTrackDeg),
      isCompliant,
      recommendedLevel,
      direction,
      rule: ruleText,
    }
  }

  private computeFirCrossings(
    waypoints: Array<{ identifier: string; lat: number; lon: number }>,
    groundspeedKts: number
  ): Array<{ firCode: string; firName: string; entryPoint: string; exitPoint: string; distanceNm: number; eetMinutes: number }> {
    if (waypoints.length < 2) return []

    const crossings: Array<{ firCode: string; firName: string; entryPoint: string; exitPoint: string; distanceNm: number; eetMinutes: number }> = []
    let currentFir = assignFir(waypoints[0].lat, waypoints[0].lon)
    let firEntryPoint = waypoints[0].identifier
    let firDist = 0

    for (let i = 1; i < waypoints.length; i++) {
      const segDist = haversineNm(waypoints[i - 1].lat, waypoints[i - 1].lon, waypoints[i].lat, waypoints[i].lon)
      firDist += segDist

      const wpFir = assignFir(waypoints[i].lat, waypoints[i].lon)
      if (wpFir.firCode !== currentFir.firCode) {
        // FIR boundary crossing
        crossings.push({
          ...currentFir,
          entryPoint: firEntryPoint,
          exitPoint: waypoints[i - 1].identifier,
          distanceNm: Math.round(firDist),
          eetMinutes: groundspeedKts > 0 ? Math.round((firDist / groundspeedKts) * 60) : 0,
        })
        currentFir = wpFir
        firEntryPoint = waypoints[i].identifier
        firDist = 0
      }
    }

    // Final FIR segment
    crossings.push({
      ...currentFir,
      entryPoint: firEntryPoint,
      exitPoint: waypoints[waypoints.length - 1].identifier,
      distanceNm: Math.round(firDist),
      eetMinutes: groundspeedKts > 0 ? Math.round((firDist / groundspeedKts) * 60) : 0,
    })

    return crossings
  }

  private buildVfrAdvisory(
    adep: string, ades: string,
    depCoords: { lat: number; lon: number },
    destCoords: { lat: number; lon: number },
    cruisingLevel: string,
  ): { corridorNote: string; maxAltitude: string; requiresSpecialVfr: boolean } {
    // Check if either aerodrome is in controlled airspace (major airports)
    const majorAerodromes = ['VIDP', 'VABB', 'VECC', 'VOMF', 'VOBL', 'VOHS', 'VOCI', 'VEGT', 'VAAH', 'VAGO']
    const nearControlled = majorAerodromes.includes(adep) || majorAerodromes.includes(ades)

    // Build corridor advisory text
    let corridorNote = 'VFR flight — direct route recommended. '
    if (nearControlled) {
      corridorNote += `Departure or arrival at a controlled aerodrome (${adep}/${ades}). `
      corridorNote += 'Special VFR clearance may be required within CTR. '
      corridorNote += 'Contact ATC for VFR corridor assignment before entering controlled airspace. '
    }
    corridorNote += 'Maintain VMC at all times. Comply with right-of-way rules (AIP ENR 1.2). '
    corridorNote += 'Monitor appropriate FIS frequency for traffic information.'

    // Determine max altitude advisory
    const level = cruisingLevel.toUpperCase()
    let maxAltitude = 'FL150'
    if (level.startsWith('A')) {
      const altVal = parseInt(level.substring(1))
      if (!isNaN(altVal) && altVal <= 180) maxAltitude = `A${String(altVal).padStart(3, '0')}`
    }

    return {
      corridorNote,
      maxAltitude,
      requiresSpecialVfr: nearControlled,
    }
  }

  private buildNoRecommendation(
    adep: string, ades: string,
    depCoords: { lat: number; lon: number } | null,
    destCoords: { lat: number; lon: number } | null,
    cruisingLevel: string, cruisingSpeed: string,
    isVfr: boolean = false,
  ): RouteAdvisory {
    const directDistNm = depCoords && destCoords ? haversineNm(depCoords.lat, depCoords.lon, destCoords.lat, destCoords.lon) : 0
    const gs = this.parseSpeed(cruisingSpeed)
    const directEetMin = gs > 0 ? (directDistNm / gs) * 60 : 0
    const magTrack = depCoords && destCoords
      ? ((greatCircleBearing(depCoords.lat, depCoords.lon, destCoords.lat, destCoords.lon) + getMagneticVariation(depCoords.lat, depCoords.lon) + 360) % 360)
      : 0

    const vfrAdvisory = isVfr && depCoords && destCoords
      ? this.buildVfrAdvisory(adep, ades, depCoords, destCoords, cruisingLevel)
      : null

    return {
      hasRecommendation: false,
      routeType: isVfr ? 'VFR' : 'IFR',
      recommended: null,
      flightLevelAdvisory: this.buildFlightLevelAdvisory(cruisingLevel, magTrack),
      vfrAdvisory,
      reportingPoints: [],
      firCrossings: depCoords && destCoords
        ? this.computeFirCrossings(
            [{ identifier: adep, lat: depCoords.lat, lon: depCoords.lon },
             { identifier: ades, lat: destCoords.lat, lon: destCoords.lon }],
            gs
          )
        : [],
      directRoute: {
        routeString: `${adep} DCT ${ades}`,
        totalDistanceNm: Math.round(directDistNm),
        totalEetMinutes: Math.round(directEetMin),
      },
    }
  }
}

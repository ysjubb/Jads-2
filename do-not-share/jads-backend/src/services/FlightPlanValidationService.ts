/**
 * FlightPlanValidationService.ts
 *
 * Pre-submission validation engine for drone flight plans.
 * Runs 15 checks across three severity levels:
 *
 *   HARD FAILURES (block submission):
 *     V01 — UIN registration active
 *     V02 — Remote Pilot Certificate (RPC) valid
 *     V03 — UAOP (operator permit) valid
 *     V04 — Insurance valid
 *     V05 — Type Certificate valid (Medium/Large drones)
 *     V06 — No conflicting Permission Artefact for same drone
 *     V07 — Polygon valid (non-self-intersecting, >= 3 vertices)
 *     V08 — Altitude <= 500m AGL
 *     V09 — startDateTime not in the past
 *
 *   WARNINGS (require acknowledgement):
 *     V10 — Overlaps sunrise/sunset (twilight operations)
 *     V11 — Area > 5 sq km
 *     V12 — Altitude > 120m AGL
 *     V13 — Active NOTAM in area
 *     V14 — Payload > 90% max
 *
 *   INFO (informational only):
 *     V15 — Auto-expires in < 24 hours
 */

import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('FlightPlanValidationService')

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'FAILURE' | 'WARNING' | 'INFO'

export interface ValidationCheck {
  code:       string           // V01..V15
  label:      string           // human-readable check name
  severity:   ValidationSeverity
  passed:     boolean
  message:    string           // detail message
  field?:     string           // form field to link "Fix Issues" button
}

export interface ValidationResult {
  valid:     boolean           // true only if zero failures
  failures:  ValidationCheck[]
  warnings:  ValidationCheck[]
  info:      ValidationCheck[]
  summary: {
    total:   number
    passed:  number
    failed:  number
    warned:  number
    info:    number
  }
}

export interface FlightPlanInput {
  // Drone identification
  droneSerialNumber:   string
  uinNumber?:          string | null
  droneWeightCategory: string       // NANO | MICRO | SMALL | MEDIUM | LARGE

  // Operator & pilot
  operatorId:          string
  pilotLicenceNumber?: string | null
  operatorLicenseType?: string | null  // UAOP-I | UAOP-II | RPC | NONE
  insuranceExpiry?:    string | null   // ISO 8601
  typeCertificateId?:  string | null

  // Area definition
  areaType:            'POLYGON' | 'CIRCLE'
  areaGeoJson?:        string | null   // GeoJSON Polygon
  centerLatDeg?:       number | null
  centerLonDeg?:       number | null
  radiusM?:            number | null

  // Flight parameters
  maxAltitudeAglM:     number
  plannedStartUtc:     string          // ISO 8601
  plannedEndUtc:       string          // ISO 8601
  payloadWeightGrams?: number | null
  maxPayloadGrams?:    number | null

  // Optional existing plan context
  planId?:             string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ALTITUDE_AGL_M = 500
const LARGE_AREA_SQ_KM = 5
const ELEVATED_ALTITUDE_M = 120
const PAYLOAD_WARNING_PERCENT = 0.90
const AUTO_EXPIRE_HOURS = 24

// ── Geometry helpers ──────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
            Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Check if a polygon ring is self-intersecting.
 * Uses brute-force edge-pair intersection test.
 */
function isSelfIntersecting(ring: number[][]): boolean {
  const n = ring.length
  if (n < 4) return false // triangle or less cannot self-intersect

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      // Skip adjacent edges
      if (i === 0 && j === n - 2) continue

      if (segmentsIntersect(
        ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1],
        ring[j][0], ring[j][1], ring[j + 1][0], ring[j + 1][1]
      )) {
        return true
      }
    }
  }
  return false
}

function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const d1 = direction(x3, y3, x4, y4, x1, y1)
  const d2 = direction(x3, y3, x4, y4, x2, y2)
  const d3 = direction(x1, y1, x2, y2, x3, y3)
  const d4 = direction(x1, y1, x2, y2, x4, y4)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

function direction(
  xi: number, yi: number, xj: number, yj: number,
  xk: number, yk: number
): number {
  return (xk - xi) * (yj - yi) - (xj - xi) * (yk - yi)
}

/**
 * Compute approximate area of a polygon in sq km using the Shoelace formula.
 */
function polygonAreaSqKm(coordinates: number[][][]): number {
  if (!coordinates || !coordinates[0] || coordinates[0].length < 4) return 0

  const ring = coordinates[0]
  let area = 0
  const n = ring.length

  for (let i = 0; i < n - 1; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[i + 1]
    area += lon1 * lat2 - lon2 * lat1
  }

  area = Math.abs(area) / 2

  // Convert from degrees^2 to km^2
  const midLat = ring.reduce((s, c) => s + c[1], 0) / ring.length
  const latKm = 111.32
  const lonKm = 111.32 * Math.cos(midLat * Math.PI / 180)

  return area * latKm * lonKm
}

function circleAreaSqKm(radiusM: number): number {
  const radiusKm = radiusM / 1000
  return Math.PI * radiusKm * radiusKm
}

/**
 * Approximate sunrise/sunset times for a given date and latitude.
 */
function approximateSunTimes(
  date: Date,
  latDeg: number,
  lonDeg: number
): { sunriseUtc: Date; sunsetUtc: Date } {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  )

  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))
  const decRad = declination * DEG_TO_RAD
  const latRad = latDeg * DEG_TO_RAD

  const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad)
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) * (180 / Math.PI)

  const solarNoonHours = 12 - lonDeg / 15

  const sunriseHours = solarNoonHours - hourAngle / 15
  const sunsetHours = solarNoonHours + hourAngle / 15

  const sunriseUtc = new Date(date)
  sunriseUtc.setUTCHours(0, 0, 0, 0)
  sunriseUtc.setUTCMinutes(Math.round(sunriseHours * 60))

  const sunsetUtc = new Date(date)
  sunsetUtc.setUTCHours(0, 0, 0, 0)
  sunsetUtc.setUTCMinutes(Math.round(sunsetHours * 60))

  return { sunriseUtc, sunsetUtc }
}

function getCentroid(input: FlightPlanInput): { lat: number; lng: number } {
  if (input.areaType === 'CIRCLE' && input.centerLatDeg != null && input.centerLonDeg != null) {
    return { lat: input.centerLatDeg, lng: input.centerLonDeg }
  }

  if (input.areaGeoJson) {
    try {
      const geo = JSON.parse(input.areaGeoJson)
      if (geo.type === 'Polygon' && geo.coordinates && geo.coordinates[0]) {
        const ring = geo.coordinates[0] as number[][]
        const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
        const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length
        return { lat, lng }
      }
    } catch {
      // fall through
    }
  }

  // Default to center of India
  return { lat: 20.5937, lng: 78.9629 }
}

// ── Validation Engine ─────────────────────────────────────────────────────────

export async function validateFlightPlan(
  input: FlightPlanInput,
  prisma: PrismaClient
): Promise<ValidationResult> {

  const checks: ValidationCheck[] = []

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD FAILURES — block submission
  // ═══════════════════════════════════════════════════════════════════════════

  // V01 — UIN registration active
  {
    const hasUin = !!input.uinNumber && input.uinNumber.trim().length > 0
    const nanoExempt = input.droneWeightCategory === 'NANO'

    let passed = true
    let message = ''

    if (nanoExempt) {
      message = 'Nano drones (< 250g) are exempt from UIN requirement'
    } else if (!hasUin) {
      passed = false
      message = 'UIN (Unique Identification Number) is required for non-Nano drones'
    } else {
      // Check if UIN exists in the system via drone missions or operation plans
      const existingDrone = await prisma.droneMission.findFirst({
        where: { uinNumber: input.uinNumber!, droneSerialNumber: input.droneSerialNumber },
        select: { id: true },
      })
      const existingPlan = await prisma.droneOperationPlan.findFirst({
        where: { uinNumber: input.uinNumber!, droneSerialNumber: input.droneSerialNumber },
        select: { id: true },
      })

      if (existingDrone || existingPlan) {
        message = `UIN ${input.uinNumber} is registered and active for drone ${input.droneSerialNumber}`
      } else {
        // UIN provided but not found in system — still pass (may be first use)
        message = `UIN ${input.uinNumber} provided — will be verified by eGCA on submission`
      }
    }

    checks.push({
      code: 'V01', label: 'UIN Registration Active',
      severity: 'FAILURE', passed, message,
      field: 'uinNumber',
    })
  }

  // V02 — Remote Pilot Certificate (RPC) valid
  {
    const hasRpc = !!input.pilotLicenceNumber && input.pilotLicenceNumber.trim().length > 0
    const nanoExempt = input.droneWeightCategory === 'NANO'

    let passed = true
    let message = ''

    if (nanoExempt) {
      message = 'Nano drones (< 250g) are exempt from RPC requirement'
    } else if (!hasRpc) {
      passed = false
      message = 'Remote Pilot Certificate (RPC) number is required for non-Nano drones'
    } else {
      message = `RPC ${input.pilotLicenceNumber} provided — will be verified by eGCA`
    }

    checks.push({
      code: 'V02', label: 'Remote Pilot Certificate Valid',
      severity: 'FAILURE', passed, message,
      field: 'pilotLicenceNumber',
    })
  }

  // V03 — UAOP (Unmanned Aircraft Operator Permit) valid
  {
    const validTypes = ['UAOP-I', 'UAOP-II']
    const nanoExempt = input.droneWeightCategory === 'NANO'
    const microExempt = input.droneWeightCategory === 'MICRO'

    let passed = true
    let message = ''

    if (nanoExempt || microExempt) {
      message = `${input.droneWeightCategory} drones are exempt from UAOP requirement`
    } else if (!input.operatorLicenseType || !validTypes.includes(input.operatorLicenseType)) {
      passed = false
      message = `Valid UAOP (UAOP-I or UAOP-II) is required. Current: ${input.operatorLicenseType ?? 'NONE'}`
    } else {
      message = `Operator has valid ${input.operatorLicenseType}`
    }

    checks.push({
      code: 'V03', label: 'UAOP Valid',
      severity: 'FAILURE', passed, message,
      field: 'operatorLicenseType',
    })
  }

  // V04 — Insurance valid
  {
    const nanoExempt = input.droneWeightCategory === 'NANO'
    let passed = true
    let message = ''

    if (nanoExempt) {
      message = 'Nano drones (< 250g) are exempt from insurance requirement'
    } else if (!input.insuranceExpiry) {
      passed = false
      message = 'Third-party liability insurance is required for non-Nano drones'
    } else {
      const expiry = new Date(input.insuranceExpiry)
      const planned = new Date(input.plannedEndUtc)
      if (expiry < planned) {
        passed = false
        message = `Insurance expires ${expiry.toISOString().split('T')[0]} — before planned flight end ${planned.toISOString().split('T')[0]}`
      } else {
        message = `Insurance valid until ${expiry.toISOString().split('T')[0]}`
      }
    }

    checks.push({
      code: 'V04', label: 'Insurance Valid',
      severity: 'FAILURE', passed, message,
      field: 'insuranceExpiry',
    })
  }

  // V05 — Type Certificate valid (Medium/Large drones only)
  {
    const requiresTC = input.droneWeightCategory === 'MEDIUM' || input.droneWeightCategory === 'LARGE'

    let passed = true
    let message = ''

    if (!requiresTC) {
      message = `${input.droneWeightCategory} drones do not require a Type Certificate`
    } else if (!input.typeCertificateId) {
      passed = false
      message = `Type Certificate is required for ${input.droneWeightCategory} category drones`
    } else {
      message = `Type Certificate ${input.typeCertificateId} provided`
    }

    checks.push({
      code: 'V05', label: 'Type Certificate Valid',
      severity: 'FAILURE', passed, message,
      field: 'typeCertificateId',
    })
  }

  // V06 — No conflicting Permission Artefact for same drone
  {
    const startUtc = new Date(input.plannedStartUtc)
    const endUtc = new Date(input.plannedEndUtc)

    let passed = true
    let message = ''

    try {
      const conflicting = await prisma.permissionArtefact.findMany({
        where: {
          uinNumber: input.uinNumber ?? input.droneSerialNumber,
          status: { in: ['PENDING', 'APPROVED', 'DOWNLOADED', 'LOADED', 'ACTIVE'] },
          flightStartTime: { lt: endUtc },
          flightEndTime:   { gt: startUtc },
          // Exclude current plan's artefacts if editing
          ...(input.planId ? { planId: { not: input.planId } } : {}),
        },
        select: {
          applicationId: true,
          flightStartTime: true,
          flightEndTime: true,
          status: true,
        },
      })

      if (conflicting.length > 0) {
        passed = false
        const first = conflicting[0]
        message = `Conflicting PA "${first.applicationId}" (${first.status}) overlaps time window: ${first.flightStartTime.toISOString()} - ${first.flightEndTime.toISOString()}`
      } else {
        message = 'No conflicting Permission Artefacts found for this drone and time window'
      }
    } catch (err) {
      // If DB query fails, do not block — log and pass
      log.warn('v06_conflict_check_failed', {
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      message = 'Conflict check skipped — will be verified on submission'
    }

    checks.push({
      code: 'V06', label: 'No Conflicting Permission Artefact',
      severity: 'FAILURE', passed, message,
      field: 'plannedStartUtc',
    })
  }

  // V07 — Polygon valid (non-self-intersecting, >= 3 vertices)
  {
    let passed = true
    let message = ''

    if (input.areaType === 'POLYGON') {
      if (!input.areaGeoJson) {
        passed = false
        message = 'GeoJSON polygon is required for POLYGON area type'
      } else {
        try {
          const geo = JSON.parse(input.areaGeoJson)
          if (geo.type !== 'Polygon' || !geo.coordinates || !geo.coordinates[0]) {
            passed = false
            message = 'Invalid GeoJSON: must be a Polygon with at least one coordinate ring'
          } else {
            const ring = geo.coordinates[0] as number[][]
            // GeoJSON polygons have closing vertex (first === last), so need >= 4 points for 3 vertices
            if (ring.length < 4) {
              passed = false
              message = `Polygon has ${ring.length - 1} vertices — minimum 3 required`
            } else if (isSelfIntersecting(ring)) {
              passed = false
              message = 'Polygon is self-intersecting — edges must not cross each other'
            } else {
              message = `Polygon valid: ${ring.length - 1} vertices, no self-intersections`
            }
          }
        } catch {
          passed = false
          message = 'Failed to parse GeoJSON polygon — check format'
        }
      }
    } else if (input.areaType === 'CIRCLE') {
      if (input.centerLatDeg == null || input.centerLonDeg == null) {
        passed = false
        message = 'Center coordinates required for CIRCLE area type'
      } else if (!input.radiusM || input.radiusM <= 0) {
        passed = false
        message = 'Positive radius required for CIRCLE area type'
      } else {
        message = `Circle valid: center (${input.centerLatDeg.toFixed(4)}, ${input.centerLonDeg.toFixed(4)}), radius ${input.radiusM}m`
      }
    } else {
      passed = false
      message = `Unknown area type: ${input.areaType}`
    }

    checks.push({
      code: 'V07', label: 'Area Geometry Valid',
      severity: 'FAILURE', passed, message,
      field: 'areaGeoJson',
    })
  }

  // V08 — Altitude <= 500m AGL
  {
    const passed = input.maxAltitudeAglM <= MAX_ALTITUDE_AGL_M
    const message = passed
      ? `Altitude ${input.maxAltitudeAglM}m AGL is within the ${MAX_ALTITUDE_AGL_M}m limit`
      : `Altitude ${input.maxAltitudeAglM}m AGL exceeds the absolute maximum of ${MAX_ALTITUDE_AGL_M}m AGL`

    checks.push({
      code: 'V08', label: 'Altitude Within Limits',
      severity: 'FAILURE', passed, message,
      field: 'maxAltitudeAglM',
    })
  }

  // V09 — startDateTime not in the past
  {
    const startUtc = new Date(input.plannedStartUtc)
    const now = new Date()
    const passed = startUtc > now
    const message = passed
      ? `Start time ${startUtc.toISOString()} is in the future`
      : `Start time ${startUtc.toISOString()} is in the past — must be a future date/time`

    checks.push({
      code: 'V09', label: 'Start Time Not in Past',
      severity: 'FAILURE', passed, message,
      field: 'plannedStartUtc',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WARNINGS — require acknowledgement
  // ═══════════════════════════════════════════════════════════════════════════

  // V10 — Overlaps sunrise/sunset (twilight operations)
  {
    const startUtc = new Date(input.plannedStartUtc)
    const endUtc = new Date(input.plannedEndUtc)
    const centroid = getCentroid(input)
    const sunTimes = approximateSunTimes(startUtc, centroid.lat, centroid.lng)

    // Twilight window: 30 minutes around sunrise and sunset
    const sunriseMinus30 = new Date(sunTimes.sunriseUtc.getTime() - 30 * 60 * 1000)
    const sunrisePlus30  = new Date(sunTimes.sunriseUtc.getTime() + 30 * 60 * 1000)
    const sunsetMinus30  = new Date(sunTimes.sunsetUtc.getTime() - 30 * 60 * 1000)
    const sunsetPlus30   = new Date(sunTimes.sunsetUtc.getTime() + 30 * 60 * 1000)

    const overlapsSunrise = startUtc < sunrisePlus30 && endUtc > sunriseMinus30
    const overlapsSunset  = startUtc < sunsetPlus30 && endUtc > sunsetMinus30

    const passed = !overlapsSunrise && !overlapsSunset
    let message = ''

    if (overlapsSunrise && overlapsSunset) {
      message = `Flight window overlaps both sunrise (~${sunTimes.sunriseUtc.toISOString().slice(11, 16)} UTC) and sunset (~${sunTimes.sunsetUtc.toISOString().slice(11, 16)} UTC) twilight periods — reduced visibility conditions`
    } else if (overlapsSunrise) {
      message = `Flight window overlaps sunrise (~${sunTimes.sunriseUtc.toISOString().slice(11, 16)} UTC) twilight period — reduced visibility`
    } else if (overlapsSunset) {
      message = `Flight window overlaps sunset (~${sunTimes.sunsetUtc.toISOString().slice(11, 16)} UTC) twilight period — reduced visibility`
    } else {
      message = 'Flight window does not overlap sunrise/sunset twilight periods'
    }

    checks.push({
      code: 'V10', label: 'Sunrise/Sunset Overlap',
      severity: 'WARNING', passed, message,
      field: 'plannedStartUtc',
    })
  }

  // V11 — Area > 5 sq km
  {
    let areaSqKm = 0
    if (input.areaType === 'CIRCLE' && input.radiusM) {
      areaSqKm = circleAreaSqKm(input.radiusM)
    } else if (input.areaType === 'POLYGON' && input.areaGeoJson) {
      try {
        const geo = JSON.parse(input.areaGeoJson)
        areaSqKm = polygonAreaSqKm(geo.coordinates)
      } catch {
        // skip
      }
    }

    const passed = areaSqKm <= LARGE_AREA_SQ_KM
    const message = passed
      ? `Operation area ${areaSqKm.toFixed(2)} sq km is within the ${LARGE_AREA_SQ_KM} sq km advisory threshold`
      : `Operation area ${areaSqKm.toFixed(2)} sq km exceeds ${LARGE_AREA_SQ_KM} sq km — larger areas may require extended ATC coordination`

    checks.push({
      code: 'V11', label: 'Area Size Advisory',
      severity: 'WARNING', passed, message,
      field: 'areaGeoJson',
    })
  }

  // V12 — Altitude > 120m AGL
  {
    const passed = input.maxAltitudeAglM <= ELEVATED_ALTITUDE_M
    const message = passed
      ? `Altitude ${input.maxAltitudeAglM}m AGL is within the standard ${ELEVATED_ALTITUDE_M}m GREEN zone limit`
      : `Altitude ${input.maxAltitudeAglM}m AGL exceeds ${ELEVATED_ALTITUDE_M}m — classified as YELLOW zone, ATC coordination required`

    checks.push({
      code: 'V12', label: 'Elevated Altitude Advisory',
      severity: 'WARNING', passed, message,
      field: 'maxAltitudeAglM',
    })
  }

  // V13 — Active NOTAM in area
  {
    const startUtc = new Date(input.plannedStartUtc)
    const endUtc = new Date(input.plannedEndUtc)

    let passed = true
    let message = 'No active NOTAMs affecting the operation area'

    try {
      const centroid = getCentroid(input)

      // Find active NOTAMs that overlap the time window
      const activeNotams = await prisma.notamRecord.findMany({
        where: {
          isActive: true,
          effectiveFrom: { lte: endUtc },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: startUtc } },
          ],
        },
        select: {
          notamId: true,
          notamNumber: true,
          location: true,
          subject: true,
          content: true,
          rawText: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
        take: 50,
      })

      // Check proximity of NOTAMs to operation area
      const relevantNotams: string[] = []

      for (const notam of activeNotams) {
        // Match by location ICAO proximity
        if (notam.location) {
          // Look up airport coordinates for the NOTAM's location
          const airport = await prisma.aerodromeRecord.findFirst({
            where: {
              OR: [
                { icao: notam.location },
                { icaoCode: notam.location },
              ],
            },
            select: { latitudeDeg: true, longitudeDeg: true, latDeg: true, lonDeg: true },
          })

          if (airport) {
            const apLat = airport.latitudeDeg ?? airport.latDeg ?? 0
            const apLon = airport.longitudeDeg ?? airport.lonDeg ?? 0
            const dist = haversineKm(centroid.lat, centroid.lng, apLat, apLon)

            if (dist <= 25) {
              // Check if NOTAM is drone-related or restricts operations
              const text = [notam.subject, notam.content, notam.rawText].filter(Boolean).join(' ')
              const isDroneRelevant = /restrict|prohibit|temporary|TFR|drone|UAS|RPAS|no.fly|airspace.closure/i.test(text)

              if (isDroneRelevant) {
                relevantNotams.push(notam.notamNumber ?? notam.notamId ?? 'UNKNOWN')
              }
            }
          }
        }
      }

      if (relevantNotams.length > 0) {
        passed = false
        message = `${relevantNotams.length} active NOTAM(s) may affect the operation area: ${relevantNotams.slice(0, 3).join(', ')}${relevantNotams.length > 3 ? ` (+${relevantNotams.length - 3} more)` : ''}`
      }
    } catch (err) {
      log.warn('v13_notam_check_failed', {
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      message = 'NOTAM check could not be completed — verify manually before flight'
      passed = true // Do not block on NOTAM check failure
    }

    checks.push({
      code: 'V13', label: 'Active NOTAM Check',
      severity: 'WARNING', passed, message,
    })
  }

  // V14 — Payload > 90% max
  {
    let passed = true
    let message = 'No payload weight data provided'

    if (input.payloadWeightGrams != null && input.maxPayloadGrams != null && input.maxPayloadGrams > 0) {
      const ratio = input.payloadWeightGrams / input.maxPayloadGrams
      if (ratio > PAYLOAD_WARNING_PERCENT) {
        passed = false
        message = `Payload ${input.payloadWeightGrams}g is ${(ratio * 100).toFixed(0)}% of max ${input.maxPayloadGrams}g — exceeds ${(PAYLOAD_WARNING_PERCENT * 100).toFixed(0)}% advisory threshold. Reduced manoeuvrability and endurance.`
      } else {
        message = `Payload ${input.payloadWeightGrams}g is ${(ratio * 100).toFixed(0)}% of max ${input.maxPayloadGrams}g — within safe operating limits`
      }
    }

    checks.push({
      code: 'V14', label: 'Payload Weight Advisory',
      severity: 'WARNING', passed, message,
      field: 'payloadWeightGrams',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO — informational only
  // ═══════════════════════════════════════════════════════════════════════════

  // V15 — Auto-expires in < 24 hours
  {
    const startUtc = new Date(input.plannedStartUtc)
    const endUtc = new Date(input.plannedEndUtc)
    const durationHours = (endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60)

    const passed = durationHours >= AUTO_EXPIRE_HOURS
    const message = passed
      ? `Flight window is ${durationHours.toFixed(1)} hours — standard validity`
      : `Flight window is ${durationHours.toFixed(1)} hours (< ${AUTO_EXPIRE_HOURS}h) — Permission Artefact will auto-expire shortly after planned end time`

    checks.push({
      code: 'V15', label: 'Auto-Expiry Notice',
      severity: 'INFO', passed, message,
    })
  }

  // ── Build result ──────────────────────────────────────────────────────────

  const failures = checks.filter(c => c.severity === 'FAILURE' && !c.passed)
  const warnings = checks.filter(c => c.severity === 'WARNING' && !c.passed)
  const info     = checks.filter(c => c.severity === 'INFO' && !c.passed)

  const result: ValidationResult = {
    valid:    failures.length === 0,
    failures,
    warnings,
    info,
    summary: {
      total:  checks.length,
      passed: checks.filter(c => c.passed).length,
      failed: failures.length,
      warned: warnings.length,
      info:   info.length,
    },
  }

  log.info('flight_plan_validation_complete', {
    data: {
      operatorId: input.operatorId,
      droneSerial: input.droneSerialNumber,
      valid: result.valid,
      failures: failures.length,
      warnings: warnings.length,
      info: info.length,
      totalChecks: checks.length,
      passedChecks: checks.filter(c => c.passed).length,
    },
  })

  return result
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const FlightPlanValidationService = {
  validateFlightPlan,
}

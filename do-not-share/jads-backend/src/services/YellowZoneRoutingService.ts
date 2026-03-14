/**
 * YellowZoneRoutingService.ts
 *
 * Determines which ATC authority should receive a yellow-zone drone flight
 * permission application and whether it qualifies for expedited processing.
 *
 * Authority routing:
 *   AAI civilian airports    -> AAI regional NOF (Delhi/Mumbai/Chennai/Kolkata)
 *   IAF airfields             -> IAF relevant Command HQ
 *   Navy airfields            -> Indian Navy Area HQ
 *   HAL-managed airports      -> HAL Bengaluru
 *   Joint civil-military      -> AAI + IAF joint routing
 *
 * Expedited processing criteria (inspired by FAA LAANC):
 *   - Altitude <= 60m AGL
 *   - Duration <= 2 hours
 *   - Area <= 1 sq km
 *   - No payload discharge
 *   - Day operations only (sunrise+30min to sunset-30min)
 *   - Operator has valid UAOP-I or UAOP-II
 *   - No active TFR/NOTAM in area
 *   - Not within 5km of VOR/NDB/ILS critical area
 */

import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'
import { haversineKm } from './ZoneClassificationService'
import authorityMapData from '../data/airport_authority_map.json'
import airportsData from '../data/india_airports.json'

const log = createServiceLogger('YellowZoneRoutingService')

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthorityType = 'AAI' | 'IAF' | 'NAVY' | 'HAL' | 'AAI_IAF'

export interface ATCAuthority {
  type:         AuthorityType
  name:         string          // e.g. "AAI Delhi NOF"
  commandHq:    string | null   // e.g. "IAF Western Air Command, New Delhi"
  jointNote:    string | null   // e.g. "AAI + IAF WAC"
  region:       string          // NORTHERN | WESTERN | SOUTHERN | EASTERN
}

export interface ATCContactDetails {
  email:        string
  phone:        string
  icao:         string
  airportName:  string
}

export interface RoutingResult {
  authority:               ATCAuthority
  expectedProcessingDays:  number        // 1 if expedited, 7 if standard, 30 if complex
  expedited:               boolean
  submissionInstructions:  string
  requiredDocuments:       string[]
  contactDetails:          ATCContactDetails
}

/** Payload shape for canExpedite and routeApplication */
export interface FlightPermissionPayload {
  // Area definition
  areaType:           'POLYGON' | 'CIRCLE'
  areaGeoJson?:       string         // GeoJSON Polygon string
  centerLatDeg?:      number
  centerLonDeg?:      number
  radiusM?:           number

  // Flight parameters
  maxAltitudeAglM:    number
  plannedStartUtc:    string         // ISO 8601
  plannedEndUtc:      string         // ISO 8601
  purpose:            string

  // Operator details
  operatorId:         string
  operatorLicenseType?: string       // UAOP-I | UAOP-II | RPC | NONE
  droneSerialNumber:  string
  droneWeightCategory?: string

  // Payload flags
  payloadDischarge?:  boolean        // true if payload will be released during flight

  // Nearest aerodrome (optional — resolved internally if not provided)
  nearestIcao?:       string
}

// ── Navigational aid critical areas (VOR/NDB/ILS) ────────────────────────────
// Approximate coordinates of major navigational aids in India.
// Drone operations within 5km of these require non-expedited routing.

interface NavAid {
  id:     string
  type:   'VOR' | 'NDB' | 'ILS'
  lat:    number
  lng:    number
  name:   string
}

const NAVAIDS: NavAid[] = [
  // VOR stations at major airports
  { id: 'DPN', type: 'VOR', lat: 28.5665, lng: 77.1167, name: 'Delhi VOR' },
  { id: 'BBB', type: 'VOR', lat: 19.0887, lng: 72.8679, name: 'Mumbai VOR' },
  { id: 'MAA', type: 'VOR', lat: 12.9941, lng: 80.1709, name: 'Chennai VOR' },
  { id: 'CCU', type: 'VOR', lat: 22.6520, lng: 88.4467, name: 'Kolkata VOR' },
  { id: 'BLR', type: 'VOR', lat: 13.1979, lng: 77.7063, name: 'Bengaluru VOR' },
  { id: 'HYD', type: 'VOR', lat: 17.2403, lng: 78.4294, name: 'Hyderabad VOR' },
  { id: 'AMD', type: 'VOR', lat: 23.0772, lng: 72.6347, name: 'Ahmedabad VOR' },
  { id: 'GOA', type: 'VOR', lat: 15.3808, lng: 73.8314, name: 'Goa VOR' },
  { id: 'JAI', type: 'VOR', lat: 26.8242, lng: 75.8122, name: 'Jaipur VOR' },
  { id: 'LKO', type: 'VOR', lat: 26.7606, lng: 80.8893, name: 'Lucknow VOR' },
  { id: 'PAT', type: 'VOR', lat: 25.5913, lng: 85.0880, name: 'Patna VOR' },
  { id: 'GAU', type: 'VOR', lat: 26.1061, lng: 91.5859, name: 'Guwahati VOR' },
  { id: 'PNQ', type: 'VOR', lat: 18.5821, lng: 73.9197, name: 'Pune VOR' },
  { id: 'NAG', type: 'VOR', lat: 21.0922, lng: 79.0472, name: 'Nagpur VOR' },
  { id: 'TRV', type: 'VOR', lat: 8.4821,  lng: 76.9200, name: 'Trivandrum VOR' },
  { id: 'COK', type: 'VOR', lat: 10.1520, lng: 76.3919, name: 'Cochin VOR' },
  { id: 'TRZ', type: 'VOR', lat: 10.7654, lng: 78.7097, name: 'Trichy VOR' },
  { id: 'VTZ', type: 'VOR', lat: 17.7212, lng: 83.2245, name: 'Vizag VOR' },
  { id: 'IXB', type: 'VOR', lat: 26.6812, lng: 88.3286, name: 'Bagdogra VOR' },
  { id: 'RPR', type: 'VOR', lat: 21.1804, lng: 81.7389, name: 'Raipur VOR' },
  // NDB stations
  { id: 'DL',  type: 'NDB', lat: 28.5500, lng: 77.0900, name: 'Delhi NDB' },
  { id: 'BB',  type: 'NDB', lat: 19.0950, lng: 72.8580, name: 'Mumbai NDB' },
  { id: 'MA',  type: 'NDB', lat: 12.9900, lng: 80.1650, name: 'Chennai NDB' },
  { id: 'CC',  type: 'NDB', lat: 22.6490, lng: 88.4500, name: 'Kolkata NDB' },
  { id: 'VN',  type: 'NDB', lat: 25.4522, lng: 82.8593, name: 'Varanasi NDB' },
  { id: 'SXR', type: 'NDB', lat: 34.0000, lng: 74.7942, name: 'Srinagar NDB' },
  { id: 'IXJ', type: 'NDB', lat: 32.6891, lng: 74.8374, name: 'Jammu NDB' },
  { id: 'MGL', type: 'NDB', lat: 12.9613, lng: 74.8900, name: 'Mangalore NDB' },
  { id: 'CJB', type: 'NDB', lat: 11.0300, lng: 77.0434, name: 'Coimbatore NDB' },
  { id: 'BBI', type: 'NDB', lat: 20.2444, lng: 85.8178, name: 'Bhubaneswar NDB' },
  // ILS critical areas (major runways)
  { id: 'VIDP-ILS-28R', type: 'ILS', lat: 28.5562, lng: 77.0870, name: 'Delhi Rwy 28R ILS' },
  { id: 'VIDP-ILS-10L', type: 'ILS', lat: 28.5562, lng: 77.1130, name: 'Delhi Rwy 10L ILS' },
  { id: 'VABB-ILS-27',  type: 'ILS', lat: 19.0896, lng: 72.8530, name: 'Mumbai Rwy 27 ILS' },
  { id: 'VABB-ILS-09',  type: 'ILS', lat: 19.0896, lng: 72.8780, name: 'Mumbai Rwy 09 ILS' },
  { id: 'VOMM-ILS-07',  type: 'ILS', lat: 12.9941, lng: 80.1580, name: 'Chennai Rwy 07 ILS' },
  { id: 'VECC-ILS-19R', type: 'ILS', lat: 22.6527, lng: 88.4350, name: 'Kolkata Rwy 19R ILS' },
  { id: 'VOBL-ILS-09',  type: 'ILS', lat: 13.1979, lng: 77.6930, name: 'Bengaluru Rwy 09 ILS' },
  { id: 'VOHY-ILS-09',  type: 'ILS', lat: 17.2403, lng: 78.4170, name: 'Hyderabad Rwy 09 ILS' },
]

// ── Authority map (loaded from JSON) ─────────────────────────────────────────

interface AerodromeAuthority {
  icao:           string
  name:           string
  authority:      AuthorityType
  nof:            string | null
  commandHq:      string | null
  jointAuthority: string | null
  region:         string
  contactEmail:   string
  contactPhone:   string
}

interface AirportRecord {
  icao:    string
  name:    string
  lat:     number
  lng:     number
  isMajor: boolean
}

const authorityMap: AerodromeAuthority[] = (authorityMapData as any).aerodromes
const airports: AirportRecord[] = (airportsData as any).airports

// Build a fast lookup map: ICAO -> AerodromeAuthority
const authorityByIcao = new Map<string, AerodromeAuthority>()
for (const entry of authorityMap) {
  authorityByIcao.set(entry.icao, entry)
}

// Build a fast lookup map: ICAO -> AirportRecord
const airportByIcao = new Map<string, AirportRecord>()
for (const ap of airports) {
  airportByIcao.set(ap.icao, ap)
}

// ── Solar calculation (approximate sunrise/sunset for India) ──────────────────

/**
 * Approximate sunrise/sunset times for a given date and latitude.
 * Uses simplified equation of time. Accurate to ~10 minutes for India latitudes.
 * Returns { sunriseUtc, sunsetUtc } as Date objects.
 */
function approximateSunTimes(
  date: Date,
  latDeg: number,
  lonDeg: number
): { sunriseUtc: Date; sunsetUtc: Date } {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  )

  // Declination angle (simplified)
  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))
  const decRad = declination * (Math.PI / 180)
  const latRad = latDeg * (Math.PI / 180)

  // Hour angle
  const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad)
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) * (180 / Math.PI)

  // Solar noon (UTC) — approximate based on longitude
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

// ── Area calculation ──────────────────────────────────────────────────────────

/**
 * Compute approximate area of a polygon in sq km using the Shoelace formula
 * with latitude correction. Suitable for small polygons (< 100km across).
 */
function polygonAreaSqKm(coordinates: number[][][]): number {
  if (!coordinates || !coordinates[0] || coordinates[0].length < 4) return 0

  const ring = coordinates[0] // outer ring
  let area = 0
  const n = ring.length

  for (let i = 0; i < n - 1; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[i + 1]
    area += lon1 * lat2 - lon2 * lat1
  }

  area = Math.abs(area) / 2

  // Convert from degrees^2 to km^2
  // At mid-latitude of India (~20 deg N):
  // 1 degree latitude ~= 111 km
  // 1 degree longitude ~= 111 * cos(lat) km
  const midLat = ring.reduce((s, c) => s + c[1], 0) / ring.length
  const latKm = 111.32
  const lonKm = 111.32 * Math.cos(midLat * Math.PI / 180)

  return area * latKm * lonKm
}

/**
 * Circle area in sq km from radius in meters.
 */
function circleAreaSqKm(radiusM: number): number {
  const radiusKm = radiusM / 1000
  return Math.PI * radiusKm * radiusKm
}

// ── Centroid calculation ──────────────────────────────────────────────────────

function getCentroid(payload: FlightPermissionPayload): { lat: number; lng: number } {
  if (payload.areaType === 'CIRCLE' && payload.centerLatDeg != null && payload.centerLonDeg != null) {
    return { lat: payload.centerLatDeg, lng: payload.centerLonDeg }
  }

  if (payload.areaGeoJson) {
    try {
      const geo = JSON.parse(payload.areaGeoJson)
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

  // Default to center of India if nothing available
  return { lat: 20.5937, lng: 78.9629 }
}

// ── Find nearest airport ──────────────────────────────────────────────────────

function findNearestAirport(lat: number, lng: number): AirportRecord | null {
  let nearest: AirportRecord | null = null
  let minDist = Infinity

  for (const ap of airports) {
    const dist = haversineKm(lat, lng, ap.lat, ap.lng)
    if (dist < minDist) {
      minDist = dist
      nearest = ap
    }
  }

  return nearest
}

// ── Expedited processing check ────────────────────────────────────────────────

/**
 * canExpedite determines whether a yellow-zone application qualifies for
 * expedited (LAANC-style) processing.
 *
 * Returns true if ALL conditions are met:
 *   1. Altitude <= 60m AGL
 *   2. Duration <= 2 hours
 *   3. Area <= 1 sq km
 *   4. No payload discharge
 *   5. Day operations only (sunrise+30min to sunset-30min)
 *   6. Operator has valid UAOP-I or UAOP-II
 *   7. No active TFR/NOTAM in area (checked via Prisma)
 *   8. Not within 5km of a VOR/NDB/ILS critical area
 */
export async function canExpedite(
  application: FlightPermissionPayload,
  prisma: PrismaClient
): Promise<{ expedited: boolean; reasons: string[] }> {
  const reasons: string[] = []

  // 1. Altitude <= 60m AGL
  if (application.maxAltitudeAglM > 60) {
    reasons.push(`Altitude ${application.maxAltitudeAglM}m exceeds 60m AGL expedited limit`)
  }

  // 2. Duration <= 2 hours
  const startUtc = new Date(application.plannedStartUtc)
  const endUtc = new Date(application.plannedEndUtc)
  const durationHours = (endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60)
  if (durationHours > 2) {
    reasons.push(`Duration ${durationHours.toFixed(1)}h exceeds 2-hour expedited limit`)
  }

  // 3. Area <= 1 sq km
  let areaSqKm = 0
  if (application.areaType === 'CIRCLE' && application.radiusM) {
    areaSqKm = circleAreaSqKm(application.radiusM)
  } else if (application.areaType === 'POLYGON' && application.areaGeoJson) {
    try {
      const geo = JSON.parse(application.areaGeoJson)
      areaSqKm = polygonAreaSqKm(geo.coordinates)
    } catch {
      reasons.push('Unable to parse area GeoJSON for area calculation')
    }
  }
  if (areaSqKm > 1) {
    reasons.push(`Area ${areaSqKm.toFixed(2)} sq km exceeds 1 sq km expedited limit`)
  }

  // 4. No payload discharge
  if (application.payloadDischarge === true) {
    reasons.push('Payload discharge operations are not eligible for expedited processing')
  }

  // 5. Day operations only (sunrise+30min to sunset-30min)
  const centroid = getCentroid(application)
  const sunTimes = approximateSunTimes(startUtc, centroid.lat, centroid.lng)
  const earliestStart = new Date(sunTimes.sunriseUtc.getTime() + 30 * 60 * 1000) // sunrise + 30 min
  const latestEnd = new Date(sunTimes.sunsetUtc.getTime() - 30 * 60 * 1000)      // sunset - 30 min

  if (startUtc < earliestStart) {
    reasons.push(`Start time is before sunrise+30min (earliest: ${earliestStart.toISOString()})`)
  }
  if (endUtc > latestEnd) {
    reasons.push(`End time is after sunset-30min (latest: ${latestEnd.toISOString()})`)
  }

  // 6. Operator has valid UAOP-I or UAOP-II
  const validLicenseTypes = ['UAOP-I', 'UAOP-II']
  if (!application.operatorLicenseType || !validLicenseTypes.includes(application.operatorLicenseType)) {
    reasons.push(
      `Operator license type "${application.operatorLicenseType ?? 'NONE'}" is not UAOP-I or UAOP-II`
    )
  }

  // 7. No active TFR/NOTAM in area
  try {
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
        areaGeoJson: true,
        subject: true,
        content: true,
        lowerFt: true,
        upperFt: true,
      },
    })

    // Check if any NOTAM's area intersects with the application area
    // Simplified: check if the NOTAM location (airport ICAO) is the nearest airport
    const nearestAirport = findNearestAirport(centroid.lat, centroid.lng)
    for (const notam of activeNotams) {
      if (notam.location && nearestAirport && notam.location === nearestAirport.icao) {
        // Check if the NOTAM is relevant (TFR, restricted area, etc.)
        const subjectStr = (notam.subject ?? '') + (notam.content ?? '')
        const isTfr = /restrict|prohibit|temporary|TFR|NOTAM|drone|UAS|RPAS/i.test(subjectStr)
        if (isTfr) {
          reasons.push(
            `Active NOTAM ${notam.notamNumber ?? notam.notamId ?? 'unknown'} affects the area — TFR/restriction in effect`
          )
          break
        }
      }
    }
  } catch (err) {
    log.warn('notam_check_failed', {
      data: { error: err instanceof Error ? err.message : String(err) },
    })
    // Do not block expedited if NOTAM check fails — log warning and continue
  }

  // 8. Not within 5km of a VOR/NDB/ILS critical area
  for (const navaid of NAVAIDS) {
    const dist = haversineKm(centroid.lat, centroid.lng, navaid.lat, navaid.lng)
    if (dist <= 5) {
      reasons.push(
        `Within ${dist.toFixed(1)}km of ${navaid.type} "${navaid.name}" (${navaid.id}) — minimum 5km clearance required`
      )
      break // One is enough to disqualify
    }
  }

  const expedited = reasons.length === 0

  log.info('can_expedite_check', {
    data: {
      operatorId: application.operatorId,
      expedited,
      failedCriteria: reasons.length,
    },
  })

  return { expedited, reasons }
}

// ── Route application ─────────────────────────────────────────────────────────

/**
 * routeApplication determines the correct ATC authority, expected processing time,
 * and required documents for a yellow-zone drone flight permission application.
 */
export async function routeApplication(
  application: FlightPermissionPayload,
  zoneIcao: string | null,
  prisma: PrismaClient
): Promise<RoutingResult> {
  const centroid = getCentroid(application)

  // Determine nearest airport ICAO
  let resolvedIcao = zoneIcao ?? application.nearestIcao ?? null
  if (!resolvedIcao) {
    const nearest = findNearestAirport(centroid.lat, centroid.lng)
    resolvedIcao = nearest?.icao ?? null
  }

  // Look up authority from the routing table
  const authorityEntry = resolvedIcao ? authorityByIcao.get(resolvedIcao) : null
  const airportEntry = resolvedIcao ? airportByIcao.get(resolvedIcao) : null

  // Build ATCAuthority
  const authority = buildAuthority(authorityEntry ?? undefined)

  // Check expedited eligibility
  const { expedited, reasons: expediteReasons } = await canExpedite(application, prisma)

  // Determine complexity
  const isComplex = determineComplexity(application, authorityEntry ?? undefined)

  // Processing days: 1 expedited, 7 standard, 30 complex
  const expectedProcessingDays = expedited ? 1 : isComplex ? 30 : 7

  // Build submission instructions
  const submissionInstructions = buildSubmissionInstructions(
    authority,
    authorityEntry ?? undefined,
    expedited,
    isComplex
  )

  // Build required documents list
  const requiredDocuments = buildRequiredDocuments(application, authorityEntry ?? undefined, isComplex)

  // Contact details
  const contactDetails: ATCContactDetails = {
    email: authorityEntry?.contactEmail ?? 'uas-cell@dgca.gov.in',
    phone: authorityEntry?.contactPhone ?? '+91-11-24622495',
    icao: resolvedIcao ?? 'UNKNOWN',
    airportName: airportEntry?.name ?? authorityEntry?.name ?? 'Unknown Aerodrome',
  }

  log.info('route_application_complete', {
    data: {
      operatorId: application.operatorId,
      resolvedIcao,
      authorityType: authority.type,
      expedited,
      expectedProcessingDays,
      isComplex,
    },
  })

  return {
    authority,
    expectedProcessingDays,
    expedited,
    submissionInstructions,
    requiredDocuments,
    contactDetails,
  }
}

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildAuthority(entry: AerodromeAuthority | undefined): ATCAuthority {
  if (!entry) {
    return {
      type: 'AAI',
      name: 'DGCA UAS Cell (fallback)',
      commandHq: null,
      jointNote: null,
      region: 'NATIONAL',
    }
  }

  const authorityType = entry.authority as AuthorityType

  let name: string
  switch (authorityType) {
    case 'AAI':
      name = entry.nof ?? `AAI ATC — ${entry.name}`
      break
    case 'IAF':
      name = entry.commandHq ?? `IAF — ${entry.name}`
      break
    case 'NAVY':
      name = entry.commandHq ?? `Indian Navy — ${entry.name}`
      break
    case 'HAL':
      name = `HAL Bengaluru — ${entry.name}`
      break
    case 'AAI_IAF':
      name = entry.jointAuthority ?? `AAI + IAF — ${entry.name}`
      break
    default:
      name = entry.nof ?? entry.name
  }

  return {
    type: authorityType,
    name,
    commandHq: entry.commandHq,
    jointNote: entry.jointAuthority,
    region: entry.region,
  }
}

function determineComplexity(
  application: FlightPermissionPayload,
  entry: AerodromeAuthority | undefined
): boolean {
  // Complex if any of:
  //   - Joint civil-military routing (AAI_IAF)
  //   - Military-only airfield (IAF, NAVY)
  //   - Medium or Large drone weight category
  //   - Duration > 8 hours
  //   - Altitude > 120m
  //   - Payload discharge
  if (entry?.authority === 'AAI_IAF') return true
  if (entry?.authority === 'IAF') return true
  if (entry?.authority === 'NAVY') return true

  const weightCat = application.droneWeightCategory ?? 'UNKNOWN'
  if (weightCat === 'MEDIUM' || weightCat === 'LARGE') return true

  const startUtc = new Date(application.plannedStartUtc)
  const endUtc = new Date(application.plannedEndUtc)
  const durationHours = (endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60)
  if (durationHours > 8) return true

  if (application.maxAltitudeAglM > 120) return true
  if (application.payloadDischarge === true) return true

  return false
}

function buildSubmissionInstructions(
  authority: ATCAuthority,
  entry: AerodromeAuthority | undefined,
  expedited: boolean,
  isComplex: boolean
): string {
  const parts: string[] = []

  if (expedited) {
    parts.push(
      'EXPEDITED PROCESSING: This application qualifies for expedited review (1 business day).'
    )
    parts.push(
      'Submit via Digital Sky Platform with LAANC-equivalent auto-approval flow.'
    )
  } else if (isComplex) {
    parts.push(
      'COMPLEX APPLICATION: This application requires multi-authority coordination (up to 30 business days).'
    )
  } else {
    parts.push(
      'STANDARD PROCESSING: Application will be reviewed within 7 business days.'
    )
  }

  switch (authority.type) {
    case 'AAI':
      parts.push(
        `Submit to ${entry?.nof ?? 'AAI regional NOF'} via DGCA Digital Sky Platform.`
      )
      parts.push(
        'Reference: DGCA CAR Section 3 Series X Part I — UAS Rules 2021.'
      )
      break
    case 'IAF':
      parts.push(
        `Submit via Station Commander office at ${entry?.name ?? 'the IAF airfield'}.`
      )
      parts.push(
        `Coordination through ${entry?.commandHq ?? 'IAF Command HQ'} is required.`
      )
      parts.push(
        'Reference: IAF Air Staff Instruction 3/2020 — UAS Operations in Military Airspace.'
      )
      break
    case 'NAVY':
      parts.push(
        `Submit via Flag Officer Naval Aviation (FONA) at ${entry?.commandHq ?? 'Indian Navy Area HQ'}.`
      )
      parts.push(
        'Reference: Indian Navy Standing Order for UAS Operations in Naval Air Zones.'
      )
      break
    case 'HAL':
      parts.push(
        'Submit to HAL Bengaluru Airport Director with copy to DGCA regional office.'
      )
      parts.push(
        'Reference: HAL aerodrome operating procedures for civilian drone operations.'
      )
      break
    case 'AAI_IAF':
      parts.push(
        `Submit to ${entry?.nof ?? 'AAI NOF'} AND ${entry?.commandHq ?? 'IAF Command HQ'} simultaneously.`
      )
      parts.push(
        'Both AAI and IAF approvals are required. The application is considered approved only after both authorities grant clearance.'
      )
      parts.push(
        'Reference: Joint AAI-IAF SOP for Shared Aerodrome UAS Operations.'
      )
      break
  }

  return parts.join(' ')
}

function buildRequiredDocuments(
  application: FlightPermissionPayload,
  entry: AerodromeAuthority | undefined,
  isComplex: boolean
): string[] {
  const docs: string[] = [
    'DGCA UAS Operator Permit (UAOP) — valid copy',
    'Drone Registration Certificate (UIN)',
    'Remote Pilot License (RPL) of designated pilot',
    'Third-party liability insurance certificate',
    'Flight plan with precise coordinates and altitude limits',
    'Risk assessment and mitigation plan',
  ]

  if (application.droneWeightCategory === 'MEDIUM' || application.droneWeightCategory === 'LARGE') {
    docs.push('Type Certificate from DGCA')
    docs.push('NPNT compliance certificate')
  }

  if (application.payloadDischarge) {
    docs.push('Payload discharge safety assessment')
    docs.push('Environmental clearance (if applicable)')
  }

  if (entry?.authority === 'IAF' || entry?.authority === 'AAI_IAF') {
    docs.push('Security clearance from local police/administration')
    docs.push('NOC from Station Commander (IAF)')
  }

  if (entry?.authority === 'NAVY') {
    docs.push('Naval security clearance')
    docs.push('NOC from Flag Officer Naval Aviation')
  }

  if (isComplex) {
    docs.push('Detailed SOP for complex/extended operations')
    docs.push('Emergency response and contingency plan')
    docs.push('Communication plan with ATC frequencies')
  }

  return docs
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const YellowZoneRoutingService = {
  canExpedite,
  routeApplication,
  findNearestAirport,
  getCentroid,
}

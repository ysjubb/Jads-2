/**
 * ZoneClassificationService.ts
 *
 * Classifies any geofence polygon against India's official drone airspace zones
 * per DGCA UAS Rules 2021 and Digital Sky Platform zone definitions.
 *
 * Zone precedence (most restrictive wins):
 *   RED    - No-fly zones (airports, borders, strategic installations)
 *   YELLOW - Controlled airspace (ATC permission required)
 *   GREEN  - Open airspace (auto-approvable if altitude <= 120m AGL)
 *
 * Algorithm checks (in order of precedence):
 *   RED:    5km major airports, 3km other airports, 25km borders, 2km strategic
 *   YELLOW: >120m AGL, 8-12km major airports, 5-8km other airports, FIR controlled
 *   GREEN:  passes all above checks
 */

import { createServiceLogger } from '../logger'
import { INDIA_FIR_BOUNDARIES, FirBoundary } from '../data/IndiaFirBoundaries'
import airportsData from '../data/india_airports.json'
import bordersData from '../data/india_borders_simplified.json'
import strategicData from '../data/strategic_installations.json'

const log = createServiceLogger('ZoneClassificationService')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number
  lng: number
}

export type ZoneType = 'GREEN' | 'YELLOW' | 'RED'
export type AuthorityCode = 'AAI' | 'IAF' | 'NAVY' | 'HAL' | 'DGCA' | 'MHA' | null

export interface AffectedZoneEntry {
  zone:             ZoneType
  reason:           string
  authority:        AuthorityCode
  affectedVertices: number[]   // indices of polygon vertices in this zone
}

export interface ZoneClassificationResult {
  primaryZone:                  ZoneType
  affectedZones:                AffectedZoneEntry[]
  requiresATCPermission:        boolean
  atcAuthority:                 string | null
  requiresCentralGovtPermission: boolean
  canAutoApprove:               boolean   // true only if entire polygon is GREEN and altitude <= 120m
  warnings:                     string[]
}

// ── Airport data types ────────────────────────────────────────────────────────

interface AirportRecord {
  icao:    string
  name:    string
  lat:     number
  lng:     number
  isMajor: boolean
}

interface StrategicInstallation {
  id:              string
  name:            string
  category:        string
  lat:             number
  lng:             number
  bufferRadiusKm:  number
  authority:       string
}

interface BorderSegment {
  name:        string
  coordinates: Array<{ lat: number; lng: number }>
}

// ── Load static data ──────────────────────────────────────────────────────────

const airports: AirportRecord[] = (airportsData as any).airports
const borderSegments: BorderSegment[] = (bordersData as any).borderSegments
const strategicInstallations: StrategicInstallation[] = (strategicData as any).installations

// Major airports with their zone-classification coordinates (per task spec)
const MAJOR_AIRPORTS: Array<{ icao: string; lat: number; lng: number; name: string }> = [
  { icao: 'VIDP', lat: 28.5562, lng: 77.1000, name: 'Delhi (VIDP)' },
  { icao: 'VABB', lat: 19.0896, lng: 72.8656, name: 'Mumbai (VABB)' },
  { icao: 'VOMM', lat: 12.9941, lng: 80.1709, name: 'Chennai (VOMM)' },
  { icao: 'VECC', lat: 22.6527, lng: 88.4467, name: 'Kolkata (VECC)' },
  { icao: 'VOBL', lat: 13.1979, lng: 77.7063, name: 'Bengaluru (VOBL)' },
  { icao: 'VOHY', lat: 17.2403, lng: 78.4294, name: 'Hyderabad (VOHY)' },
]

const MAJOR_ICAO_SET = new Set(MAJOR_AIRPORTS.map(a => a.icao))

// ── Haversine distance ────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371

export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
            Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Point-to-line-segment distance ────────────────────────────────────────────
// Approximate: compute perpendicular distance from point to each segment of
// the border polyline. Returns minimum distance in km.

function pointToSegmentDistanceKm(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): number {
  // Project point onto segment in lat/lng space (approximate for short segments)
  const dx = bLng - aLng
  const dy = bLat - aLat
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    return haversineKm(pLat, pLng, aLat, aLng)
  }

  let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projLat = aLat + t * dy
  const projLng = aLng + t * dx

  return haversineKm(pLat, pLng, projLat, projLng)
}

function minDistanceToBorderKm(lat: number, lng: number): number {
  let minDist = Infinity

  for (const segment of borderSegments) {
    const coords = segment.coordinates
    for (let i = 0; i < coords.length - 1; i++) {
      const dist = pointToSegmentDistanceKm(
        lat, lng,
        coords[i].lat, coords[i].lng,
        coords[i + 1].lat, coords[i + 1].lng
      )
      if (dist < minDist) minDist = dist
    }
  }

  return minDist
}

// ── Point-in-polygon (ray casting) ────────────────────────────────────────────

export function pointInPolygon(
  lat: number, lng: number,
  polygon: Array<{ lat: number; lon?: number; lng?: number }>
): boolean {
  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    const piLng = pi.lng ?? pi.lon ?? 0
    const pjLng = pj.lng ?? pj.lon ?? 0

    if (((pi.lat > lat) !== (pj.lat > lat)) &&
        (lng < (pjLng - piLng) * (lat - pi.lat) / (pj.lat - pi.lat) + piLng)) {
      inside = !inside
    }
  }

  return inside
}

// ── Core classification ───────────────────────────────────────────────────────

export async function classifyPolygon(
  polygon: LatLng[],
  altitudeAGL: number
): Promise<ZoneClassificationResult> {

  const affectedZones: AffectedZoneEntry[] = []
  const warnings: string[] = []
  let atcAuthority: string | null = null
  let requiresCentralGovtPermission = false

  // Track per-vertex zone assignment (for affectedVertices indexing)
  const vertexZones: ZoneType[] = polygon.map(() => 'GREEN')

  // ── RED ZONE checks ──────────────────────────────────────────────────────

  // 1a. Within 5km of 6 major airports → RED
  for (const major of MAJOR_AIRPORTS) {
    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = haversineKm(polygon[i].lat, polygon[i].lng, major.lat, major.lng)
      if (dist <= 5) {
        affectedVerts.push(i)
        vertexZones[i] = 'RED'
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'RED',
        reason: `Within 5km of major airport ${major.name}`,
        authority: 'AAI',
        affectedVertices: affectedVerts,
      })
      atcAuthority = atcAuthority ?? `${major.icao} ATC`
    }
  }

  // 1b. Within 3km of all other airports → RED
  for (const airport of airports) {
    if (MAJOR_ICAO_SET.has(airport.icao)) continue  // already checked above

    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = haversineKm(polygon[i].lat, polygon[i].lng, airport.lat, airport.lng)
      if (dist <= 3) {
        affectedVerts.push(i)
        vertexZones[i] = 'RED'
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'RED',
        reason: `Within 3km of aerodrome ${airport.icao} (${airport.name})`,
        authority: 'AAI',
        affectedVertices: affectedVerts,
      })
      atcAuthority = atcAuthority ?? `${airport.icao} ATC`
    }
  }

  // 1c. Within 25km of international borders → RED
  {
    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = minDistanceToBorderKm(polygon[i].lat, polygon[i].lng)
      if (dist <= 25) {
        affectedVerts.push(i)
        vertexZones[i] = 'RED'
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'RED',
        reason: 'Within 25km of international border',
        authority: 'MHA',
        affectedVertices: affectedVerts,
      })
      requiresCentralGovtPermission = true
    }
  }

  // 1d. Within 2km of MHA notified strategic installations → RED
  for (const si of strategicInstallations) {
    const bufferKm = si.bufferRadiusKm || 2
    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = haversineKm(polygon[i].lat, polygon[i].lng, si.lat, si.lng)
      if (dist <= bufferKm) {
        affectedVerts.push(i)
        vertexZones[i] = 'RED'
      }
    }
    if (affectedVerts.length > 0) {
      const authorityCode = mapAuthority(si.authority)
      affectedZones.push({
        zone: 'RED',
        reason: `Within ${bufferKm}km of strategic installation: ${si.name}`,
        authority: authorityCode,
        affectedVertices: affectedVerts,
      })
      requiresCentralGovtPermission = true
    }
  }

  // ── YELLOW ZONE checks ───────────────────────────────────────────────────

  // 2a. Altitude > 120m AGL anywhere → YELLOW (applies to all vertices)
  if (altitudeAGL > 120) {
    const allVerts = polygon.map((_, i) => i)
    affectedZones.push({
      zone: 'YELLOW',
      reason: `Altitude ${altitudeAGL}m AGL exceeds 120m limit`,
      authority: 'DGCA',
      affectedVertices: allVerts,
    })
    warnings.push(`Flight altitude ${altitudeAGL}m AGL exceeds 120m maximum for GREEN zone operations`)
    for (let i = 0; i < polygon.length; i++) {
      if (vertexZones[i] === 'GREEN') vertexZones[i] = 'YELLOW'
    }
  }

  // 2b. Within 8-12km from major airport perimeters → YELLOW
  for (const major of MAJOR_AIRPORTS) {
    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = haversineKm(polygon[i].lat, polygon[i].lng, major.lat, major.lng)
      if (dist > 5 && dist <= 12) {
        // Only within 8-12km per spec, but 5-8km can also be YELLOW for major
        // Spec says 8-12km for major; we use >5 and <=12 to be safe
        // Vertices 5-8km from major: these are technically caught by "other airport" 5-8km check
        // but for major airports the yellow zone extends to 12km
        if (dist > 8 && dist <= 12) {
          affectedVerts.push(i)
          if (vertexZones[i] === 'GREEN') vertexZones[i] = 'YELLOW'
        }
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'YELLOW',
        reason: `Within 8-12km of major airport ${major.name} — ATC coordination required`,
        authority: 'AAI',
        affectedVertices: affectedVerts,
      })
      atcAuthority = atcAuthority ?? `${major.icao} ATC`
    }
  }

  // 2c. Within 5-8km from any civil aerodrome → YELLOW
  for (const airport of airports) {
    // For major airports, yellow zone is 8-12km (handled above).
    // For non-major airports, yellow zone is 5-8km.
    // Major airports also have 5-8km as yellow (bridge between RED 5km and YELLOW 8-12km).
    const innerYellow = MAJOR_ICAO_SET.has(airport.icao) ? 5 : 5
    const outerYellow = MAJOR_ICAO_SET.has(airport.icao) ? 8 : 8

    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const dist = haversineKm(polygon[i].lat, polygon[i].lng, airport.lat, airport.lng)
      if (dist > innerYellow && dist <= outerYellow) {
        affectedVerts.push(i)
        if (vertexZones[i] === 'GREEN') vertexZones[i] = 'YELLOW'
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'YELLOW',
        reason: `Within 5-8km of aerodrome ${airport.icao} (${airport.name}) — ATC coordination required`,
        authority: 'AAI',
        affectedVertices: affectedVerts,
      })
      atcAuthority = atcAuthority ?? `${airport.icao} ATC`
    }
  }

  // 2d. Within FIR controlled airspace boundaries → YELLOW
  // If any vertex falls inside a defined FIR polygon, it is in controlled airspace
  for (const fir of INDIA_FIR_BOUNDARIES) {
    const affectedVerts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      if (pointInPolygon(polygon[i].lat, polygon[i].lng, fir.polygon)) {
        // Being inside a FIR is controlled airspace.
        // This is a YELLOW classification only (not RED) since FIR coverage is nationwide.
        // The YELLOW flag here indicates ATC awareness is needed.
        affectedVerts.push(i)
        if (vertexZones[i] === 'GREEN') vertexZones[i] = 'YELLOW'
      }
    }
    if (affectedVerts.length > 0) {
      affectedZones.push({
        zone: 'YELLOW',
        reason: `Within ${fir.firName} (${fir.firCode}) controlled airspace`,
        authority: 'AAI',
        affectedVertices: affectedVerts,
      })
      atcAuthority = atcAuthority ?? fir.callsign
    }
  }

  // ── Determine primary zone ────────────────────────────────────────────────

  let primaryZone: ZoneType = 'GREEN'
  if (vertexZones.some(z => z === 'RED'))    primaryZone = 'RED'
  else if (vertexZones.some(z => z === 'YELLOW')) primaryZone = 'YELLOW'

  // If no specific zone entries were added but all vertices are GREEN,
  // add a single GREEN zone entry
  if (primaryZone === 'GREEN') {
    affectedZones.push({
      zone: 'GREEN',
      reason: 'All vertices within unrestricted airspace',
      authority: null,
      affectedVertices: polygon.map((_, i) => i),
    })
  }

  const requiresATCPermission = primaryZone === 'RED' || primaryZone === 'YELLOW'
  const canAutoApprove = primaryZone === 'GREEN' && altitudeAGL <= 120

  // Add warnings for mixed-zone polygons
  const hasRed    = vertexZones.some(z => z === 'RED')
  const hasYellow = vertexZones.some(z => z === 'YELLOW')
  const hasGreen  = vertexZones.some(z => z === 'GREEN')

  if (hasRed && (hasYellow || hasGreen)) {
    warnings.push('Polygon spans multiple zone classifications — entire operation classified as RED')
  } else if (hasYellow && hasGreen) {
    warnings.push('Polygon spans GREEN and YELLOW zones — entire operation classified as YELLOW')
  }

  log.info('zone_classification_complete', {
    data: {
      primaryZone,
      vertexCount: polygon.length,
      altitudeAGL,
      affectedZoneCount: affectedZones.length,
      requiresATCPermission,
      canAutoApprove,
    }
  })

  return {
    primaryZone,
    affectedZones,
    requiresATCPermission,
    atcAuthority: requiresATCPermission ? atcAuthority : null,
    requiresCentralGovtPermission,
    canAutoApprove,
    warnings,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAuthority(raw: string): AuthorityCode {
  const upper = raw.toUpperCase()
  if (upper === 'AAI')  return 'AAI'
  if (upper === 'IAF')  return 'IAF'
  if (upper === 'NAVY') return 'NAVY'
  if (upper === 'HAL')  return 'HAL'
  if (upper === 'DGCA') return 'DGCA'
  if (upper === 'MHA')  return 'MHA'
  return 'MHA'  // Default to MHA for strategic installations
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const ZoneClassificationService = {
  classifyPolygon,
  haversineKm,
  pointInPolygon,
}

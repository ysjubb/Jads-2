// Airspace zone classification fixture data for eGCA mock adapter.
// Representative Indian airspace zone polygons for GREEN / YELLOW / RED.

import type { ZoneClassification, LatLng } from '../types'

// ── Zone classification logic for mock ──────────────────────────────────────
// Simple heuristic: check if any vertex falls in a known zone.
// Production eGCA performs server-side spatial intersection.

interface ZoneRegion {
  classification: ZoneClassification
  bounds: {
    minLat: number; maxLat: number
    minLng: number; maxLng: number
  }
}

// RED zones: near major airports, military installations, government buildings
const RED_ZONES: ZoneRegion[] = [
  {
    // Rashtrapati Bhavan / Parliament area, New Delhi
    classification: { zone: 'RED', reasons: ['Within 5km of Rashtrapati Bhavan — permanent no-fly zone'], atcAuthority: 'VIDF_APP' },
    bounds: { minLat: 28.58, maxLat: 28.64, minLng: 77.18, maxLng: 77.24 },
  },
  {
    // IGI Airport, Delhi — 5km inner zone
    classification: { zone: 'RED', reasons: ['Within 5km of Indira Gandhi International Airport (VIDP)'], atcAuthority: 'VIDP_TWR' },
    bounds: { minLat: 28.52, maxLat: 28.60, minLng: 77.06, maxLng: 77.14 },
  },
  {
    // CSIA, Mumbai — 5km inner zone
    classification: { zone: 'RED', reasons: ['Within 5km of Chhatrapati Shivaji Maharaj International Airport (VABB)'], atcAuthority: 'VABB_TWR' },
    bounds: { minLat: 19.06, maxLat: 19.12, minLng: 72.85, maxLng: 72.90 },
  },
]

// YELLOW zones: 5-8km airport buffer, controlled airspace
const YELLOW_ZONES: ZoneRegion[] = [
  {
    // IGI Airport outer buffer (5–8km)
    classification: { zone: 'YELLOW', reasons: ['Within 5–8km buffer of VIDP — DGCA permission required'], atcAuthority: 'VIDP_APP' },
    bounds: { minLat: 28.48, maxLat: 28.66, minLng: 77.02, maxLng: 77.18 },
  },
  {
    // Controlled airspace near HAL Airport, Bangalore
    classification: { zone: 'YELLOW', reasons: ['Controlled airspace near HAL Airport (VOBG)'], atcAuthority: 'VOBL_APP' },
    bounds: { minLat: 12.93, maxLat: 12.99, minLng: 77.65, maxLng: 77.72 },
  },
]

/** Determine zone classification for a polygon based on fixture data. */
export function classifyZoneFromFixtures(polygon: LatLng[]): ZoneClassification {
  // Check RED first (highest restriction)
  for (const region of RED_ZONES) {
    if (polygonIntersects(polygon, region.bounds)) {
      return region.classification
    }
  }

  // Check YELLOW
  for (const region of YELLOW_ZONES) {
    if (polygonIntersects(polygon, region.bounds)) {
      return region.classification
    }
  }

  // Default: GREEN
  return {
    zone:    'GREEN',
    reasons: ['No restricted zones detected — open for operations per DGCA UAS Rules 2021'],
  }
}

function polygonIntersects(
  polygon: LatLng[],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return polygon.some(
    pt => pt.latitude  >= bounds.minLat && pt.latitude  <= bounds.maxLat &&
          pt.longitude >= bounds.minLng && pt.longitude <= bounds.maxLng
  )
}

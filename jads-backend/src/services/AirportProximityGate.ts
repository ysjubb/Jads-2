/**
 * AirportProximityGate.ts
 *
 * Checks drone operations against airport exclusion zones.
 * This is SEPARATE from NPNT zone classification (GREEN/YELLOW/RED).
 * A location can be GREEN zone but still inside an airport exclusion.
 * Both checks must run independently in NpntComplianceGate.
 *
 * Rules per UAS Rules 2021 + DGCA circular:
 *   Within 5km of ARP, below 1000ft AGL  → PROHIBITED (hard stop)
 *   Within 5km of ARP, above 1000ft AGL  → ATC coordination required
 *   Within 8km of ARP, any altitude       → ATC coordination required
 *   Beyond 8km                            → CLEAR (proximity check passes)
 *
 * Military aerodromes may have extended exclusion radii.
 */

import { createServiceLogger } from '../logger'

const log = createServiceLogger('AirportProximityGate')

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProximityRestriction = 'NONE' | 'COORDINATION_REQUIRED' | 'PROHIBITED'

export interface AerodromeProximityRecord {
  icaoCode:               string
  name:                   string
  arpLat:                 number
  arpLon:                 number
  type:                   'INTERNATIONAL' | 'DOMESTIC' | 'MILITARY' | 'HELIPORT' | 'AIRSTRIP'
  exclusionRadiusInnerKm: number   // hard prohibition below 1000ft
  exclusionRadiusOuterKm: number   // coordination required any altitude
}

export interface ProximityCheckResult {
  clear:             boolean
  restriction:       ProximityRestriction
  nearestAerodrome:  {
    icaoCode:    string
    name:        string
    distanceKm:  number
    type:        string
  } | null
  message:           string | null
}

// ── Aerodrome dataset ─────────────────────────────────────────────────────────
// Source: AIP India ENR 5.4 + DGCA UAS Rules 2021
// Updated with each AIRAC cycle. Current: AIRAC 2401

export const INDIAN_AERODROMES_PROXIMITY: AerodromeProximityRecord[] = [
  // ── Major international ───────────────────────────────────────────────────
  { icaoCode: 'VIDP', name: 'Indira Gandhi International, Delhi',
    arpLat: 28.5665, arpLon: 77.1031, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VABB', name: 'Chhatrapati Shivaji Maharaj Intl, Mumbai',
    arpLat: 19.0896, arpLon: 72.8656, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOMM', name: 'Chennai International',
    arpLat: 12.9900, arpLon: 80.1693, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VECC', name: 'Netaji Subhas Chandra Bose Intl, Kolkata',
    arpLat: 22.6547, arpLon: 88.4467, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOBL', name: 'Kempegowda International, Bengaluru',
    arpLat: 13.1986, arpLon: 77.7066, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOHS', name: 'Rajiv Gandhi International, Hyderabad',
    arpLat: 17.2403, arpLon: 78.4294, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VAAH', name: 'Sardar Vallabhbhai Patel Intl, Ahmedabad',
    arpLat: 23.0772, arpLon: 72.6347, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOCL', name: 'Cochin International, Kochi',
    arpLat: 10.1520, arpLon: 76.3919, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOGP', name: 'Goa International, Dabolim',
    arpLat: 15.3808, arpLon: 73.8314, type: 'INTERNATIONAL',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VIPT', name: 'Pantnagar Airport',
    arpLat: 29.0334, arpLon: 79.4737, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },

  // ── Key domestic ─────────────────────────────────────────────────────────
  { icaoCode: 'VILK', name: 'Chaudhary Charan Singh Intl, Lucknow',
    arpLat: 26.7606, arpLon: 80.8893, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VIAR', name: 'Sri Guru Ram Dass Jee Intl, Amritsar',
    arpLat: 31.7096, arpLon: 74.7972, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VOPB', name: 'Veer Savarkar Intl, Port Blair',
    arpLat: 11.6412, arpLon: 92.7297, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VEJH', name: 'Jharsuguda Airport',
    arpLat: 21.9135, arpLon: 84.0504, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VABP', name: 'Raja Bhoj Airport, Bhopal',
    arpLat: 23.2875, arpLon: 77.3374, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VANP', name: 'Dr. Babasaheb Ambedkar Intl, Nagpur',
    arpLat: 21.0922, arpLon: 79.0472, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VIBN', name: 'Lal Bahadur Shastri Intl, Varanasi',
    arpLat: 25.4522, arpLon: 82.8593, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },
  { icaoCode: 'VEPB', name: 'Biju Patnaik Intl, Bhubaneswar',
    arpLat: 20.2444, arpLon: 85.8178, type: 'DOMESTIC',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 8 },

  // ── Military aerodromes — extended exclusion radii ────────────────────────
  // Note: actual restricted airspace may differ from exclusion radius.
  // This covers the UAS operational exclusion only.
  { icaoCode: 'VIDD', name: 'Air Force Station Hindon',
    arpLat: 28.7225, arpLon: 77.3044, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VOHB', name: 'Air Force Station Hakimpet, Hyderabad',
    arpLat: 17.4619, arpLon: 78.5442, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VOYR', name: 'Yelahanka Air Force Station, Bengaluru',
    arpLat: 13.1358, arpLon: 77.6008, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VIBK', name: 'Air Force Station Bareilly',
    arpLat: 28.4221, arpLon: 79.4513, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VIJR', name: 'Air Force Station Jodhpur',
    arpLat: 26.2514, arpLon: 73.0489, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VIGG', name: 'Air Force Station Gwalior',
    arpLat: 26.2933, arpLon: 78.2278, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VOBZ', name: 'Air Force Station Begumpet, Hyderabad',
    arpLat: 17.4531, arpLon: 78.4675, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
  { icaoCode: 'VAGN', name: 'INS Hansa Naval Air Station, Goa',
    arpLat: 15.4406, arpLon: 73.8458, type: 'MILITARY',
    exclusionRadiusInnerKm: 5, exclusionRadiusOuterKm: 10 },
]

// ── Core proximity check ──────────────────────────────────────────────────────

export function checkAirportProximity(
  lat:          number,
  lon:          number,
  altitudeFtAgl: number
): ProximityCheckResult {

  let nearest:  AerodromeProximityRecord | null = null
  let minDistKm = Infinity

  for (const aerodrome of INDIAN_AERODROMES_PROXIMITY) {
    const dist = haversineKm(lat, lon, aerodrome.arpLat, aerodrome.arpLon)
    if (dist < minDistKm) {
      minDistKm = dist
      nearest   = aerodrome
    }
  }

  if (!nearest) {
    return { clear: true, restriction: 'NONE', nearestAerodrome: null, message: null }
  }

  const nearestInfo = {
    icaoCode:   nearest.icaoCode,
    name:       nearest.name,
    distanceKm: Math.round(minDistKm * 10) / 10,
    type:       nearest.type,
  }

  // Inner zone — hard prohibition below 1000ft AGL
  if (minDistKm <= nearest.exclusionRadiusInnerKm) {
    if (altitudeFtAgl < 1000) {
      log.warn('airport_proximity_prohibited', {
        data: { lat, lon, altitudeFtAgl, nearestIcao: nearest.icaoCode, distanceKm: minDistKm }
      })
      return {
        clear:            false,
        restriction:      'PROHIBITED',
        nearestAerodrome: nearestInfo,
        message:
          `Operations within ${nearest.exclusionRadiusInnerKm}km of ${nearest.icaoCode} ` +
          `(${nearest.name}) below 1000ft AGL are PROHIBITED under UAS Rules 2021. ` +
          `Distance: ${nearestInfo.distanceKm}km. No override path exists.`,
      }
    }
    // Above 1000ft inside inner zone — coordination required
    return {
      clear:            false,
      restriction:      'COORDINATION_REQUIRED',
      nearestAerodrome: nearestInfo,
      message:
        `Within ${nearest.exclusionRadiusInnerKm}km of ${nearest.icaoCode} (${nearest.name}). ` +
        `ATC coordination required for operations above 1000ft AGL. ` +
        `Distance: ${nearestInfo.distanceKm}km.`,
    }
  }

  // Outer zone — coordination required regardless of altitude
  if (minDistKm <= nearest.exclusionRadiusOuterKm) {
    return {
      clear:            false,
      restriction:      'COORDINATION_REQUIRED',
      nearestAerodrome: nearestInfo,
      message:
        `Within ${nearest.exclusionRadiusOuterKm}km of ${nearest.icaoCode} (${nearest.name}). ` +
        `ATC coordination required. Distance: ${nearestInfo.distanceKm}km.`,
    }
  }

  return {
    clear:            true,
    restriction:      'NONE',
    nearestAerodrome: nearestInfo,
    message:          null,
  }
}

// ── Haversine distance ────────────────────────────────────────────────────────

export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R    = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const toRad = (deg: number) => (deg * Math.PI) / 180

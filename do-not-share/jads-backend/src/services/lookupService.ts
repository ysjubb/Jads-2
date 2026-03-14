/**
 * lookupService.ts
 *
 * Backend lookup service for aerodromes, aircraft types, coordinates, and flight levels.
 * Single source of truth — all clients (web, Android, iOS) call these via API.
 */

import { INDIA_AIP_AERODROMES, type AerodromeTransitionData } from './indiaAIP'

// ── Aerodrome Search ────────────────────────────────────────────────────────

export interface AerodromeLookupResult {
  icao: string
  name: string
  lat: number
  lon: number
}

export function searchAerodromes(query: string): AerodromeLookupResult[] {
  if (!query || query.trim().length === 0) return []

  const q = query.trim().toUpperCase()
  const qLower = query.trim().toLowerCase()
  const results: AerodromeLookupResult[] = []
  const seen = new Set<string>()
  const entries = Object.values(INDIA_AIP_AERODROMES)

  // 1. Exact ICAO match
  const exact = INDIA_AIP_AERODROMES[q]
  if (exact) {
    results.push(toAerodromeLookup(exact))
    seen.add(exact.icao)
  }

  // 2. ICAO prefix match
  if (results.length < 10) {
    for (const a of entries) {
      if (seen.has(a.icao)) continue
      if (a.icao.startsWith(q)) {
        results.push(toAerodromeLookup(a))
        seen.add(a.icao)
        if (results.length >= 10) break
      }
    }
  }

  // 3. Name substring match
  if (results.length < 10) {
    for (const a of entries) {
      if (seen.has(a.icao)) continue
      if (a.name.toLowerCase().includes(qLower)) {
        results.push(toAerodromeLookup(a))
        seen.add(a.icao)
        if (results.length >= 10) break
      }
    }
  }

  return results
}

function toAerodromeLookup(a: AerodromeTransitionData): AerodromeLookupResult {
  return { icao: a.icao, name: a.name, lat: a.latDeg, lon: a.lonDeg }
}

export function validateAerodrome(icao: string): { valid: boolean; aerodrome?: AerodromeLookupResult } {
  const a = INDIA_AIP_AERODROMES[icao.toUpperCase()]
  if (a) return { valid: true, aerodrome: toAerodromeLookup(a) }
  if (icao.toUpperCase() === 'ZZZZ') return { valid: true }
  return { valid: false }
}

// ── Aircraft Type Search ────────────────────────────────────────────────────

export interface AircraftTypeEntry {
  icao: string
  name: string
  category: string
  wake: 'L' | 'M' | 'H' | 'J'
}

const AIRCRAFT_TYPES: AircraftTypeEntry[] = [
  // Commercial
  { icao: 'B738', name: 'Boeing 737-800',            category: 'COMMERCIAL', wake: 'M' },
  { icao: 'B737', name: 'Boeing 737-700',            category: 'COMMERCIAL', wake: 'M' },
  { icao: 'B77W', name: 'Boeing 777-300ER',          category: 'COMMERCIAL', wake: 'H' },
  { icao: 'B789', name: 'Boeing 787-9',              category: 'COMMERCIAL', wake: 'H' },
  { icao: 'B788', name: 'Boeing 787-8',              category: 'COMMERCIAL', wake: 'H' },
  { icao: 'A20N', name: 'Airbus A320neo',            category: 'COMMERCIAL', wake: 'M' },
  { icao: 'A21N', name: 'Airbus A321neo',            category: 'COMMERCIAL', wake: 'M' },
  { icao: 'A319', name: 'Airbus A319',               category: 'COMMERCIAL', wake: 'M' },
  { icao: 'A320', name: 'Airbus A320',               category: 'COMMERCIAL', wake: 'M' },
  { icao: 'A321', name: 'Airbus A321',               category: 'COMMERCIAL', wake: 'M' },
  { icao: 'A333', name: 'Airbus A330-300',           category: 'COMMERCIAL', wake: 'H' },
  { icao: 'A359', name: 'Airbus A350-900',           category: 'COMMERCIAL', wake: 'H' },
  { icao: 'AT76', name: 'ATR 72-600',                category: 'COMMERCIAL', wake: 'M' },
  { icao: 'AT75', name: 'ATR 72-500',                category: 'COMMERCIAL', wake: 'M' },
  { icao: 'DH8D', name: 'Dash 8 Q400',              category: 'COMMERCIAL', wake: 'M' },
  { icao: 'CRJ7', name: 'CRJ-700',                  category: 'COMMERCIAL', wake: 'M' },
  { icao: 'E190', name: 'Embraer 190',               category: 'COMMERCIAL', wake: 'M' },
  // GA
  { icao: 'C172', name: 'Cessna 172',                category: 'GA', wake: 'L' },
  { icao: 'C182', name: 'Cessna 182',                category: 'GA', wake: 'L' },
  { icao: 'C206', name: 'Cessna 206',                category: 'GA', wake: 'L' },
  { icao: 'C208', name: 'Cessna 208 Caravan',        category: 'GA', wake: 'L' },
  { icao: 'C510', name: 'Cessna Citation Mustang',   category: 'GA', wake: 'L' },
  { icao: 'C525', name: 'Cessna CitationJet',        category: 'GA', wake: 'L' },
  { icao: 'C560', name: 'Cessna Citation V',         category: 'GA', wake: 'M' },
  { icao: 'C680', name: 'Cessna Citation Sovereign', category: 'GA', wake: 'M' },
  { icao: 'BE20', name: 'King Air 200',              category: 'GA', wake: 'M' },
  { icao: 'BE9L', name: 'King Air 90',               category: 'GA', wake: 'L' },
  { icao: 'B350', name: 'King Air 350',              category: 'GA', wake: 'M' },
  { icao: 'PC12', name: 'Pilatus PC-12',             category: 'GA', wake: 'L' },
  { icao: 'P28A', name: 'Piper PA-28',               category: 'GA', wake: 'L' },
  { icao: 'DA40', name: 'Diamond DA40',              category: 'GA', wake: 'L' },
  { icao: 'DA42', name: 'Diamond DA42',              category: 'GA', wake: 'L' },
  { icao: 'SR22', name: 'Cirrus SR22',               category: 'GA', wake: 'L' },
  { icao: 'GLF6', name: 'Gulfstream G650',           category: 'GA', wake: 'H' },
  { icao: 'GLEX', name: 'Bombardier Global Express', category: 'GA', wake: 'H' },
  { icao: 'CL35', name: 'Challenger 350',            category: 'GA', wake: 'M' },
  { icao: 'H25B', name: 'Hawker 800',                category: 'GA', wake: 'M' },
  { icao: 'LJ45', name: 'Learjet 45',                category: 'GA', wake: 'M' },
  { icao: 'FA7X', name: 'Falcon 7X',                 category: 'GA', wake: 'H' },
  { icao: 'P180', name: 'Piaggio P.180',             category: 'GA', wake: 'L' },
  { icao: 'TBM9', name: 'TBM 900',                   category: 'GA', wake: 'L' },
  // Helicopters
  { icao: 'EC35', name: 'Airbus EC135',              category: 'HELICOPTER', wake: 'L' },
  { icao: 'EC45', name: 'Airbus EC145',              category: 'HELICOPTER', wake: 'M' },
  { icao: 'EC55', name: 'Airbus EC155',              category: 'HELICOPTER', wake: 'M' },
  { icao: 'AS50', name: 'AS350 Ecureuil',            category: 'HELICOPTER', wake: 'L' },
  { icao: 'AS65', name: 'AS365 Dauphin',             category: 'HELICOPTER', wake: 'M' },
  { icao: 'S76',  name: 'Sikorsky S-76',             category: 'HELICOPTER', wake: 'M' },
  { icao: 'S92',  name: 'Sikorsky S-92',             category: 'HELICOPTER', wake: 'M' },
  { icao: 'B412', name: 'Bell 412',                  category: 'HELICOPTER', wake: 'M' },
  { icao: 'B206', name: 'Bell 206',                  category: 'HELICOPTER', wake: 'L' },
  { icao: 'B407', name: 'Bell 407',                  category: 'HELICOPTER', wake: 'L' },
  { icao: 'B429', name: 'Bell 429',                  category: 'HELICOPTER', wake: 'M' },
  { icao: 'A139', name: 'AW139',                     category: 'HELICOPTER', wake: 'M' },
  { icao: 'A169', name: 'AW169',                     category: 'HELICOPTER', wake: 'M' },
  { icao: 'MI17', name: 'Mi-17',                     category: 'HELICOPTER', wake: 'M' },
  { icao: 'MI8',  name: 'Mi-8',                      category: 'HELICOPTER', wake: 'M' },
  { icao: 'K226', name: 'Kamov Ka-226',              category: 'HELICOPTER', wake: 'L' },
  { icao: 'R22',  name: 'Robinson R22',              category: 'HELICOPTER', wake: 'L' },
  { icao: 'R44',  name: 'Robinson R44',              category: 'HELICOPTER', wake: 'L' },
  { icao: 'R66',  name: 'Robinson R66',              category: 'HELICOPTER', wake: 'L' },
  { icao: 'ALH',  name: 'HAL Dhruv',                 category: 'HELICOPTER', wake: 'L' },
  { icao: 'APCH', name: 'Apache AH-64',              category: 'HELICOPTER', wake: 'M' },
  { icao: 'CH47', name: 'Chinook CH-47F',            category: 'HELICOPTER', wake: 'H' },
  { icao: 'LUH',  name: 'HAL Light Utility Helicopter', category: 'HELICOPTER', wake: 'L' },
  // Military Fighters
  { icao: 'SU30', name: 'Sukhoi Su-30MKI',           category: 'MILITARY_FIGHTER', wake: 'H' },
  { icao: 'M29K', name: 'MiG-29K',                   category: 'MILITARY_FIGHTER', wake: 'M' },
  { icao: 'MG21', name: 'MiG-21 Bison',              category: 'MILITARY_FIGHTER', wake: 'M' },
  { icao: 'M2KD', name: 'Mirage 2000',               category: 'MILITARY_FIGHTER', wake: 'M' },
  { icao: 'RFAL', name: 'Dassault Rafale',           category: 'MILITARY_FIGHTER', wake: 'M' },
  { icao: 'TEJA', name: 'Tejas LCA Mk1',             category: 'MILITARY_FIGHTER', wake: 'L' },
  { icao: 'JG17', name: 'SEPECAT Jaguar',            category: 'MILITARY_FIGHTER', wake: 'M' },
  // Military Transport
  { icao: 'C130', name: 'C-130J Super Hercules',     category: 'MILITARY_TRANSPORT', wake: 'H' },
  { icao: 'C17',  name: 'C-17 Globemaster III',      category: 'MILITARY_TRANSPORT', wake: 'H' },
  { icao: 'IL76', name: 'Ilyushin Il-76',            category: 'MILITARY_TRANSPORT', wake: 'H' },
  { icao: 'AN32', name: 'Antonov An-32',             category: 'MILITARY_TRANSPORT', wake: 'M' },
  { icao: 'DO28', name: 'Dornier 228',               category: 'MILITARY_TRANSPORT', wake: 'L' },
  { icao: 'P8I',  name: 'Boeing P-8I Neptune',       category: 'MILITARY_TRANSPORT', wake: 'H' },
  { icao: 'AVRO', name: 'HS 748 Avro',               category: 'MILITARY_TRANSPORT', wake: 'M' },
  // Military Trainers
  { icao: 'PC7',  name: 'Pilatus PC-7 Mk.II',        category: 'MILITARY_TRAINER', wake: 'L' },
  { icao: 'HK36', name: 'HAL HJT-16 Kiran',          category: 'MILITARY_TRAINER', wake: 'L' },
  { icao: 'HW36', name: 'BAE Hawk Mk.132',           category: 'MILITARY_TRAINER', wake: 'M' },
  { icao: 'HTT40', name: 'HAL HTT-40',               category: 'MILITARY_TRAINER', wake: 'L' },
  // Drones
  { icao: 'MAVIC3', name: 'DJI Mavic 3',             category: 'DRONE', wake: 'L' },
  { icao: 'M300',   name: 'DJI Matrice 300 RTK',     category: 'DRONE', wake: 'L' },
  { icao: 'P4RTK',  name: 'DJI Phantom 4 RTK',      category: 'DRONE', wake: 'L' },
  { icao: 'T30',    name: 'DJI Agras T30',           category: 'DRONE', wake: 'L' },
  { icao: 'HERON',  name: 'IAI Heron',               category: 'DRONE', wake: 'L' },
  { icao: 'SRCH',   name: 'Searcher Mk.II',          category: 'DRONE', wake: 'L' },
  { icao: 'HRM9',   name: 'Hermes 900',              category: 'DRONE', wake: 'L' },
  { icao: 'TPAS',   name: 'Tapas/Rustom-II',         category: 'DRONE', wake: 'L' },
  // Special
  { icao: 'ZZZZ', name: 'Custom (enter type designator)', category: 'GA', wake: 'L' },
]

const AIRCRAFT_TYPE_MAP = new Map(AIRCRAFT_TYPES.map(a => [a.icao, a]))

export function searchAircraftTypes(query: string): AircraftTypeEntry[] {
  if (!query || query.trim().length === 0) return []

  const q = query.trim().toUpperCase()
  const qLower = query.trim().toLowerCase()
  const results: AircraftTypeEntry[] = []
  const seen = new Set<string>()

  const exact = AIRCRAFT_TYPE_MAP.get(q)
  if (exact) { results.push(exact); seen.add(exact.icao) }

  if (results.length < 15) {
    for (const a of AIRCRAFT_TYPES) {
      if (seen.has(a.icao)) continue
      if (a.icao.startsWith(q)) { results.push(a); seen.add(a.icao); if (results.length >= 15) break }
    }
  }

  if (results.length < 15) {
    for (const a of AIRCRAFT_TYPES) {
      if (seen.has(a.icao)) continue
      if (a.name.toLowerCase().includes(qLower)) { results.push(a); seen.add(a.icao); if (results.length >= 15) break }
    }
  }

  return results
}

// ── Coordinate Validation ───────────────────────────────────────────────────

const INDIA_BOUNDS = { latMin: 6.0, latMax: 37.5, lonMin: 65.0, lonMax: 98.0 }

export interface CoordinateValidationResult {
  valid: boolean
  compact?: string       // DDMM N/DDDMME format for Item 18
  displayDMS?: string    // Human-readable DMS
  error?: string
}

export function validateCoordinates(
  latDeg: number, latMin: number, latSec: number, latHemi: string,
  lonDeg: number, lonMin: number, lonSec: number, lonHemi: string,
): CoordinateValidationResult {
  if (latDeg < 0 || latDeg > 90 || latMin < 0 || latMin > 59 || latSec < 0 || latSec > 59) {
    return { valid: false, error: 'Invalid latitude values' }
  }
  if (lonDeg < 0 || lonDeg > 180 || lonMin < 0 || lonMin > 59 || lonSec < 0 || lonSec > 59) {
    return { valid: false, error: 'Invalid longitude values' }
  }

  let lat = latDeg + latMin / 60 + latSec / 3600
  let lon = lonDeg + lonMin / 60 + lonSec / 3600
  if (latHemi === 'S') lat = -lat
  if (lonHemi === 'W') lon = -lon

  if (lat < INDIA_BOUNDS.latMin || lat > INDIA_BOUNDS.latMax ||
      lon < INDIA_BOUNDS.lonMin || lon > INDIA_BOUNDS.lonMax) {
    return { valid: false, error: `Coordinates outside Indian airspace (${INDIA_BOUNDS.latMin}-${INDIA_BOUNDS.latMax}N, ${INDIA_BOUNDS.lonMin}-${INDIA_BOUNDS.lonMax}E)` }
  }

  const compact = `${String(latDeg).padStart(2, '0')}${String(latMin).padStart(2, '0')}${latHemi}/${String(lonDeg).padStart(3, '0')}${String(lonMin).padStart(2, '0')}${lonHemi}`
  const displayDMS = `${String(latDeg).padStart(2, '0')}°${String(latMin).padStart(2, '0')}'${String(latSec).padStart(2, '0')}"${latHemi} ${String(lonDeg).padStart(3, '0')}°${String(lonMin).padStart(2, '0')}'${String(lonSec).padStart(2, '0')}"${lonHemi}`

  return { valid: true, compact, displayDMS }
}

// ── Flight Level Advisory ───────────────────────────────────────────────────

export interface FlightLevelCheckResult {
  isValid: boolean
  levelDisplay: string
  altitudeFt: number | null
  semicircular: {
    applicable: boolean
    direction: 'EASTBOUND' | 'WESTBOUND' | null
    magneticTrackDeg: number | null
    isCompliant: boolean | null
    recommendedLevel: string | null
    rule: string
  }
  rvsm: {
    inRange: boolean
    equipmentOk: boolean
    message: string
  } | null
  transitionInfo: string | null
}

export function checkFlightLevel(
  cruisingLevel: string,
  flightRules: string,
  adep: string,
  ades: string,
  equipment: string,
): FlightLevelCheckResult {
  const parsed = parseLevel(cruisingLevel)
  if (!parsed) {
    return {
      isValid: false,
      levelDisplay: cruisingLevel || '—',
      altitudeFt: null,
      semicircular: { applicable: false, direction: null, magneticTrackDeg: null, isCompliant: null, recommendedLevel: null, rule: 'Cannot parse cruising level. Use format: F350, A030, or VFR.' },
      rvsm: null,
      transitionInfo: null,
    }
  }

  const { display, altFt } = parsed
  const isIFR = flightRules.toUpperCase().startsWith('I')
  const depAd = INDIA_AIP_AERODROMES[adep.toUpperCase()]
  const desAd = INDIA_AIP_AERODROMES[ades.toUpperCase()]

  // Semicircular
  let semicircular: FlightLevelCheckResult['semicircular']
  if (!isIFR || altFt === null) {
    semicircular = { applicable: false, direction: null, magneticTrackDeg: null, isCompliant: null, recommendedLevel: null, rule: isIFR ? 'Cruising level not parsed.' : 'Semicircular rule applies to IFR only.' }
  } else if (!depAd || !desAd) {
    semicircular = { applicable: true, direction: null, magneticTrackDeg: null, isCompliant: null, recommendedLevel: null, rule: 'Cannot determine track — ADEP or ADES not in database.' }
  } else {
    const track = computeMagneticTrack(depAd.latDeg, depAd.lonDeg, desAd.latDeg, desAd.lonDeg)
    const direction: 'EASTBOUND' | 'WESTBOUND' = track < 180 ? 'EASTBOUND' : 'WESTBOUND'

    if (altFt > 41000) {
      semicircular = { applicable: true, direction, magneticTrackDeg: Math.round(track), isCompliant: null, recommendedLevel: null, rule: `Above FL410 — special separation. Track: ${Math.round(track)}° (${direction.toLowerCase()}).` }
    } else {
      const needOdd = direction === 'EASTBOUND'
      const flLevel = altFt / 100
      const isOdd = flLevel % 20 >= 10  // FL310=odd, FL320=even, FL330=odd...
      const isCompliant = needOdd === isOdd
      let recommendedLevel: string | null = null
      if (!isCompliant) {
        const nearest = needOdd
          ? (flLevel % 20 < 10 ? flLevel + (10 - flLevel % 20) : flLevel - (flLevel % 20 - 10))
          : (flLevel % 20 >= 10 ? flLevel + (20 - flLevel % 20) : flLevel)
        recommendedLevel = `FL${String(Math.round(nearest)).padStart(3, '0')}`
      }
      const ruleDesc = direction === 'EASTBOUND'
        ? 'Eastbound (000°-179°): odd FLs (FL310, FL350, ...)'
        : 'Westbound (180°-359°): even FLs (FL320, FL360, ...)'
      semicircular = { applicable: true, direction, magneticTrackDeg: Math.round(track), isCompliant, recommendedLevel, rule: ruleDesc }
    }
  }

  // RVSM
  let rvsm: FlightLevelCheckResult['rvsm'] = null
  if (altFt !== null && altFt >= 29000 && altFt <= 41000) {
    const hasW = equipment.toUpperCase().includes('W')
    rvsm = { inRange: true, equipmentOk: hasW, message: hasW ? 'RVSM airspace — equipment W present.' : 'RVSM airspace (FL290-FL410): equipment "W" required.' }
  }

  // Transition
  let transitionInfo: string | null = null
  const td = INDIA_AIP_AERODROMES[adep.toUpperCase()]
  if (td) {
    transitionInfo = `${td.icao} transition altitude: ${td.transitionAltitude.toLocaleString()} ft / ${td.transitionLevel}`
  }

  return { isValid: true, levelDisplay: display, altitudeFt: altFt, semicircular, rvsm, transitionInfo }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseLevel(level: string): { display: string; altFt: number | null } | null {
  const s = level.trim().toUpperCase()
  if (!s) return null
  if (s === 'VFR') return { display: 'VFR', altFt: null }

  const flMatch = s.match(/^F[L]?(\d{2,3})$/)
  if (flMatch) {
    const fl = parseInt(flMatch[1])
    return { display: `FL${String(fl).padStart(3, '0')}`, altFt: fl * 100 }
  }

  const altMatch = s.match(/^A(\d{2,3})$/)
  if (altMatch) {
    const alt = parseInt(altMatch[1])
    return { display: `A${String(alt).padStart(3, '0')}`, altFt: alt * 100 }
  }

  const sMatch = s.match(/^S(\d{3,4})$/)
  if (sMatch) {
    const metres = parseInt(sMatch[1])
    return { display: `S${sMatch[1]}`, altFt: Math.round(metres * 3.28084) }
  }

  return null
}

function computeMagneticTrack(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
  let brng = toDeg(Math.atan2(y, x))
  return ((brng % 360) + 360) % 360
}

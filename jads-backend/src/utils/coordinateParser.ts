/**
 * coordinateParser.ts
 *
 * Parses all coordinate formats used in Indian aviation:
 *   - ICAO/IATA codes (lookup from aerodrome DB)
 *   - DMS:     28°34'15"N  077°12'07"E
 *   - DM:      28°34.25'N  077°12.12'E  (GPS unit output)
 *   - Compact: 283415N 0771207E  (military chart standard)
 *   - Decimal: 28.571389, 77.201944
 *
 * All formats validated against Indian airspace bounding box.
 * Used by: aerodrome input fields, route planning, address bar.
 *
 * For helicopter ops at helipads without ICAO codes,
 * DMS/compact format is the operational standard.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedCoordinate {
  lat:         number   // decimal degrees, signed (negative = South)
  lon:         number   // decimal degrees, signed (negative = West)
  inputFormat: 'DMS' | 'DM' | 'COMPACT' | 'DECIMAL'
  displayDMS:  string   // canonical display: 28°34'15"N 077°12'07"E
}

export interface CoordinateParseResult {
  success: true
  coord:   ParsedCoordinate
} | {
  success: false
  error:   string
}

// India + offshore + immediate neighbours bounding box
// Generous enough for: Andaman/Nicobar, Lakshadweep, border operations
const INDIA_BOUNDS = {
  latMin:  6.0,
  latMax: 37.5,
  lonMin: 65.0,
  lonMax: 98.0,
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseCoordinateInput(input: string): CoordinateParseResult {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, ' ')

  return (
    tryDecimalDegrees(cleaned) ??
    tryDMSFormat(cleaned)      ??
    tryDMFormat(cleaned)       ??
    tryCompactDMS(cleaned)     ??
    {
      success: false,
      error: `Cannot parse "${input}". ` +
             `Accepted formats: ICAO (VIDP), DMS (28°34'15"N 077°12'07"E), ` +
             `GPS (28°34.25'N 077°12.12'E), Compact (283415N 0771207E), ` +
             `Decimal (28.5713, 77.2019)`,
    }
  )
}

// ── Format parsers ────────────────────────────────────────────────────────────

// Format: 28.571389, 77.201944  |  28.5713N 77.2019E  |  28.5713 77.2019
function tryDecimalDegrees(s: string): CoordinateParseResult | null {
  // With explicit hemisphere letters
  const reHemi = /^(\d{1,2}\.\d+)\s*([NS])\s+(\d{1,3}\.\d+)\s*([EW])$/
  let m = s.match(reHemi)
  if (m) {
    let lat = parseFloat(m[1])
    let lon = parseFloat(m[3])
    if (m[2] === 'S') lat = -lat
    if (m[4] === 'W') lon = -lon
    return buildResult(lat, lon, 'DECIMAL')
  }

  // Comma or space separated, no hemisphere
  const rePlain = /^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/
  m = s.match(rePlain)
  if (m) {
    return buildResult(parseFloat(m[1]), parseFloat(m[2]), 'DECIMAL')
  }

  return null
}

// Format: 28°34'15"N 077°12'07"E  (various separator styles)
function tryDMSFormat(s: string): CoordinateParseResult | null {
  // Degree symbol: °, space, or dash. Minute/second: ', ", space
  const re = /^(\d{1,2})[°\s\-](\d{1,2})['\s\-](\d{1,2}(?:\.\d+)?)["\s]?\s*([NS])\s+(\d{1,3})[°\s\-](\d{1,2})['\s\-](\d{1,2}(?:\.\d+)?)["\s]?\s*([EW])$/
  const m  = s.match(re)
  if (!m) return null

  const lat = dmsToDecimal(parseInt(m[1]), parseInt(m[2]), parseFloat(m[3]), m[4])
  const lon = dmsToDecimal(parseInt(m[5]), parseInt(m[6]), parseFloat(m[7]), m[8])
  return buildResult(lat, lon, 'DMS')
}

// Format: 28°34.25'N 077°12.12'E  (GPS unit output — degrees + decimal minutes)
function tryDMFormat(s: string): CoordinateParseResult | null {
  const re = /^(\d{1,2})[°\s](\d{1,2}\.\d+)['\s]?\s*([NS])\s+(\d{1,3})[°\s](\d{1,2}\.\d+)['\s]?\s*([EW])$/
  const m  = s.match(re)
  if (!m) return null

  const lat = dmToDecimal(parseInt(m[1]), parseFloat(m[2]), m[3])
  const lon = dmToDecimal(parseInt(m[4]), parseFloat(m[5]), m[6])
  return buildResult(lat, lon, 'DM')
}

// Format: 283415N 0771207E  (military chart compact, ICAO significant point)
function tryCompactDMS(s: string): CoordinateParseResult | null {
  // 6-digit lat + hemisphere + 7-digit lon + hemisphere
  const re = /^(\d{6})([NS])\s*(\d{7})([EW])$/
  const m  = s.match(re)
  if (!m) return null

  const latStr = m[1]   // e.g. "283415" → 28°34'15"
  const lonStr = m[3]   // e.g. "0771207" → 077°12'07"

  const lat = dmsToDecimal(
    parseInt(latStr.slice(0, 2)),
    parseInt(latStr.slice(2, 4)),
    parseInt(latStr.slice(4, 6)),
    m[2]
  )
  const lon = dmsToDecimal(
    parseInt(lonStr.slice(0, 3)),
    parseInt(lonStr.slice(3, 5)),
    parseInt(lonStr.slice(5, 7)),
    m[4]
  )
  return buildResult(lat, lon, 'COMPACT')
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function dmsToDecimal(deg: number, min: number, sec: number, hemi: string): number {
  const decimal = deg + min / 60 + sec / 3600
  return (hemi === 'S' || hemi === 'W') ? -decimal : decimal
}

function dmToDecimal(deg: number, minDecimal: number, hemi: string): number {
  const decimal = deg + minDecimal / 60
  return (hemi === 'S' || hemi === 'W') ? -decimal : decimal
}

// ── Validation and result builder ─────────────────────────────────────────────

function buildResult(
  lat: number,
  lon: number,
  format: ParsedCoordinate['inputFormat']
): CoordinateParseResult {
  if (
    lat < INDIA_BOUNDS.latMin || lat > INDIA_BOUNDS.latMax ||
    lon < INDIA_BOUNDS.lonMin || lon > INDIA_BOUNDS.lonMax
  ) {
    return {
      success: false,
      error:
        `Coordinates ${lat.toFixed(4)}°, ${lon.toFixed(4)}° are outside Indian airspace. ` +
        `Valid range: ${INDIA_BOUNDS.latMin}°N–${INDIA_BOUNDS.latMax}°N, ` +
        `${INDIA_BOUNDS.lonMin}°E–${INDIA_BOUNDS.lonMax}°E.`,
    }
  }

  return {
    success: true,
    coord: {
      lat,
      lon,
      inputFormat: format,
      displayDMS:  toDisplayDMS(lat, lon),
    },
  }
}

// ── Display formatting ────────────────────────────────────────────────────────

export function toDisplayDMS(lat: number, lon: number): string {
  return (
    `${decimalToDMSString(Math.abs(lat), lat >= 0 ? 'N' : 'S', false)} ` +
    `${decimalToDMSString(Math.abs(lon), lon >= 0 ? 'E' : 'W', true)}`
  )
}

export function decimalToDMSString(
  decimal:  number,
  hemi:     string,
  isLon:    boolean
): string {
  const deg = Math.floor(decimal)
  const minDecimal = (decimal - deg) * 60
  const min = Math.floor(minDecimal)
  const sec = Math.round((minDecimal - min) * 60)

  const degStr = isLon
    ? String(deg).padStart(3, '0')  // longitude: 3 digits
    : String(deg).padStart(2, '0')  // latitude: 2 digits

  return `${degStr}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}"${hemi}`
}

// Compact format for AFTN significant points: DDMMN/DDDMME
export function toAftnSignificantPoint(lat: number, lon: number): string {
  const latDeg = Math.floor(Math.abs(lat))
  const latMin = Math.round((Math.abs(lat) - latDeg) * 60)
  const lonDeg = Math.floor(Math.abs(lon))
  const lonMin = Math.round((Math.abs(lon) - lonDeg) * 60)
  const ns     = lat >= 0 ? 'N' : 'S'
  const ew     = lon >= 0 ? 'E' : 'W'

  return (
    `${String(latDeg).padStart(2, '0')}${String(latMin).padStart(2, '0')}${ns}/` +
    `${String(lonDeg).padStart(3, '0')}${String(lonMin).padStart(2, '0')}${ew}`
  )
  // e.g. "2834N/07712E"
}

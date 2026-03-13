// Static lookup of Indian waypoints and major airport coordinates.
// Used by DeconflictionEngine for route-to-GeoJSON conversion.
// Coordinates: [longitude, latitude] (GeoJSON convention).

export interface WaypointCoord {
  lat: number
  lon: number
}

export const INDIAN_WAYPOINTS: Record<string, WaypointCoord> = {
  // ── Major Waypoints ────────────────────────────────
  IGONI:  { lat: 30.7500, lon: 76.8333 },
  SIPTU:  { lat: 33.5000, lon: 75.5000 },
  DUBAD:  { lat: 15.3833, lon: 75.0167 },
  DOGAR:  { lat: 17.5000, lon: 75.6667 },
  MOLGU:  { lat: 16.5000, lon: 74.0000 },
  VAGAD:  { lat: 18.0000, lon: 73.5000 },
  GUDUM:  { lat: 27.5000, lon: 77.0000 },
  ADKAL:  { lat: 20.0000, lon: 77.5000 },
  TIGER:  { lat: 14.0000, lon: 79.5000 },
  POLAM:  { lat: 14.5000, lon: 74.5000 },
  IGANI:  { lat: 11.0000, lon: 76.0000 },
  ANMOD:  { lat: 14.8333, lon: 74.4333 },
  OSGAN:  { lat: 15.5000, lon: 78.0000 },
  PALNA:  { lat: 25.5000, lon: 75.8333 },
  UKASO:  { lat: 21.0000, lon: 73.0000 },
  LUMAN:  { lat: 23.0000, lon: 72.5000 },
  GOPAS:  { lat: 19.5000, lon: 74.0000 },
  BITOD:  { lat: 22.5000, lon: 78.0000 },
  NIKOT:  { lat: 26.5000, lon: 80.5000 },
  TONAK:  { lat: 28.5000, lon: 77.5000 },

  // ── Major Airport Coordinates ──────────────────────
  VIDP:   { lat: 28.5665, lon: 77.1031 },   // Delhi IGI
  VOBL:   { lat: 13.1986, lon: 77.7066 },   // Bangalore Kempegowda
  VABB:   { lat: 19.0896, lon: 72.8656 },   // Mumbai CSIA
  VOCL:   { lat: 11.0368, lon: 76.0699 },   // Calicut
  VOCI:   { lat: 9.9471,  lon: 76.2673 },   // Cochin
  VOMM:   { lat: 12.9900, lon: 80.1693 },   // Chennai
  VOHS:   { lat: 17.2403, lon: 78.4294 },   // Hyderabad RGIA
  VECC:   { lat: 22.6547, lon: 88.4467 },   // Kolkata NSCBI
  VISR:   { lat: 33.9871, lon: 74.7742 },   // Srinagar
  VIAR:   { lat: 31.7096, lon: 74.7973 },   // Amritsar
  VAPO:   { lat: 18.5821, lon: 73.9197 },   // Pune
  VAJJ:   { lat: 23.1138, lon: 70.0122 },   // Jamnagar
  VAGO:   { lat: 15.3808, lon: 73.8314 },   // Goa Dabolim
  VIJP:   { lat: 26.8242, lon: 75.8122 },   // Jaipur
  VILK:   { lat: 26.7606, lon: 80.8893 },   // Lucknow
  VAAH:   { lat: 23.0772, lon: 72.6347 },   // Ahmedabad
}

/** Resolve a route point (waypoint or ICAO code) to coordinates. */
export function resolveWaypoint(point: string): WaypointCoord | null {
  return INDIAN_WAYPOINTS[point.toUpperCase()] ?? null
}

/** Convert a route string (e.g. "IGONI UA461 SIPTU") into coordinate pairs.
 *  Skips airway designators (e.g. UA461, UW63, UL310). */
export function routeToCoords(routeString: string): WaypointCoord[] {
  const tokens = routeString.trim().split(/\s+/)
  const coords: WaypointCoord[] = []
  for (const token of tokens) {
    // Skip airway designators (start with U, A, B, G, R, W followed by digits)
    if (/^[UABGRW]\w*\d+/.test(token)) continue
    const wp = resolveWaypoint(token)
    if (wp) coords.push(wp)
  }
  return coords
}

// Static lookup of Indian waypoints and major airport coordinates.
// Used by DeconflictionEngine for route-to-GeoJSON conversion.
// Coordinates: [longitude, latitude] (GeoJSON convention).

export interface WaypointCoord {
  lat: number
  lon: number
}

export const INDIAN_WAYPOINTS: Record<string, WaypointCoord> = {
  // ── Fix/Reporting Points ─────────────────────────────
  IGONI:  { lat: 30.7500, lon: 76.8333 },
  SIPTU:  { lat: 33.5000, lon: 75.5000 },
  DUBAD:  { lat: 15.3800, lon: 75.0200 },
  DOGAR:  { lat: 17.5000, lon: 75.6667 },
  MOLGU:  { lat: 16.5000, lon: 74.0000 },
  VAGAD:  { lat: 18.0000, lon: 73.5000 },
  GUDUM:  { lat: 25.4500, lon: 76.3500 },
  ADKAL:  { lat: 15.5000, lon: 77.5000 },
  TIGER:  { lat: 14.0000, lon: 79.5000 },
  POLAM:  { lat: 14.5000, lon: 74.5000 },
  IGANI:  { lat: 11.0000, lon: 76.0000 },
  ANMOD:  { lat: 14.8333, lon: 74.4333 },
  OSGAN:  { lat: 15.5000, lon: 78.0000 },
  PALNA:  { lat: 14.5000, lon: 79.5000 },
  UKASO:  { lat: 21.0000, lon: 73.0000 },
  LUMAN:  { lat: 23.0000, lon: 72.5000 },
  GOPAS:  { lat: 19.5000, lon: 74.0000 },
  BITOD:  { lat: 22.5000, lon: 78.0000 },
  NIKOT:  { lat: 26.5000, lon: 80.5000 },
  TONAK:  { lat: 12.8000, lon: 78.5000 },

  // ── Fixes — L301 (Delhi→Mumbai primary trunk) ────────
  GANDO:  { lat: 27.3861, lon: 77.7125 },
  PAKER:  { lat: 26.0000, lon: 77.0000 },
  BUBIM:  { lat: 23.5000, lon: 75.5000 },
  IGARI:  { lat: 22.0000, lon: 74.2000 },
  TATIM:  { lat: 21.0000, lon: 73.5000 },
  SULOM:  { lat: 19.8000, lon: 73.2000 },

  // ── Fixes — W1 (Delhi→Ahmedabad→Bangalore) ──────────
  BETRA:  { lat: 27.5000, lon: 76.0000 },
  PARAR:  { lat: 25.8000, lon: 74.2000 },
  GULAB:  { lat: 20.5000, lon: 76.5000 },
  LOTAV:  { lat: 17.8000, lon: 77.2000 },

  // ── Fixes — W15 (Delhi→Hyderabad→Chennai) ────────────
  AGNIK:  { lat: 26.8000, lon: 78.0000 },
  IBOVI:  { lat: 23.0000, lon: 78.5000 },
  MABTA:  { lat: 17.0800, lon: 73.2200 },
  OPAMO:  { lat: 14.3600, lon: 77.0500 },
  PESOT:  { lat: 14.8000, lon: 79.5000 },

  // ── Fixes — A791 (Mumbai→Chennai) ────────────────────
  PEDAM:  { lat: 18.0000, lon: 75.5000 },
  ANIRO:  { lat: 14.0361, lon: 78.6084 },
  TELEM:  { lat: 14.5000, lon: 78.0000 },

  // ── Fixes — G450 (Mumbai→Kolkata) ────────────────────
  BUBOS:  { lat: 20.5000, lon: 77.0000 },
  POLER:  { lat: 21.5000, lon: 83.0000 },

  // ── Fixes — W33 (Delhi→Mumbai alternate) ─────────────
  AGRAS:  { lat: 27.1800, lon: 77.9800 },

  // ── Fixes — W34 (Delhi→Goa) ──────────────────────────
  AKELA:  { lat: 27.4200, lon: 76.8000 },
  LALUT:  { lat: 25.5000, lon: 76.0000 },
  NIKAB:  { lat: 21.5000, lon: 74.5000 },

  // ── Fixes — W43 (Delhi→Ahmedabad→Mumbai) ─────────────
  AMVIG:  { lat: 22.8500, lon: 73.3800 },
  AKTIV:  { lat: 20.2500, lon: 73.2600 },

  // ── Fixes — A461 (Delhi→Kolkata upper) ───────────────
  BUBNU:  { lat: 26.8500, lon: 80.9500 },
  LUNKA:  { lat: 25.6000, lon: 84.0000 },

  // ── Fixes — G452 (Mumbai→Bangalore) ──────────────────
  GUBBI:  { lat: 17.3200, lon: 74.7800 },
  TUKLI:  { lat: 15.3800, lon: 76.9200 },

  // ── Fixes — M635 (Chennai→Hyderabad→Mumbai upper) ────
  XIVIL:  { lat: 13.1700, lon: 78.5500 },
  VINEP:  { lat: 14.1600, lon: 78.1400 },

  // ── Fixes — R460 (Kolkata→Mumbai upper) ──────────────
  RANKI:  { lat: 23.3100, lon: 85.3200 },
  NAGPR:  { lat: 21.0900, lon: 79.0500 },

  // ── Fixes — L507 / Q1 ───────────────────────────────
  IKAVA:  { lat: 21.7000, lon: 73.5000 },
  IDKOT:  { lat: 26.1000, lon: 75.8000 },

  // ── Fixes — B345 (Kolkata→Bangalore) ─────────────────
  RUDRA:  { lat: 19.0000, lon: 83.5000 },
  DOMIL:  { lat: 16.0000, lon: 80.0000 },
  APGUN:  { lat: 12.0600, lon: 77.5800 },

  // ── Fixes — L301 lower ──────────────────────────────
  TULSI:  { lat: 26.3000, lon: 77.6000 },

  // ── Major Airport Coordinates ──────────────────────────
  VIDP:   { lat: 28.5665, lon: 77.1031 },   // Delhi IGI
  VOBL:   { lat: 13.1986, lon: 77.7066 },   // Bangalore Kempegowda
  VABB:   { lat: 19.0896, lon: 72.8656 },   // Mumbai CSIA
  VOCL:   { lat: 11.1368, lon: 75.9553 },   // Calicut
  VOCI:   { lat: 9.9471,  lon: 76.2673 },   // Cochin
  VOMM:   { lat: 12.9900, lon: 80.1693 },   // Chennai
  VOHS:   { lat: 17.2403, lon: 78.4294 },   // Hyderabad RGIA
  VECC:   { lat: 22.6547, lon: 88.4467 },   // Kolkata NSCBI
  VISR:   { lat: 33.9871, lon: 74.7742 },   // Srinagar
  VIAR:   { lat: 31.7096, lon: 74.7973 },   // Amritsar
  VAPO:   { lat: 18.5822, lon: 73.9197 },   // Pune
  VAJJ:   { lat: 23.1138, lon: 70.0122 },   // Jamnagar
  VAGO:   { lat: 15.3808, lon: 73.8314 },   // Goa Dabolim
  VIJP:   { lat: 26.8242, lon: 75.8122 },   // Jaipur
  VILK:   { lat: 26.7606, lon: 80.8893 },   // Lucknow
  VAAH:   { lat: 23.0772, lon: 72.6347 },   // Ahmedabad

  // ── Secondary Aerodromes ─────────────────────────────
  VANP:   { lat: 21.0922, lon: 79.0472 },   // Nagpur
  VABP:   { lat: 23.2875, lon: 77.3374 },   // Bhopal
  VAID:   { lat: 22.7218, lon: 75.8011 },   // Indore
  VEAB:   { lat: 25.4401, lon: 81.7340 },   // Prayagraj
  VEPT:   { lat: 25.5913, lon: 85.0880 },   // Patna
  VIBN:   { lat: 25.4524, lon: 82.8593 },   // Varanasi
  VOCB:   { lat: 11.0300, lon: 77.0434 },   // Coimbatore
  VOML:   { lat: 12.9613, lon: 74.8901 },   // Mangalore
  VOTV:   { lat: 8.4821,  lon: 76.9200 },   // Trivandrum
  VOTR:   { lat: 10.7654, lon: 78.7097 },   // Trichy
  VEBP:   { lat: 23.3143, lon: 85.3217 },   // Ranchi
  VEGT:   { lat: 26.1061, lon: 91.5859 },   // Guwahati
  VICG:   { lat: 30.6735, lon: 76.7885 },   // Chandigarh
  VIDX:   { lat: 30.1897, lon: 78.1803 },   // Dehradun
  VISM:   { lat: 31.0818, lon: 77.0681 },   // Shimla
  VIUT:   { lat: 24.6177, lon: 73.8961 },   // Udaipur
  VEDI:   { lat: 27.4839, lon: 95.0169 },   // Dibrugarh
  VEGK:   { lat: 26.7397, lon: 83.4497 },   // Gorakhpur
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

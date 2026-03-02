// Adapter interface for METAR weather data providers.

export interface MetarData {
  icaoCode:       string
  rawText:        string
  observationUtc: string    // ISO 8601
  windDirDeg:     number | null
  windSpeedKt:    number | null
  windGustKt:     number | null
  visibilityM:    number | null
  tempC:          number | null
  dewPointC:      number | null
  altimeterHpa:   number | null
  isSpeci:        boolean
}

export interface IMetarAdapter {
  // Get the most recent METAR for an ICAO code. Returns null if unavailable.
  getLatestMetar(icaoCode: string): Promise<MetarData | null>

  // Get recent METARs (last N hours) for an ICAO code.
  getMetarHistory(icaoCode: string, hoursBack: number): Promise<MetarData[]>
}

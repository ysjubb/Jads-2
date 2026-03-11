// T01 — Live telemetry type definitions

export interface TelemetryPoint {
  missionId:      string
  uin:            string        // drone UIN
  lat:            number        // WGS84 decimal degrees
  lon:            number
  altAGL:         number        // altitude above ground level, metres
  altMSL:         number        // altitude MSL, metres
  speedKmh:       number
  headingDeg:     number        // 0-360
  batteryPct:     number        // 0-100
  satelliteCount: number
  source:         'DJI_MSDK' | 'MAVSDK' | 'SIMULATOR' | 'MANUAL'
  ts:             number        // Unix epoch milliseconds
}

export interface TelemetryBatch {
  points: TelemetryPoint[]      // up to 10 points per batch
}

export interface GeofenceStatus {
  inside:          boolean
  distanceToEdge:  number       // metres, negative = outside
  violationType:   'ALTITUDE' | 'BOUNDARY' | 'TIME' | null
}

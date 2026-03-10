// DJI Cloud API v2 adapter — enterprise drone telemetry and fleet management.
// @dataFlow TWO_WAY — pull device/telemetry data (inbound) + push flight areas & commands (outbound).
//
// Supported enterprise platforms:
//   DJI FlightHub 2, DJI Dock, DJI Pilot 2 (enterprise edition)
//
// Supported drones (Cloud API v2):
//   Matrice 30/30T, Matrice 350 RTK, Mavic 3 Enterprise/Thermal/Multispectral
//   DJI Dock (remote operations), DJI Dock 2
//
// Consumer drones (Mini 4 Pro, Air 3, Mavic 3 Pro, Avata 2) do NOT support
// Cloud API — use file-based CSV/TXT log import via track-log upload instead.
//
// Protocol: MQTT 3.1.1 over TLS (emqx broker or DJI FlightHub)
// Authentication: App key + app secret + workspace credentials.

// ── Device & Telemetry Types ──────────────────────────────────────────────

export interface DJIDevice {
  deviceSn:       string        // drone serial number
  deviceName:     string
  deviceModel:    string        // e.g. "Matrice 30T", "Mavic 3E"
  firmwareVersion: string
  workspaceSn:    string        // workspace the device belongs to
  onlineStatus:   'ONLINE' | 'OFFLINE'
  boundStatus:    'BOUND' | 'UNBOUND'
  lastSeenUtc:    string
  controllerSn:   string | null // paired remote controller
}

export interface DJITelemetryPoint {
  deviceSn:       string
  timestampUtcMs: number
  latitudeDeg:    number
  longitudeDeg:   number
  altitudeM:      number        // relative to takeoff
  altitudeMslM:   number        // relative to sea level
  speedMs:        number
  headingDeg:     number
  batteryPercent: number
  satelliteCount: number
  flightMode:     string        // e.g. "GPS", "ATTI", "SPORT", "TRIPOD"
  isFlying:       boolean
}

export interface DJIFlightRecord {
  flightId:       string
  deviceSn:       string
  startTimeUtc:   string
  endTimeUtc:     string | null
  durationSec:    number
  maxAltitudeM:   number
  maxSpeedMs:     number
  distanceM:      number
  takeoff:        { lat: number; lon: number }
  landing:        { lat: number; lon: number } | null
  telemetryPoints: DJITelemetryPoint[]
}

// ── Outbound Types (JADS → DJI Cloud) ────────────────────────────────────

export interface DJIFlightArea {
  areaId:         string
  areaName:       string
  areaType:       'POLYGON' | 'CIRCLE'
  geoJson:        string | null   // GeoJSON for POLYGON
  centerLat:      number | null   // for CIRCLE
  centerLon:      number | null
  radiusM:        number | null
  maxAltitudeM:   number
  restriction:    'NO_FLY' | 'ALTITUDE_LIMIT' | 'SPEED_LIMIT' | 'AUTHORIZATION_REQUIRED'
  effectiveFrom:  string
  effectiveTo:    string | null
}

export interface DJIFlightAreaResult {
  areaId:     string
  synced:     boolean
  errorMsg:   string | null
}

// ── Adapter Interface ────────────────────────────────────────────────────

export interface IDJICloudAdapter {
  // ── CONNECTION ──────────────────────────────────────
  connect(): Promise<{ connected: boolean; brokerId: string | null }>
  disconnect(): Promise<void>

  // ── INBOUND (DJI → JADS) ───────────────────────────
  getDevices(workspaceSn: string): Promise<DJIDevice[]>
  getDeviceTelemetry(deviceSn: string, sinceUtcMs: number): Promise<DJITelemetryPoint[]>
  getFlightRecords(deviceSn: string, sinceUtc: string): Promise<DJIFlightRecord[]>
  getLatestFirmwareVersion(deviceModel: string): Promise<string | null>

  // ── OUTBOUND (JADS → DJI) ─────────────────────────
  pushFlightAreas(areas: DJIFlightArea[]): Promise<DJIFlightAreaResult[]>

  // ── HEALTH ─────────────────────────────────────────
  ping(): Promise<{ connected: boolean; latencyMs: number }>
}

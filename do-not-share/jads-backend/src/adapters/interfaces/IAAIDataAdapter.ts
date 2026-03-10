// Adapter interface for AAI (Airports Authority of India) data exchange.
// @dataFlow TWO_WAY — pull aerodrome/airspace data (inbound) + push flight status & compliance reports (outbound)
// Separate from IAftnGateway which handles AFTN flight plan filing only.
// This adapter covers the broader AAI data exchange channel.

// ── INBOUND types (AAI → JADS) ─────────────────────────────

export interface RunwayInfo {
  designator:    string    // e.g. "28R/10L"
  lengthM:       number
  widthM:        number
  surfaceType:   string
  ilsAvailable:  boolean
  status:        'OPEN' | 'CLOSED' | 'UNDER_MAINTENANCE'
}

export interface AerodromeInfo {
  icaoCode:       string
  iataCode:       string | null
  name:           string
  city:           string
  runways:        RunwayInfo[]
  operatingHours: string
  elevationFt:    number
  referencePoint: { lat: number; lon: number }
  lastUpdated:    string   // ISO 8601
}

export interface AirspaceUpdate {
  updateId:      string
  type:          string      // CLASSIFICATION_CHANGE, TRA, TSA, RESTRICTED_AREA
  description:   string
  areaGeoJson:   string | null
  effectiveFrom: string
  effectiveTo:   string | null
}

// ── OUTBOUND types (JADS → AAI) ────────────────────────────

export interface FlightStatusReport {
  flightPlanId: string
  callsign:     string
  status:       string   // FILED, CLEARED, DEPARTED, ARRIVED, CANCELLED
  reportedAt:   string
}

export interface ComplianceReport {
  reportId:       string
  period:         string   // e.g. "2024-Q1"
  totalFlights:   number
  violations:     number
  complianceRate: number   // 0–1
  generatedAt:    string
}

export interface IAAIDataAdapter {
  // ── INBOUND (AAI → JADS) ────────────────────────────────
  // Get operational info for a single aerodrome.
  getAerodromeInfo(icaoCode: string): Promise<AerodromeInfo | null>

  // Get operational info for all AAI-managed aerodromes.
  getAllAerodromes(): Promise<AerodromeInfo[]>

  // Get airspace classification changes since a timestamp.
  getAirspaceUpdates(since: string): Promise<AirspaceUpdate[]>

  // ── OUTBOUND (JADS → AAI) ───────────────────────────────
  // Push a flight status report to AAI.
  pushFlightStatus(report: FlightStatusReport): Promise<{ accepted: boolean }>

  // Push a quarterly compliance report to AAI.
  pushComplianceReport(report: ComplianceReport): Promise<{ accepted: boolean; receiptId: string | null }>

  // ── HEALTH ──────────────────────────────────────────────
  ping(): Promise<{ connected: boolean; latencyMs: number }>
}

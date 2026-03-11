// Adapter interface for FIR (Flight Information Region) data providers.
// Provides FIC (Flight Information Circulars) from each FIR office.
// @dataFlow TWO_WAY — pull FIC records (inbound) + submit flight plans for clearance (outbound)

export interface FicRecord {
  ficNumber:     string
  firCode:       string
  subject:       string
  content:       string
  category:      string
  effectiveFrom: string
  effectiveTo:   string | null
  supersedes:    string | null
  issuedBy:      string
  issuedAtUtc:   string
}

export interface FicPullResult {
  records:   FicRecord[]
  asOfUtc:   string
}

export interface FicUpdateResult {
  newRecords:        FicRecord[]
  expiredFicNumbers: string[]
  asOfUtc:           string
}

// ── OUTBOUND types (JADS → FIR) ──────────────────────────────
export interface FicClearanceRequest {
  flightPlanId:    string
  callsign:        string
  routeSummary:    string
  firCode:         string
  estimatedEntry:  string   // ISO 8601 — when flight enters this FIR
  estimatedExit:   string   // ISO 8601 — when flight exits this FIR
  aircraftType:    string
  flightLevel:     number
}

export interface FicClearanceResponse {
  accepted:               boolean
  ficNumber:              string | null   // issued FIC number if accepted
  rejectionReason:        string | null
  estimatedProcessingMin: number | null
  respondedAtUtc:         string
}

// ── Conflict alert (JADS → FIR) ────────────────────────────
export interface FicConflictAlert {
  alertId:              string
  dronePlanId:          string
  flightPlanId:         string
  callsign:             string
  firCode:              string
  severity:             'CRITICAL' | 'WARNING'
  droneAltitudeAglM:    { min: number; max: number }
  droneAltitudeAmslFt:  { min: number; max: number }
  flightAltitudeAmslFt: number
  overlapStartUtc:      string
  overlapEndUtc:        string
  areaDescription:      string
  groundElevationFt:    number
  detectedAtUtc:        string
}

export interface IFirAdapter {
  // ── INBOUND (FIR → JADS) ───────────────────────────────────
  // Pull all active FIC records for a FIR.
  pullFicRecords(firCode: string): Promise<FicPullResult>

  // Pull only FIC records changed since a given timestamp.
  pullFicUpdates(firCode: string, sinceUtc: string): Promise<FicUpdateResult>

  // ── OUTBOUND (JADS → FIR) ─────────────────────────────────
  // Submit a flight plan to FIR for FIC clearance processing.
  submitFlightPlanForFic(request: FicClearanceRequest): Promise<FicClearanceResponse>

  // Acknowledge receipt of a FIC record update.
  acknowledgeFicUpdate(ficNumber: string, acknowledged: boolean): Promise<void>

  // Push an airspace conflict alert to FIR office for coordination.
  pushConflictAlert(alert: FicConflictAlert): Promise<{ acknowledged: boolean }>
}

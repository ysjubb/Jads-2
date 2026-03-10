// Adapter interface for AFMLU (Air Force Major Line Unit) data providers.
// Provides ADC (Airspace Design Cell) records — drone airspace zone definitions.
// @dataFlow TWO_WAY — pull ADC zone records (inbound) + submit flight plans for clearance (outbound)

export interface AdcArea {
  type:        'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export interface AdcVerticalLimits {
  lowerFt:  number
  lowerRef: string  // AGL, AMSL, FL
  upperFt:  number
  upperRef: string
}

export interface AdcRecord {
  afmluId:          number
  adcNumber:        string
  adcType:          string   // PROHIBITED, RESTRICTED, DANGER, CONTROLLED, etc.
  area:             AdcArea
  verticalLimits:   AdcVerticalLimits
  effectiveFrom:    string
  effectiveTo:      string | null
  activitySchedule: string | null
  contactFrequency: string | null
  remarks:          string | null
  fetchedAtUtc:     string
}

export interface AdcPullResult {
  records:  AdcRecord[]
  asOfUtc:  string
}

export interface AdcUpdateResult {
  newRecords:          AdcRecord[]
  withdrawnAdcNumbers: string[]
  asOfUtc:             string
}

// ── OUTBOUND types (JADS → AFMLU) ────────────────────────────
export interface AdcClearanceRequest {
  flightPlanId:      string
  callsign:          string
  routeSummary:      string        // brief description of planned route
  requestedAltitude: number        // feet
  estimatedDep:      string        // ISO 8601
  estimatedArr:      string        // ISO 8601
  aircraftType:      string
  purposeOfFlight:   string
}

export interface AdcClearanceResponse {
  accepted:               boolean
  adcNumber:              string | null   // issued ADC number if accepted
  rejectionReason:        string | null
  estimatedProcessingMin: number | null   // minutes until decision
  respondedAtUtc:         string
}

export interface IAfmluAdapter {
  // ── INBOUND (AFMLU → JADS) ─────────────────────────────────
  // Pull all current ADC records from an AFMLU.
  pullAdcRecords(afmluId: number): Promise<AdcPullResult>

  // Pull only ADC records changed since a given timestamp.
  pullAdcUpdates(afmluId: number, sinceUtc: string): Promise<AdcUpdateResult>

  // ── OUTBOUND (JADS → AFMLU) ────────────────────────────────
  // Submit a flight plan to AFMLU for ADC clearance processing.
  submitFlightPlanForAdc(afmluId: number, request: AdcClearanceRequest): Promise<AdcClearanceResponse>

  // Acknowledge receipt of an ADC zone update.
  acknowledgeAdcUpdate(adcNumber: string, acknowledged: boolean): Promise<void>
}

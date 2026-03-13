// Adapter interface for AAI Online Flight Plan (OFPL) portal integration.
// Government replaces OFPLAdapterStub with their live AAI OFPL implementation
// (https://ofpl.aai.aero) without changing any service code.
//
// JADS is a compliance intermediary — it never transmits AFTN messages directly.
// All conflict outputs are ADVISORY only.

// ── Types ──────────────────────────────────────────────────────────────────

export interface FiledFPL {
  externalFplId:   string        // AAI OFPL system identifier
  callsign:        string        // ICAO callsign (e.g. 'SXR409', 'SEK204')
  aircraftType:    string        // ICAO type designator (e.g. 'A320', 'B738')
  departure:       string        // ICAO aerodrome (e.g. 'VIDP')
  destination:     string        // ICAO aerodrome (e.g. 'VOBL')
  eobt:            string        // ISO 8601 — Estimated Off-Block Time
  eet:             number        // Estimated Elapsed Time in minutes
  route:           string        // ICAO route string (e.g. 'IGONI UA461 SIPTU')
  cruisingLevel:   string        // e.g. 'FL310', 'A080'
  flightRules:     'IFR' | 'VFR' | 'Y' | 'Z'
  altDest:         string | null // Alternate destination ICAO code
  picName:         string        // Pilot in Command
  remarks:         string | null // Item 18 / remarks
  status:          'FILED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED'
}

export interface FPLSearchParams {
  departure?:      string        // Filter by departure ICAO
  destination?:    string        // Filter by destination ICAO
  fromEobt?:       string        // ISO 8601 — window start
  toEobt?:         string        // ISO 8601 — window end
  callsign?:       string        // Partial match
}

export interface FPLActivation {
  externalFplId:   string
  activatedAt:     string        // ISO 8601
}

// ── Interface ──────────────────────────────────────────────────────────────

export interface IOFPLAdapter {
  /** Search filed flight plans by criteria. */
  searchFlightPlans(params: FPLSearchParams): Promise<FiledFPL[]>

  /** Get a single flight plan by its external OFPL ID. Returns null if not found. */
  getFlightPlan(externalFplId: string): Promise<FiledFPL | null>

  /** Mark a flight plan as activated. */
  activateFPL(externalFplId: string): Promise<FPLActivation>

  /** Close a flight plan (post-arrival). */
  closeFPL(externalFplId: string): Promise<{ closed: boolean }>

  /** Cancel a flight plan. */
  cancelFPL(externalFplId: string): Promise<{ cancelled: boolean }>
}

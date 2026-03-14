// Adapter interface for AAI eAIP ENR data (Aeronautical Information Publication).
// @dataFlow ONE_WAY — pull ATS routes, navaids, and fixes from AAI eAIP (inbound only).
// Covers ENR 3.0 (ATS routes), ENR 4.1 (radio navigation aids), ENR 4.4 (significant points/fixes).
// Separate from IAAIDataAdapter which handles aerodrome operational data.
// Government replaces the stub with a live adapter that scrapes/polls aim-india.aai.aero.

// ── ENR 4.1 + ENR 4.4: Waypoints (navaids + fixes) ─────────────

export interface EAIPWaypoint {
  identifier:  string                // e.g. "GANDO", "VNS", "DPN"
  type:        'VOR' | 'NDB' | 'FIX' | 'VORTAC' | 'DME' | 'VOR/DME'
  name:        string                // human-readable name
  lat:         number
  lon:         number
  freqMhz:    number | null          // null for fixes
  firCode:    string | null           // FIR containing this waypoint
  airacCycle: string                  // e.g. "2602"
}

// ── ENR 3.0: ATS routes ─────────────────────────────────────────

export interface EAIPATSRoute {
  designator:       string            // e.g. "L301", "W1", "A461"
  waypointSequence: string[]          // ordered waypoint identifiers
  direction:        'BOTH' | 'FORWARD_ONLY' | 'REVERSE_ONLY'
  minFl:            number            // minimum flight level (e.g. 50 = FL050)
  maxFl:            number            // maximum flight level (e.g. 460 = FL460)
  routeType:        'LOWER' | 'UPPER' | 'BOTH'
  airacCycle:       string
}

// ── ENR 4.1: Radio navigation aids ──────────────────────────────

export interface EAIPNavaid {
  navaidId:     string                // e.g. "DPN" (Delhi VOR)
  type:         'VOR' | 'DME' | 'NDB' | 'ILS' | 'VORTAC' | 'VOR/DME'
  name:         string
  lat:          number
  lon:          number
  frequency:   string | null          // e.g. "116.1 MHz"
  declination: number | null          // magnetic declination in degrees
  icaoCode:    string | null          // associated aerodrome ICAO code
  firCode:     string | null          // FIR containing this navaid
  airacCycle:  string
}

// ── AIRAC status ────────────────────────────────────────────────

export interface AIRACStatus {
  cycle:             string           // e.g. "2602"
  effectiveDate:     string           // ISO 8601
  nextCycle:         string           // e.g. "2603"
  nextEffectiveDate: string           // ISO 8601
}

// ── Adapter interface ───────────────────────────────────────────

export interface IAAIeAIPAdapter {
  // ENR 4.1 + ENR 4.4: all waypoints (navaids + fixes) for a given FIR.
  getWaypoints(firCode: string): Promise<EAIPWaypoint[]>

  // ENR 3.0: all published ATS routes across Indian airspace.
  getATSRoutes(): Promise<EAIPATSRoute[]>

  // ENR 4.1: navaids for a given FIR (VOR, NDB, DME, ILS).
  getNavaids(firCode: string): Promise<EAIPNavaid[]>

  // Current AIRAC cycle and effective dates.
  getAIRACStatus(): Promise<AIRACStatus>

  // Check connectivity to the eAIP data source.
  ping(): Promise<{ connected: boolean; latencyMs: number }>
}

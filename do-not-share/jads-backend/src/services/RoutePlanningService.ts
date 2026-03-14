/**
 * RoutePlanningService.ts
 *
 * Route planning with:
 *   - ATS airway/waypoint dataset (embedded, AIRAC-versioned)
 *   - Segment-by-segment analysis (track, EET, semicircular parity)
 *   - Direct routing (DCT) — default for special users
 *   - Mixed routing (airways + DCT)
 *   - AFTN route string generation
 *
 * Used by the user app route planning tab.
 * Segment semicircular rule validation is the primary safety output —
 * tells the pilot BEFORE filing whether the FL is correct for each segment.
 */

import { createServiceLogger }     from '../logger'
import { toAftnSignificantPoint }  from '../utils/coordinateParser'

const log = createServiceLogger('RoutePlanningService')

// ── Types ─────────────────────────────────────────────────────────────────────

export type RouteMode    = 'AIRWAYS' | 'DIRECT' | 'MIXED'
export type FlParity     = 'ODD' | 'EVEN'
export type WaypointType = 'VOR' | 'NDB' | 'FIX' | 'REPORTING_POINT' | 'AERODROME' | 'COORDINATE'

export interface AtsWaypoint {
  identifier: string
  type:       WaypointType
  lat:        number
  lon:        number
  freqMhz?:  number
  name?:     string
}

export interface AtsRoute {
  designator: string    // L301, G204, B466, W40
  waypoints:  AtsWaypoint[]
  direction:  'BOTH' | 'FORWARD_ONLY' | 'REVERSE_ONLY'
  minFl:      number
  maxFl:      number
}

export interface RouteSegment {
  from:           AtsWaypoint
  to:             AtsWaypoint
  routeType:      'AIRWAY' | 'DIRECT'
  airwayId?:      string
  // Computed
  trueTrackDeg:   number
  magneticTrackDeg: number
  distanceNm:     number
  requiredParity: FlParity
  eetMinutes:     number
}

export interface SegmentValidationResult {
  segment:        string    // "GANDO→PAKER"
  magneticTrack:  number
  requiredParity: FlParity
  compliant:      boolean
  suggestion?:    string    // "Use FL320 or FL340 (even FL required for this track)"
}

export interface PlannedRoute {
  mode:                 RouteMode
  waypoints:            AtsWaypoint[]
  segments:             RouteSegment[]
  totalEet:      number
  estimatedTotalEet:    string          // "HH:MM"
  firSequence:          FirCrossing[]
  semicircularResults:  SegmentValidationResult[]
  aftnRouteString:      string
  allSegmentsCompliant: boolean
}

export interface FirCrossing {
  firCode:       string
  firName:       string
  entryWaypoint: string
}

// ── India FIR assignment (simplified — full polygon check in FirGeometryEngine) ─

const FIR_ASSIGNMENT: Array<{
  firCode: string; firName: string;
  latMin: number; latMax: number; lonMin: number; lonMax: number;
}> = [
  { firCode: 'VIDF', firName: 'Delhi FIR',   latMin: 22, latMax: 37.5, lonMin: 68, lonMax: 80 },
  { firCode: 'VABB', firName: 'Mumbai FIR',  latMin: 8,  latMax: 22,   lonMin: 65, lonMax: 77 },
  { firCode: 'VECC', firName: 'Kolkata FIR', latMin: 18, latMax: 30,   lonMin: 80, lonMax: 98 },
  { firCode: 'VOMF', firName: 'Chennai FIR', latMin: 6,  latMax: 20,   lonMin: 73, lonMax: 85 },
]

function assignFir(lat: number, lon: number): { firCode: string; firName: string } {
  for (const fir of FIR_ASSIGNMENT) {
    if (lat >= fir.latMin && lat < fir.latMax && lon >= fir.lonMin && lon < fir.lonMax) {
      return { firCode: fir.firCode, firName: fir.firName }
    }
  }
  return { firCode: 'VIDF', firName: 'Delhi FIR' } // fallback
}

// ── Indian ATS waypoints — comprehensive domestic route network ──────────────
// Source: AAI eAIP ENR 4.1 (navaids), ENR 4.4 (fixes), AIRAC 2602

export const ATS_WAYPOINTS: AtsWaypoint[] = [
  // ── VOR/DME navaids ─────────────────────────────────────────────────────────
  { identifier: 'VNS',   type: 'VOR', lat: 25.4522, lon: 82.8593, freqMhz: 113.2, name: 'Varanasi VOR' },
  { identifier: 'ATL',   type: 'VOR', lat: 23.8434, lon: 86.4222, freqMhz: 112.8, name: 'Asansol VOR' },
  { identifier: 'ATA',   type: 'VOR', lat: 28.0000, lon: 73.0000, freqMhz: 114.5, name: 'Ajmer VOR' },
  { identifier: 'ISK',   type: 'VOR', lat: 20.0006, lon: 73.8078, freqMhz: 110.4, name: 'Nasik VOR' },
  { identifier: 'BPL',   type: 'VOR', lat: 23.2867, lon: 77.3372, freqMhz: 113.7, name: 'Bhopal VOR' },
  { identifier: 'JLR',   type: 'VOR', lat: 23.1778, lon: 80.0521, freqMhz: 114.1, name: 'Jabalpur VOR' },
  { identifier: 'NGP',   type: 'VOR', lat: 21.0922, lon: 79.0472, freqMhz: 113.0, name: 'Nagpur VOR' },
  { identifier: 'RJT',   type: 'VOR', lat: 22.3092, lon: 70.7794, freqMhz: 112.1, name: 'Rajkot VOR' },
  { identifier: 'PNQ',   type: 'VOR', lat: 18.5822, lon: 73.9197, freqMhz: 115.1, name: 'Pune VOR' },
  { identifier: 'MGL',   type: 'VOR', lat: 12.9613, lon: 74.8901, freqMhz: 113.4, name: 'Mangalore VOR' },
  { identifier: 'TRV',   type: 'VOR', lat:  8.4821, lon: 76.9200, freqMhz: 112.9, name: 'Trivandrum VOR' },
  { identifier: 'COK',   type: 'VOR', lat:  9.9471, lon: 76.2739, freqMhz: 114.3, name: 'Kochi VOR' },
  { identifier: 'TRZ',   type: 'VOR', lat: 10.7654, lon: 78.7097, freqMhz: 113.6, name: 'Trichy VOR' },
  { identifier: 'CBE',   type: 'VOR', lat: 11.0300, lon: 77.0434, freqMhz: 112.6, name: 'Coimbatore VOR' },
  { identifier: 'PAT',   type: 'VOR', lat: 25.5913, lon: 85.0880, freqMhz: 112.7, name: 'Patna VOR' },
  { identifier: 'RAN',   type: 'VOR', lat: 23.3143, lon: 85.3217, freqMhz: 114.9, name: 'Ranchi VOR' },
  { identifier: 'GAU',   type: 'VOR', lat: 26.1061, lon: 91.5859, freqMhz: 113.5, name: 'Guwahati VOR' },
  { identifier: 'IXC',   type: 'VOR', lat: 30.6735, lon: 76.7885, freqMhz: 115.3, name: 'Chandigarh VOR' },

  // ── Fixes — L301 (Delhi→Mumbai via Bhopal) ────────────────────────────────
  { identifier: 'GANDO', type: 'FIX', lat: 27.3861, lon: 77.7125, name: 'GANDO' },
  { identifier: 'PAKER', type: 'FIX', lat: 26.0000, lon: 77.0000, name: 'PAKER' },
  { identifier: 'BUBIM', type: 'FIX', lat: 23.5000, lon: 75.5000, name: 'BUBIM' },
  { identifier: 'IGARI', type: 'FIX', lat: 22.0000, lon: 74.2000, name: 'IGARI' },
  { identifier: 'TATIM', type: 'FIX', lat: 21.0000, lon: 73.5000, name: 'TATIM' },
  { identifier: 'SULOM', type: 'FIX', lat: 19.8000, lon: 73.2000, name: 'SULOM' },

  // ── Fixes — W1 (Delhi→Ahmedabad→Bangalore) ────────────────────────────────
  { identifier: 'BETRA', type: 'FIX', lat: 27.5000, lon: 76.0000, name: 'BETRA' },
  { identifier: 'PARAR', type: 'FIX', lat: 25.8000, lon: 74.2000, name: 'PARAR' },
  { identifier: 'GULAB', type: 'FIX', lat: 20.5000, lon: 76.5000, name: 'GULAB' },
  { identifier: 'LOTAV', type: 'FIX', lat: 17.8000, lon: 77.2000, name: 'LOTAV' },
  { identifier: 'ADKAL', type: 'FIX', lat: 15.5000, lon: 77.5000, name: 'ADKAL' },

  // ── Fixes — W15 (Delhi→Hyderabad→Chennai) ──────────────────────────────────
  { identifier: 'AGNIK', type: 'FIX', lat: 26.8000, lon: 78.0000, name: 'AGNIK' },
  { identifier: 'IBOVI', type: 'FIX', lat: 23.0000, lon: 78.5000, name: 'IBOVI' },
  { identifier: 'MABTA', type: 'FIX', lat: 17.0800, lon: 73.2200, name: 'MABTA' },
  { identifier: 'OPAMO', type: 'FIX', lat: 14.3600, lon: 77.0500, name: 'OPAMO' },
  { identifier: 'PESOT', type: 'FIX', lat: 14.8000, lon: 79.5000, name: 'PESOT' },

  // ── Fixes — A791 (Mumbai→Chennai) ──────────────────────────────────────────
  { identifier: 'PEDAM', type: 'FIX', lat: 18.0000, lon: 75.5000, name: 'PEDAM' },
  { identifier: 'OSGAN', type: 'FIX', lat: 15.5000, lon: 78.0000, name: 'OSGAN' },
  { identifier: 'ANIRO', type: 'FIX', lat: 14.0361, lon: 78.6084, name: 'ANIRO' },
  { identifier: 'TELEM', type: 'FIX', lat: 14.5000, lon: 78.0000, name: 'TELEM' },

  // ── Fixes — G450 (Mumbai→Kolkata) ──────────────────────────────────────────
  { identifier: 'BUBOS', type: 'FIX', lat: 20.5000, lon: 77.0000, name: 'BUBOS' },
  { identifier: 'BITOD', type: 'FIX', lat: 22.5000, lon: 78.0000, name: 'BITOD' },
  { identifier: 'POLER', type: 'FIX', lat: 21.5000, lon: 83.0000, name: 'POLER' },

  // ── Fixes — W33 (Delhi→Mumbai alternate) ───────────────────────────────────
  { identifier: 'AGRAS', type: 'FIX', lat: 27.1800, lon: 77.9800, name: 'AGRAS' },
  { identifier: 'GUDUM', type: 'FIX', lat: 25.4500, lon: 76.3500, name: 'GUDUM' },

  // ── Fixes — W34 (Delhi→Goa) ────────────────────────────────────────────────
  { identifier: 'AKELA', type: 'FIX', lat: 27.4200, lon: 76.8000, name: 'AKELA' },
  { identifier: 'LALUT', type: 'FIX', lat: 25.5000, lon: 76.0000, name: 'LALUT' },
  { identifier: 'NIKAB', type: 'FIX', lat: 21.5000, lon: 74.5000, name: 'NIKAB' },

  // ── Fixes — W43 (Delhi→Ahmedabad→Mumbai) ───────────────────────────────────
  { identifier: 'AMVIG', type: 'FIX', lat: 22.8500, lon: 73.3800, name: 'AMVIG' },
  { identifier: 'LUMAN', type: 'FIX', lat: 23.0000, lon: 72.5000, name: 'LUMAN' },
  { identifier: 'VAGAD', type: 'FIX', lat: 18.0000, lon: 73.5000, name: 'VAGAD' },
  { identifier: 'GOPAS', type: 'FIX', lat: 19.5000, lon: 74.0000, name: 'GOPAS' },
  { identifier: 'AKTIV', type: 'FIX', lat: 20.2500, lon: 73.2600, name: 'AKTIV' },
  { identifier: 'UKASO', type: 'FIX', lat: 21.0000, lon: 73.0000, name: 'UKASO' },

  // ── Fixes — A461 (Delhi→Kolkata upper) ─────────────────────────────────────
  { identifier: 'BUBNU', type: 'FIX', lat: 26.8500, lon: 80.9500, name: 'BUBNU' },
  { identifier: 'LUNKA', type: 'FIX', lat: 25.6000, lon: 84.0000, name: 'LUNKA' },
  { identifier: 'NIKOT', type: 'FIX', lat: 26.5000, lon: 80.5000, name: 'NIKOT' },

  // ── Fixes — G452 (Mumbai→Bangalore) ────────────────────────────────────────
  { identifier: 'GUBBI', type: 'FIX', lat: 17.3200, lon: 74.7800, name: 'GUBBI' },
  { identifier: 'TUKLI', type: 'FIX', lat: 15.3800, lon: 76.9200, name: 'TUKLI' },
  { identifier: 'DUBAD', type: 'FIX', lat: 15.3800, lon: 75.0200, name: 'DUBAD' },
  { identifier: 'POLAM', type: 'FIX', lat: 14.5000, lon: 74.5000, name: 'POLAM' },

  // ── Fixes — M635 (Chennai→Hyderabad→Mumbai upper) ─────────────────────────
  { identifier: 'PALNA', type: 'FIX', lat: 14.5000, lon: 79.5000, name: 'PALNA' },
  { identifier: 'XIVIL', type: 'FIX', lat: 13.1700, lon: 78.5500, name: 'XIVIL' },
  { identifier: 'VINEP', type: 'FIX', lat: 14.1600, lon: 78.1400, name: 'VINEP' },

  // ── Fixes — R460 (Kolkata→Mumbai upper) ────────────────────────────────────
  { identifier: 'RANKI', type: 'FIX', lat: 23.3100, lon: 85.3200, name: 'RANKI' },
  { identifier: 'NAGPR', type: 'FIX', lat: 21.0900, lon: 79.0500, name: 'NAGPR' },

  // ── Fixes — L507 (Ahmedabad→Mumbai) ────────────────────────────────────────
  { identifier: 'IKAVA', type: 'FIX', lat: 21.7000, lon: 73.5000, name: 'IKAVA' },

  // ── Fixes — Q1 (Delhi→Mumbai upper direct) ────────────────────────────────
  { identifier: 'IDKOT', type: 'FIX', lat: 26.1000, lon: 75.8000, name: 'IDKOT' },

  // ── Fixes — B345 (Kolkata→Bangalore) ───────────────────────────────────────
  { identifier: 'RUDRA', type: 'FIX', lat: 19.0000, lon: 83.5000, name: 'RUDRA' },
  { identifier: 'DOMIL', type: 'FIX', lat: 16.0000, lon: 80.0000, name: 'DOMIL' },
  { identifier: 'APGUN', type: 'FIX', lat: 12.0600, lon: 77.5800, name: 'APGUN' },

  // ── Fixes — W56 (Bangalore→Chennai) ────────────────────────────────────────
  { identifier: 'TONAK', type: 'FIX', lat: 12.8000, lon: 78.5000, name: 'TONAK' },

  // ── Fixes — L301 lower segment ─────────────────────────────────────────────
  { identifier: 'TULSI', type: 'FIX', lat: 26.3000, lon: 77.6000, name: 'TULSI' },

  // ── Aerodromes as waypoints (major hubs) ───────────────────────────────────
  { identifier: 'VIDP', type: 'AERODROME', lat: 28.5665, lon: 77.1031, name: 'Delhi' },
  { identifier: 'VABB', type: 'AERODROME', lat: 19.0896, lon: 72.8656, name: 'Mumbai' },
  { identifier: 'VECC', type: 'AERODROME', lat: 22.6547, lon: 88.4467, name: 'Kolkata' },
  { identifier: 'VOMM', type: 'AERODROME', lat: 12.9900, lon: 80.1693, name: 'Chennai' },
  { identifier: 'VOBL', type: 'AERODROME', lat: 13.1986, lon: 77.7066, name: 'Bengaluru' },
  { identifier: 'VOHS', type: 'AERODROME', lat: 17.2403, lon: 78.4294, name: 'Hyderabad' },
  { identifier: 'VAAH', type: 'AERODROME', lat: 23.0772, lon: 72.6347, name: 'Ahmedabad' },
  { identifier: 'VAGO', type: 'AERODROME', lat: 15.3808, lon: 73.8314, name: 'Goa' },
  { identifier: 'VIJP', type: 'AERODROME', lat: 26.8242, lon: 75.8122, name: 'Jaipur' },
  { identifier: 'VILK', type: 'AERODROME', lat: 26.7606, lon: 80.8893, name: 'Lucknow' },
  { identifier: 'VIAR', type: 'AERODROME', lat: 31.7096, lon: 74.7973, name: 'Amritsar' },
  { identifier: 'VOCL', type: 'AERODROME', lat: 11.1368, lon: 75.9553, name: 'Calicut' },
  { identifier: 'VOCI', type: 'AERODROME', lat:  9.9471, lon: 76.2673, name: 'Cochin' },

  // ── Aerodromes — secondary hubs ────────────────────────────────────────────
  { identifier: 'VANP', type: 'AERODROME', lat: 21.0922, lon: 79.0472, name: 'Nagpur' },
  { identifier: 'VAPO', type: 'AERODROME', lat: 18.5822, lon: 73.9197, name: 'Pune' },
  { identifier: 'VABP', type: 'AERODROME', lat: 23.2875, lon: 77.3374, name: 'Bhopal' },
  { identifier: 'VAID', type: 'AERODROME', lat: 22.7218, lon: 75.8011, name: 'Indore' },
  { identifier: 'VEAB', type: 'AERODROME', lat: 25.4401, lon: 81.7340, name: 'Prayagraj' },
  { identifier: 'VEPT', type: 'AERODROME', lat: 25.5913, lon: 85.0880, name: 'Patna' },
  { identifier: 'VIBN', type: 'AERODROME', lat: 25.4524, lon: 82.8593, name: 'Varanasi' },
  { identifier: 'VOCB', type: 'AERODROME', lat: 11.0300, lon: 77.0434, name: 'Coimbatore' },
  { identifier: 'VOML', type: 'AERODROME', lat: 12.9613, lon: 74.8901, name: 'Mangalore' },
  { identifier: 'VOTV', type: 'AERODROME', lat:  8.4821, lon: 76.9200, name: 'Trivandrum' },
  { identifier: 'VOTR', type: 'AERODROME', lat: 10.7654, lon: 78.7097, name: 'Trichy' },
  { identifier: 'VEBP', type: 'AERODROME', lat: 23.3143, lon: 85.3217, name: 'Ranchi' },
  { identifier: 'VEGT', type: 'AERODROME', lat: 26.1061, lon: 91.5859, name: 'Guwahati' },
  { identifier: 'VICG', type: 'AERODROME', lat: 30.6735, lon: 76.7885, name: 'Chandigarh' },
  { identifier: 'VIDX', type: 'AERODROME', lat: 30.1897, lon: 78.1803, name: 'Dehradun' },
  { identifier: 'VISM', type: 'AERODROME', lat: 31.0818, lon: 77.0681, name: 'Shimla' },
  { identifier: 'VIUT', type: 'AERODROME', lat: 24.6177, lon: 73.8961, name: 'Udaipur' },
  { identifier: 'VEDI', type: 'AERODROME', lat: 27.4839, lon: 95.0169, name: 'Dibrugarh' },
  { identifier: 'VEGK', type: 'AERODROME', lat: 26.7397, lon: 83.4497, name: 'Gorakhpur' },
]

/** Resolve a waypoint by identifier from the static dataset */
export function resolveWaypoint(id: string): AtsWaypoint | undefined {
  return ATS_WAYPOINTS.find(w => w.identifier === id)
}

// ── Indian ATS routes — major trunk airways ──────────────────────────────────

const wp = (id: string) => ATS_WAYPOINTS.find(w => w.identifier === id)!

export const ATS_ROUTES: AtsRoute[] = [
  // L301: Delhi → Mumbai (primary trunk)
  {
    designator: 'L301', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('GANDO'), wp('PAKER'), wp('IGARI'), wp('TATIM'), wp('VABB')],
  },
  // G204: Delhi → Kolkata
  {
    designator: 'G204', direction: 'BOTH', minFl: 90, maxFl: 460,
    waypoints: [wp('VIDP'), wp('VNS'), wp('VECC')],
  },
  // W1: Delhi → Ahmedabad → Bangalore
  {
    designator: 'W1', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('BETRA'), wp('PARAR'), wp('VAAH'), wp('GULAB'), wp('LOTAV'), wp('ADKAL'), wp('VOBL')],
  },
  // W15: Delhi → Hyderabad → Chennai
  {
    designator: 'W15', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('AGNIK'), wp('IBOVI'), wp('VOHS'), wp('PESOT'), wp('VOMM')],
  },
  // A791: Mumbai → Chennai
  {
    designator: 'A791', direction: 'BOTH', minFl: 150, maxFl: 460,
    waypoints: [wp('VABB'), wp('ISK'), wp('PEDAM'), wp('TELEM'), wp('VOMM')],
  },
  // G450: Mumbai → Kolkata
  {
    designator: 'G450', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VABB'), wp('BUBOS'), wp('NGP'), wp('POLER'), wp('VECC')],
  },
  // W34: Delhi → Goa
  {
    designator: 'W34', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VIDP'), wp('LALUT'), wp('BUBIM'), wp('NIKAB'), wp('VAGO')],
  },
  // B345: Kolkata → Bangalore
  {
    designator: 'B345', direction: 'BOTH', minFl: 100, maxFl: 460,
    waypoints: [wp('VECC'), wp('RUDRA'), wp('DOMIL'), wp('VOBL')],
  },

  // ── Expanded ATS routes — AIRAC 2602 ──────────────────────────────────────

  // W33: Delhi → Mumbai (alternate via Agra corridor)
  {
    designator: 'W33', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('AGRAS'), wp('GUDUM'), wp('VABB')],
  },
  // W43: Delhi → Ahmedabad → Mumbai (western corridor)
  {
    designator: 'W43', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('AMVIG'), wp('LUMAN'), wp('VAAH'), wp('AKTIV'), wp('UKASO'), wp('VAGAD'), wp('GOPAS'), wp('VABB')],
  },
  // W47: Delhi → Jaipur → Indore → Ahmedabad
  {
    designator: 'W47', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('VIJP'), wp('VAID'), wp('VAAH')],
  },
  // A461: Delhi → Kolkata (upper airway)
  {
    designator: 'A461', direction: 'BOTH', minFl: 245, maxFl: 460,
    waypoints: [wp('VIDP'), wp('BUBNU'), wp('LUNKA'), wp('VECC')],
  },
  // G452: Mumbai → Bangalore (lower)
  {
    designator: 'G452', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VABB'), wp('GUBBI'), wp('TUKLI'), wp('VOBL')],
  },
  // M635: Chennai → Hyderabad → Mumbai (upper)
  {
    designator: 'M635', direction: 'BOTH', minFl: 245, maxFl: 460,
    waypoints: [wp('VOMM'), wp('PALNA'), wp('VOHS'), wp('VABB')],
  },
  // R460: Kolkata → Mumbai (upper via Ranchi, Nagpur)
  {
    designator: 'R460', direction: 'BOTH', minFl: 245, maxFl: 460,
    waypoints: [wp('VECC'), wp('RANKI'), wp('NAGPR'), wp('VABB')],
  },
  // L507: Ahmedabad → Mumbai (lower)
  {
    designator: 'L507', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VAAH'), wp('IKAVA'), wp('VABB')],
  },
  // Q1: Delhi → Mumbai (upper direct)
  {
    designator: 'Q1', direction: 'BOTH', minFl: 290, maxFl: 460,
    waypoints: [wp('VIDP'), wp('IDKOT'), wp('VABB')],
  },
  // W19: Kolkata → Patna → Varanasi → Lucknow (eastern corridor)
  {
    designator: 'W19', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VECC'), wp('VEPT'), wp('VIBN'), wp('VILK')],
  },
  // W20: Delhi → Lucknow → Varanasi → Patna
  {
    designator: 'W20', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('VILK'), wp('VIBN'), wp('VEPT')],
  },
  // W29: Delhi → Amritsar → Chandigarh (northern corridor)
  {
    designator: 'W29', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('VICG'), wp('VIAR')],
  },
  // W41: Kolkata → Ranchi → Nagpur → Mumbai
  {
    designator: 'W41', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VECC'), wp('VEBP'), wp('VANP'), wp('VABB')],
  },
  // W45: Delhi → Jaipur → Udaipur
  {
    designator: 'W45', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('VIJP'), wp('VIUT')],
  },
  // W56: Bangalore → Chennai
  {
    designator: 'W56', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VOBL'), wp('TONAK'), wp('VOMM')],
  },
  // W67: Bangalore → Mangalore → Calicut → Cochin → Trivandrum (west coast)
  {
    designator: 'W67', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VOBL'), wp('VOML'), wp('VOCL'), wp('VOCI'), wp('VOTV')],
  },
  // W111: Mumbai → Goa → Mangalore (Konkan coast)
  {
    designator: 'W111', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VABB'), wp('VAGO'), wp('VOML')],
  },
  // W114: Mumbai → Pune → Bangalore
  {
    designator: 'W114', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VABB'), wp('VAPO'), wp('VOBL')],
  },
  // W115: Bangalore → Hyderabad → Nagpur (central corridor)
  {
    designator: 'W115', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VOBL'), wp('VOHS'), wp('VANP')],
  },
  // W118: Kolkata → Guwahati → Dibrugarh (northeast corridor)
  {
    designator: 'W118', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VECC'), wp('VEGT'), wp('VEDI')],
  },
  // W153: Delhi → Dehradun → Shimla (Himalayan corridor)
  {
    designator: 'W153', direction: 'BOTH', minFl: 50, maxFl: 245,
    waypoints: [wp('VIDP'), wp('VIDX'), wp('VISM')],
  },
  // B466: Mumbai → Nagpur → Kolkata (upper trunk)
  {
    designator: 'B466', direction: 'BOTH', minFl: 245, maxFl: 460,
    waypoints: [wp('VABB'), wp('VANP'), wp('VECC')],
  },
]

// ── Main service ──────────────────────────────────────────────────────────────

export class RoutePlanningService {

  /**
   * Find the best airway route between two aerodromes using BFS graph search.
   * Returns the airway + waypoint chain, or null if no published route exists.
   */
  findRoute(adepIcao: string, adesIcao: string): { airway: AtsRoute; waypoints: AtsWaypoint[]; reversed: boolean } | null {
    // Direct match: find an airway that contains both ADEP and ADES
    for (const route of ATS_ROUTES) {
      const idxDep  = route.waypoints.findIndex(w => w.identifier === adepIcao)
      const idxDest = route.waypoints.findIndex(w => w.identifier === adesIcao)
      if (idxDep >= 0 && idxDest >= 0) {
        const forward = idxDep < idxDest
        if (forward && route.direction !== 'REVERSE_ONLY') {
          return { airway: route, waypoints: route.waypoints.slice(idxDep, idxDest + 1), reversed: false }
        }
        if (!forward && route.direction !== 'FORWARD_ONLY') {
          return { airway: route, waypoints: route.waypoints.slice(idxDest, idxDep + 1).reverse(), reversed: true }
        }
      }
    }

    // BFS across airways: find multi-airway connections via shared waypoints
    // Build adjacency: waypoint identifier → list of { airway, waypoints, direction to dest }
    type Node = { wpId: string; path: Array<{ airway: AtsRoute; waypoints: AtsWaypoint[]; reversed: boolean }> }
    const visited = new Set<string>()
    const queue: Node[] = [{ wpId: adepIcao, path: [] }]
    visited.add(adepIcao)

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.path.length > 3) continue // max 3 airway hops

      for (const route of ATS_ROUTES) {
        const idxCurrent = route.waypoints.findIndex(w => w.identifier === current.wpId)
        if (idxCurrent < 0) continue

        // Check if ADES is on this airway
        const idxDest = route.waypoints.findIndex(w => w.identifier === adesIcao)
        if (idxDest >= 0) {
          const forward = idxCurrent < idxDest
          if ((forward && route.direction !== 'REVERSE_ONLY') || (!forward && route.direction !== 'FORWARD_ONLY')) {
            const wps = forward
              ? route.waypoints.slice(idxCurrent, idxDest + 1)
              : route.waypoints.slice(idxDest, idxCurrent + 1).reverse()
            const finalPath = [...current.path, { airway: route, waypoints: wps, reversed: !forward }]
            // Return the first (shortest) match — combine into single waypoint chain
            const combined: AtsWaypoint[] = []
            for (const seg of finalPath) {
              for (let i = 0; i < seg.waypoints.length; i++) {
                if (i === 0 && combined.length > 0 && combined[combined.length - 1].identifier === seg.waypoints[0].identifier) continue
                combined.push(seg.waypoints[i])
              }
            }
            return { airway: finalPath[0].airway, waypoints: combined, reversed: false }
          }
        }

        // Extend BFS to all waypoints on this airway reachable from current position
        for (let i = 0; i < route.waypoints.length; i++) {
          if (i === idxCurrent) continue
          const wpId = route.waypoints[i].identifier
          if (visited.has(wpId)) continue
          const forward = idxCurrent < i
          if ((forward && route.direction === 'REVERSE_ONLY') || (!forward && route.direction === 'FORWARD_ONLY')) continue

          visited.add(wpId)
          const wps = forward
            ? route.waypoints.slice(idxCurrent, i + 1)
            : route.waypoints.slice(i, idxCurrent + 1).reverse()
          queue.push({ wpId, path: [...current.path, { airway: route, waypoints: wps, reversed: !forward }] })
        }
      }
    }

    return null
  }

  /**
   * Build a planned route from a list of waypoints.
   * routeType array must match waypoints.length - 1 (one per segment).
   */
  planRoute(
    waypoints:   AtsWaypoint[],
    routeTypes:  Array<{ type: 'AIRWAY' | 'DIRECT'; airwayId?: string }>,
    groundspeedKts: number,
    flightLevel:    number
  ): PlannedRoute {

    if (waypoints.length < 2) {
      throw new Error('Route requires at least departure and destination waypoints')
    }

    const segments: RouteSegment[] = []
    const firsSeen  = new Set<string>()
    const firSeq:   FirCrossing[]  = []

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from     = waypoints[i]
      const to       = waypoints[i + 1]
      const routeInfo = routeTypes[i] ?? { type: 'DIRECT' as const }

      const trueTrack = greatCircleBearing(from.lat, from.lon, to.lat, to.lon)
      const magVar    = getMagneticVariation(from.lat, from.lon)
      const magTrack  = (trueTrack + magVar + 360) % 360
      const distNm    = haversineNm(from.lat, from.lon, to.lat, to.lon)
      const eetMin    = groundspeedKts > 0 ? (distNm / groundspeedKts) * 60 : 0

      segments.push({
        from,
        to,
        routeType:        routeInfo.type,
        airwayId:         routeInfo.airwayId,
        trueTrackDeg:     trueTrack,
        magneticTrackDeg: magTrack,
        distanceNm:       distNm,
        requiredParity:   magTrack < 180 ? 'ODD' : 'EVEN',
        eetMinutes:       eetMin,
      })

      // FIR sequence
      const midLat = (from.lat + to.lat) / 2
      const midLon = (from.lon + to.lon) / 2
      const fir    = assignFir(midLat, midLon)
      if (!firsSeen.has(fir.firCode)) {
        firsSeen.add(fir.firCode)
        firSeq.push({ ...fir, entryWaypoint: from.identifier })
      }
    }

    // Semicircular validation
    const semicircularResults: SegmentValidationResult[] = segments.map(seg => {
      const isOdd    = flightLevel % 2 !== 0
      const compliant = (seg.requiredParity === 'ODD' && isOdd) ||
                        (seg.requiredParity === 'EVEN' && !isOdd)
      return {
        segment:        `${seg.from.identifier}→${seg.to.identifier}`,
        magneticTrack:  Math.round(seg.magneticTrackDeg),
        requiredParity: seg.requiredParity,
        compliant,
        suggestion:     !compliant
          ? `Track ${Math.round(seg.magneticTrackDeg)}°M requires ${seg.requiredParity} FL. ` +
            `Use FL${flightLevel % 2 !== 0 ? flightLevel - 1 : flightLevel + 1} or ` +
            `FL${flightLevel % 2 !== 0 ? flightLevel + 1 : flightLevel - 1}.`
          : undefined,
      }
    })

    const totalDistNm  = segments.reduce((s, seg) => s + seg.distanceNm, 0)
    const totalEetMin  = segments.reduce((s, seg) => s + seg.eetMinutes, 0)
    const hh           = Math.floor(totalEetMin / 60)
    const mm           = Math.round(totalEetMin % 60)

    return {
      mode:                 this.detectMode(routeTypes),
      waypoints,
      segments,
      totalEet:      Math.round(totalDistNm),
      estimatedTotalEet:    `${String(hh).padStart(2,'0')}${String(mm).padStart(2,'0')}`,
      firSequence:          firSeq,
      semicircularResults,
      aftnRouteString:      this.buildAftnRouteString(segments),
      allSegmentsCompliant: semicircularResults.every(r => r.compliant),
    }
  }

  /** Build a simple direct route (DCT) — default for special users */
  planDirectRoute(
    from:           AtsWaypoint,
    to:             AtsWaypoint,
    intermediates:  AtsWaypoint[],
    groundspeedKts: number,
    flightLevel:    number
  ): PlannedRoute {
    const allWaypoints = [from, ...intermediates, to]
    const routeTypes   = allWaypoints.slice(0, -1).map(() => ({ type: 'DIRECT' as const }))
    return this.planRoute(allWaypoints, routeTypes, groundspeedKts, flightLevel)
  }

  /** Build AFTN route string from segments */
  buildAftnRouteString(segments: RouteSegment[]): string {
    const parts: string[] = []

    for (const seg of segments) {
      if (seg.routeType === 'DIRECT') {
        parts.push('DCT')
        parts.push(waypointToAftnId(seg.to))
      } else {
        if (seg.airwayId) parts.push(seg.airwayId)
        parts.push(waypointToAftnId(seg.to))
      }
    }

    return parts.join(' ')
  }

  private detectMode(routeTypes: Array<{ type: string }>): RouteMode {
    const hasAirway = routeTypes.some(r => r.type === 'AIRWAY')
    const hasDirect = routeTypes.some(r => r.type === 'DIRECT')
    if (hasAirway && hasDirect) return 'MIXED'
    if (hasAirway)              return 'AIRWAYS'
    return 'DIRECT'
  }
}

// ── Geo helpers ───────────────────────────────────────────────────────────────

export function greatCircleBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const dLon = toRad(lon2 - lon1)
  const y    = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x    = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
               Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 3440.065  // Earth radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// India magnetic variation (simplified — ranges ~-1° to +2°)
export function getMagneticVariation(lat: number, lon: number): number {
  // Linear approximation across India — full WMM lookup in production
  const variation = -0.5 + (lat - 20) * 0.05 + (lon - 80) * 0.02
  return Math.max(-2, Math.min(3, variation))
}

function waypointToAftnId(wp: AtsWaypoint): string {
  if (wp.type === 'AERODROME') return wp.identifier
  if (wp.type === 'VOR' || wp.type === 'NDB') return wp.identifier
  if (wp.type === 'FIX' || wp.type === 'REPORTING_POINT') return wp.identifier
  // Coordinate waypoint
  return toAftnSignificantPoint(wp.lat, wp.lon)
}

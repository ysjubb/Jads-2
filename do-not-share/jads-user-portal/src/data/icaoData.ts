import type { AerodromeInfo, AircraftTypeInfo, AirlineInfo, WakeTurbulence } from '../types/flightPlan'

// ── Indian Aerodromes ──────────────────────────────────────────────────────────
export const INDIAN_AERODROMES: AerodromeInfo[] = [
  { icao: 'VIDP', name: 'Indira Gandhi International', city: 'New Delhi', lat: 28.5665, lon: 77.1031, elevation: 777, fir: 'VIDF' },
  { icao: 'VABB', name: 'Chhatrapati Shivaji Maharaj International', city: 'Mumbai', lat: 19.0896, lon: 72.8656, elevation: 39, fir: 'VABF' },
  { icao: 'VOMM', name: 'Chennai International', city: 'Chennai', lat: 12.9941, lon: 80.1709, elevation: 52, fir: 'VOMF' },
  { icao: 'VECC', name: 'Netaji Subhas Chandra Bose International', city: 'Kolkata', lat: 22.6547, lon: 88.4467, elevation: 16, fir: 'VECF' },
  { icao: 'VOBL', name: 'Kempegowda International', city: 'Bengaluru', lat: 13.1979, lon: 77.7063, elevation: 3000, fir: 'VOMF' },
  { icao: 'VAAH', name: 'Sardar Vallabhbhai Patel International', city: 'Ahmedabad', lat: 23.0772, lon: 72.6347, elevation: 189, fir: 'VABF' },
  { icao: 'VOCI', name: 'Cochin International', city: 'Kochi', lat: 10.1520, lon: 76.4019, elevation: 30, fir: 'VOMF' },
  { icao: 'VIAR', name: 'Sri Guru Ram Dass Jee International', city: 'Amritsar', lat: 31.7096, lon: 74.7973, elevation: 756, fir: 'VIDF' },
  { icao: 'VIJP', name: 'Jaipur International', city: 'Jaipur', lat: 26.8242, lon: 75.8122, elevation: 1263, fir: 'VIDF' },
  { icao: 'VOHY', name: 'Rajiv Gandhi International', city: 'Hyderabad', lat: 17.2403, lon: 78.4294, elevation: 2024, fir: 'VOMF' },
  { icao: 'VEPT', name: 'Jay Prakash Narayan International', city: 'Patna', lat: 25.5913, lon: 85.0880, elevation: 170, fir: 'VECF' },
  { icao: 'VEGT', name: 'Lokpriya Gopinath Bordoloi International', city: 'Guwahati', lat: 26.1061, lon: 91.5859, elevation: 162, fir: 'VECF' },
  { icao: 'VEBS', name: 'Biju Patnaik International', city: 'Bhubaneswar', lat: 20.2444, lon: 85.8178, elevation: 138, fir: 'VECF' },
  { icao: 'VOCL', name: 'Calicut International', city: 'Calicut', lat: 11.1368, lon: 75.9553, elevation: 341, fir: 'VOMF' },
  { icao: 'VOPB', name: 'Veer Savarkar International', city: 'Port Blair', lat: 11.6412, lon: 92.7297, elevation: 14, fir: 'VOMF' },
  { icao: 'VIAG', name: 'Agra Airport (Kheria)', city: 'Agra', lat: 27.1557, lon: 77.9609, elevation: 551, fir: 'VIDF' },
  { icao: 'VANP', name: 'Dr. Babasaheb Ambedkar International', city: 'Nagpur', lat: 21.0922, lon: 79.0472, elevation: 1033, fir: 'VABF' },
  { icao: 'VILK', name: 'Chaudhary Charan Singh International', city: 'Lucknow', lat: 26.7606, lon: 80.8893, elevation: 410, fir: 'VIDF' },
  { icao: 'VIBN', name: 'Lal Bahadur Shastri International', city: 'Varanasi', lat: 25.4524, lon: 82.8593, elevation: 266, fir: 'VIDF' },
  { icao: 'VOBG', name: 'HAL Airport', city: 'Bengaluru', lat: 12.9499, lon: 77.6682, elevation: 2910, fir: 'VOMF' },
  { icao: 'VABP', name: 'Raja Bhoj International', city: 'Bhopal', lat: 23.2875, lon: 77.3372, elevation: 1719, fir: 'VABF' },
]

// ── Aircraft Types (Doc 8643 subset) ───────────────────────────────────────────
export const AIRCRAFT_TYPES: AircraftTypeInfo[] = [
  { icao: 'B738', name: 'Boeing 737-800', wake: 'M' },
  { icao: 'A320', name: 'Airbus A320', wake: 'M' },
  { icao: 'A321', name: 'Airbus A321', wake: 'M' },
  { icao: 'A319', name: 'Airbus A319', wake: 'M' },
  { icao: 'AT72', name: 'ATR 72', wake: 'M' },
  { icao: 'B77W', name: 'Boeing 777-300ER', wake: 'H' },
  { icao: 'B789', name: 'Boeing 787-9', wake: 'H' },
  { icao: 'A333', name: 'Airbus A330-300', wake: 'H' },
  { icao: 'A343', name: 'Airbus A340-300', wake: 'H' },
  { icao: 'A359', name: 'Airbus A350-900', wake: 'H' },
  { icao: 'B744', name: 'Boeing 747-400', wake: 'H' },
  { icao: 'B748', name: 'Boeing 747-8', wake: 'J' },
  { icao: 'A388', name: 'Airbus A380-800', wake: 'J' },
  { icao: 'C172', name: 'Cessna 172', wake: 'L' },
  { icao: 'C208', name: 'Cessna 208 Caravan', wake: 'L' },
  { icao: 'DH8D', name: 'Dash 8 Q400', wake: 'M' },
  { icao: 'PC12', name: 'Pilatus PC-12', wake: 'L' },
  { icao: 'B190', name: 'Beechcraft 1900', wake: 'L' },
  { icao: 'E145', name: 'Embraer ERJ 145', wake: 'L' },
  { icao: 'E175', name: 'Embraer E175', wake: 'M' },
  { icao: 'AN12', name: 'Antonov An-12', wake: 'H' },
  { icao: 'AN24', name: 'Antonov An-24', wake: 'M' },
  { icao: 'IL76', name: 'Ilyushin Il-76', wake: 'H' },
  { icao: 'C130', name: 'C-130J Super Hercules', wake: 'H' },
]

// ── CORRECTED Indian Airline 3LD Lookup ────────────────────────────────────────
// CRITICAL: Verified against ICAO Doc 8585 / Indian DGCA registry
export const INDIAN_AIRLINES: AirlineInfo[] = [
  { icao3ld: 'AIC', name: 'Air India', telephony: 'AIRINDIA', country: 'IN' },
  { icao3ld: 'IGO', name: 'IndiGo', telephony: 'IFLY', country: 'IN' }, // NOT INTERGLOBE
  { icao3ld: 'SEJ', name: 'SpiceJet', telephony: 'SPICEJET', country: 'IN' },
  { icao3ld: 'AKJ', name: 'Akasa Air', telephony: 'AKASA AIR', country: 'IN' }, // NOT AKB or AGD
  { icao3ld: 'AXB', name: 'Air India Express', telephony: 'EXPRESS INDIA', country: 'IN' }, // NOT IAX or IXA
  { icao3ld: 'LLR', name: 'Alliance Air', telephony: 'ALLIED', country: 'IN' },
  { icao3ld: 'SDG', name: 'Star Air', telephony: 'HI STAR', country: 'IN' }, // NOT OTK
  { icao3ld: 'BDA', name: 'Blue Dart Aviation', telephony: 'BLUE DART', country: 'IN' },
  { icao3ld: 'IFC', name: 'Indian Air Force', telephony: 'INDIAN AIRFORCE', country: 'IN' }, // NOT 'IAF'
  { icao3ld: 'PHE', name: 'Pawan Hans', telephony: 'PAWAN HANS', country: 'IN' },
  { icao3ld: 'TRJ', name: 'TruJet', telephony: 'TRUJET', country: 'IN' }, // NOT TJK
  { icao3ld: 'FLG', name: 'FlyBig', telephony: 'FLYBIG', country: 'IN' }, // NOT FBB
  // DEFUNCT — retained for historical FPL
  { icao3ld: 'VTI', name: 'Vistara', telephony: 'VISTARA', country: 'IN', defunct: true, defunctNote: 'Merged with Air India Nov 2024' },
  { icao3ld: 'GOW', name: 'Go First', telephony: 'GO FIRST', country: 'IN', defunct: true, defunctNote: 'Liquidated Jan 2025' },
  { icao3ld: 'IAD', name: 'AirAsia India', telephony: 'AIRASIA', country: 'IN', defunct: true, defunctNote: 'Merged with Air India Oct 2024' },
]

// ── ATS Route Designators (Indian ENR 3.0) ─────────────────────────────────────
export const ATS_ROUTES = [
  'W33', 'W10', 'W10N', 'W10S', 'W19', 'W20', 'W53', 'W55', 'W68', 'W137',
  'A461', 'A201', 'A474', 'A791',
  'G452', 'G450', 'G463', 'G465',
  'L301', 'L507', 'L894',
  'M635', 'M300', 'M557', 'M770', 'M771',
  'R460',
  'B459', 'B463',
  'P570', 'N571', 'P628',
  'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q13', 'Q19', 'Q20',
  'J7',
]

// ── Utility functions ──────────────────────────────────────────────────────────
export function findAerodrome(icao: string): AerodromeInfo | undefined {
  return INDIAN_AERODROMES.find(a => a.icao === icao.toUpperCase())
}

export function findAircraftType(code: string): AircraftTypeInfo | undefined {
  return AIRCRAFT_TYPES.find(a => a.icao === code.toUpperCase())
}

export function findAirline(code: string): AirlineInfo | undefined {
  return INDIAN_AIRLINES.find(a => a.icao3ld === code.toUpperCase())
}

export function resolveCallsign(raw: string): {
  type: 'FORMAT_A' | 'FORMAT_C' | 'NUMERIC' | 'ZZZZ'
  transmitted: string
  telephony?: string
  airline?: string
  isDefunct?: boolean
  defunctNote?: string
  warning?: string
  field18Remark?: string
} {
  const input = raw.trim().toUpperCase()

  // Format A: VT- registration (strip hyphen for AFTN)
  if (/^VT-?[A-Z]{3}$/.test(input)) {
    return { type: 'FORMAT_A', transmitted: input.replace('-', '') }
  }

  // Format C: 3LD + flight number
  const m3ld = input.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/)
  if (m3ld) {
    const airline = findAirline(m3ld[1])
    if (airline) {
      const flightNum = m3ld[2].split('').map(c => {
        const digits: Record<string, string> = { '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine' }
        return digits[c] ?? c
      }).join(' ')
      return {
        type: 'FORMAT_C',
        transmitted: input,
        telephony: `${airline.telephony} ${flightNum}`,
        airline: airline.name,
        isDefunct: airline.defunct,
        defunctNote: airline.defunctNote,
      }
    }
  }

  // Numeric detection
  if (/^\d/.test(input)) {
    let transmitted: string
    if (input.length <= 6) {
      transmitted = 'Q' + input
    } else {
      transmitted = 'Q' + input.slice(1)
    }
    return {
      type: 'NUMERIC',
      transmitted,
      warning: 'Numeric callsign detected — Q-prefix applied per ICAO rules',
      field18Remark: `RMK/ORIGINAL CALLSIGN ${input}`,
    }
  }

  // Valid alphanumeric (possibly foreign airline)
  if (/^[A-Z0-9]{2,7}$/.test(input)) {
    const m2ld = input.match(/^([A-Z]{3})/)
    if (m2ld) {
      const airline = findAirline(m2ld[1])
      if (airline) {
        return {
          type: 'FORMAT_C',
          transmitted: input,
          telephony: airline.telephony,
          airline: airline.name,
          isDefunct: airline.defunct,
          defunctNote: airline.defunctNote,
        }
      }
    }
    return { type: 'FORMAT_C', transmitted: input }
  }

  return { type: 'ZZZZ', transmitted: 'ZZZZ', warning: 'Unrecognized callsign — ZZZZ used, specify in Field 18' }
}

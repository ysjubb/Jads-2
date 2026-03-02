// Platform-wide constants. Import from here — never hardcode strings elsewhere.

export const ENTITY_CODES = [
  // Core aviation regulators
  'DGCA', 'AAI',
  // Armed forces with active aviation/drone programs
  'IAF',   // Indian Air Force
  'ARMY',  // Indian Army Aviation
  'NAVY',  // Indian Navy
  // Defence R&D — active test flight programs
  'HAL',   // Hindustan Aeronautics Limited
  'ADA',   // Aeronautical Development Agency (Tejas, UAVs)
  'DRDO',  // Defence R&D Organisation (drone programs)
  'ISRO',  // Indian Space Research Organisation
  // Paramilitary with drone/aviation programs
  'BSF',   // Border Security Force
  'CRPF',  // Central Reserve Police Force
  'CISF',  // Central Industrial Security Force
  'NSG',   // National Security Guard
  'CUST',  // Indian Customs
  'SPF',   // Special Protection Force
  // Intelligence / security
  'CBI', 'IB', 'RAW', 'NTRO', 'NDRF', 'SPG',
  // Administration
  'MOD',
] as const

export type EntityCode = typeof ENTITY_CODES[number]

export const FIR_CODES = ['VABB', 'VIDF', 'VECC', 'VOMF'] as const
export type FirCode = typeof FIR_CODES[number]

export const NPNT_CLASSIFICATIONS = ['GREEN', 'YELLOW', 'RED'] as const
export type NpntClassification = typeof NPNT_CLASSIFICATIONS[number]

// OTP config
export const OTP_EXPIRY_MINUTES = 10
export const OTP_MAX_ATTEMPTS   = 3
export const BCRYPT_ROUNDS      = 12

// Session durations
export const USER_SESSION_HOURS  = 8
export const ADMIN_SESSION_HOURS = 2

// Aadhaar reverification
export const AADHAAR_REVERIFY_DAYS = 90

// Annual reconfirmation for special users
export const SPECIAL_USER_RECONFIRM_DAYS = 365

// Chain hash algorithm
export const CHAIN_HASH_ALGO  = 'SHA-256'
export const MISSION_INIT_PREFIX = 'MISSION_INIT'

// Telemetry payload size (bytes)
export const CANONICAL_PAYLOAD_BYTES = 96
export const CANONICAL_HEX_LENGTH    = 192  // 96 * 2

// AFMLU IDs (10 regional AFMLUs in India)
export const AFMLU_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

// India FIR definitions
export const INDIA_FIRS = {
  DELHI:   { icao: 'VIDF', name: 'Delhi FIR' },
  MUMBAI:  { icao: 'VABB', name: 'Mumbai FIR' },
  KOLKATA: { icao: 'VECC', name: 'Kolkata FIR' },
  CHENNAI: { icao: 'VOMF', name: 'Chennai FIR' },
} as const

// Major Indian aerodromes for METAR polling (12 ICAO codes)
export const MAJOR_AERODROME_ICAOS = [
  'VIDP', 'VABB', 'VOMM', 'VECC', 'VOBL', 'VOHB',
  'VAAH', 'VOGO', 'VOCL', 'VIBN', 'VORY', 'VIPT',
] as const

// METAR cache
export const METAR_CACHE_MINUTES = 60   // isStale if older than this
export const METAR_POLL_INTERVAL = 30   // minutes between polls

// ── Flight plan / airspace constants ──────────────────────────────────────
export const RVSM_LOWER_FL                 = 290
export const RVSM_UPPER_FL                 = 410
export const TRANSITION_ALTITUDE_DEFAULT_FT = 9000

// Geodesic
export const EARTH_RADIUS_NM         = 3440.065   // Must not be changed
export const MACH_TO_KTAS_AT_FL350   = 666.739    // Standard ISA FL350 approximation
export const KMH_TO_KTAS             = 1.0 / 1.852

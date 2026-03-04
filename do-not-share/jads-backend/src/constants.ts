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

// ── DGCA UAS Rules 2021 — Drone Weight Categories ──────────────────────────
// Determines regulatory requirements: NPNT gate, UIN, permission artefact
export const DRONE_WEIGHT_CATEGORIES = ['NANO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN'] as const
export type DroneWeightCategory = typeof DRONE_WEIGHT_CATEGORIES[number]

// Weight thresholds in grams
export const CATEGORY_WEIGHT_LIMITS = {
  NANO:   { maxGrams: 250,    label: '< 250g' },
  MICRO:  { maxGrams: 2000,   label: '250g – 2kg' },
  SMALL:  { maxGrams: 25000,  label: '2kg – 25kg' },
  MEDIUM: { maxGrams: 150000, label: '25kg – 150kg' },
  LARGE:  { maxGrams: Infinity, label: '> 150kg' },
} as const

// Category-specific regulatory requirements per DGCA UAS Rules 2021
export const CATEGORY_COMPLIANCE_RULES = {
  NANO: {
    npntRequired:         false,   // exempt from NPNT
    uinRequired:          false,   // no UIN needed
    nanoAckRequired:      true,    // nano drone acknowledgement number only
    permissionArtefact:   false,   // no PA needed in GREEN zone
    maxAglFt:             400,     // still limited to 400ft AGL
    pilotLicenseRequired: false,
    remoteIdRequired:     false,
    insuranceRequired:    false,
  },
  MICRO: {
    npntRequired:         true,    // NPNT in YELLOW zones only
    uinRequired:          true,    // simplified UIN registration
    nanoAckRequired:      false,
    permissionArtefact:   false,   // not needed in GREEN zones
    maxAglFt:             400,
    pilotLicenseRequired: false,   // no pilot license for micro
    remoteIdRequired:     true,
    insuranceRequired:    true,    // third-party insurance required
  },
  SMALL: {
    npntRequired:         true,    // full NPNT compliance
    uinRequired:          true,    // full UIN registration
    nanoAckRequired:      false,
    permissionArtefact:   true,    // PA required in YELLOW zones
    maxAglFt:             400,
    pilotLicenseRequired: true,    // remote pilot license required
    remoteIdRequired:     true,
    insuranceRequired:    true,
  },
  MEDIUM: {
    npntRequired:         true,
    uinRequired:          true,    // UIN + type certificate
    nanoAckRequired:      false,
    permissionArtefact:   true,
    maxAglFt:             400,
    pilotLicenseRequired: true,
    remoteIdRequired:     true,
    insuranceRequired:    true,
  },
  LARGE: {
    npntRequired:         true,
    uinRequired:          true,    // treated like manned aircraft
    nanoAckRequired:      false,
    permissionArtefact:   true,
    maxAglFt:             400,
    pilotLicenseRequired: true,
    remoteIdRequired:     true,
    insuranceRequired:    true,
  },
  UNKNOWN: {
    npntRequired:         true,    // default to strictest
    uinRequired:          true,
    nanoAckRequired:      false,
    permissionArtefact:   true,
    maxAglFt:             400,
    pilotLicenseRequired: true,
    remoteIdRequired:     true,
    insuranceRequired:    true,
  },
} as const

// Derive category from weight in grams
export function categorizeByWeight(grams: number): DroneWeightCategory {
  if (grams < 250)    return 'NANO'
  if (grams < 2000)   return 'MICRO'
  if (grams < 25000)  return 'SMALL'
  if (grams < 150000) return 'MEDIUM'
  return 'LARGE'
}

// ── Manufacturer Push Sources ──────────────────────────────────────────────
export const MANUFACTURER_PUSH_SOURCES = [
  'DJI', 'AUTEL', 'PARROT', 'SKYDIO', 'IZI', 'ASTERIA', 'THROTTLE', 'GENERIC'
] as const
export type ManufacturerPushSource = typeof MANUFACTURER_PUSH_SOURCES[number]

export const PUSH_TYPES = ['REAL_TIME', 'DEFERRED'] as const
export type PushType = typeof PUSH_TYPES[number]

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

// ── Platform Scope Enforcement ──────────────────────────────────────────────
// JADS is a POST-FLIGHT FORENSIC system. It must NEVER be used for live
// monitoring, real-time command & control, or in-flight decision-making.
//
// Stages S1–S7 represent the post-flight forensic pipeline:
//   S1: Mission upload & ingestion (after drone has landed)
//   S2: Canonical serialization & CRC32 verification
//   S3: Hash chain integrity verification (I-1)
//   S4: ECDSA / PQC signature verification (device cert + ML-DSA-65)
//   S5: NTP & timestamp validation (I-2, I-9)
//   S6: Geofence & NPNT zone compliance check (I-6)
//   S7: Final forensic report generation & evidence ledger entry
//
// Hard scope boundary: the platform processes COMPLETED missions only.
// Any attempt to process live/in-progress telemetry is rejected at ingestion.
export const PLATFORM_SCOPE = {
  mode:        'POST_FLIGHT_FORENSIC' as const,
  description: 'Post-flight forensic audit only — no live monitoring, no real-time C2',
  stages:      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const,
  hardLocks: {
    REJECT_LIVE_TELEMETRY:    true,  // Ingestion rejects if mission.status !== COMPLETED
    REJECT_STREAMING_API:     true,  // No WebSocket / SSE telemetry streaming endpoints
    REJECT_REALTIME_COMMANDS: true,  // No command-to-drone relay capability
    REQUIRE_MISSION_END:      true,  // missionEndUtcMs must be set before forensic runs
  },
} as const

export type PlatformStage = typeof PLATFORM_SCOPE.stages[number]

/** Runtime guard — throws if any code attempts to bypass post-flight-only scope. */
export function assertPostFlightScope(missionStatus: string, missionEndUtcMs: string | null): void {
  if (missionStatus !== 'COMPLETED' && missionStatus !== 'COMPLETED_WITH_VIOLATIONS') {
    throw new Error(
      `SCOPE_VIOLATION: Platform is post-flight forensic only. ` +
      `Cannot process mission with status="${missionStatus}". ` +
      `Only COMPLETED or COMPLETED_WITH_VIOLATIONS missions are accepted.`
    )
  }
  if (!missionEndUtcMs) {
    throw new Error(
      'SCOPE_VIOLATION: missionEndUtcMs is required. ' +
      'Forensic verification uses missionEndUtcMs as the frozen compliance time anchor.'
    )
  }
}

// Geodesic
export const EARTH_RADIUS_NM         = 3440.065   // Must not be changed
export const MACH_TO_KTAS_AT_FL350   = 666.739    // Standard ISA FL350 approximation
export const KMH_TO_KTAS             = 1.0 / 1.852

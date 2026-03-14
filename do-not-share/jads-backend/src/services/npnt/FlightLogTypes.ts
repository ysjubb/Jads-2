/**
 * FP13 — Flight Log Types
 *
 * Type definitions for the NPNT flight log hash chain.
 *
 * Aligned with Digital Sky API contract:
 *   - DS entry types: TAKEOFF_OR_ARM, GEOFENCE_BREACH, TIME_BREACH, LAND_OR_DISARM
 *   - DS field names: Entry_type, TimeStamp, Longitude, Latitude, Altitude, CRC
 *   - DS timestamps: Unix seconds (not milliseconds)
 *   - DS log structure: { PermissionArtefact, previous_log_hash, LogEntries[] }
 */

// ── DS-Aligned Entry Types ──────────────────────────────────────────────

/**
 * Digital Sky entry types (4 values).
 * Maps: ARM+TAKEOFF → TAKEOFF_OR_ARM, LAND+DISARM → LAND_OR_DISARM
 */
export type DsFlightLogEntryType =
  | 'TAKEOFF_OR_ARM'
  | 'GEOFENCE_BREACH'
  | 'TIME_BREACH'
  | 'LAND_OR_DISARM';

/**
 * JADS internal entry types (superset of DS — 7 values).
 * Allows finer granularity internally; maps to DS types at adapter boundary.
 */
export type FlightLogEntryType =
  | 'ARM'
  | 'TAKEOFF'
  | 'POSITION'
  | 'GEOFENCE_BREACH'
  | 'TIME_BREACH'
  | 'LAND'
  | 'DISARM';

/**
 * Map JADS internal entry type → DS entry type.
 * POSITION entries have no DS equivalent (omitted from DS log).
 */
export function toDsEntryType(jadsType: FlightLogEntryType): DsFlightLogEntryType | null {
  switch (jadsType) {
    case 'ARM':
    case 'TAKEOFF':
      return 'TAKEOFF_OR_ARM';
    case 'LAND':
    case 'DISARM':
      return 'LAND_OR_DISARM';
    case 'GEOFENCE_BREACH':
      return 'GEOFENCE_BREACH';
    case 'TIME_BREACH':
      return 'TIME_BREACH';
    case 'POSITION':
      return null; // DS has no POSITION type — omit from DS log
  }
}

// ── DS Flight Log Format ────────────────────────────────────────────────

/**
 * A single entry in the DS flight log format.
 * Field names match DS exactly (PascalCase with underscore).
 */
export interface DsFlightLogEntry {
  Entry_type: DsFlightLogEntryType;
  TimeStamp: number;       // Unix seconds (NOT milliseconds)
  Longitude: number;       // WGS84 decimal degrees
  Latitude: number;        // WGS84 decimal degrees
  Altitude: number;        // Feet AGL
  CRC: number;             // CRC check value (0 if not computed)
}

/**
 * The complete DS flight log payload (submitted to Digital Sky).
 */
export interface DsFlightLog {
  /** Permission artefact UUID (links log to the approved flight) */
  PermissionArtefact: string;
  /** Base64 hash of the most recent flight log for this UIN (chain across flights) */
  previous_log_hash: string;
  /** The log entries */
  LogEntries: DsFlightLogEntry[];
}

// ── JADS Internal Flight Log Entry ──────────────────────────────────────

/**
 * JADS internal flight log entry — richer than DS format.
 * Includes speed, heading, drone UIN, flight ID, sequence number,
 * hash chain fields, and cryptographic signatures.
 */
export interface FlightLogEntry {
  entryType: FlightLogEntryType;
  timestamp: number;         // Unix milliseconds UTC (JADS internal)
  latitude: number;          // WGS84 decimal degrees
  longitude: number;         // WGS84 decimal degrees
  altitudeMeters: number;    // AGL meters (JADS internal — convert to feet for DS)
  speedMps: number;          // metres per second
  headingDeg: number;        // 0–360 degrees
  droneUIN: string;          // UIN from NPNT PA
  flightId: string;          // matches NPNT PA FlightID
  sequenceNumber: number;    // monotonically increasing within flight
  previousLogHash: string;   // SHA-256 hex of previous entry JSON
  entryHash: string;         // SHA-256 hex of THIS entry
  signature: string;         // RSA-SHA256 base64 signature of entryHash
  mlDsaSignature?: string;   // ML-DSA-65 base64 signature (FP15 hybrid)
}

// ── Chain Verification ─────────────────────────────────────────────────

export interface ChainVerificationResult {
  valid: boolean;
  entriesVerified: number;
  brokenLinkAt?: number;       // sequence number where chain breaks
  invalidSignatureAt?: number; // sequence number with bad signature
  errors: string[];
}

// ── Partial entry (for addEntry input) ─────────────────────────────────

export type FlightLogEntryInput = Omit<
  FlightLogEntry,
  'previousLogHash' | 'entryHash' | 'signature' | 'sequenceNumber' | 'mlDsaSignature'
>;

// ── Conversion: JADS chain → DS flight log ──────────────────────────────

/**
 * Convert a JADS internal flight log chain to DS submission format.
 *
 * @param chain           The JADS internal entries
 * @param permissionArtefactId  The PA UUID for this flight
 * @param previousLogHash      Hash of the drone's previous flight log (or empty for first flight)
 */
export function toDsFlightLog(
  chain: FlightLogEntry[],
  permissionArtefactId: string,
  previousLogHash: string
): DsFlightLog {
  const metersToFeet = (m: number) => Math.round(m * 3.28084);

  const dsEntries: DsFlightLogEntry[] = [];

  for (const entry of chain) {
    const dsType = toDsEntryType(entry.entryType);
    if (dsType === null) continue; // Skip POSITION entries (no DS equivalent)

    dsEntries.push({
      Entry_type: dsType,
      TimeStamp: Math.floor(entry.timestamp / 1000), // ms → seconds
      Longitude: entry.longitude,
      Latitude: entry.latitude,
      Altitude: metersToFeet(entry.altitudeMeters),
      CRC: 0, // CRC computation per DS spec (0 placeholder)
    });
  }

  return {
    PermissionArtefact: permissionArtefactId,
    previous_log_hash: previousLogHash || '',
    LogEntries: dsEntries,
  };
}

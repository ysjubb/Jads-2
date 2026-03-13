/**
 * FP13 — Flight Log Types
 *
 * Type definitions for the NPNT flight log hash chain.
 */

// ── Flight Log Entry ───────────────────────────────────────────────────

export interface FlightLogEntry {
  entryType: FlightLogEntryType;
  timestamp: number;         // Unix milliseconds UTC
  latitude: number;          // WGS84 decimal degrees
  longitude: number;         // WGS84 decimal degrees
  altitudeMeters: number;    // AGL meters
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

export type FlightLogEntryType =
  | 'ARM'
  | 'TAKEOFF'
  | 'POSITION'
  | 'GEOFENCE_BREACH'
  | 'TIME_BREACH'
  | 'LAND'
  | 'DISARM';

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

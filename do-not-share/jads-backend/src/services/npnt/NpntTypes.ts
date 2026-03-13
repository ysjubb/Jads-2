/**
 * FP11 — NPNT Types
 *
 * Type definitions for the DGCA v1.2 NPNT (No Permission No Takeoff)
 * Permission Artefact system.
 */

// ── Permission Artefact Input ──────────────────────────────────────────

export interface NpntPermissionInput {
  flightId: string;             // Unique flight ID, e.g. JADS-2026-00001
  operatorId: string;           // Digital Sky operator ID
  pilotId: string;              // Digital Sky pilot ID
  uaRegistrationNumber: string; // UIN from Digital Sky (UA + 12 alphanumeric)
  flightPurpose: NpntFlightPurpose;
  payloadType: NpntPayloadType;
  payloadMake: string;
  payloadModel: string;
  payloadWeight: number;        // grams
  droneMake: string;
  droneModel: string;
  droneCategory: NpntDroneCategory;
  droneClass: NpntDroneClass;
  flightStartTime: Date;        // Will be ISO 8601 with +05:30 offset
  flightEndTime: Date;
  maxAltitudeMeters: number;    // AGL, not MSL
  frequencies: string[];        // e.g. ['2.4 GHz', '5.8 GHz']
  flyArea: Array<{ latitude: number; longitude: number }>; // min 3 points, must be closed
}

// ── Enums ──────────────────────────────────────────────────────────────

export type NpntFlightPurpose =
  | 'AGRICULTURE'
  | 'SURVEY'
  | 'SURVEILLANCE'
  | 'DELIVERY'
  | 'PHOTOGRAPHY'
  | 'RESEARCH'
  | 'OTHERS';

export type NpntPayloadType =
  | 'CAMERA'
  | 'SENSOR'
  | 'SPRAY'
  | 'OTHER';

export type NpntDroneCategory =
  | 'NANO'    // < 250g
  | 'MICRO'   // 250g - 2kg
  | 'SMALL'   // 2 - 25kg
  | 'MEDIUM'  // 25 - 150kg
  | 'LARGE';  // > 150kg

export type NpntDroneClass =
  | 'NTA'  // Non-Type Approved
  | 'TA';  // Type Approved

// ── Signed PA Output ───────────────────────────────────────────────────

export interface SignedPermissionArtefact {
  /** The complete signed XML string */
  signedXml: string;
  /** Flight ID embedded in the PA */
  flightId: string;
  /** SHA-256 digest of the unsigned PA content */
  contentDigest: string;
  /** Certificate CN used for signing */
  signerCN: string;
  /** Timestamp when PA was generated */
  generatedAt: Date;
}

// ── Signature Verification ─────────────────────────────────────────────

export interface SignatureVerificationResult {
  valid: boolean;
  errors: string[];
  signerCN: string;
  signerIssuer: string;
  certExpiry: Date;
  digestAlgorithm: string;
  signatureAlgorithm: string;
}

// ── Flight ID Generator ────────────────────────────────────────────────

let _flightIdCounter = 0;

/**
 * Generate a sequential JADS flight ID: JADS-YYYY-NNNNN
 */
export function generateFlightId(): string {
  _flightIdCounter++;
  const year = new Date().getFullYear();
  const seq = _flightIdCounter.toString().padStart(5, '0');
  return `JADS-${year}-${seq}`;
}

/** Reset counter (for testing) */
export function resetFlightIdCounter(n = 0): void {
  _flightIdCounter = n;
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Validate an NPNT permission input — returns errors array (empty = valid).
 */
export function validateNpntInput(input: NpntPermissionInput): string[] {
  const errors: string[] = [];

  // Time validation
  if (input.flightStartTime >= input.flightEndTime) {
    errors.push('flightStartTime must be before flightEndTime');
  }

  // Fly area validation
  if (input.flyArea.length < 3) {
    errors.push('flyArea must have at least 3 coordinate pairs');
  }

  // Check coordinates are valid WGS84
  for (let i = 0; i < input.flyArea.length; i++) {
    const pt = input.flyArea[i];
    if (pt.latitude < -90 || pt.latitude > 90) {
      errors.push(`flyArea[${i}].latitude ${pt.latitude} is outside WGS84 range (-90 to +90)`);
    }
    if (pt.longitude < -180 || pt.longitude > 180) {
      errors.push(`flyArea[${i}].longitude ${pt.longitude} is outside WGS84 range (-180 to +180)`);
    }
  }

  // Altitude validation
  if (input.maxAltitudeMeters <= 0) {
    errors.push('maxAltitudeMeters must be > 0');
  }
  if (input.maxAltitudeMeters > 400) {
    errors.push('maxAltitudeMeters exceeds DGCA limit of 400m for most categories');
  } else if (input.maxAltitudeMeters > 120) {
    // Warning level — not an error
  }

  // UIN format
  if (!/^UA[A-Z0-9]{12}$/i.test(input.uaRegistrationNumber)) {
    errors.push(`UIN format invalid: '${input.uaRegistrationNumber}' (expected UA + 12 alphanumeric)`);
  }

  // Frequencies
  if (input.frequencies.length === 0) {
    errors.push('At least one frequency must be specified');
  }

  return errors;
}

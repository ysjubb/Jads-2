/**
 * FP11 — NPNT Types
 *
 * Type definitions for the DGCA NPNT (No Permission No Takeoff)
 * Permission Artefact system.
 *
 * Aligned with Digital Sky API contract (iSPIRT reference implementation).
 * Key DS alignment:
 *   - Altitude in feet AGL (DS maxAltitude field, MAXIMUM_FLIGHT_AGL_IN_FT = 400)
 *   - Payload weight in kilograms (DS payloadWeightInKg)
 *   - Zone colors: GREEN, AMBER, RED (not YELLOW)
 *   - Auto-approval: NANO ≤50ft GREEN, MICRO ≤200ft GREEN
 *   - Flight window: 05:30–19:30 IST
 *   - Advance booking: 1–5 days
 *   - Max fly area: π sq km
 */

// ── Permission Artefact Input ──────────────────────────────────────────

export interface NpntPermissionInput {
  /** Digital Sky operator business identifier (UUID) */
  operatorId: string;
  /** Digital Sky pilot business identifier (UUID) */
  pilotId: string;
  /** Pilot validity end date — 'NA' if no expiry. DS uses validTo attribute. */
  pilotValidTo: string;
  /** UIN (Unique Identification Number) from Digital Sky — e.g. UA + 12 alphanumeric */
  uaRegistrationNumber: string;
  /** Flight purpose — short description */
  flightPurpose: NpntFlightPurpose;
  /** Payload weight in kilograms (DS: payloadWeightInKg) */
  payloadWeightKg: number;
  /** Payload details — free text */
  payloadDetails: string;
  /** Drone category from DroneType */
  droneCategory: NpntDroneCategory;
  /** Flight start time */
  flightStartTime: Date;
  /** Flight end time */
  flightEndTime: Date;
  /**
   * Maximum altitude in feet AGL (Above Ground Level).
   * DS uses feet internally. MAXIMUM_FLIGHT_AGL_IN_FT = 400.
   */
  maxAltitudeFeetAGL: number;
  /** Geofence polygon vertices — min 3 points, auto-closed */
  flyArea: Array<{ latitude: number; longitude: number }>;

  // ── Optional recurrence fields (DS recurring flights) ──
  /** Quartz cron expression for recurring flights */
  recurrenceTimeExpression?: string;
  /** Expression type — currently only 'CRON_QUARTZ' */
  recurrenceTimeExpressionType?: 'CRON_QUARTZ';
  /** Duration of each recurring flight window in minutes */
  recurringTimeDurationInMinutes?: number;

  // ── Set by approval pipeline (not by applicant) ──
  /** FIC number — set by ATC approval stage */
  ficNumber?: string;
  /** ADC number — set by AFMLU approval stage */
  adcNumber?: string;
}

// ── Enums (aligned with Digital Sky) ────────────────────────────────────

export type NpntFlightPurpose =
  | 'AGRICULTURE'
  | 'SURVEY'
  | 'SURVEILLANCE'
  | 'DELIVERY'
  | 'PHOTOGRAPHY'
  | 'RESEARCH'
  | 'OTHERS';

export type NpntDroneCategory =
  | 'NANO'    // < 250g
  | 'MICRO'   // 250g – 2kg
  | 'SMALL'   // 2 – 25kg
  | 'MEDIUM'  // 25 – 150kg
  | 'LARGE';  // > 150kg

// ── DS Application Status (full pipeline) ───────────────────────────────

export type DsApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPROVEDBYATC'
  | 'APPROVEDBYAFMLU'
  | 'REJECTEDBYAFMLU'
  | 'REJECTEDBYATC';

// ── DS Zone Types (GREEN/AMBER/RED — NOT YELLOW) ───────────────────────

export type DsZoneColor = 'GREEN' | 'AMBER' | 'RED';

// ── Signed PA Output ───────────────────────────────────────────────────

export interface SignedPermissionArtefact {
  /** The complete signed XML string */
  signedXml: string;
  /** Operator ID embedded in the PA */
  operatorId: string;
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

// ── DS Hardcoded Thresholds ────────────────────────────────────────────

export const DS_THRESHOLDS = {
  /** Flight operations start hour (IST) */
  SUNRISE_HOUR: 5,
  /** Flight operations end hour (IST) */
  SUNSET_HOUR: 19,
  /** Minutes added to sunrise/sunset hours */
  SUNRISE_SUNSET_MINUTE: 30,
  /** Minimum days before flight to apply */
  MINIMUM_DAYS_BEFORE_PERMISSION_APPLY: 1,
  /** Maximum days before flight to apply */
  MAXIMUM_DAYS_FOR_PERMISSION_APPLY: 5,
  /** Absolute altitude ceiling for all drones (feet AGL) */
  MAXIMUM_FLIGHT_AGL_IN_FT: 400,
  /** Auto-approval ceiling for MICRO drones (feet AGL) */
  MAXIMUM_AUTO_PERM_MICRO_ALTITUDE_AGL_FT: 200,
  /** Auto-approval ceiling for NANO drones (feet AGL) */
  MAXIMUM_AUTO_PERM_NANO_ALTITUDE_AGL_FT: 50,
  /** Maximum fly area in square kilometers (π) */
  MAXIMUM_FLIGHT_AREA_SQ_KM: Math.PI,
} as const;

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

// ── Validation (aligned with Digital Sky thresholds) ────────────────────

/**
 * Validate an NPNT permission input — returns errors array (empty = valid).
 * Applies Digital Sky hardcoded thresholds.
 */
export function validateNpntInput(input: NpntPermissionInput): string[] {
  const errors: string[] = [];

  // ── Time validation ──
  if (input.flightStartTime >= input.flightEndTime) {
    errors.push('flightStartTime must be before flightEndTime');
  }

  // ── DS: Flight time window 05:30–19:30 IST ──
  const startIST = toISTHourMinute(input.flightStartTime);
  const endIST = toISTHourMinute(input.flightEndTime);

  const earliestMinutes = DS_THRESHOLDS.SUNRISE_HOUR * 60 + DS_THRESHOLDS.SUNRISE_SUNSET_MINUTE; // 330
  const latestMinutes = DS_THRESHOLDS.SUNSET_HOUR * 60 + DS_THRESHOLDS.SUNRISE_SUNSET_MINUTE;   // 1170

  if (startIST < earliestMinutes) {
    errors.push(`Flight start time is before 05:30 IST (DS daylight rule)`);
  }
  if (endIST > latestMinutes) {
    errors.push(`Flight end time is after 19:30 IST (DS daylight rule)`);
  }

  // ── DS: Advance booking 1–5 days ──
  const nowMs = Date.now();
  const startMs = input.flightStartTime.getTime();
  const daysAhead = (startMs - nowMs) / (24 * 60 * 60 * 1000);

  if (daysAhead < DS_THRESHOLDS.MINIMUM_DAYS_BEFORE_PERMISSION_APPLY) {
    errors.push(`Must apply at least ${DS_THRESHOLDS.MINIMUM_DAYS_BEFORE_PERMISSION_APPLY} day(s) before flight`);
  }
  if (daysAhead > DS_THRESHOLDS.MAXIMUM_DAYS_FOR_PERMISSION_APPLY) {
    errors.push(`Cannot apply more than ${DS_THRESHOLDS.MAXIMUM_DAYS_FOR_PERMISSION_APPLY} days ahead`);
  }

  // ── Fly area validation ──
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

  // ── Altitude validation (feet AGL) ──
  if (input.maxAltitudeFeetAGL <= 0) {
    errors.push('maxAltitudeFeetAGL must be > 0');
  }
  if (input.maxAltitudeFeetAGL > DS_THRESHOLDS.MAXIMUM_FLIGHT_AGL_IN_FT) {
    errors.push(`maxAltitudeFeetAGL ${input.maxAltitudeFeetAGL} exceeds DS limit of ${DS_THRESHOLDS.MAXIMUM_FLIGHT_AGL_IN_FT}ft`);
  }

  // ── Payload weight (kg) ──
  if (input.payloadWeightKg < 0) {
    errors.push('payloadWeightKg must be >= 0');
  }

  // ── UIN format ──
  if (!/^UA[A-Z0-9]{12}$/i.test(input.uaRegistrationNumber)) {
    errors.push(`UIN format invalid: '${input.uaRegistrationNumber}' (expected UA + 12 alphanumeric)`);
  }

  return errors;
}

// ── Auto-Approval Decision Logic ────────────────────────────────────────

export interface AutoApprovalResult {
  autoApproved: boolean;
  reason: string;
  /** If blocked, the blocking zone color */
  blockedByZone?: DsZoneColor;
  /** Whether UAOP is required for this category/zone combination */
  requiresUAOP: boolean;
}

/**
 * Evaluate whether a flight permission can be auto-approved.
 *
 * DS Decision Tree:
 *   1. Fly area must be WITHIN a GREEN zone
 *   2. Fly area must NOT intersect RED zone
 *   3. If intersects AMBER → manual, requires UAOP for SMALL+
 *   4. NANO ≤ 50ft AGL in GREEN → auto-approved
 *   5. MICRO ≤ 200ft AGL in GREEN → auto-approved
 *   6. SMALL/MEDIUM/LARGE → always manual, requires UAOP
 *
 * @param category  Drone category
 * @param altitudeFt  Max altitude in feet AGL
 * @param withinGreen  Whether fly area is entirely within a GREEN zone
 * @param intersectsAmber  Whether fly area intersects any AMBER zone
 * @param intersectsRed  Whether fly area intersects any RED zone
 */
export function evaluateAutoApproval(
  category: NpntDroneCategory,
  altitudeFt: number,
  withinGreen: boolean,
  intersectsAmber: boolean,
  intersectsRed: boolean
): AutoApprovalResult {
  // RED zone → blocked
  if (intersectsRed) {
    return {
      autoApproved: false,
      reason: 'Fly area intersects RED zone — flight prohibited',
      blockedByZone: 'RED',
      requiresUAOP: false,
    };
  }

  // Must be within GREEN
  if (!withinGreen) {
    return {
      autoApproved: false,
      reason: 'Fly area is not within a GREEN zone',
      requiresUAOP: false,
    };
  }

  // AMBER intersection → manual approval, UAOP required for SMALL+
  if (intersectsAmber) {
    const needsUAOP = category === 'SMALL' || category === 'MEDIUM' || category === 'LARGE';
    return {
      autoApproved: false,
      reason: 'Fly area intersects AMBER zone — requires manual approval',
      blockedByZone: 'AMBER',
      requiresUAOP: needsUAOP,
    };
  }

  // GREEN only — check category + altitude thresholds
  switch (category) {
    case 'NANO':
      if (altitudeFt <= DS_THRESHOLDS.MAXIMUM_AUTO_PERM_NANO_ALTITUDE_AGL_FT) {
        return {
          autoApproved: true,
          reason: 'Self approval, within green zone (NANO ≤ 50ft)',
          requiresUAOP: false,
        };
      }
      return {
        autoApproved: false,
        reason: `NANO altitude ${altitudeFt}ft exceeds auto-approval ceiling of ${DS_THRESHOLDS.MAXIMUM_AUTO_PERM_NANO_ALTITUDE_AGL_FT}ft`,
        requiresUAOP: false,
      };

    case 'MICRO':
      if (altitudeFt <= DS_THRESHOLDS.MAXIMUM_AUTO_PERM_MICRO_ALTITUDE_AGL_FT) {
        return {
          autoApproved: true,
          reason: 'Self approval, within green zone (MICRO ≤ 200ft)',
          requiresUAOP: false,
        };
      }
      return {
        autoApproved: false,
        reason: `MICRO altitude ${altitudeFt}ft exceeds auto-approval ceiling of ${DS_THRESHOLDS.MAXIMUM_AUTO_PERM_MICRO_ALTITUDE_AGL_FT}ft`,
        requiresUAOP: false,
      };

    case 'SMALL':
    case 'MEDIUM':
    case 'LARGE':
      return {
        autoApproved: false,
        reason: `${category} drones require manual approval and approved UAOP`,
        requiresUAOP: true,
      };

    default:
      return {
        autoApproved: false,
        reason: `Unknown drone category: ${category}`,
        requiresUAOP: false,
      };
  }
}

// ── Helper: IST time-of-day ────────────────────────────────────────────

/**
 * Returns total minutes since midnight IST for a given Date.
 */
function toISTHourMinute(date: Date): number {
  // IST is UTC+05:30
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
}

// ── Legacy Compatibility Aliases ────────────────────────────────────────

/** @deprecated Use NpntDroneCategory instead */
export type NpntDroneClass = 'NTA' | 'TA';

/** @deprecated Use NpntPayloadType from original code — now using DS payloadDetails string */
export type NpntPayloadType = 'CAMERA' | 'SENSOR' | 'SPRAY' | 'OTHER';

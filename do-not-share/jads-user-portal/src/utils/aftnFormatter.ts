/**
 * AFTN (Aeronautical Fixed Telecommunication Network) Field 7 & Field 18 formatting
 *
 * ICAO Flight Plan callsign rules:
 * - Field 7: Aircraft Identification (max 7 chars, A-Z0-9 only)
 * - Registration-based: Remove hyphens (VT-ABC → VTABC)
 * - Airline + flight number: ICAO 3LD + up to 4 digits (IGO1234)
 * - Numeric-only callsigns: Prefix with Q to avoid confusion (Q1234)
 *   Two variants: Q + raw digits, or Q + zero-padded to 4 digits
 * - IFC prefix = Indian Air Force (military) — triggers military-specific Field 8
 */

export interface Field7Result {
  callsign: string;
  isMilitary: boolean;
  isRegistration: boolean;
  warnings: string[];
}

/**
 * Format a callsign for ICAO Flight Plan Field 7.
 *
 * Handles:
 * - VT-XXX registration → strips hyphen
 * - ICAO 3LD + flight number → validated and trimmed
 * - Numeric-only → Q-prefix (two variants available)
 * - IFC prefix → flagged as military
 */
export function formatField7(
  input: string,
  options?: { zeroPadNumeric?: boolean }
): Field7Result {
  const warnings: string[] = [];
  let callsign = input.trim().toUpperCase();

  // Remove spaces and hyphens
  callsign = callsign.replace(/[\s-]/g, '');

  // Check if it's a pure registration (starts with VT or other 2-letter nationality mark)
  const isRegistration = /^VT[A-Z]{3}$/.test(callsign) || /^[A-Z]{2}[A-Z0-9]{1,5}$/.test(callsign);

  // Detect military (Indian Air Force)
  const isMilitary = callsign.startsWith('IFC');

  // Handle numeric-only callsign — needs Q prefix
  if (/^\d+$/.test(callsign)) {
    if (options?.zeroPadNumeric) {
      callsign = 'Q' + callsign.padStart(4, '0');
    } else {
      callsign = 'Q' + callsign;
    }
    warnings.push('Numeric callsign — Q-prefix applied per ICAO convention');
  }

  // Validate characters: A-Z and 0-9 only
  if (!/^[A-Z0-9]+$/.test(callsign)) {
    warnings.push('Callsign contains invalid characters — only A-Z and 0-9 allowed');
    callsign = callsign.replace(/[^A-Z0-9]/g, '');
  }

  // Enforce 7-character maximum
  if (callsign.length > 7) {
    warnings.push(`Callsign truncated from ${callsign.length} to 7 characters`);
    callsign = callsign.slice(0, 7);
  }

  if (callsign.length === 0) {
    warnings.push('Empty callsign after formatting');
  }

  return { callsign, isMilitary, isRegistration, warnings };
}

/**
 * Validate a formatted Field 7 callsign.
 */
export function validateField7(callsign: string): { valid: boolean; error?: string } {
  if (!callsign || callsign.length === 0) {
    return { valid: false, error: 'Callsign is required' };
  }
  if (callsign.length > 7) {
    return { valid: false, error: 'Callsign exceeds 7-character maximum' };
  }
  if (!/^[A-Z0-9]+$/.test(callsign)) {
    return { valid: false, error: 'Callsign must contain only A-Z and 0-9' };
  }
  return { valid: true };
}

// --- Field 18 (Other Information) ---

export interface Field18Data {
  /** STS/ — Reason for special handling (e.g., MEDEVAC, FFR, HEAD) */
  sts?: string;
  /** PBN/ — Performance-based navigation capability */
  pbn?: string;
  /** NAV/ — Significant navigation data */
  nav?: string;
  /** DAT/ — Data link capability */
  dat?: string;
  /** COM/ — Communication capability */
  com?: string;
  /** SUR/ — Surveillance capability */
  sur?: string;
  /** DEP/ — Departure aerodrome (if ZZZZ in Field 13) */
  dep?: string;
  /** DEST/ — Destination aerodrome (if ZZZZ in Field 16) */
  dest?: string;
  /** DOF/ — Date of flight (YYMMDD) */
  dof?: string;
  /** REG/ — Aircraft registration (with hyphen) */
  reg?: string;
  /** EET/ — Estimated elapsed time to FIR boundaries */
  eet?: string;
  /** SEL/ — SELCAL code */
  sel?: string;
  /** OPR/ — Operator name */
  opr?: string;
  /** ORGN/ — Originator AFTN address */
  orgn?: string;
  /** PER/ — Aircraft performance category */
  per?: string;
  /** RMK/ — Remarks (free text) */
  rmk?: string;
  /** RIF/ — Route to revised destination */
  rif?: string;
  /** RVR/ — RVR requirements */
  rvr?: string;
  /** CODE/ — Aircraft address (Mode S, hex) */
  code?: string;
  /** DLE/ — Delay en route */
  dle?: string;
  /** TYP/ — Aircraft type (if ZZZZ in Field 9) */
  typ?: string;
}

/**
 * Build ICAO Field 18 string from structured data.
 * Follows ICAO Doc 4444 format: each item as KEY/VALUE separated by spaces.
 */
export function buildField18(data: Field18Data): string {
  const parts: string[] = [];

  // ICAO-prescribed order
  const fields: { key: string; value: string | undefined }[] = [
    { key: 'STS', value: data.sts },
    { key: 'PBN', value: data.pbn },
    { key: 'NAV', value: data.nav },
    { key: 'COM', value: data.com },
    { key: 'DAT', value: data.dat },
    { key: 'SUR', value: data.sur },
    { key: 'DEP', value: data.dep },
    { key: 'DEST', value: data.dest },
    { key: 'DOF', value: data.dof },
    { key: 'REG', value: data.reg },
    { key: 'EET', value: data.eet },
    { key: 'SEL', value: data.sel },
    { key: 'TYP', value: data.typ },
    { key: 'CODE', value: data.code },
    { key: 'DLE', value: data.dle },
    { key: 'OPR', value: data.opr },
    { key: 'ORGN', value: data.orgn },
    { key: 'PER', value: data.per },
    { key: 'RIF', value: data.rif },
    { key: 'RVR', value: data.rvr },
    { key: 'RMK', value: data.rmk },
  ];

  for (const { key, value } of fields) {
    if (value && value.trim()) {
      parts.push(`${key}/${value.trim()}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0';
}

/**
 * Auto-populate Field 18 from flight plan data.
 * Fills REG, DOF, OPR, and PBN when data is available.
 */
export function autoPopulateField18(flightPlan: {
  registration?: string;
  departureDate?: Date;
  operatorName?: string;
  pbnCapability?: string;
  selcal?: string;
  modeSCode?: string;
}): Field18Data {
  const data: Field18Data = {};

  if (flightPlan.registration) {
    data.reg = flightPlan.registration.toUpperCase();
  }

  if (flightPlan.departureDate) {
    const d = flightPlan.departureDate;
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    data.dof = `${yy}${mm}${dd}`;
  }

  if (flightPlan.operatorName) {
    data.opr = flightPlan.operatorName.toUpperCase();
  }

  if (flightPlan.pbnCapability) {
    data.pbn = flightPlan.pbnCapability;
  }

  if (flightPlan.selcal) {
    data.sel = flightPlan.selcal.replace(/-/g, '').toUpperCase();
  }

  if (flightPlan.modeSCode) {
    data.code = flightPlan.modeSCode.toUpperCase();
  }

  return data;
}

/**
 * Detect if a Field 8 flight rules entry needs military-specific handling.
 * IFC-prefixed callsigns may use 'M' (military) flight rules.
 */
export function detectMilitaryField8(callsign: string): {
  suggestMilitary: boolean;
  note?: string;
} {
  const upper = callsign.toUpperCase().replace(/[\s-]/g, '');
  if (upper.startsWith('IFC')) {
    return {
      suggestMilitary: true,
      note: 'IFC callsign detected (Indian Air Force) — consider M (military) flight rules in Field 8',
    };
  }
  if (upper.startsWith('ICG')) {
    return {
      suggestMilitary: true,
      note: 'ICG callsign detected (Indian Coast Guard) — consider M (military) flight rules in Field 8',
    };
  }
  if (upper.startsWith('INV')) {
    return {
      suggestMilitary: true,
      note: 'INV callsign detected (Indian Navy) — consider M (military) flight rules in Field 8',
    };
  }
  return { suggestMilitary: false };
}

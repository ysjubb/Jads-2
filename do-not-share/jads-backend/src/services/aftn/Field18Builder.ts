/**
 * FP10 — Field 18 Complete Builder with All 20+ Ordered Indicators + STS
 *
 * Implements the complete ICAO Doc 4444 Field 18 (Other Information)
 * builder with all indicators in prescribed order, the complete STS/
 * special handling code table, and Field 19 supplementary information.
 */

// ── STS Codes ──────────────────────────────────────────────────────────

export const STS_CODES: Record<string, { meaning: string; notes: string }> = {
  ALTRV:   { meaning: 'Altitude reservation',                notes: 'Coordinated altitude block' },
  ATFMX:   { meaning: 'Exempt from ATFM measures',           notes: 'Military exemption common' },
  FFR:     { meaning: 'Firefighting flight',                  notes: 'Priority handling, no delays' },
  FLTCK:   { meaning: 'Flight check for calibration',         notes: 'Requires ATC advance notice' },
  HAZMAT:  { meaning: 'Dangerous goods on board',             notes: 'Requires DG declaration' },
  HEAD:    { meaning: 'Head of State/Government',             notes: 'Maximum priority' },
  HOSP:    { meaning: 'Medical/hospital flight',              notes: 'Priority ATC handling' },
  HUM:     { meaning: 'Humanitarian flight',                  notes: 'Priority handling' },
  MARSA:   { meaning: 'Military under mil auth separation',   notes: 'Military responsibility for separation' },
  MEDEVAC: { meaning: 'Emergency medical evacuation',         notes: 'Immediate priority' },
  NONRVSM: { meaning: 'Not RVSM approved in RVSM airspace',  notes: 'Conflicts with W in Field 10a' },
  SAR:     { meaning: 'Search and rescue',                    notes: 'Priority handling' },
  STATE:   { meaning: 'State/military aircraft (not HEAD)',    notes: 'Protocol handling' },
};

/** Valid STS code names */
export const VALID_STS_CODES = Object.keys(STS_CODES);

// ── Field 18 Interface ─────────────────────────────────────────────────

export interface Field18 {
  sts?: string[];         // STS codes (space-separated in output)
  pbn?: string;           // PBN codes string (max 16 chars / 8 entries)
  nav?: string;           // NAV supplement
  com?: string;           // COM supplement
  dat?: string;           // DAT applications
  sur?: string;           // SUR supplement (ADS-B detail)
  dep?: string;           // DEP details if ADEP=ZZZZ
  dest?: string;          // DEST details if ADES=ZZZZ
  dof?: string;           // YYMMDD
  reg?: string;           // registration
  eet?: string[];         // FIR/point EET entries (e.g. ['VIDF0025','VABF0055'])
  sel?: string;           // SELCAL code
  typ?: string;           // aircraft type name (if Field 9 = ZZZZ)
  code?: string;          // Mode S hex code
  dle?: string[];         // delay entries (e.g. ['IGOLU0030','GOVID0015'])
  opr?: string;           // operator ICAO designator or name
  orgn?: string;          // originator if different from AFTN sender
  per?: string;           // performance category A/B/C/D/E
  altn?: string;          // alternate details if Field 16 alt = ZZZZ
  ralt?: string;          // en-route alternate aerodrome(s)
  talt?: string;          // take-off alternate aerodrome
  rif?: string;           // routing to revised destination
  rmk?: string;           // remarks
}

// ── Field 19 Interface ─────────────────────────────────────────────────

export interface Field19 {
  endurance?: string;     // E/HHMM — fuel on board as hours
  personsOnBoard?: string; // P/nnn or P/TBE
  emergencyRadio?: string; // R/UVE combination
  survival?: string;       // S/PDMJ combination
  jackets?: string;        // J/LFUV combination
  dinghies?: string;       // D/nn cc colour
  aircraftColour?: string; // A/free text
  remarks?: string;        // N/free text or N/N
  pilotInCommand?: string; // C/name and licence
}

// ── Indicator ordering ─────────────────────────────────────────────────

/**
 * ICAO Doc 4444 prescribed indicator order for Field 18.
 * Indicators MUST appear in this order if present.
 */
const FIELD18_ORDER: (keyof Field18)[] = [
  'sts', 'pbn', 'nav', 'com', 'dat', 'sur',
  'dep', 'dest', 'dof', 'reg', 'eet', 'sel',
  'typ', 'code', 'dle', 'opr', 'orgn', 'per',
  'altn', 'ralt', 'talt', 'rif', 'rmk',
];

// ── Builder ────────────────────────────────────────────────────────────

/**
 * Build Field 18 string from structured input.
 * Returns '0' if no indicators are present (ICAO convention for empty F18).
 */
export function buildField18(f18: Field18): string {
  const parts: string[] = [];

  for (const key of FIELD18_ORDER) {
    const val = f18[key];
    if (val === undefined || val === null || val === '') continue;

    const indicator = key.toUpperCase();

    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      parts.push(`${indicator}/${val.join(' ')}`);
    } else {
      parts.push(`${indicator}/${val}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0';
}

/**
 * Validate Field 18 contents — returns errors array (empty = valid).
 */
export function validateField18(f18: Field18): string[] {
  const errors: string[] = [];

  // ── STS validation ──
  if (f18.sts && f18.sts.length > 0) {
    for (const code of f18.sts) {
      if (!STS_CODES[code.toUpperCase()]) {
        errors.push(`Unknown STS code: '${code}'`);
      }
    }
  }

  // ── PBN validation ──
  if (f18.pbn) {
    // PBN codes are 2-char each, max 8 entries = 16 chars
    if (f18.pbn.length > 16) {
      errors.push(`PBN indicator exceeds 8 entries (${f18.pbn.length / 2} codes, max 8)`);
    }
  }

  // ── DOF validation ──
  if (f18.dof) {
    if (!/^\d{6}$/.test(f18.dof)) {
      errors.push(`DOF must be YYMMDD format, got '${f18.dof}'`);
    } else {
      const mm = parseInt(f18.dof.substring(2, 4));
      const dd = parseInt(f18.dof.substring(4, 6));
      if (mm < 1 || mm > 12) errors.push(`DOF month ${mm} is invalid`);
      if (dd < 1 || dd > 31) errors.push(`DOF day ${dd} is invalid`);
    }
  }

  // ── REG validation ──
  if (f18.reg) {
    if (!/^[A-Z0-9-]+$/i.test(f18.reg)) {
      errors.push(`REG contains invalid characters: '${f18.reg}'`);
    }
  }

  // ── PER validation ──
  if (f18.per) {
    if (!/^[ABCDE]$/.test(f18.per.toUpperCase())) {
      errors.push(`PER must be A/B/C/D/E, got '${f18.per}'`);
    }
  }

  // ── EET validation ──
  if (f18.eet) {
    for (const entry of f18.eet) {
      // Format: AAAA HHMM or AAAAAHHMM
      if (!/^[A-Z]{4}\d{4}$/.test(entry.replace(/\s/g, ''))) {
        errors.push(`EET entry format invalid: '${entry}' (expected AAAAHHMM)`);
      }
    }
  }

  // ── CODE validation (Mode S hex) ──
  if (f18.code) {
    if (!/^[0-9A-F]{6}$/i.test(f18.code)) {
      errors.push(`CODE must be 6-digit hex, got '${f18.code}'`);
    }
  }

  // ── SEL validation (SELCAL) ──
  if (f18.sel) {
    if (!/^[A-S]{4}$/i.test(f18.sel)) {
      errors.push(`SEL (SELCAL) must be 4 letters A-S, got '${f18.sel}'`);
    }
  }

  return errors;
}

/**
 * Build Field 19 (supplementary information) string.
 */
export function buildField19(f19: Field19): string {
  const parts: string[] = [];

  if (f19.endurance)     parts.push(`E/${f19.endurance}`);
  if (f19.personsOnBoard) parts.push(`P/${f19.personsOnBoard}`);
  if (f19.emergencyRadio) parts.push(`R/${f19.emergencyRadio}`);
  if (f19.survival)       parts.push(`S/${f19.survival}`);
  if (f19.jackets)        parts.push(`J/${f19.jackets}`);
  if (f19.dinghies)       parts.push(`D/${f19.dinghies}`);
  if (f19.aircraftColour) parts.push(`A/${f19.aircraftColour}`);
  if (f19.remarks)        parts.push(`N/${f19.remarks}`);
  if (f19.pilotInCommand) parts.push(`C/${f19.pilotInCommand}`);

  return parts.length > 0 ? parts.join(' ') : '';
}

/**
 * Validate Field 19 — returns errors array.
 */
export function validateField19(f19: Field19): string[] {
  const errors: string[] = [];

  if (f19.endurance) {
    if (!/^\d{4}$/.test(f19.endurance)) {
      errors.push(`E/ (endurance) must be HHMM, got '${f19.endurance}'`);
    }
  }

  if (f19.personsOnBoard) {
    if (!/^(\d{1,3}|TBE)$/i.test(f19.personsOnBoard)) {
      errors.push(`P/ (persons on board) must be 1-3 digits or TBE, got '${f19.personsOnBoard}'`);
    }
  }

  if (f19.emergencyRadio) {
    if (!/^[UVE]+$/i.test(f19.emergencyRadio)) {
      errors.push(`R/ (emergency radio) must be combination of U/V/E, got '${f19.emergencyRadio}'`);
    }
  }

  if (f19.survival) {
    if (!/^[PDMJ]+$/i.test(f19.survival)) {
      errors.push(`S/ (survival) must be combination of P/D/M/J, got '${f19.survival}'`);
    }
  }

  if (f19.jackets) {
    if (!/^[LFUV]+$/i.test(f19.jackets)) {
      errors.push(`J/ (jackets) must be combination of L/F/U/V, got '${f19.jackets}'`);
    }
  }

  return errors;
}

/**
 * Parse a raw Field 18 string into structured Field18 object.
 */
export function parseField18String(raw: string): Field18 {
  if (!raw || raw === '0') return {};

  const result: Field18 = {};

  // Split by indicator pattern: KEYWORD/value
  const regex = /([A-Z]+)\/((?:(?![A-Z]+\/).)*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    const key = match[1].toLowerCase() as keyof Field18;
    const value = match[2].trim();

    switch (key) {
      case 'sts':
        result.sts = value.split(/\s+/).filter(Boolean);
        break;
      case 'eet':
        result.eet = value.split(/\s+/).filter(Boolean);
        break;
      case 'dle':
        result.dle = value.split(/\s+/).filter(Boolean);
        break;
      default:
        // Single-value indicators
        (result as any)[key] = value;
        break;
    }
  }

  return result;
}

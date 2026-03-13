/**
 * FP07 — Field 10a Complete Equipment Code Table (~40 codes)
 *
 * Implements the complete ICAO Doc 4444 Field 10a (COM/NAV/approach aid
 * equipment) code table with mutual-exclusion rules and Field 18
 * dependency declarations.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface EquipmentCodeDef {
  code: string;
  category: 'COM' | 'NAV' | 'APPROACH' | 'DATALINK' | 'SPECIAL';
  description: string;
  /** true for N — cannot combine with any other 10a code */
  exclusive?: boolean;
  /** Field 18 indicators this code mandates (e.g. R → PBN/) */
  requiresF18?: string[];
  /** Codes that cannot appear alongside this one */
  conflictsWith?: string[];
  /** true for multi-character codes like E1, J3, M2, P1-P9 */
  isMulticode?: boolean;
}

// ── Complete Field 10a Code Table ──────────────────────────────────────

export const FIELD10A_CODES: Record<string, EquipmentCodeDef> = {
  // ── No equipment ──
  N: {
    code: 'N',
    category: 'SPECIAL',
    description: 'No COM/NAV/approach aid equipment carried, or equipment unserviceable',
    exclusive: true,
  },

  // ── Standard shorthand ──
  S: {
    code: 'S',
    category: 'SPECIAL',
    description: 'Standard equipment: VHF RTF + VOR + ILS',
  },

  // ── Communications ──
  D: { code: 'D', category: 'COM', description: 'SSB HF RTF' },
  E1: { code: 'E1', category: 'DATALINK', description: 'FMC WPR ACARS', isMulticode: true },
  E2: { code: 'E2', category: 'DATALINK', description: 'D-FIS ACARS', isMulticode: true },
  E3: { code: 'E3', category: 'DATALINK', description: 'PDC ACARS', isMulticode: true },
  F: { code: 'F', category: 'NAV', description: 'ADF (Automatic Direction Finder)' },
  G: { code: 'G', category: 'NAV', description: 'GNSS (Global Navigation Satellite System)' },
  H: { code: 'H', category: 'COM', description: 'HF RTF' },
  I: { code: 'I', category: 'NAV', description: 'Inertial Navigation (INS or IRS)' },
  J1: { code: 'J1', category: 'DATALINK', description: 'CPDLC ATN VHF', isMulticode: true },
  J2: { code: 'J2', category: 'DATALINK', description: 'CPDLC FANS 1/A HFDL', isMulticode: true },
  J3: { code: 'J3', category: 'DATALINK', description: 'CPDLC FANS 1/A VDL Mode A', isMulticode: true },
  J4: { code: 'J4', category: 'DATALINK', description: 'CPDLC FANS 1/A VDL Mode 2', isMulticode: true },
  J5: { code: 'J5', category: 'DATALINK', description: 'CPDLC FANS 1/A SATCOM INMARSAT', isMulticode: true },
  J6: { code: 'J6', category: 'DATALINK', description: 'CPDLC FANS 1/A SATCOM MTSAT', isMulticode: true },
  J7: { code: 'J7', category: 'DATALINK', description: 'CPDLC FANS 1/A SATCOM Iridium', isMulticode: true },
  K: { code: 'K', category: 'APPROACH', description: 'MLS (Microwave Landing System)' },
  L: { code: 'L', category: 'APPROACH', description: 'ILS (Instrument Landing System)' },
  M1: { code: 'M1', category: 'COM', description: 'ATC SATVOICE INMARSAT', isMulticode: true },
  M2: { code: 'M2', category: 'COM', description: 'ATC SATVOICE MTSAT', isMulticode: true },
  M3: { code: 'M3', category: 'COM', description: 'ATC SATVOICE Iridium', isMulticode: true },
  O: { code: 'O', category: 'NAV', description: 'VOR (VHF Omnidirectional Range)' },
  P1: { code: 'P1', category: 'COM', description: 'RCP 10 specification', isMulticode: true },
  P2: { code: 'P2', category: 'COM', description: 'RCP 120 specification', isMulticode: true },
  P3: { code: 'P3', category: 'COM', description: 'RCP 180 specification', isMulticode: true },
  P4: { code: 'P4', category: 'COM', description: 'RCP 400 specification', isMulticode: true },
  P5: { code: 'P5', category: 'COM', description: 'RCP reserved 5', isMulticode: true },
  P6: { code: 'P6', category: 'COM', description: 'RCP reserved 6', isMulticode: true },
  P7: { code: 'P7', category: 'COM', description: 'RCP reserved 7', isMulticode: true },
  P8: { code: 'P8', category: 'COM', description: 'RCP reserved 8', isMulticode: true },
  P9: { code: 'P9', category: 'COM', description: 'RCP reserved 9', isMulticode: true },
  R: {
    code: 'R',
    category: 'NAV',
    description: 'PBN approved',
    requiresF18: ['PBN'],
  },
  T: { code: 'T', category: 'NAV', description: 'TACAN' },
  U: { code: 'U', category: 'COM', description: 'UHF RTF' },
  V: { code: 'V', category: 'COM', description: 'VHF RTF' },
  W: {
    code: 'W',
    category: 'SPECIAL',
    description: 'RVSM approved (Reduced Vertical Separation Minima)',
    conflictsWith: ['STS/NONRVSM'],
  },
  X: { code: 'X', category: 'NAV', description: 'MNPS approved' },
  Y: { code: 'Y', category: 'COM', description: 'VHF 8.33 kHz channel spacing' },
  Z: {
    code: 'Z',
    category: 'SPECIAL',
    description: 'Other equipment — requires COM/, NAV/, or DAT/ in Field 18',
    requiresF18: ['COM', 'NAV', 'DAT'],
  },
};

// ── Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a Field 10a string into its component codes.
 *
 * Multi-character codes (E1-E3, J1-J7, M1-M3, P1-P9) are detected by
 * lookahead: if the current letter is E/J/M/P and the next character is
 * a digit, consume both characters as one code.
 *
 * @example parseField10a('SDE2E3FGHIJ3J5RWXY') → ['S','D','E2','E3','F','G','H','I','J3','J5','R','W','X','Y']
 */
export function parseField10a(field10a: string): string[] {
  const codes: string[] = [];
  let i = 0;
  const s = field10a.toUpperCase();

  while (i < s.length) {
    const ch = s[i];
    // Check for 2-char codes: E1-E3, J1-J7, M1-M3, P1-P9
    if (
      i + 1 < s.length &&
      (ch === 'E' || ch === 'J' || ch === 'M' || ch === 'P') &&
      s[i + 1] >= '1' && s[i + 1] <= '9'
    ) {
      codes.push(ch + s[i + 1]);
      i += 2;
    } else {
      codes.push(ch);
      i++;
    }
  }

  return codes;
}

/**
 * Validate a Field 10a string — returns errors array (empty = valid).
 */
export function validateField10a(field10a: string): string[] {
  const errors: string[] = [];
  const codes = parseField10a(field10a);

  if (codes.length === 0) {
    errors.push('Field 10a is empty');
    return errors;
  }

  // Check each code is valid
  for (const code of codes) {
    if (!FIELD10A_CODES[code]) {
      errors.push(`Unknown Field 10a code: '${code}'`);
    }
  }

  // ── N exclusivity ──
  if (codes.includes('N') && codes.length > 1) {
    errors.push("'N' (no equipment) must be the only Field 10a code");
  }

  // ── S redundancy warnings (not errors, but worth noting) ──
  // S includes V and O and L — having them alongside S is valid but redundant

  // ── R requires PBN/ in Field 18 ──
  // (Cross-validated in Field10F18CrossValidator — just flag here)
  // No error here — handled by cross-validator

  // ── Z requires COM/NAV/DAT in Field 18 ──
  // (Cross-validated in Field10F18CrossValidator)

  // ── W conflicts with STS/NONRVSM ──
  // (Cross-validated in Field10F18CrossValidator)

  // ── Duplicate detection ──
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      errors.push(`Duplicate Field 10a code: '${code}'`);
    }
    seen.add(code);
  }

  return errors;
}

/**
 * Get the human-readable description for a Field 10a code.
 */
export function getEquipmentDescription(code: string): string | null {
  return FIELD10A_CODES[code]?.description ?? null;
}

/**
 * Returns all Field 18 indicators required by the given Field 10a codes.
 */
export function getRequiredField18Indicators(codes: string[]): string[] {
  const required = new Set<string>();
  for (const code of codes) {
    const def = FIELD10A_CODES[code];
    if (def?.requiresF18) {
      for (const ind of def.requiresF18) {
        required.add(ind);
      }
    }
  }
  return [...required];
}

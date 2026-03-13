/**
 * FP08 — Field 10b Complete Surveillance Code Table + Mutual Exclusion
 *
 * Implements the complete ICAO Doc 4444 Field 10b (surveillance equipment)
 * code table.  Field 10b comes after the slash in Field 10
 * (e.g. in 'SDE2E3FGHIJ3J5RWXY/LB1D1', the 10b part is 'LB1D1').
 *
 * 16 valid codes in 4 categories: None, SSR, ADS-B, ADS-C.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface SurveillanceCodeDef {
  code: string;
  category: 'NONE' | 'SSR' | 'ADS-B' | 'ADS-C';
  description: string;
  exclusive?: boolean;
  /** Codes that should NOT appear alongside this one */
  conflictsWith?: string[];
  isMulticode?: boolean;
}

// ── Complete Field 10b Code Table ──────────────────────────────────────

export const FIELD10B_CODES: Record<string, SurveillanceCodeDef> = {
  // ── None ──
  N: {
    code: 'N',
    category: 'NONE',
    description: 'No surveillance equipment',
    exclusive: true,
  },

  // ── SSR transponder modes ──
  A: {
    code: 'A',
    category: 'SSR',
    description: 'Transponder Mode A (4 digits, 4096 codes) only',
    conflictsWith: ['E', 'H', 'I', 'L', 'S', 'X'],
  },
  C: {
    code: 'C',
    category: 'SSR',
    description: 'Transponder Mode A and Mode C (altitude reporting)',
  },
  E: {
    code: 'E',
    category: 'SSR',
    description: 'Transponder Mode S with aircraft ID, pressure altitude, and extended squitter (ADS-B out 1090)',
    conflictsWith: ['A', 'L'],
  },
  H: {
    code: 'H',
    category: 'SSR',
    description: 'Transponder Mode S with aircraft ID, pressure altitude, and enhanced surveillance',
    conflictsWith: ['A', 'L'],
  },
  I: {
    code: 'I',
    category: 'SSR',
    description: 'Transponder Mode S with aircraft identification only',
    conflictsWith: ['A', 'S', 'L'],
  },
  L: {
    code: 'L',
    category: 'SSR',
    description: 'Transponder Mode S with ID, pressure alt, enhanced surveillance, and extended squitter',
    conflictsWith: ['A', 'I', 'E', 'H'],
  },
  P: {
    code: 'P',
    category: 'SSR',
    description: 'Transponder Mode C only (altitude only, no A codes)',
  },
  S: {
    code: 'S',
    category: 'SSR',
    description: 'Transponder Mode S with aircraft identification and pressure altitude',
    conflictsWith: ['I'],
  },
  X: {
    code: 'X',
    category: 'SSR',
    description: 'Transponder Mode S with no ID and no pressure altitude',
    conflictsWith: ['A'],
  },

  // ── ADS-B ──
  B1: {
    code: 'B1',
    category: 'ADS-B',
    description: 'ADS-B out 1090 MHz dedicated',
    conflictsWith: ['B2'],
    isMulticode: true,
  },
  B2: {
    code: 'B2',
    category: 'ADS-B',
    description: 'ADS-B out and in 1090 MHz dedicated',
    conflictsWith: ['B1'],
    isMulticode: true,
  },
  U1: {
    code: 'U1',
    category: 'ADS-B',
    description: 'ADS-B out UAT',
    conflictsWith: ['U2'],
    isMulticode: true,
  },
  U2: {
    code: 'U2',
    category: 'ADS-B',
    description: 'ADS-B out and in UAT',
    conflictsWith: ['U1'],
    isMulticode: true,
  },
  V1: {
    code: 'V1',
    category: 'ADS-B',
    description: 'ADS-B out VDL Mode 4',
    conflictsWith: ['V2'],
    isMulticode: true,
  },
  V2: {
    code: 'V2',
    category: 'ADS-B',
    description: 'ADS-B out and in VDL Mode 4',
    conflictsWith: ['V1'],
    isMulticode: true,
  },

  // ── ADS-C ──
  D1: {
    code: 'D1',
    category: 'ADS-C',
    description: 'ADS-C with FANS 1/A capabilities',
    isMulticode: true,
  },
  G1: {
    code: 'G1',
    category: 'ADS-C',
    description: 'ADS-C with ATN capabilities',
    isMulticode: true,
  },
};

// ── Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a Field 10b string into its component codes.
 *
 * Multi-character codes (B1/B2, U1/U2, V1/V2, D1, G1) are detected by
 * lookahead: if the current letter is B/U/V/D/G and the next char is a digit.
 *
 * @example parseField10b('LB1D1') → ['L','B1','D1']
 */
export function parseField10b(field10b: string): string[] {
  const codes: string[] = [];
  let i = 0;
  const s = field10b.toUpperCase();

  while (i < s.length) {
    const ch = s[i];
    if (
      i + 1 < s.length &&
      (ch === 'B' || ch === 'U' || ch === 'V' || ch === 'D' || ch === 'G') &&
      s[i + 1] >= '1' && s[i + 1] <= '2'
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
 * Validate a Field 10b string — returns errors array (empty = valid).
 */
export function validateField10b(field10b: string): string[] {
  const errors: string[] = [];
  const codes = parseField10b(field10b);

  if (codes.length === 0) {
    errors.push('Field 10b is empty');
    return errors;
  }

  // Check each code is valid
  for (const code of codes) {
    if (!FIELD10B_CODES[code]) {
      errors.push(`Unknown Field 10b code: '${code}'`);
    }
  }

  // ── N exclusivity ──
  if (codes.includes('N') && codes.length > 1) {
    errors.push("'N' (no surveillance) must be the only Field 10b code");
  }

  // ── Mutual exclusion ──
  for (const code of codes) {
    const def = FIELD10B_CODES[code];
    if (!def?.conflictsWith) continue;
    for (const conflict of def.conflictsWith) {
      if (codes.includes(conflict)) {
        errors.push(
          `Field 10b: '${code}' conflicts with '${conflict}' — ${def.description} is incompatible with ${FIELD10B_CODES[conflict]?.description}`
        );
      }
    }
  }

  // ── Duplicate detection ──
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      errors.push(`Duplicate Field 10b code: '${code}'`);
    }
    seen.add(code);
  }

  return errors;
}

/**
 * Determine the highest transponder capability level from the codes.
 */
export function getTransponderLevel(
  codes: string[]
): 'none' | 'mode-a' | 'mode-c' | 'mode-s' | 'ads-b' {
  const codeSet = new Set(codes);

  // ADS-B is the highest
  if (codeSet.has('B1') || codeSet.has('B2') ||
      codeSet.has('U1') || codeSet.has('U2') ||
      codeSet.has('V1') || codeSet.has('V2')) {
    return 'ads-b';
  }

  // Mode S codes
  if (codeSet.has('S') || codeSet.has('L') || codeSet.has('E') ||
      codeSet.has('H') || codeSet.has('I') || codeSet.has('X')) {
    return 'mode-s';
  }

  // Mode C
  if (codeSet.has('C') || codeSet.has('P')) {
    return 'mode-c';
  }

  // Mode A
  if (codeSet.has('A')) {
    return 'mode-a';
  }

  // None
  if (codeSet.has('N') || codeSet.size === 0) {
    return 'none';
  }

  // ADS-C only (D1/G1) — still requires at least mode-c for surveillance
  return 'none';
}

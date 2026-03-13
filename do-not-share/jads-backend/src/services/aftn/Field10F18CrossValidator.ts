/**
 * FP09 — Field 10 ↔ Field 18 Cross-Validation and PBN Dependency Matrix
 *
 * Implements the complete cross-validation engine between Field 10 and
 * Field 18, including the full 24-code PBN dependency matrix.
 */

import { parseField10a, FIELD10A_CODES } from './Field10aEquipment';

// ── PBN Dependency Matrix ──────────────────────────────────────────────

/**
 * Each PBN code's required Field 10a equipment codes.
 * If any required code is missing, it's an error.
 */
export const PBN_DEPENDENCY_MATRIX: Record<string, {
  specification: string;
  requiredCodes: string[];
  meaning: string;
}> = {
  A1: { specification: 'RNAV 10 (RNP 10)',        requiredCodes: ['G'],       meaning: 'Oceanic — GNSS or inertial (G or I)' },
  B1: { specification: 'RNAV 5 all sensors',       requiredCodes: ['G'],       meaning: 'Any combination of GNSS, DME, VOR' },
  B2: { specification: 'RNAV 5 GNSS',              requiredCodes: ['G'],       meaning: 'GNSS-based RNAV 5' },
  B3: { specification: 'RNAV 5 DME/DME',           requiredCodes: ['D'],       meaning: 'DME/DME-based RNAV 5' },
  B4: { specification: 'RNAV 5 VOR/DME',           requiredCodes: ['O'],       meaning: 'VOR/DME-based RNAV 5' },
  B5: { specification: 'RNAV 5 INS/IRS',           requiredCodes: ['I'],       meaning: 'Inertial RNAV 5' },
  B6: { specification: 'RNAV 5 LORANC',            requiredCodes: [],          meaning: 'LORAN-C — rarely used' },
  C1: { specification: 'RNAV 2 all sensors',       requiredCodes: ['G'],       meaning: 'RNAV 2 any sensor' },
  C2: { specification: 'RNAV 2 GNSS',              requiredCodes: ['G'],       meaning: 'GNSS-based RNAV 2' },
  C3: { specification: 'RNAV 2 DME/DME',           requiredCodes: ['D'],       meaning: 'DME/DME-based RNAV 2' },
  C4: { specification: 'RNAV 2 DME/DME/IRU',       requiredCodes: ['D', 'I'],  meaning: 'DME/DME with inertial' },
  D1: { specification: 'RNAV 1 all sensors',       requiredCodes: ['G'],       meaning: 'RNAV 1 any sensor' },
  D2: { specification: 'RNAV 1 GNSS',              requiredCodes: ['G'],       meaning: 'GNSS-based RNAV 1' },
  D3: { specification: 'RNAV 1 DME/DME',           requiredCodes: ['D'],       meaning: 'DME/DME-based RNAV 1' },
  D4: { specification: 'RNAV 1 DME/DME/IRU',       requiredCodes: ['D', 'I'],  meaning: 'DME/DME with inertial' },
  L1: { specification: 'RNP 4',                    requiredCodes: ['G'],       meaning: 'Oceanic RNP 4 — GNSS required' },
  O1: { specification: 'Basic RNP 1 all sensors',  requiredCodes: ['G'],       meaning: 'RNP 1 any sensor' },
  O2: { specification: 'Basic RNP 1 GNSS',         requiredCodes: ['G'],       meaning: 'GNSS-based RNP 1' },
  O3: { specification: 'Basic RNP 1 DME/DME',      requiredCodes: ['D'],       meaning: 'DME/DME-based RNP 1' },
  O4: { specification: 'Basic RNP 1 DME/DME/IRU',  requiredCodes: ['D', 'I'],  meaning: 'DME/DME with inertial' },
  S1: { specification: 'RNP APCH',                 requiredCodes: ['G'],       meaning: 'RNP approach without vertical guidance' },
  S2: { specification: 'RNP APCH BARO-VNAV',       requiredCodes: ['G'],       meaning: 'RNP approach with BARO vertical nav' },
  T1: { specification: 'RNP AR APCH RF',           requiredCodes: ['G'],       meaning: 'Required nav performance — radius to fix' },
  T2: { specification: 'RNP AR APCH no RF',        requiredCodes: ['G'],       meaning: 'RNP AR without radius to fix' },
};

// ── PBN Validation ─────────────────────────────────────────────────────

export interface PbnValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  pbnCodesFound: string[];
  missingEquipmentFor: Array<{ pbnCode: string; missingCodes: string[] }>;
}

/**
 * Parse PBN indicator value into individual 2-char codes.
 * @example parsePbnCodes('A1B1C1D1L1') → ['A1','B1','C1','D1','L1']
 */
export function parsePbnCodes(pbnValue: string): string[] {
  const codes: string[] = [];
  for (let i = 0; i < pbnValue.length; i += 2) {
    if (i + 1 < pbnValue.length) {
      codes.push(pbnValue.substring(i, i + 2).toUpperCase());
    }
  }
  return codes;
}

/**
 * Validate PBN codes against Field 10a equipment — the PBN dependency matrix.
 */
export function validatePbnEquipmentConsistency(
  field10a: string,
  pbnIndicatorValue: string
): PbnValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingEquipmentFor: Array<{ pbnCode: string; missingCodes: string[] }> = [];

  const codes10a = parseField10a(field10a);
  const codeSet = new Set(codes10a);
  const pbnCodes = parsePbnCodes(pbnIndicatorValue);

  // R must be in Field 10a
  if (!codeSet.has('R')) {
    errors.push("PBN codes are specified but 'R' is missing from Field 10a");
  }

  // Validate each PBN code
  for (const pbn of pbnCodes) {
    const def = PBN_DEPENDENCY_MATRIX[pbn];
    if (!def) {
      errors.push(`Unknown PBN code: '${pbn}'`);
      continue;
    }

    const missing = def.requiredCodes.filter(rc => {
      // Special case: A1 accepts G or I
      if (pbn === 'A1' && (rc === 'G')) {
        return !codeSet.has('G') && !codeSet.has('I');
      }
      // S also covers V, O, L
      if (rc === 'V' && codeSet.has('S')) return false;
      if (rc === 'O' && codeSet.has('S')) return false;
      if (rc === 'L' && codeSet.has('S')) return false;
      return !codeSet.has(rc);
    });

    if (missing.length > 0) {
      missingEquipmentFor.push({ pbnCode: pbn, missingCodes: missing });
      errors.push(
        `PBN code '${pbn}' (${def.specification}) requires Field 10a codes: ${missing.join(', ')}`
      );
    }
  }

  // Check PBN count limit (max 8 entries = 16 chars)
  if (pbnCodes.length > 8) {
    warnings.push(
      `PBN/ has ${pbnCodes.length} codes (max 8 in Field 18); overflow should go to NAV/`
    );
  }

  // GNSS augmentation warning for approach PBN codes
  const approachPbn = pbnCodes.filter(c => ['S1', 'S2', 'T1', 'T2'].includes(c));
  if (approachPbn.length > 0 && codeSet.has('G')) {
    // Check for NAV/ augmentation — caller should provide Field 18 content
    warnings.push(
      'GNSS-based approach PBN codes present (S1/S2/T1/T2) — consider specifying GNSS augmentation in NAV/ (GSBAS/GAGAN for India)'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    pbnCodesFound: pbnCodes,
    missingEquipmentFor,
  };
}

// ── Full Cross-Validation ──────────────────────────────────────────────

export interface CrossValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  pbnResult?: PbnValidationResult;
}

/**
 * Full Field 10 ↔ Field 18 cross-validation.
 *
 * Rules:
 *   1. R in 10a → PBN/ must exist in F18
 *   2. PBN/ in F18 → R must be in 10a
 *   3. Z in 10a → COM/ or NAV/ or DAT/ must exist in F18
 *   4. W in 10a → STS/NONRVSM must NOT be in F18
 *   5. PBN dependency matrix check
 */
export function validateField10F18(
  field10a: string,
  field18: {
    pbn?: string;
    com?: string;
    nav?: string;
    dat?: string;
    sts?: string[];
    sur?: string;
  }
): CrossValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let pbnResult: PbnValidationResult | undefined;

  const codes10a = parseField10a(field10a);
  const codeSet = new Set(codes10a);

  // ── Rule 1: R in 10a → PBN/ in F18 ──
  if (codeSet.has('R') && !field18.pbn) {
    errors.push("'R' in Field 10a requires PBN/ in Field 18");
  }

  // ── Rule 2: PBN/ in F18 → R in 10a ──
  if (field18.pbn && !codeSet.has('R')) {
    errors.push("PBN/ in Field 18 requires 'R' in Field 10a");
  }

  // ── Rule 3: Z in 10a → COM/ or NAV/ or DAT/ in F18 ──
  if (codeSet.has('Z')) {
    if (!field18.com && !field18.nav && !field18.dat) {
      errors.push("'Z' in Field 10a requires COM/ and/or NAV/ and/or DAT/ in Field 18");
    }
  }

  // ── Rule 4: W ↔ NONRVSM conflict ──
  const stsUpper = (field18.sts ?? []).map(s => s.toUpperCase());
  if (codeSet.has('W') && stsUpper.includes('NONRVSM')) {
    errors.push(
      "'W' (RVSM approved) in Field 10a is incompatible with STS/NONRVSM in Field 18"
    );
  }

  // ── Rule 5: PBN dependency matrix ──
  if (field18.pbn && codeSet.has('R')) {
    pbnResult = validatePbnEquipmentConsistency(field10a, field18.pbn);
    errors.push(...pbnResult.errors);
    warnings.push(...pbnResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    pbnResult,
  };
}

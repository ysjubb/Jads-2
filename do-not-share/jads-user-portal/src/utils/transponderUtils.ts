/**
 * Transponder / Squawk utilities for Indian airspace
 *
 * Key India-specific rules:
 * - VFR conspicuity squawk: 7000 (NOT US 1200)
 * - Emergency codes 7500/7600/7700 are BLOCKED from assignment
 * - Squawk digits are octal: 0-7 only (no 8 or 9)
 * - SELCAL codes: 4 letters from A-S (excluding I, N, O), no repeated letters
 */

/** Squawk codes that must never be assigned to flights */
export const EMERGENCY_SQUAWKS = ['7500', '7600', '7700'] as const;

/** India VFR conspicuity code (NOT US 1200) */
export const INDIA_VFR_CONSPICUITY = '7000';

/** Squawk codes with special meaning in Indian airspace */
export const RESERVED_SQUAWKS: Record<string, string> = {
  '7500': 'Hijack',
  '7600': 'Radio failure',
  '7700': 'Emergency',
  '7000': 'VFR conspicuity (India)',
  '2000': 'Entry into secondary surveillance radar area',
};

export interface SquawkValidation {
  valid: boolean;
  error?: string;
  isEmergency?: boolean;
  isReserved?: boolean;
}

/**
 * Validate a squawk code.
 * Must be exactly 4 octal digits (0-7). Emergency codes are flagged.
 */
export function validateSquawk(code: string): SquawkValidation {
  const trimmed = code.trim();

  if (trimmed.length !== 4) {
    return { valid: false, error: 'Squawk must be exactly 4 digits' };
  }

  if (!/^[0-7]{4}$/.test(trimmed)) {
    return { valid: false, error: 'Squawk digits must be 0-7 (octal only — no 8 or 9)' };
  }

  if (EMERGENCY_SQUAWKS.includes(trimmed as typeof EMERGENCY_SQUAWKS[number])) {
    return { valid: false, error: `${trimmed} is emergency code (${RESERVED_SQUAWKS[trimmed]}) — cannot assign`, isEmergency: true };
  }

  const isReserved = trimmed in RESERVED_SQUAWKS;
  return { valid: true, isReserved };
}

/**
 * Check if a squawk code is safe to assign (not emergency, not reserved).
 */
export function isSquawkAssignable(code: string): boolean {
  const result = validateSquawk(code);
  return result.valid && !result.isReserved;
}

/**
 * Generate a random non-reserved squawk in a given range.
 * Default range: 0001–7677 (common IFR assignment range).
 */
export function generateRandomSquawk(min = 1, max = 4023): string {
  // Convert octal range — squawk 7677 octal = 4023 decimal
  let attempts = 0;
  while (attempts < 100) {
    const decimal = Math.floor(Math.random() * (max - min + 1)) + min;
    // Convert decimal to octal string, pad to 4 digits
    const octal = decimal.toString(8).padStart(4, '0');
    if (validateSquawk(octal).valid && !validateSquawk(octal).isReserved) {
      return octal;
    }
    attempts++;
  }
  return '0401'; // Safe fallback
}

// --- SELCAL ---

/**
 * Valid SELCAL letters: A-S excluding I, N, O.
 * SELCAL uses audio tones assigned to specific letters.
 */
const SELCAL_VALID_LETTERS = 'ABCDEFGHJKLMPQRS';

export interface SELCALValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a SELCAL code.
 * Format: 4 unique letters from valid set, often written as AB-CD.
 */
export function validateSELCAL(code: string): SELCALValidation {
  const cleaned = code.replace(/-/g, '').toUpperCase().trim();

  if (cleaned.length !== 4) {
    return { valid: false, error: 'SELCAL must be exactly 4 letters (e.g., AB-CD)' };
  }

  for (const ch of cleaned) {
    if (!SELCAL_VALID_LETTERS.includes(ch)) {
      return { valid: false, error: `Invalid SELCAL letter '${ch}' — allowed: ${SELCAL_VALID_LETTERS}` };
    }
  }

  // Each pair must be in alphabetical order: A<B and C<D
  if (cleaned[0] >= cleaned[1]) {
    return { valid: false, error: 'First pair must be in alphabetical order (e.g., AB not BA)' };
  }
  if (cleaned[2] >= cleaned[3]) {
    return { valid: false, error: 'Second pair must be in alphabetical order (e.g., CD not DC)' };
  }

  // No repeated letters
  const unique = new Set(cleaned);
  if (unique.size !== 4) {
    return { valid: false, error: 'SELCAL letters must all be unique' };
  }

  return { valid: true };
}

/**
 * Format SELCAL code with hyphen separator: ABCD → AB-CD
 */
export function formatSELCAL(code: string): string {
  const cleaned = code.replace(/-/g, '').toUpperCase().trim();
  if (cleaned.length !== 4) return cleaned;
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
}

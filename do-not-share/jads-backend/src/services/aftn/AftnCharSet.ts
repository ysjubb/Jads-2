/**
 * FP05 — AFTN IA-5 Character Set Enforcer
 *
 * Implements the ICAO Annex 10 Vol II IA-5 character set validation and
 * sanitisation for all AFTN messages.  IA-5 is a restricted subset of
 * ASCII used on the Aeronautical Fixed Telecommunication Network.
 *
 * Valid IA-5 characters:
 *   A-Z (uppercase only), 0-9, SPACE, CR, LF
 *   and the special characters: - ( ) . / : ' + ? ,
 *
 * Line length limit: 69 characters (AFTN standard)
 * Message text limit: 1,800 characters
 * Total message limit: 2,100 characters
 */

// ── Constants ──────────────────────────────────────────────────────────

/** Characters permitted in IA-5 (ICAO Annex 10 Vol II) */
const IA5_VALID = /^[A-Z0-9 \r\n\-()./:'+?,]*$/;

/** Single-character IA-5 test */
const IA5_CHAR = /^[A-Z0-9 \r\n\-()./:'+?,]$/;

/** Maximum characters per line in an AFTN message */
export const AFTN_LINE_MAX = 69;

/** Maximum characters in the message text block (between header and NNNN) */
export const AFTN_MESSAGE_TEXT_MAX = 1800;

/** Maximum total AFTN message length including envelope */
export const AFTN_TOTAL_MAX = 2100;

// ── Replacement table ──────────────────────────────────────────────────

/**
 * Maps non-IA-5 characters to their IA-5 replacements.
 * Source: ICAO Doc 8585 Appendix, common AFTN operator practice.
 */
const REPLACEMENT_TABLE: Record<string, string> = {
  // Lowercase → uppercase
  ...Object.fromEntries(
    'abcdefghijklmnopqrstuvwxyz'.split('').map(c => [c, c.toUpperCase()])
  ),

  // Common punctuation
  '!':  '.',
  ';':  ',',
  '=':  '-',
  '*':  'X',
  '&':  'AND',
  '%':  'PCT',
  '#':  'NR',
  '@':  'AT',
  '_':  '-',
  '"':  "'",
  '\u201C': "'", // left double curly quote
  '\u201D': "'", // right double curly quote
  '\u2018': "'", // left single curly quote
  '\u2019': "'", // right single curly quote / apostrophe
  '\u2013': '-', // en-dash
  '\u2014': '-', // em-dash
  '\u00B0': ' ', // degree symbol
  '\t':  ' ',    // tab
};

// ── Error classes ──────────────────────────────────────────────────────

export class AftnCharsetError extends Error {
  constructor(
    public readonly offendingChar: string,
    public readonly position: number,
    public readonly context: string
  ) {
    super(
      `Non-IA-5 character '${offendingChar}' (U+${offendingChar
        .charCodeAt(0)
        .toString(16)
        .toUpperCase()
        .padStart(4, '0')}) at position ${position} in context: "${context}"`
    );
    this.name = 'AftnCharsetError';
  }
}

export class AftnMessageTooLongError extends Error {
  constructor(
    public readonly actual: number,
    public readonly max: number
  ) {
    super(
      `AFTN message length ${actual} exceeds maximum ${max} characters`
    );
    this.name = 'AftnMessageTooLongError';
  }
}

// ── Validation result ──────────────────────────────────────────────────

export interface AftnCharsetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Positions of non-IA-5 characters */
  offendingPositions: number[];
  /** Lines exceeding 69-char limit (1-indexed) */
  longLines: Array<{ line: number; length: number }>;
}

// ── Core functions ─────────────────────────────────────────────────────

/**
 * Tests whether a string contains only valid IA-5 characters.
 */
export function isIa5(text: string): boolean {
  return IA5_VALID.test(text);
}

/**
 * Tests whether a single character is valid IA-5.
 */
export function isIa5Char(ch: string): boolean {
  return IA5_CHAR.test(ch);
}

/**
 * Sanitises a string to IA-5 by applying the replacement table.
 * Characters with no replacement are replaced with '?' and flagged.
 *
 * @returns The sanitised string and an array of warnings for
 *          characters that were replaced with '?'.
 */
export function sanitiseToIa5(text: string): { sanitised: string; warnings: string[] } {
  const warnings: string[] = [];
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isIa5Char(ch)) {
      result += ch;
      continue;
    }

    const replacement = REPLACEMENT_TABLE[ch];
    if (replacement !== undefined) {
      result += replacement;
    } else {
      // Unknown character — replace with ? and warn
      result += '?';
      warnings.push(
        `Position ${i}: '${ch}' (U+${ch
          .charCodeAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}) replaced with '?'`
      );
    }
  }

  return { sanitised: result, warnings };
}

/**
 * Validates an AFTN message string for IA-5 compliance,
 * line length, and total message length.
 */
export function validateAftnCharset(raw: string): AftnCharsetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const offendingPositions: number[] = [];
  const longLines: Array<{ line: number; length: number }> = [];

  // ── Character validation ──
  for (let i = 0; i < raw.length; i++) {
    if (!isIa5Char(raw[i])) {
      offendingPositions.push(i);
      errors.push(
        `Non-IA-5 character '${raw[i]}' (U+${raw[i]
          .charCodeAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}) at position ${i}`
      );
    }
  }

  // ── Line length validation ──
  const lines = raw.split('\n');
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l].replace(/\r$/, '');
    if (lineText.length > AFTN_LINE_MAX) {
      longLines.push({ line: l + 1, length: lineText.length });
      warnings.push(
        `Line ${l + 1} is ${lineText.length} chars (max ${AFTN_LINE_MAX})`
      );
    }
  }

  // ── Message text length ──
  // Extract message text between first '(' and last ')'
  const msgStart = raw.indexOf('(');
  const msgEnd = raw.lastIndexOf(')');
  if (msgStart >= 0 && msgEnd > msgStart) {
    const messageText = raw.substring(msgStart, msgEnd + 1);
    if (messageText.length > AFTN_MESSAGE_TEXT_MAX) {
      errors.push(
        `Message text is ${messageText.length} chars (max ${AFTN_MESSAGE_TEXT_MAX})`
      );
    }
  }

  // ── Total length ──
  if (raw.length > AFTN_TOTAL_MAX) {
    errors.push(
      `Total message is ${raw.length} chars (max ${AFTN_TOTAL_MAX})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    offendingPositions,
    longLines,
  };
}

/**
 * Wraps text to the AFTN 69-character line limit.
 * Breaks at word boundaries where possible; forces a break at 69 otherwise.
 */
export function wrapToAftnLines(text: string, maxLen = AFTN_LINE_MAX): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxLen) {
      // Force-break long words
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let i = 0; i < word.length; i += maxLen) {
        lines.push(word.substring(i, i + maxLen));
      }
      continue;
    }

    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxLen) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\r\n');
}

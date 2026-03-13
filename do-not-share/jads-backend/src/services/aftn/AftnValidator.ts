/**
 * FP06 — AFTN Message Validator
 *
 * Validates a built AFTN message string for structural correctness
 * field by field per ICAO Annex 10 Vol II.
 */

import { validateAftnCharset } from './AftnCharSet';

// ── Types ──────────────────────────────────────────────────────────────

export interface AftnValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsedBlocks: {
    header: string;
    filingTime: string;
    addressBlock: string[];
    originLine: string;
    messageText: string;
  };
}

// ── Validator ──────────────────────────────────────────────────────────

/**
 * Validate a complete AFTN message string.
 */
export function validateAftnMessage(raw: string): AftnValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsedBlocks = {
    header: '',
    filingTime: '',
    addressBlock: [] as string[],
    originLine: '',
    messageText: '',
  };

  if (!raw || raw.trim().length === 0) {
    errors.push('Empty message');
    return { valid: false, errors, warnings, parsedBlocks };
  }

  // ── IA-5 charset validation ──
  const charResult = validateAftnCharset(raw);
  errors.push(...charResult.errors);
  warnings.push(...charResult.warnings.map(w => `[Charset] ${w}`));

  // ── Parse into blocks ──
  const lines = raw.split(/\r?\n/);

  // Block 1: ZCZC header
  if (lines.length > 0) {
    parsedBlocks.header = lines[0];
    if (!lines[0].startsWith('ZCZC')) {
      errors.push("Header must start with 'ZCZC'");
    } else {
      // Validate channel ID + sequence: ZCZC <channelId><3-digit seq>
      const headerMatch = lines[0].match(/^ZCZC\s+([A-Z]+)(\d{3})$/);
      if (!headerMatch) {
        warnings.push('Header format: expected ZCZC <channelId><sequence 001-999>');
      } else {
        const seq = parseInt(headerMatch[2]);
        if (seq < 1 || seq > 999) {
          errors.push(`Sequence number ${seq} out of range (001-999)`);
        }
      }
    }
  }

  // Block 3: Address block (starts with priority indicator)
  let lineIdx = 1;
  const validPriorities = ['SS', 'DD', 'FF', 'GG', 'KK'];
  let priorityFound = false;

  while (lineIdx < lines.length) {
    const line = lines[lineIdx].trim();
    if (!line) { lineIdx++; continue; }

    // Check if this line starts with a priority indicator
    const firstWord = line.split(/\s+/)[0];
    if (!priorityFound && validPriorities.includes(firstWord)) {
      priorityFound = true;
      const parts = line.split(/\s+/);
      // First line: priority + addresses
      for (let p = 1; p < parts.length; p++) {
        parsedBlocks.addressBlock.push(parts[p]);
      }
      lineIdx++;
      // Continuation address lines (no priority prefix)
      while (lineIdx < lines.length) {
        const nextLine = lines[lineIdx].trim();
        if (!nextLine) { lineIdx++; continue; }
        // If it looks like addresses (8-char blocks), add them
        if (/^[A-Z0-9]{8}(\s+[A-Z0-9]{8})*$/.test(nextLine)) {
          parsedBlocks.addressBlock.push(...nextLine.split(/\s+/));
          lineIdx++;
        } else {
          break;
        }
      }
      break;
    }
    lineIdx++;
    break;
  }

  if (!priorityFound) {
    errors.push('No priority indicator found (expected SS/DD/FF/GG/KK)');
  }

  // Validate addresses
  for (const addr of parsedBlocks.addressBlock) {
    if (!/^[A-Z0-9]{8}$/.test(addr)) {
      errors.push(`Invalid address format: '${addr}' (must be 8 uppercase alphanumeric chars)`);
    }
  }
  if (parsedBlocks.addressBlock.length > 21) {
    errors.push(`Too many addresses: ${parsedBlocks.addressBlock.length} (max 21)`);
  }

  // Block 4: Origin line (DDHHMM ORIGINATOR)
  if (lineIdx < lines.length) {
    const originLine = lines[lineIdx].trim();
    parsedBlocks.originLine = originLine;
    const originMatch = originLine.match(/^(\d{6})\s+([A-Z0-9]{8})$/);
    if (originMatch) {
      parsedBlocks.filingTime = originMatch[1];
      // Validate DDHHMM
      const dd = parseInt(originMatch[1].substring(0, 2));
      const hh = parseInt(originMatch[1].substring(2, 4));
      const mm = parseInt(originMatch[1].substring(4, 6));
      if (dd < 1 || dd > 31) errors.push(`Filing time day ${dd} is invalid`);
      if (hh > 23) errors.push(`Filing time hour ${hh} is invalid`);
      if (mm > 59) errors.push(`Filing time minute ${mm} is invalid`);
    } else if (originLine) {
      warnings.push(`Origin line format unexpected: '${originLine}' (expected DDHHMM XXXXXXXX)`);
    }
    lineIdx++;
  }

  // Block 5: Message text (everything between origin and NNNN)
  const textLines: string[] = [];
  while (lineIdx < lines.length) {
    const line = lines[lineIdx].trim();
    if (line === 'NNNN') break;
    textLines.push(lines[lineIdx]);
    lineIdx++;
  }
  parsedBlocks.messageText = textLines.join('\n').trim();

  // Validate message text structure
  const msgText = parsedBlocks.messageText;
  if (msgText) {
    if (!msgText.startsWith('(')) {
      warnings.push("Message text should start with '('");
    }
    if (!msgText.endsWith(')')) {
      warnings.push("Message text should end with ')'");
    }
  }

  // Check NNNN ending
  const lastNonEmpty = lines.filter(l => l.trim()).pop();
  if (lastNonEmpty !== 'NNNN') {
    errors.push("Message must end with 'NNNN'");
  }

  // Message text length
  if (msgText.length > 1800) {
    errors.push(`Message text is ${msgText.length} chars (max 1,800)`);
  }

  // Total length
  if (raw.length > 2100) {
    errors.push(`Total message is ${raw.length} chars (max 2,100)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsedBlocks,
  };
}

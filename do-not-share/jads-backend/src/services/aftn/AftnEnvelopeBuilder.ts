/**
 * FP01 — AFTN Wire-Format 5-Block Message Envelope
 *
 * Implements the complete AFTN message envelope per ICAO Annex 10 Vol II:
 *   Block 1: ZCZC <channel-id><sequence> (start-of-message)
 *   Block 2: Filing time line
 *   Block 3: Address block (<priority> <address1> ... <addressN>)
 *   Block 4: Origin line (<filing-time> <originator>)
 *   Block 5: Message text (FPL/CNL/DLA/ARR/CHG/DEP)
 *   End:     NNNN (end-of-message)
 *
 * Line length limit: 69 characters per line.
 * Total message text limit: 1,800 characters.
 */

import { sanitiseToIa5, wrapToAftnLines, AFTN_LINE_MAX } from './AftnCharSet';

// ── Types ──────────────────────────────────────────────────────────────

export type AftnPriority = 'SS' | 'DD' | 'FF' | 'GG' | 'KK';

export interface AftnEnvelopeInput {
  /** Priority indicator: SS (distress), DD (urgent), FF (flight safety), GG (met), KK (admin) */
  priority: AftnPriority;
  /** List of 8-character AFTN destination addresses (max 21) */
  addresses: string[];
  /** Filing time in DDHHMM format */
  filingTime: string;
  /** 8-character AFTN originator address */
  originator: string;
  /** The message text (FPL/CNL/DLA/ARR etc.) — already formatted */
  messageText: string;
  /** Optional channel identifier (default: 'TCA') */
  channelId?: string;
  /** Optional sequence number 001-999 (default: auto-increment) */
  sequenceNumber?: number;
}

export interface AftnEnvelopeResult {
  /** The complete AFTN message ready for transmission */
  message: string;
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Character count of message text */
  messageTextLength: number;
  /** Total character count */
  totalLength: number;
}

// ── Sequence counter ───────────────────────────────────────────────────

let _globalSequence = 0;
function nextSequence(): number {
  _globalSequence = (_globalSequence % 999) + 1;
  return _globalSequence;
}

/** Reset sequence (for testing) */
export function resetSequence(n = 0): void {
  _globalSequence = n;
}

// ── Builder ────────────────────────────────────────────────────────────

/**
 * Build a complete AFTN wire-format message envelope.
 */
export function buildAftnEnvelope(input: AftnEnvelopeInput): AftnEnvelopeResult {
  const warnings: string[] = [];
  const channelId = input.channelId ?? 'TCA';
  const seq = input.sequenceNumber ?? nextSequence();
  const seqStr = seq.toString().padStart(3, '0');

  // ── Validate inputs ──
  if (input.addresses.length === 0) {
    throw new Error('AFTN envelope requires at least one address');
  }
  if (input.addresses.length > 21) {
    throw new Error(`AFTN envelope allows max 21 addresses, got ${input.addresses.length}`);
  }
  for (const addr of input.addresses) {
    if (!/^[A-Z0-9]{8}$/.test(addr)) {
      throw new Error(`Invalid AFTN address format: '${addr}' (must be 8 uppercase alphanumeric chars)`);
    }
  }
  if (!/^\d{6}$/.test(input.filingTime)) {
    throw new Error(`Invalid filing time: '${input.filingTime}' (must be DDHHMM)`);
  }
  if (!/^[A-Z0-9]{8}$/.test(input.originator)) {
    throw new Error(`Invalid originator: '${input.originator}' (must be 8 uppercase alphanumeric chars)`);
  }

  // ── Sanitise message text to IA-5 ──
  const { sanitised: cleanText, warnings: charWarnings } = sanitiseToIa5(input.messageText);
  warnings.push(...charWarnings);

  // ── Block 1: ZCZC header ──
  const block1 = `ZCZC ${channelId}${seqStr}`;

  // ── Block 3: Address block ──
  // Format: <priority> <addr1> <addr2> ... (max 69 chars per line)
  const addressLines = buildAddressBlock(input.priority, input.addresses);

  // ── Block 4: Origin line ──
  const block4 = `${input.filingTime} ${input.originator}`;

  // ── Block 5: Message text (wrapped to 69 chars) ──
  const wrappedText = wrapToAftnLines(cleanText, AFTN_LINE_MAX);

  // ── Assemble ──
  const lines = [
    block1,
    ...addressLines,
    block4,
    '',  // blank line before message text
    wrappedText,
    '',  // blank line before ending
    'NNNN',
  ];

  const message = lines.join('\r\n');
  const messageTextLength = cleanText.length;
  const totalLength = message.length;

  // ── Length warnings ──
  if (messageTextLength > 1800) {
    warnings.push(`Message text is ${messageTextLength} chars (AFTN limit: 1,800)`);
  }
  if (totalLength > 2100) {
    warnings.push(`Total message is ${totalLength} chars (AFTN limit: 2,100)`);
  }

  return { message, warnings, messageTextLength, totalLength };
}

/**
 * Build the address block lines, wrapping at 69 characters.
 */
function buildAddressBlock(priority: AftnPriority, addresses: string[]): string[] {
  const lines: string[] = [];
  let current: string = priority as string;

  for (const addr of addresses) {
    if (current.length + 1 + addr.length > AFTN_LINE_MAX) {
      lines.push(current);
      current = addr;
    } else {
      current += ' ' + addr;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a raw AFTN message back into its components (for validation).
 */
export interface ParsedAftnMessage {
  header: string;
  filingTime: string;
  addressBlock: string[];
  originLine: string;
  messageText: string;
  valid: boolean;
}

export function parseAftnMessage(raw: string): ParsedAftnMessage {
  const lines = raw.split(/\r?\n/);
  const result: ParsedAftnMessage = {
    header: '',
    filingTime: '',
    addressBlock: [],
    originLine: '',
    messageText: '',
    valid: false,
  };

  if (lines.length < 4) return result;

  // Block 1: ZCZC header
  result.header = lines[0];

  // Find address block (starts with priority indicator)
  let i = 1;
  while (i < lines.length && /^(SS|DD|FF|GG|KK)\s/.test(lines[i])) {
    // First address line starts with priority
    const addrLine = lines[i];
    const parts = addrLine.trim().split(/\s+/);
    if (i === 1) {
      // Skip priority indicator
      result.addressBlock.push(...parts.slice(1));
    } else {
      result.addressBlock.push(...parts);
    }
    i++;
  }

  // If no priority-prefixed line found, try the line after header
  if (result.addressBlock.length === 0 && i === 1) {
    const parts = lines[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      result.addressBlock.push(...parts.slice(1));
    }
    i = 2;
  }

  // Origin line (DDHHMM ORIGINATOR)
  if (i < lines.length) {
    result.originLine = lines[i];
    const originParts = lines[i].trim().split(/\s+/);
    if (originParts.length >= 1) {
      result.filingTime = originParts[0];
    }
    i++;
  }

  // Message text: everything between origin line and NNNN
  const textLines: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === 'NNNN') break;
    textLines.push(lines[i]);
    i++;
  }
  result.messageText = textLines.join('\n').trim();

  // Check for NNNN ending
  const lastNonEmpty = lines.filter(l => l.trim()).pop();
  result.valid = result.header.startsWith('ZCZC') && lastNonEmpty === 'NNNN';

  return result;
}

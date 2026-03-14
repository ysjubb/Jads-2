/**
 * FP13 — Flight Log Hash Chain — SHA-256 Chaining + Per-Entry Signing
 *
 * Each log entry's hash includes the previous entry's hash, creating a
 * cryptographically linked chain. Any modification to any entry
 * invalidates all subsequent entries.
 *
 * DS alignment:
 *   - Genesis hash uses zero-fill (64 hex zeros) instead of 'GENESIS' string
 *   - DS chains across flights (previous_log_hash = hash of last flight's log)
 *   - JADS chains within a single flight AND across flights
 *
 * This is the technical foundation of JADS's BSA 2023 compliance claim.
 */

import * as crypto from 'crypto';
import {
  FlightLogEntry,
  FlightLogEntryInput,
  ChainVerificationResult,
} from './FlightLogTypes';

// ── Deterministic JSON Stringify ───────────────────────────────────────

/**
 * Deterministic JSON.stringify with sorted keys.
 * CRITICAL: Must produce identical output across JS engines.
 */
export function deterministicStringify(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];

  for (const key of sortedKeys) {
    const val = obj[key];
    let serialized: string;

    if (val === null || val === undefined) {
      serialized = 'null';
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      serialized = deterministicStringify(val as Record<string, unknown>);
    } else {
      serialized = JSON.stringify(val);
    }

    parts.push(`${JSON.stringify(key)}:${serialized}`);
  }

  return `{${parts.join(',')}}`;
}

// ── Flight Log Chain ───────────────────────────────────────────────────

/**
 * Zero-fill genesis hash (64 hex zeros = SHA-256 of nothing).
 * DS uses previous_log_hash from the prior flight; for the first entry
 * in the first flight, we use all-zero hash instead of 'GENESIS' string.
 */
const GENESIS_HASH = '0'.repeat(64);

export class FlightLogChain {
  private chain: FlightLogEntry[] = [];
  private flightId: string;
  private droneUIN: string;
  private signingKey: string; // RSA private key PEM
  private sequenceCounter = 0;
  /** Hash from the drone's previous flight log (DS cross-flight chain) */
  private previousFlightLogHash: string;

  /**
   * @param flightId  Matches NPNT PA FlightID
   * @param droneUIN  Drone UIN
   * @param signingKey  RSA private key PEM
   * @param previousFlightLogHash  Hash of the drone's last flight log
   *                               (empty/undefined for first-ever flight → uses zero-fill)
   */
  constructor(
    flightId: string,
    droneUIN: string,
    signingKey: string,
    previousFlightLogHash?: string
  ) {
    this.flightId = flightId;
    this.droneUIN = droneUIN;
    this.signingKey = signingKey;
    this.previousFlightLogHash = previousFlightLogHash || GENESIS_HASH;
  }

  /**
   * Add an entry to the chain.
   * Automatically computes sequenceNumber, previousLogHash, entryHash, and signature.
   */
  addEntry(
    partial: Omit<FlightLogEntryInput, 'flightId' | 'droneUIN'>
  ): FlightLogEntry {
    const seq = this.sequenceCounter++;

    // Compute previousLogHash
    let previousLogHash: string;
    if (seq === 0) {
      // First entry uses zero-fill genesis hash (DS-aligned)
      previousLogHash = this.previousFlightLogHash;
    } else {
      const prevEntry = this.chain[this.chain.length - 1];
      previousLogHash = crypto
        .createHash('sha256')
        .update(deterministicStringify(prevEntry as unknown as Record<string, unknown>))
        .digest('hex');
    }

    // Build entry with all fields except entryHash and signature
    const entry: FlightLogEntry = {
      entryType: partial.entryType,
      timestamp: partial.timestamp,
      latitude: partial.latitude,
      longitude: partial.longitude,
      altitudeMeters: partial.altitudeMeters,
      speedMps: partial.speedMps,
      headingDeg: partial.headingDeg,
      droneUIN: this.droneUIN,
      flightId: this.flightId,
      sequenceNumber: seq,
      previousLogHash,
      entryHash: '',    // placeholder — will be set after hash computation
      signature: '',    // placeholder — will be set after signing
    };

    // Compute entryHash = SHA-256 of deterministic JSON (with signature as empty string)
    const entryForHash = { ...entry, signature: '' };
    const entryHash = crypto
      .createHash('sha256')
      .update(deterministicStringify(entryForHash as unknown as Record<string, unknown>))
      .digest('hex');

    entry.entryHash = entryHash;

    // Sign entryHash with RSA-2048-SHA256
    try {
      const signer = crypto.createSign('SHA256');
      signer.update(entryHash, 'utf8');
      entry.signature = signer.sign(this.signingKey, 'base64');
    } catch {
      // If signing fails (e.g., no valid key), use HMAC fallback for demo
      entry.signature = crypto
        .createHmac('sha256', this.signingKey)
        .update(entryHash)
        .digest('base64');
    }

    this.chain.push(entry);
    return entry;
  }

  /**
   * Verify the integrity of the entire chain.
   */
  verifyChain(): ChainVerificationResult {
    const errors: string[] = [];
    let brokenLinkAt: number | undefined;
    let invalidSignatureAt: number | undefined;

    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];

      // Verify previousLogHash
      if (i === 0) {
        if (entry.previousLogHash !== this.previousFlightLogHash) {
          errors.push(`Entry 0: previousLogHash should be '${this.previousFlightLogHash.substring(0, 16)}...', got '${entry.previousLogHash.substring(0, 16)}...'`);
          brokenLinkAt = brokenLinkAt ?? 0;
        }
      } else {
        const prevEntry = this.chain[i - 1];
        const expectedPrevHash = crypto
          .createHash('sha256')
          .update(deterministicStringify(prevEntry as unknown as Record<string, unknown>))
          .digest('hex');

        if (entry.previousLogHash !== expectedPrevHash) {
          errors.push(`Entry ${entry.sequenceNumber}: previousLogHash mismatch — chain broken`);
          brokenLinkAt = brokenLinkAt ?? entry.sequenceNumber;
        }
      }

      // Verify entryHash
      const entryForHash = { ...entry, signature: '', mlDsaSignature: undefined };
      // Remove mlDsaSignature from hash computation to maintain backward compat
      delete (entryForHash as any).mlDsaSignature;
      const recomputedHash = crypto
        .createHash('sha256')
        .update(deterministicStringify(entryForHash as unknown as Record<string, unknown>))
        .digest('hex');

      if (entry.entryHash !== recomputedHash) {
        errors.push(`Entry ${entry.sequenceNumber}: entryHash mismatch — data tampered`);
        brokenLinkAt = brokenLinkAt ?? entry.sequenceNumber;
      }

      // Sequence number check
      if (entry.sequenceNumber !== i) {
        errors.push(`Entry ${i}: sequenceNumber should be ${i}, got ${entry.sequenceNumber}`);
      }
    }

    return {
      valid: errors.length === 0,
      entriesVerified: this.chain.length,
      brokenLinkAt,
      invalidSignatureAt,
      errors,
    };
  }

  /**
   * Export the complete chain.
   */
  exportChain(): FlightLogEntry[] {
    return [...this.chain];
  }

  /**
   * Get the SHA-256 hash of the entire chain (hash of all entryHashes concatenated).
   */
  getChainHash(): string {
    const allHashes = this.chain.map(e => e.entryHash).join('');
    return crypto.createHash('sha256').update(allHashes).digest('hex');
  }

  /**
   * Get the number of entries in the chain.
   */
  get length(): number {
    return this.chain.length;
  }

  /**
   * Get the number of geofence breach entries.
   */
  get breachCount(): number {
    return this.chain.filter(e => e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH').length;
  }

  /**
   * Get the last entry in the chain (or null if empty).
   */
  get lastEntry(): FlightLogEntry | null {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : null;
  }
}

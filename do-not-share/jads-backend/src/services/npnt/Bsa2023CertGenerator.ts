/**
 * FP14 — BSA 2023 Section 63 Certificate Auto-Generator
 *
 * Generates certificates under Section 63 of the Bharatiya Sakshya
 * Adhiniyam 2023 for electronic evidence admissibility.
 *
 * Part A is auto-generated from flight log hash chain data.
 * Part B requires human signature (PENDING_HUMAN_SIGNATURE placeholder).
 */

import { FlightLogChain } from './FlightLogChain';
import { FlightLogEntry } from './FlightLogTypes';

// ── Types ──────────────────────────────────────────────────────────────

export interface Bsa2023Certificate {
  certificateId: string;
  generatedAt: string;        // ISO 8601

  partA: {
    documentTitle: 'CERTIFICATE UNDER SECTION 63 OF THE BHARATIYA SAKSHYA ADHINIYAM 2023';
    caseReference?: string;
    deviceDetails: {
      deviceType: 'UAV TELEMETRY PLATFORM';
      systemName: string;
      operatedBy: string;
      location: string;
    };
    droneDetails: {
      uin: string;
      make: string;
      model: string;
      serialNumber?: string;
    };
    flightDetails: {
      flightId: string;
      missionId: string;
      operatorName: string;
      pilotId: string;
      flightDate: string;
      startTime: string;
      endTime: string;
    };
    evidenceRecord: {
      description: 'FLIGHT LOG HASH CHAIN WITH TELEMETRY RECORDS';
      totalEntries: number;
      hashAlgorithm: 'SHA-256';
      chainHash: string;
      geofenceBreaches: number;
      firstEntryHash: string;
      lastEntryHash: string;
    };
    generatedAt: string;
    generatedBy: 'JADS Automated Certificate System';
  };

  partB: {
    certifyingOfficerName: string;
    designation: string;
    organisation: string;
    signature: 'PENDING_HUMAN_SIGNATURE';
    date: string;
  };
}

// ── Input ──────────────────────────────────────────────────────────────

export interface Bsa2023CertInput {
  missionId: string;
  flightId: string;
  operatorName: string;
  pilotId: string;
  droneUIN: string;
  droneMake: string;
  droneModel: string;
  droneSerialNumber?: string;
  flightDate: string;           // YYYY-MM-DD
  caseReference?: string;
  certifyingOfficerName?: string;
  certifyingDesignation?: string;
  certifyingOrganisation?: string;
}

// ── Generator ──────────────────────────────────────────────────────────

let _certCounter = 0;

/**
 * Generate a BSA 2023 Section 63 certificate from a flight log chain.
 *
 * @param chain  The complete, verified flight log chain
 * @param input  Metadata about the mission and certifying officer
 * @returns      The BSA 2023 certificate (Part A auto-filled, Part B pending)
 */
export function generateBsa2023Certificate(
  chain: FlightLogChain,
  input: Bsa2023CertInput
): Bsa2023Certificate {
  _certCounter++;
  const now = new Date().toISOString();
  const entries = chain.exportChain();

  // Compute chain hash fresh (not cached — proves freshness)
  const chainHash = chain.getChainHash();

  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];

  // Count geofence breaches
  const breaches = entries.filter(
    e => e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH'
  ).length;

  // Determine flight times from chain entries
  const startTime = firstEntry
    ? new Date(firstEntry.timestamp).toISOString()
    : 'UNKNOWN';
  const endTime = lastEntry
    ? new Date(lastEntry.timestamp).toISOString()
    : 'UNKNOWN';

  const certId = `BSA63-JADS-${new Date().getFullYear()}-${_certCounter.toString().padStart(6, '0')}`;

  return {
    certificateId: certId,
    generatedAt: now,

    partA: {
      documentTitle: 'CERTIFICATE UNDER SECTION 63 OF THE BHARATIYA SAKSHYA ADHINIYAM 2023',
      caseReference: input.caseReference,
      deviceDetails: {
        deviceType: 'UAV TELEMETRY PLATFORM',
        systemName: 'JADS v1.0 — Joint Airspace Drone System',
        operatedBy: input.certifyingOrganisation ?? 'JADS Platform',
        location: 'India',
      },
      droneDetails: {
        uin: input.droneUIN,
        make: input.droneMake,
        model: input.droneModel,
        serialNumber: input.droneSerialNumber,
      },
      flightDetails: {
        flightId: input.flightId,
        missionId: input.missionId,
        operatorName: input.operatorName,
        pilotId: input.pilotId,
        flightDate: input.flightDate,
        startTime,
        endTime,
      },
      evidenceRecord: {
        description: 'FLIGHT LOG HASH CHAIN WITH TELEMETRY RECORDS',
        totalEntries: entries.length,
        hashAlgorithm: 'SHA-256',
        chainHash,
        geofenceBreaches: breaches,
        firstEntryHash: firstEntry?.entryHash ?? '',
        lastEntryHash: lastEntry?.entryHash ?? '',
      },
      generatedAt: now,
      generatedBy: 'JADS Automated Certificate System',
    },

    partB: {
      certifyingOfficerName: input.certifyingOfficerName ?? 'PENDING',
      designation: input.certifyingDesignation ?? 'PENDING',
      organisation: input.certifyingOrganisation ?? 'PENDING',
      signature: 'PENDING_HUMAN_SIGNATURE',
      date: new Date().toISOString().split('T')[0],
    },
  };
}

/**
 * Reset certificate counter (for testing).
 */
export function resetCertCounter(n = 0): void {
  _certCounter = n;
}

/**
 * DS-10 — Full DigitalSkyAdapterStub
 *
 * Implements ALL IDigitalSkyAdapter methods (required + optional)
 * using the DigitalSkyMockServer for state management.
 *
 * This stub never makes network calls. Government replaces it with
 * their live Digital Sky portal integration via USE_LIVE_ADAPTERS=true.
 */

import type {
  IDigitalSkyAdapter,
  PermissionArtefact,
  DroneRegistration,
  PilotLicense,
  FlightLogSubmission,
  FlightLogReceipt,
  FlyDronePermissionInput,
  FlyDronePermissionResult,
  DsAirspaceZone,
} from '../interfaces/IDigitalSkyAdapter'
import { getDigitalSkyMockServer } from './DigitalSkyMockServer'

const STUB_ARTEFACTS: Record<string, PermissionArtefact> = {
  'PA-2024-DEMO-001': {
    paId:          'PA-2024-DEMO-001',
    droneUin:      'UIN-DEMO-001',
    pilotId:       'RPL-DEMO-001',
    validFrom:     '2024-01-01T00:00:00Z',
    validTo:       '2025-12-31T23:59:59Z',
    operatingArea: {
      type: 'Polygon',
      coordinates: [[[77.0, 28.4], [77.4, 28.4], [77.4, 28.8], [77.0, 28.8], [77.0, 28.4]]],
    },
    maxAltitudeM:  120,
    flightPurpose: 'SURVEY',
    status:        'ACTIVE',
  },
}

const STUB_REGISTRATIONS: Record<string, DroneRegistration> = {
  'UIN-DEMO-001': {
    uin:              'UIN-DEMO-001',
    manufacturerName: 'JADS Test Manufacturer',
    modelName:        'JADS-Phantom-T1',
    weightCategory:   'SMALL',
    registrationDate: '2024-01-15T00:00:00Z',
    ownerName:        'JADS Demo Operator',
    ownerEntityType:  'ORGANIZATION',
    status:           'REGISTERED',
  },
}

const STUB_LICENSES: Record<string, PilotLicense> = {
  'RPL-DEMO-001': {
    rplNumber:    'RPL-DEMO-001',
    pilotName:    'JADS Demo Pilot',
    licenseClass: 'SMALL',
    validFrom:    '2024-01-01T00:00:00Z',
    validTo:      '2026-12-31T23:59:59Z',
    status:       'ACTIVE',
  },
}

export class DigitalSkyAdapterStub implements IDigitalSkyAdapter {
  private mockServer = getDigitalSkyMockServer()

  // ── Required methods ─────────────────────────────────────────────────

  async validatePermissionArtefact(paId: string): Promise<PermissionArtefact | null> {
    return STUB_ARTEFACTS[paId] ?? null
  }

  async getDroneRegistration(uin: string): Promise<DroneRegistration | null> {
    return STUB_REGISTRATIONS[uin] ?? null
  }

  async verifyPilotLicense(rplNumber: string): Promise<PilotLicense | null> {
    return STUB_LICENSES[rplNumber] ?? null
  }

  async submitFlightLog(submission: FlightLogSubmission): Promise<FlightLogReceipt> {
    // Use mock server for stateful log tracking
    const result = this.mockServer.uploadFlightLog(submission.missionId, {
      PermissionArtefact: submission.droneUin,
      previous_log_hash: submission.hashChainRootHex,
      LogEntries: submission.dsFlightLog?.LogEntries ?? [],
    })

    return {
      receiptId:   result.receiptId || `RECEIPT-STUB-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      accepted:    result.accepted,
      rejectionReason: result.accepted ? undefined : 'Duplicate flight log submission',
    }
  }

  async validateNpntToken(_tokenBase64: string): Promise<{
    valid: boolean; droneUin: string | null; paId: string | null; error?: string
  }> {
    return {
      valid:    true,
      droneUin: 'UIN-DEMO-001',
      paId:     'PA-2024-DEMO-001',
    }
  }

  // ── Optional DS-specific methods ─────────────────────────────────────

  async submitFlyDronePermission(input: FlyDronePermissionInput): Promise<FlyDronePermissionResult> {
    const result = this.mockServer.submitFlyPermission({
      pilotBusinessIdentifier: input.pilotBusinessIdentifier,
      flyArea: input.flyArea,
      droneId: input.droneId,
      payloadWeightInKg: input.payloadWeightInKg,
      payloadDetails: input.payloadDetails,
      flightPurpose: input.flightPurpose,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
      maxAltitude: input.maxAltitude,
      operatorId: input.operatorId,
    })

    return {
      applicationId: result.id,
      status: result.status,
      signedPaXml: result.status === 'APPROVED' ? '<UAPermission><!-- stub PA --></UAPermission>' : undefined,
      ficNumber: result.ficNumber,
      adcNumber: result.adcNumber,
      fir: result.fir,
    }
  }

  async getAirspaceZones(): Promise<DsAirspaceZone[]> {
    return this.mockServer.getZones()
  }

  async registerDroneDevice(payload: {
    drone: { version: string; txn: string; deviceId: string; deviceModelId: string; operatorBusinessIdentifier: string }
    signature: string
    digitalCertificate: string
  }): Promise<{ responseCode: string; uin?: string }> {
    // Use default manufacturer for stub
    return this.mockServer.registerDevice('JADS-MFR-001', payload)
  }

  async ping(): Promise<{ reachable: boolean; latencyMs: number }> {
    const start = Date.now()
    this.mockServer.ping()
    return { reachable: true, latencyMs: Date.now() - start }
  }

}

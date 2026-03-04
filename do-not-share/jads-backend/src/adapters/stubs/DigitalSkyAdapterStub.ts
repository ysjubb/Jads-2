// Stub implementation of IDigitalSkyAdapter.
// Returns deterministic test data for development and demo environments.
// Government replaces this with their live Digital Sky portal integration.
// This stub must never make network calls.

import type {
  IDigitalSkyAdapter,
  PermissionArtefact,
  DroneRegistration,
  PilotLicense,
  FlightLogSubmission,
  FlightLogReceipt,
} from '../interfaces/IDigitalSkyAdapter'

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
    return {
      receiptId:   `RECEIPT-STUB-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      accepted:    true,
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
}

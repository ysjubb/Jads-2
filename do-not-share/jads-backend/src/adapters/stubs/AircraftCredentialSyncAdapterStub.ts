import type {
  IAircraftCredentialSyncAdapter,
  AircraftCredentialSyncResult,
} from '../interfaces/IAircraftCredentialSyncAdapter'

export class AircraftCredentialSyncAdapterStub implements IAircraftCredentialSyncAdapter {
  async syncFromAAI(): Promise<AircraftCredentialSyncResult> {
    return {
      credentials: [
        {
          externalId:       'AAI-CPL-2024-001',
          pilotName:        'Demo Aircraft Pilot',
          licenseType:      'CPL',
          licenseNumber:    'CPL/1234/2022',
          issuingAuthority: 'AAI',
          validFrom:        '2022-01-01T00:00:00Z',
          validTo:          '2027-12-31T23:59:59Z',
          status:           'ACTIVE',
        },
      ],
      syncedAtUtc: new Date().toISOString(),
      totalCount:  1,
    }
  }

  async syncFromDGCA(): Promise<AircraftCredentialSyncResult> {
    return {
      credentials: [],
      syncedAtUtc: new Date().toISOString(),
      totalCount:  0,
    }
  }
}

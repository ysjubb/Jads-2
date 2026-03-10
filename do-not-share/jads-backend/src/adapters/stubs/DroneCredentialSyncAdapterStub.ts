import type {
  IDroneCredentialSyncAdapter,
  DroneCredentialSyncResult,
} from '../interfaces/IDroneCredentialSyncAdapter'

export class DroneCredentialSyncAdapterStub implements IDroneCredentialSyncAdapter {
  async syncFromDigitalSky(): Promise<DroneCredentialSyncResult> {
    return {
      credentials: [
        {
          externalId:       'DSKY-RPL-2024-001',
          operatorName:     'Demo Drone Operator',
          licenseType:      'RPL',
          licenseNumber:    'RPL-DEMO-001',
          issuingAuthority: 'DIGITAL_SKY',
          validFrom:        '2024-01-01T00:00:00Z',
          validTo:          '2026-12-31T23:59:59Z',
          status:           'ACTIVE',
        },
      ],
      syncedAtUtc: new Date().toISOString(),
      totalCount:  1,
    }
  }

  async syncFromDGCA(): Promise<DroneCredentialSyncResult> {
    return {
      credentials: [],
      syncedAtUtc: new Date().toISOString(),
      totalCount:  0,
    }
  }
}

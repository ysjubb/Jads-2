// Adapter interface for syncing aircraft pilot credentials from AAI/DGCA.
// Government replaces AircraftCredentialSyncAdapterStub with their live implementation.

export interface AircraftCredentialRecord {
  externalId:       string    // AAI/DGCA license number
  pilotName:        string
  licenseType:      string    // CPL, ATPL, PPL
  licenseNumber:    string
  issuingAuthority: 'AAI' | 'DGCA'
  validFrom:        string    // ISO 8601
  validTo:          string    // ISO 8601
  status:           'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
}

export interface AircraftCredentialSyncResult {
  credentials: AircraftCredentialRecord[]
  syncedAtUtc: string
  totalCount:  number
}

export interface IAircraftCredentialSyncAdapter {
  /** Fetch all current aircraft pilot credentials from AAI. */
  syncFromAAI(): Promise<AircraftCredentialSyncResult>

  /** Fetch all current aircraft pilot credentials from DGCA. */
  syncFromDGCA(): Promise<AircraftCredentialSyncResult>
}

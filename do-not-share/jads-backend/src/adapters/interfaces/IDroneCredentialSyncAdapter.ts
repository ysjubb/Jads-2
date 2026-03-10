// Adapter interface for syncing drone operator credentials from Digital Sky/DGCA.
// Government replaces DroneCredentialSyncAdapterStub with their live implementation.

export interface DroneCredentialRecord {
  externalId:       string    // Digital Sky RPL number or DGCA ID
  operatorName:     string
  licenseType:      string    // RPL, restricted RPL
  licenseNumber:    string
  issuingAuthority: 'DIGITAL_SKY' | 'DGCA'
  validFrom:        string    // ISO 8601
  validTo:          string    // ISO 8601
  status:           'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
}

export interface DroneCredentialSyncResult {
  credentials: DroneCredentialRecord[]
  syncedAtUtc: string
  totalCount:  number
}

export interface IDroneCredentialSyncAdapter {
  /** Fetch all current drone operator credentials from Digital Sky. */
  syncFromDigitalSky(): Promise<DroneCredentialSyncResult>

  /** Fetch all current drone operator credentials from DGCA. */
  syncFromDGCA(): Promise<DroneCredentialSyncResult>
}

// Adapter interface for FIR (Flight Information Region) data providers.
// Provides FIC (Flight Information Circulars) from each FIR office.

export interface FicRecord {
  ficNumber:     string
  firCode:       string
  subject:       string
  content:       string
  category:      string
  effectiveFrom: string
  effectiveTo:   string | null
  supersedes:    string | null
  issuedBy:      string
  issuedAtUtc:   string
}

export interface FicPullResult {
  records:   FicRecord[]
  asOfUtc:   string
}

export interface FicUpdateResult {
  newRecords:        FicRecord[]
  expiredFicNumbers: string[]
  asOfUtc:           string
}

export interface IFirAdapter {
  // Pull all active FIC records for a FIR.
  pullFicRecords(firCode: string): Promise<FicPullResult>

  // Pull only FIC records changed since a given timestamp.
  pullFicUpdates(firCode: string, sinceUtc: string): Promise<FicUpdateResult>
}

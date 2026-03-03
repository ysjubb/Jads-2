// Adapter interface for NOTAM data providers.
// Government replaces NotamAdapterStub with a live implementation without
// changing any job code. All jobs code against this interface.

export interface NotamRecord {
  notamNumber:   string
  notamSeries:   string
  firCode:       string
  subject:       string
  condition:     string
  traffic:       string
  purpose:       string
  scope:         string
  lowerFl:       number | null
  upperFl:       number | null
  areaGeoJson:   string | null   // GeoJSON polygon as string, or null
  effectiveFrom: string          // ISO 8601
  effectiveTo:   string | null   // null means permanent until cancelled
  rawText:       string
}

export interface INotamAdapter {
  // Fetch all currently active NOTAMs for a given FIR.
  // Returns all active NOTAMs — job marks missing ones inactive.
  getActiveNotams(firCode: string): Promise<NotamRecord[]>

  // Fetch a single NOTAM by number.
  getNotam(notamNumber: string): Promise<NotamRecord | null>
}

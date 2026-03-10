// Adapter interface for Jeppesen NavData providers.
// Imports licensed chart data: approach charts, SID/STAR procedures, airport diagrams, navaids.
// @dataFlow ONE_WAY — import only. JADS never pushes data back to Jeppesen.
// Government must obtain Jeppesen NavData API license separately.

export interface JeppesenChartRecord {
  chartId:        string        // e.g. "VIDP-ILS-28R"
  icaoCode:       string
  chartType:      string        // APPROACH, SID, STAR, AIRPORT, ENROUTE
  procedureName:  string
  revision:       string        // e.g. "REV-24-03"
  effectiveDate:  string        // ISO 8601
  expiryDate:     string | null
  chartDataUrl:   string | null // URL or reference to PDF/vector chart data
  waypointsJson:  string | null // JSON array of waypoints for this procedure
}

export interface JeppesenNavaid {
  navaidId:    string        // e.g. "DPN" (Delhi VOR)
  type:        string        // VOR, DME, NDB, ILS, VORTAC
  name:        string
  lat:         number
  lon:         number
  frequency:   string | null
  declination: number | null
  icaoCode:    string | null // associated aerodrome
  firCode:     string | null
}

export interface IJeppesenAdapter {
  // Pull all charts for an aerodrome.
  getCharts(icaoCode: string): Promise<JeppesenChartRecord[]>

  // Pull all navaids in a FIR.
  getNavaids(firCode: string): Promise<JeppesenNavaid[]>

  // Pull chart revisions since a date.
  getChartUpdates(since: string): Promise<JeppesenChartRecord[]>

  // Check license/subscription status with Jeppesen.
  getLicenseStatus(): Promise<{ valid: boolean; expiresAt: string | null }>
}

// Stub implementation of IJeppesenAdapter.
// Returns deterministic chart and navaid data for major Indian aerodromes.
// Government replaces this with their Jeppesen NavData API integration.
// This stub must never make network calls.

import type {
  IJeppesenAdapter, JeppesenChartRecord, JeppesenNavaid,
} from '../interfaces/IJeppesenAdapter'

// ── Stub chart data ─────────────────────────────────────────

function makeChart(
  icaoCode: string, chartType: string, procedureName: string, revision: string
): JeppesenChartRecord {
  return {
    chartId:       `${icaoCode}-${chartType}-${procedureName}`.replace(/\s+/g, '-').toUpperCase(),
    icaoCode,
    chartType,
    procedureName,
    revision,
    effectiveDate: '2024-01-15T00:00:00Z',
    expiryDate:    '2025-01-14T23:59:59Z',
    chartDataUrl:  null,   // Stub: no actual chart PDF
    waypointsJson: null,
  }
}

const STUB_CHARTS: Record<string, JeppesenChartRecord[]> = {
  VIDP: [
    makeChart('VIDP', 'APPROACH', 'ILS 28R',     'REV-24-03'),
    makeChart('VIDP', 'APPROACH', 'ILS 10L',     'REV-24-03'),
    makeChart('VIDP', 'SID',     'GUDUM 1A',     'REV-24-02'),
    makeChart('VIDP', 'STAR',    'EDNOL 1A',     'REV-24-02'),
    makeChart('VIDP', 'AIRPORT', 'AD Chart',     'REV-24-01'),
  ],
  VABB: [
    makeChart('VABB', 'APPROACH', 'ILS 27',      'REV-24-03'),
    makeChart('VABB', 'APPROACH', 'VOR 09',      'REV-24-02'),
    makeChart('VABB', 'SID',     'ANDHERI 1A',   'REV-24-01'),
    makeChart('VABB', 'STAR',    'BETAN 1A',     'REV-24-01'),
    makeChart('VABB', 'AIRPORT', 'AD Chart',     'REV-24-01'),
  ],
  VOMM: [
    makeChart('VOMM', 'APPROACH', 'ILS 07',      'REV-24-02'),
    makeChart('VOMM', 'SID',     'IDRIS 1A',     'REV-24-01'),
    makeChart('VOMM', 'STAR',    'GUTAL 1A',     'REV-24-01'),
    makeChart('VOMM', 'AIRPORT', 'AD Chart',     'REV-24-01'),
  ],
  VECC: [
    makeChart('VECC', 'APPROACH', 'ILS 19R',     'REV-24-02'),
    makeChart('VECC', 'SID',     'TUKRI 1A',     'REV-24-01'),
    makeChart('VECC', 'STAR',    'BUBUN 1A',     'REV-24-01'),
    makeChart('VECC', 'AIRPORT', 'AD Chart',     'REV-24-01'),
  ],
}

// ── Stub navaid data ────────────────────────────────────────

function makeNavaid(
  navaidId: string, type: string, name: string, lat: number, lon: number,
  frequency: string | null, firCode: string, icaoCode?: string
): JeppesenNavaid {
  return { navaidId, type, name, lat, lon, frequency, declination: null, icaoCode: icaoCode ?? null, firCode }
}

const STUB_NAVAIDS: Record<string, JeppesenNavaid[]> = {
  VIDF: [
    makeNavaid('DPN', 'VOR/DME', 'Delhi VOR',       28.5665, 77.1031, '116.10', 'VIDF', 'VIDP'),
    makeNavaid('PNJ', 'VOR',     'Pinjore VOR',      30.7600, 76.9200, '113.60', 'VIDF'),
    makeNavaid('JDR', 'NDB',     'Jodhpur NDB',      26.2500, 73.0500, '375',    'VIDF'),
    makeNavaid('IDP', 'ILS',     'Delhi ILS 28R',    28.5559, 77.0987, '110.30', 'VIDF', 'VIDP'),
  ],
  VABB: [
    makeNavaid('BBB', 'VOR/DME', 'Mumbai VOR',       19.0896, 72.8656, '116.50', 'VABB', 'VABB'),
    makeNavaid('GOA', 'VOR',     'Goa VOR',          15.3800, 73.8300, '112.30', 'VABB'),
    makeNavaid('IBB', 'ILS',     'Mumbai ILS 27',    19.0900, 72.8640, '109.50', 'VABB', 'VABB'),
  ],
  VECC: [
    makeNavaid('CCU', 'VOR/DME', 'Kolkata VOR',      22.6500, 88.4500, '113.30', 'VECC', 'VECC'),
    makeNavaid('GAY', 'NDB',     'Gaya NDB',         24.7400, 84.9500, '329',    'VECC'),
  ],
  VOMF: [
    makeNavaid('MAA', 'VOR/DME', 'Chennai VOR',      12.9900, 80.1800, '115.90', 'VOMF', 'VOMM'),
    makeNavaid('BLR', 'VOR/DME', 'Bangalore VOR',    13.1986, 77.7066, '114.50', 'VOMF', 'VOBL'),
    makeNavaid('TRV', 'NDB',     'Trivandrum NDB',    8.4800, 76.9200, '305',    'VOMF'),
  ],
}

// ── Stub class ──────────────────────────────────────────────

export class JeppesenAdapterStub implements IJeppesenAdapter {
  async getCharts(icaoCode: string): Promise<JeppesenChartRecord[]> {
    return STUB_CHARTS[icaoCode] ?? []
  }

  async getNavaids(firCode: string): Promise<JeppesenNavaid[]> {
    return STUB_NAVAIDS[firCode] ?? []
  }

  async getChartUpdates(_since: string): Promise<JeppesenChartRecord[]> {
    // Stub: return all charts as if they were all recently updated
    return Object.values(STUB_CHARTS).flat()
  }

  async getLicenseStatus(): Promise<{ valid: boolean; expiresAt: string | null }> {
    return { valid: true, expiresAt: '2027-12-31T23:59:59Z' }
  }
}

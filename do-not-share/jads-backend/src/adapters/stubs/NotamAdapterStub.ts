// Stub implementation of INotamAdapter.
// Returns deterministic test NOTAMs for all 4 Indian FIRs.
// Government replaces this with their live NOTAM portal integration.
// This stub must never make network calls.

import type { INotamAdapter, NotamRecord } from '../interfaces/INotamAdapter'

const STUB_NOTAMS: Record<string, NotamRecord[]> = {
  VIDF: [
    {
      notamNumber: 'A0001/24', notamSeries: 'A', firCode: 'VIDF',
      subject: 'AERODROME', condition: 'CLOSED', traffic: 'IFR VFR', purpose: 'BO', scope: 'A',
      lowerFl: 0, upperFl: 999, areaGeoJson: null,
      effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-12-31T23:59:00Z',
      rawText: 'NOTAM A0001/24 VIDP AD CLSD 0100-2300 DAILY',
    },
    {
      notamNumber: 'A0002/24', notamSeries: 'A', firCode: 'VIDF',
      subject: 'AIRSPACE', condition: 'RESTRICTED', traffic: 'ALL', purpose: 'M', scope: 'AE',
      lowerFl: 0, upperFl: 200, areaGeoJson: '{"type":"Polygon","coordinates":[[[77.0,28.5],[77.5,28.5],[77.5,29.0],[77.0,29.0],[77.0,28.5]]]}',
      effectiveFrom: '2024-01-15T06:00:00Z', effectiveTo: null,  // permanent until cancelled
      rawText: 'NOTAM A0002/24 R/AREA ACTIVE SFC-FL200 PERM',
    },
  ],
  VABB: [
    {
      notamNumber: 'B0001/24', notamSeries: 'B', firCode: 'VABB',
      subject: 'NAVAID', condition: 'UNSERVICEABLE', traffic: 'IFR', purpose: 'N', scope: 'E',
      lowerFl: null, upperFl: null, areaGeoJson: null,
      effectiveFrom: '2024-02-01T00:00:00Z', effectiveTo: '2024-02-28T23:59:00Z',
      rawText: 'NOTAM B0001/24 VABB VOR/DME U/S',
    },
  ],
  VECC: [
    {
      notamNumber: 'C0001/24', notamSeries: 'C', firCode: 'VECC',
      subject: 'AERODROME', condition: 'WORKS IN PROGRESS', traffic: 'IFR VFR', purpose: 'B', scope: 'A',
      lowerFl: 0, upperFl: 0, areaGeoJson: null,
      effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-06-30T23:59:00Z',
      rawText: 'NOTAM C0001/24 VECC TWY ALPHA WIP',
    },
  ],
  VOMF: [
    {
      notamNumber: 'D0001/24', notamSeries: 'D', firCode: 'VOMF',
      subject: 'OBSTACLE', condition: 'NEW', traffic: 'IFR VFR', purpose: 'O', scope: 'E',
      lowerFl: 0, upperFl: 50, areaGeoJson: null,
      effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: null,
      rawText: 'NOTAM D0001/24 NEW CRANE 500FT AMSL 080423N 0803251E',
    },
  ],
}

export class NotamAdapterStub implements INotamAdapter {
  async getActiveNotams(firCode: string): Promise<NotamRecord[]> {
    return STUB_NOTAMS[firCode] ?? []
  }

  async getNotam(notamNumber: string): Promise<NotamRecord | null> {
    for (const notams of Object.values(STUB_NOTAMS)) {
      const found = notams.find(n => n.notamNumber === notamNumber)
      if (found) return found
    }
    return null
  }
}

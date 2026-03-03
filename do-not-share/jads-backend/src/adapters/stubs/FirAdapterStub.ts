// Stub implementation of IFirAdapter.
// Returns deterministic FIC records for all 4 Indian FIRs.
// Government replaces this with their FIR office data feeds.
// This stub must never make network calls.

import type { IFirAdapter, FicPullResult, FicUpdateResult } from '../interfaces/IFirAdapter'

const AS_OF = new Date().toISOString()

const STUB_FICS: Record<string, ReturnType<typeof makeFic>[]> = {
  VIDF: [
    makeFic('FIC/VIDF/001/2024', 'VIDF', 'AIRSPACE', 'Temporary restricted area active over VIDP corridor', 'RESTRICTION'),
    makeFic('FIC/VIDF/002/2024', 'VIDF', 'PROCEDURE', 'Revised holding procedure at VIDF – effective immediately', 'ATC'),
  ],
  VABB: [
    makeFic('FIC/VABB/001/2024', 'VABB', 'WEATHER', 'Pre-monsoon turbulence advisory for VABB sector', 'ADVISORY'),
  ],
  VECC: [
    makeFic('FIC/VECC/001/2024', 'VECC', 'NAVAID', 'VOR/DME unserviceable – expect delays', 'NAVAID'),
  ],
  VOMF: [
    makeFic('FIC/VOMF/001/2024', 'VOMF', 'GENERAL', 'Updated FIR boundaries effective 01 FEB 2024', 'GENERAL'),
  ],
}

function makeFic(ficNumber: string, firCode: string, subject: string, content: string, category: string) {
  return {
    ficNumber, firCode, subject, content, category,
    effectiveFrom: '2024-01-01T00:00:00Z',
    effectiveTo:   '2024-12-31T23:59:59Z',
    supersedes:    null as string | null,
    issuedBy:      `${firCode} FIR Office`,
    issuedAtUtc:   '2024-01-01T00:00:00Z',
  }
}

export class FirAdapterStub implements IFirAdapter {
  async pullFicRecords(firCode: string): Promise<FicPullResult> {
    return {
      records:  STUB_FICS[firCode] ?? [],
      asOfUtc:  AS_OF,
    }
  }

  async pullFicUpdates(firCode: string, _sinceUtc: string): Promise<FicUpdateResult> {
    return {
      newRecords:        STUB_FICS[firCode] ?? [],
      expiredFicNumbers: [],
      asOfUtc:           AS_OF,
    }
  }
}

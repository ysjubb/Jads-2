// Stub implementation of IOFPLAdapter.
// Returns deterministic test data for development and demo environments.
// Government replaces this with their live AAI OFPL portal integration.
// This stub must never make network calls.

import type {
  IOFPLAdapter,
  FiledFPL,
  FPLSearchParams,
  FPLActivation,
} from '../interfaces/IOFPLAdapter'

const STUB_FPLS: FiledFPL[] = [
  {
    externalFplId: 'OFPL-2026-0001',
    callsign:      'SXR409',
    aircraftType:  'A320',
    departure:     'VIDP',
    destination:   'VISR',
    eobt:          '2026-03-15T06:00:00Z',
    eet:           90,
    route:         'IGONI UA461 SIPTU',
    cruisingLevel: 'FL310',
    flightRules:   'IFR',
    altDest:       'VIAR',
    picName:       'Capt. R. Sharma',
    remarks:       'DOF/260315 REG/VTJDS OPR/JADS AIR',
    status:        'FILED',
  },
  {
    externalFplId: 'OFPL-2026-0002',
    callsign:      'SEK204',
    aircraftType:  'B738',
    departure:     'VOBL',
    destination:   'VABB',
    eobt:          '2026-03-15T08:30:00Z',
    eet:           120,
    route:         'DUBAD UW63 DOGAR UM875 VAGAD',
    cruisingLevel: 'FL280',
    flightRules:   'IFR',
    altDest:       'VAPO',
    picName:       'Capt. A. Patel',
    remarks:       'DOF/260315 REG/VTBLR OPR/JADS DEMO',
    status:        'FILED',
  },
  {
    externalFplId: 'OFPL-2026-0003',
    callsign:      'IGO117',
    aircraftType:  'A20N',
    departure:     'VABB',
    destination:   'VOCL',
    eobt:          '2026-03-15T10:00:00Z',
    eet:           150,
    route:         'MOLGU UL310 POLAM UL301 IGANI',
    cruisingLevel: 'FL240',
    flightRules:   'IFR',
    altDest:       'VOCI',
    picName:       'Capt. M. Nair',
    remarks:       'DOF/260315 REG/VTIGO OPR/IGO',
    status:        'ACTIVE',
  },
  {
    externalFplId: 'OFPL-2026-0004',
    callsign:      'AIC302',
    aircraftType:  'B787',
    departure:     'VIDP',
    destination:   'VOMM',
    eobt:          '2026-03-15T14:00:00Z',
    eet:           180,
    route:         'GUDUM UP574 ADKAL UB205 TIGER',
    cruisingLevel: 'FL310',
    flightRules:   'IFR',
    altDest:       'VOBL',
    picName:       'Capt. S. Reddy',
    remarks:       'DOF/260315 REG/VTAIC OPR/AIC',
    status:        'FILED',
  },
  {
    externalFplId: 'OFPL-2026-0005',
    callsign:      'VTI501',
    aircraftType:  'ATR7',
    departure:     'VOBL',
    destination:   'VOHS',
    eobt:          '2026-03-16T05:30:00Z',
    eet:           65,
    route:         'ANMOD UR460 OSGAN',
    cruisingLevel: 'A080',
    flightRules:   'IFR',
    altDest:       null,
    picName:       'Capt. K. Das',
    remarks:       'DOF/260316 REG/VTVTI',
    status:        'FILED',
  },
]

export class OFPLAdapterStub implements IOFPLAdapter {
  async searchFlightPlans(params: FPLSearchParams): Promise<FiledFPL[]> {
    return STUB_FPLS.filter(f => {
      if (params.departure && f.departure !== params.departure) return false
      if (params.destination && f.destination !== params.destination) return false
      if (params.callsign && !f.callsign.includes(params.callsign)) return false
      if (params.fromEobt && f.eobt < params.fromEobt) return false
      if (params.toEobt && f.eobt > params.toEobt) return false
      return true
    })
  }

  async getFlightPlan(externalFplId: string): Promise<FiledFPL | null> {
    return STUB_FPLS.find(f => f.externalFplId === externalFplId) ?? null
  }

  async activateFPL(externalFplId: string): Promise<FPLActivation> {
    return {
      externalFplId,
      activatedAt: new Date().toISOString(),
    }
  }

  async closeFPL(_externalFplId: string): Promise<{ closed: boolean }> {
    return { closed: true }
  }

  async cancelFPL(_externalFplId: string): Promise<{ cancelled: boolean }> {
    return { cancelled: true }
  }
}

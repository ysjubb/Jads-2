import type { ParsedNOTAM } from '../utils/notamParser'

export const SAMPLE_NOTAMS: ParsedNOTAM[] = [
  {
    id: 'A0234/26', type: 'NOTAMN', airport: 'VIDP', fir: 'VIDF',
    qCode: 'QILAS', subject: 'ILS', condition: 'Unserviceable',
    validFrom: '2026-03-01T00:00:00Z', validTo: '2026-03-31T23:59:00Z',
    text: 'ILS RWY 28 UNSERVICEABLE DUE MAINTENANCE. CAT I/II/III APPROACHES NOT AVAILABLE RWY 28.',
    severity: 'ADVISORY',
    center: { lat: 28.5665, lon: 77.1031 }, radius: 10,
  },
  {
    id: 'A0189/26', type: 'NOTAMN', airport: 'VABB', fir: 'VABF',
    qCode: 'QMXLC', subject: 'Taxiway', condition: 'Closed',
    validFrom: '2026-03-05T04:00:00Z', validTo: '2026-04-05T16:00:00Z',
    text: 'TWY W CLOSED DUE RESURFACING. USE TWY E FOR RWY 27 DEPARTURES.',
    severity: 'ADVISORY',
    center: { lat: 19.0896, lon: 72.8656 }, radius: 5,
  },
  {
    id: 'C0078/26', type: 'NOTAMN', airport: '', fir: 'VABF',
    qCode: 'QRTCA', subject: 'Restricted Area', condition: 'Activated',
    validFrom: '2026-03-10T06:00:00Z', validTo: '2026-03-12T18:00:00Z',
    text: 'TEMPORARY RESTRICTED AREA TRA MIL-01 ACTIVATED FL200-FL320. MILITARY EXERCISE IN PROGRESS. NO CIVIL TRAFFIC PERMITTED.',
    severity: 'RESTRICTIVE',
    center: { lat: 21.0, lon: 74.5 }, radius: 60,
  },
  {
    id: 'A0301/26', type: 'NOTAMN', airport: 'VOMM', fir: 'VOMF',
    qCode: 'QFAXX', subject: 'Aerodrome', condition: 'Various',
    validFrom: '2026-03-15T00:00:00Z', validTo: '2026-04-15T23:59:00Z',
    text: 'RWY 07/25 RESURFACING, REDUCED PCN 45/F/B/W/U. ACFT WITH ACN ABOVE 45 REQ PRIOR PERMISSION.',
    severity: 'ADVISORY',
    center: { lat: 12.9941, lon: 80.1709 }, radius: 5,
  },
  {
    id: 'C0112/26', type: 'NOTAMN', airport: '', fir: 'VIDF',
    qCode: 'QRTCA', subject: 'Restricted Area', condition: 'Activated',
    validFrom: '2026-03-08T04:00:00Z', validTo: '2026-03-14T16:00:00Z',
    text: 'W33 ROUTE: MILITARY EXERCISE, ALTITUDE RESERVATION FL200-FL320 BETWEEN AGG AND POSIG. REROUTE VIA W19 ADVISED.',
    severity: 'RESTRICTIVE',
    center: { lat: 25.0, lon: 76.0 }, radius: 80,
  },
  {
    id: 'A0055/26', type: 'NOTAMN', airport: 'VOBL', fir: 'VOMF',
    qCode: 'QLCAS', subject: 'Lighting', condition: 'Unserviceable',
    validFrom: '2026-03-01T00:00:00Z', validTo: '2026-03-20T23:59:00Z',
    text: 'PAPI RWY 09L UNSERVICEABLE.',
    severity: 'INFO',
    center: { lat: 13.1979, lon: 77.7063 }, radius: 5,
  },
]

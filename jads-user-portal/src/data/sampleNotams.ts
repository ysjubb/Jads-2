import type { NOTAM } from '../types/charts';

export const SAMPLE_NOTAMS: NOTAM[] = [
  {
    id: 'A0234/26',
    icaoLocation: 'VIDP',
    type: 'N',
    startTime: '2026-03-15T00:00:00Z',
    endTime: '2026-03-20T23:59:00Z',
    text: 'RWY 11/29 CLSD FOR RESURFACING. ALL OPS ON RWY 10/28.',
    qCode: 'QMRLC',
    coordinates: { lat: 28.5665, lng: 77.1031 },
  },
  {
    id: 'A0301/26',
    icaoLocation: 'VIDF',
    type: 'N',
    startTime: '2026-03-18T04:00:00Z',
    endTime: '2026-03-18T10:00:00Z',
    text: 'RESTRICTED AREA R-42 ACTIVATED FL200-FL350. MILITARY EXERCISE.',
    qCode: 'QRRCA',
    radius: 30,
    coordinates: { lat: 27.5, lng: 76.8 },
  },
  {
    id: 'A0155/26',
    icaoLocation: 'VABB',
    type: 'N',
    startTime: '2026-03-10T00:00:00Z',
    endTime: '2026-04-10T23:59:00Z',
    text: 'VOR/DME BBB U/S. VOR APPROACHES NOT AVAILABLE. USE ILS OR RNAV.',
    qCode: 'QNVAS',
  },
  {
    id: 'A0412/26',
    icaoLocation: 'VOBL',
    type: 'N',
    startTime: '2026-03-12T00:00:00Z',
    endTime: '2026-06-30T23:59:00Z',
    text: 'CRANE ERECTED 131FT AGL AT PSN 1312N 07742E. 1.2NM NE OF RWY 09L THR.',
    qCode: 'QOBCE',
    coordinates: { lat: 13.20, lng: 77.70 },
  },
  {
    id: 'A0510/26',
    icaoLocation: 'VIJP',
    type: 'N',
    startTime: '2026-03-25T06:00:00Z',
    endTime: '2026-03-25T14:00:00Z',
    text: 'AIRSHOW IN PROGRESS. TFR WITHIN 5NM RADIUS OF VIJP SFC-5000FT AGL. PRIOR PERMISSION REQUIRED.',
    qCode: 'QRTCA',
    radius: 5,
    coordinates: { lat: 26.8242, lng: 75.8122 },
  },
  {
    id: 'D0088/26',
    icaoLocation: 'VIDP',
    type: 'N',
    startTime: '2026-03-16T00:00:00Z',
    endTime: '2026-03-16T23:59:00Z',
    text: 'DRONE ZONE GREEN ACTIVATED. ZONE-G12 WITHIN 2KM RADIUS OF 2835N 07708E. SFC-200FT AGL. NPNT REQUIRED.',
    qCode: 'QRDCA',
    radius: 2,
    coordinates: { lat: 28.583, lng: 77.133 },
  },
  {
    id: 'A0198/26',
    icaoLocation: 'VOMM',
    type: 'N',
    startTime: '2026-03-10T18:00:00Z',
    endTime: '2026-03-31T03:00:00Z',
    text: 'NIGHT OPS RESTRICTED 1830-0300 UTC DUE BIRD ACTIVITY. SPECIAL CLEARANCE REQUIRED.',
    qCode: 'QAHLC',
  },
  {
    id: 'A0275/26',
    icaoLocation: 'VIDF',
    type: 'N',
    startTime: '2026-03-14T00:00:00Z',
    endTime: '2026-03-21T23:59:00Z',
    text: 'GPS RAIM PREDICTION UNRELIABLE 0200-0400 UTC DAILY. PILOTS TO VERIFY RAIM AVAILABILITY PREFLIGHT.',
    qCode: 'QNMXX',
  },
  {
    id: 'A0340/26',
    icaoLocation: 'VABB',
    type: 'N',
    startTime: '2026-03-20T00:00:00Z',
    endTime: '2026-04-20T23:59:00Z',
    text: 'ILS RWY 27 CAT III DOWNGRADED TO CAT I. GP TRANSMITTER UNDER MAINTENANCE.',
    qCode: 'QICAS',
  },
  {
    id: 'A0600/26',
    icaoLocation: 'VECC',
    type: 'N',
    startTime: '2026-03-22T04:00:00Z',
    endTime: '2026-03-24T16:00:00Z',
    text: 'MILITARY EXERCISE AREA ACTIVATED. D-41 SFC-UNL. NO CIVIL TRAFFIC PERMITTED WITHOUT ATC COORDINATION.',
    qCode: 'QRDCA',
    radius: 25,
    coordinates: { lat: 23.0, lng: 87.5 },
  },
];

export function getNotamsForLocation(icao: string): NOTAM[] {
  return SAMPLE_NOTAMS.filter(n => n.icaoLocation === icao.toUpperCase());
}

export function getActiveNotams(asOf?: Date): NOTAM[] {
  const now = (asOf ?? new Date()).toISOString();
  return SAMPLE_NOTAMS.filter(n => n.startTime <= now && n.endTime >= now);
}

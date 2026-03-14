// OpenAIP integration service for navaids, airports, and airspace data
// API docs: https://www.openaip.net/api-documentation

export interface Navaid {
  id: string
  name: string
  type: 'VOR' | 'VORDME' | 'DME' | 'NDB' | 'ILS' | 'TACAN'
  ident: string
  frequency: string
  lat: number
  lng: number
  elevation?: number
}

export interface OpenAIPAirport {
  id: string
  icaoCode: string
  name: string
  lat: number
  lng: number
  elevation: number
  type: 'LARGE_AP' | 'MED_AP' | 'SMALL_AP' | 'HELIPORT' | 'GLIDER' | 'ULTRA_LIGHT'
  runways: Array<{ designator: string; length: number; surface: string }>
}

// Mock navaids — representative Indian navigation aids
const MOCK_NAVAIDS: Navaid[] = [
  { id: 'DEL-VOR', name: 'Delhi VOR/DME', type: 'VORDME', ident: 'DEL', frequency: '116.30', lat: 28.5665, lng: 77.1031 },
  { id: 'BOM-VOR', name: 'Mumbai VOR/DME', type: 'VORDME', ident: 'BOM', frequency: '113.90', lat: 19.0887, lng: 72.8679 },
  { id: 'BLR-VOR', name: 'Bengaluru VOR/DME', type: 'VORDME', ident: 'BLR', frequency: '117.30', lat: 13.1979, lng: 77.7063 },
  { id: 'MAA-VOR', name: 'Chennai VOR/DME', type: 'VORDME', ident: 'MAA', frequency: '115.90', lat: 12.9941, lng: 80.1709 },
  { id: 'CCU-VOR', name: 'Kolkata VOR/DME', type: 'VORDME', ident: 'CCU', frequency: '114.30', lat: 22.6547, lng: 88.4467 },
  { id: 'HYD-VOR', name: 'Hyderabad VOR/DME', type: 'VORDME', ident: 'HYD', frequency: '116.90', lat: 17.2403, lng: 78.4294 },
  { id: 'JAI-NDB', name: 'Jaipur NDB', type: 'NDB', ident: 'JAI', frequency: '338', lat: 26.8242, lng: 75.8122 },
  { id: 'GOA-VOR', name: 'Goa VOR/DME', type: 'VORDME', ident: 'GOA', frequency: '112.70', lat: 15.3808, lng: 73.8314 },
  { id: 'AMD-VOR', name: 'Ahmedabad VOR/DME', type: 'VORDME', ident: 'AMD', frequency: '115.10', lat: 23.0722, lng: 72.6347 },
  { id: 'LKO-NDB', name: 'Lucknow NDB', type: 'NDB', ident: 'LKO', frequency: '355', lat: 26.7606, lng: 80.8893 },
  { id: 'VIDP-ILS', name: 'Delhi ILS RWY 28', type: 'ILS', ident: 'IDL', frequency: '110.30', lat: 28.5665, lng: 77.1181 },
  { id: 'VABB-ILS', name: 'Mumbai ILS RWY 27', type: 'ILS', ident: 'IBM', frequency: '111.70', lat: 19.0887, lng: 72.8790 },
]

const NAVAID_ICONS: Record<Navaid['type'], string> = {
  VOR: 'V',
  VORDME: 'VD',
  DME: 'D',
  NDB: 'N',
  ILS: 'I',
  TACAN: 'T',
}

export async function fetchNavaids(bbox?: { north: number; south: number; east: number; west: number }): Promise<Navaid[]> {
  // TODO: Replace with OpenAIP API call: GET /api/navaids?bbox=...
  await new Promise(r => setTimeout(r, 200))
  if (!bbox) return MOCK_NAVAIDS
  return MOCK_NAVAIDS.filter(
    n => n.lat >= bbox.south && n.lat <= bbox.north && n.lng >= bbox.west && n.lng <= bbox.east
  )
}

export async function fetchAirportsOpenAIP(bbox?: { north: number; south: number; east: number; west: number }): Promise<OpenAIPAirport[]> {
  // TODO: Replace with OpenAIP or OurAirports API
  await new Promise(r => setTimeout(r, 200))
  return [] // placeholder — aerodromes already in icaoData.ts
}

export function getNavaidIcon(type: Navaid['type']): string {
  return NAVAID_ICONS[type] ?? '?'
}

export function getNavaidColor(type: Navaid['type']): string {
  switch (type) {
    case 'VOR': case 'VORDME': return '#00AAFF'
    case 'DME': return '#40A0FF'
    case 'NDB': return '#FFB800'
    case 'ILS': return '#00C864'
    case 'TACAN': return '#C850C0'
    default: return '#888'
  }
}

// India FIR boundaries as static GeoJSON polygons (WGS84).
// Source: ICAO regional ANP, India AIP GEN 3.1
// IMPORTANT: These boundaries are NOT fetched from the database at runtime.
//            FIR boundaries are sovereign airspace definitions — they do not
//            change on AIRAC cycles. Embed as constants.
// These are simplified polygons adequate for route planning and FIR sequencing.
// For precise ATC boundary definition, use official India AIP.

export interface FirBoundary {
  firCode:  string
  firName:  string
  callsign: string
  polygon:  Array<{ lat: number; lon: number }>
}

export const INDIA_FIR_BOUNDARIES: FirBoundary[] = [
  {
    firCode:  'VIDF',
    firName:  'Delhi FIR',
    callsign: 'DELHI CONTROL',
    polygon: [
      { lat: 37.0, lon: 66.0 },   // NW corner — Pakistan/Afghanistan border
      { lat: 37.0, lon: 78.0 },   // NE — Himalayan north
      { lat: 32.0, lon: 78.0 },   // East, Himachal
      { lat: 28.0, lon: 88.0 },   // NE India/Nepal border
      { lat: 26.0, lon: 88.0 },   // Bihar/West Bengal boundary
      { lat: 26.0, lon: 84.0 },   // Uttar Pradesh eastern boundary
      { lat: 24.0, lon: 84.0 },   // Jharkhand north
      { lat: 24.0, lon: 80.0 },   // Madhya Pradesh
      { lat: 22.0, lon: 78.0 },   // Transition to Chennai FIR
      { lat: 22.0, lon: 74.0 },   // Rajasthan/Gujarat boundary
      { lat: 24.0, lon: 68.0 },   // Gujarat west/Pakistan border
      { lat: 24.0, lon: 66.0 },   // Arabian Sea/Pakistan coast
      { lat: 37.0, lon: 66.0 },   // Close polygon
    ]
  },
  {
    firCode:  'VABB',
    firName:  'Mumbai FIR',
    callsign: 'BOMBAY CONTROL',
    polygon: [
      { lat: 24.0, lon: 66.0 },   // North — Pakistan coast
      { lat: 24.0, lon: 74.0 },   // Delhi FIR east boundary
      { lat: 22.0, lon: 74.0 },   // Rajasthan/Gujarat/MP
      { lat: 22.0, lon: 78.0 },   // Nagpur area
      { lat: 18.0, lon: 80.0 },   // Andhra Pradesh coast
      { lat: 14.0, lon: 74.5 },   // Karnataka coast
      { lat: 8.0,  lon: 76.5 },   // Kerala/Sri Lanka boundary
      { lat: 0.0,  lon: 65.0 },   // Arabian Sea far south
      { lat: 0.0,  lon: 50.0 },   // Arabian Sea west
      { lat: 24.0, lon: 55.0 },   // Oman/Gulf area
      { lat: 24.0, lon: 66.0 },   // Close polygon
    ]
  },
  {
    firCode:  'VECC',
    firName:  'Kolkata FIR',
    callsign: 'CALCUTTA CONTROL',
    polygon: [
      { lat: 28.0, lon: 88.0 },   // Nepal/Bhutan border
      { lat: 28.0, lon: 98.0 },   // Arunachal Pradesh/Myanmar
      { lat: 22.0, lon: 98.0 },   // Myanmar coast
      { lat: 16.0, lon: 98.0 },   // Bay of Bengal east
      { lat: 8.0,  lon: 90.0 },   // Andaman Islands area
      { lat: 4.0,  lon: 85.0 },   // Bay of Bengal south
      { lat: 14.0, lon: 80.5 },   // Andhra Pradesh east coast
      { lat: 18.0, lon: 80.0 },   // Orissa coast
      { lat: 22.0, lon: 80.0 },   // West Bengal/Bihar
      { lat: 24.0, lon: 84.0 },   // Jharkhand
      { lat: 26.0, lon: 84.0 },   // Bihar eastern
      { lat: 26.0, lon: 88.0 },   // West Bengal/Bangladesh
      { lat: 28.0, lon: 88.0 },   // Close polygon
    ]
  },
  {
    firCode:  'VOMF',
    firName:  'Chennai FIR',
    callsign: 'MADRAS CONTROL',
    polygon: [
      { lat: 22.0, lon: 74.0 },   // Mumbai FIR east boundary
      { lat: 22.0, lon: 80.0 },   // Central India
      { lat: 18.0, lon: 80.0 },   // Andhra Pradesh
      { lat: 14.0, lon: 80.5 },   // Andhra coast
      { lat: 4.0,  lon: 85.0 },   // Bay of Bengal south
      { lat: 0.0,  lon: 75.0 },   // Indian Ocean
      { lat: 8.0,  lon: 76.5 },   // Kerala south
      { lat: 14.0, lon: 74.5 },   // Karnataka coast
      { lat: 22.0, lon: 74.0 },   // Close polygon
    ]
  }
]

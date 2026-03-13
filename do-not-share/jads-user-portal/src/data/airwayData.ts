import type { Airway } from '../types/airspace';

/** Indian ATS routes from ENR 3.0 — real waypoints with approximate coordinates */
export const INDIAN_AIRWAYS: Airway[] = [
  {
    designator: 'W33',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'AGRAS', name: 'AGRAS', lat: 27.18, lng: 77.98, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'AGRAS', name: 'AGRAS', lat: 27.18, lng: 77.98, type: 'FIX' }, to: { id: 'GUDUM', name: 'GUDUM', lat: 25.45, lng: 76.35, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'GUDUM', name: 'GUDUM', lat: 25.45, lng: 76.35, type: 'FIX' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  {
    designator: 'A461',
    type: 'UPPER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'BUBNU', name: 'BUBNU', lat: 26.85, lng: 80.95, type: 'FIX' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'BUBNU', name: 'BUBNU', lat: 26.85, lng: 80.95, type: 'FIX' }, to: { id: 'LUNKA', name: 'LUNKA', lat: 25.60, lng: 84.00, type: 'FIX' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'LUNKA', name: 'LUNKA', lat: 25.60, lng: 84.00, type: 'FIX' }, to: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
    ],
  },
  {
    designator: 'G452',
    type: 'LOWER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'GUBBI', name: 'GUBBI', lat: 17.32, lng: 74.78, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'GUBBI', name: 'GUBBI', lat: 17.32, lng: 74.78, type: 'FIX' }, to: { id: 'TUKLI', name: 'TUKLI', lat: 15.38, lng: 76.92, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'TUKLI', name: 'TUKLI', lat: 15.38, lng: 76.92, type: 'FIX' }, to: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  {
    designator: 'L301',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'TULSI', name: 'TULSI', lat: 26.30, lng: 77.60, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'TULSI', name: 'TULSI', lat: 26.30, lng: 77.60, type: 'FIX' }, to: { id: 'BHOPL', name: 'BHOPAL', lat: 23.28, lng: 77.34, type: 'VOR' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'BHOPL', name: 'BHOPAL', lat: 23.28, lng: 77.34, type: 'VOR' }, to: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  {
    designator: 'M635',
    type: 'UPPER',
    segments: [
      { from: { id: 'VOMM', name: 'CHENNAI', lat: 12.9941, lng: 80.1709, type: 'AIRPORT' }, to: { id: 'PALNA', name: 'PALNA', lat: 14.50, lng: 79.50, type: 'FIX' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'PALNA', name: 'PALNA', lat: 14.50, lng: 79.50, type: 'FIX' }, to: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
    ],
  },
  {
    designator: 'R460',
    type: 'UPPER',
    segments: [
      { from: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, to: { id: 'RANKI', name: 'RANCHI', lat: 23.31, lng: 85.32, type: 'VOR' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'RANKI', name: 'RANCHI', lat: 23.31, lng: 85.32, type: 'VOR' }, to: { id: 'NAGPR', name: 'NAGPUR', lat: 21.09, lng: 79.05, type: 'VOR' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'NAGPR', name: 'NAGPUR', lat: 21.09, lng: 79.05, type: 'VOR' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
    ],
  },
  {
    designator: 'L507',
    type: 'LOWER',
    segments: [
      { from: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, to: { id: 'IKAVA', name: 'IKAVA', lat: 21.70, lng: 73.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'IKAVA', name: 'IKAVA', lat: 21.70, lng: 73.50, type: 'FIX' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  {
    designator: 'Q1',
    type: 'UPPER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'IDKOT', name: 'IDKOT', lat: 26.10, lng: 75.80, type: 'FIX' }, minAltitude: 29000, maxAltitude: 46000 },
      { from: { id: 'IDKOT', name: 'IDKOT', lat: 26.10, lng: 75.80, type: 'FIX' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 29000, maxAltitude: 46000 },
    ],
  },
];

export function getAirwayByDesignator(designator: string): Airway | undefined {
  return INDIAN_AIRWAYS.find(a => a.designator === designator.toUpperCase());
}

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
  // ── Expanded ATS routes — AIRAC 2602 ──────────────────────────────────────

  // L301: Delhi → Bhopal → Hyderabad
  {
    designator: 'L301',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'GANDO', name: 'GANDO', lat: 27.3861, lng: 77.7125, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'GANDO', name: 'GANDO', lat: 27.3861, lng: 77.7125, type: 'FIX' }, to: { id: 'PAKER', name: 'PAKER', lat: 26.00, lng: 77.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'PAKER', name: 'PAKER', lat: 26.00, lng: 77.00, type: 'FIX' }, to: { id: 'IGARI', name: 'IGARI', lat: 22.00, lng: 74.20, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'IGARI', name: 'IGARI', lat: 22.00, lng: 74.20, type: 'FIX' }, to: { id: 'TATIM', name: 'TATIM', lat: 21.00, lng: 73.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'TATIM', name: 'TATIM', lat: 21.00, lng: 73.50, type: 'FIX' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W1: Delhi → Ahmedabad → Bangalore
  {
    designator: 'W1',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'BETRA', name: 'BETRA', lat: 27.50, lng: 76.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'BETRA', name: 'BETRA', lat: 27.50, lng: 76.00, type: 'FIX' }, to: { id: 'PARAR', name: 'PARAR', lat: 25.80, lng: 74.20, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'PARAR', name: 'PARAR', lat: 25.80, lng: 74.20, type: 'FIX' }, to: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, to: { id: 'GULAB', name: 'GULAB', lat: 20.50, lng: 76.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'GULAB', name: 'GULAB', lat: 20.50, lng: 76.50, type: 'FIX' }, to: { id: 'LOTAV', name: 'LOTAV', lat: 17.80, lng: 77.20, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'LOTAV', name: 'LOTAV', lat: 17.80, lng: 77.20, type: 'FIX' }, to: { id: 'ADKAL', name: 'ADKAL', lat: 15.50, lng: 77.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'ADKAL', name: 'ADKAL', lat: 15.50, lng: 77.50, type: 'FIX' }, to: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W15: Delhi → Hyderabad → Chennai
  {
    designator: 'W15',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'AGNIK', name: 'AGNIK', lat: 26.80, lng: 78.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'AGNIK', name: 'AGNIK', lat: 26.80, lng: 78.00, type: 'FIX' }, to: { id: 'IBOVI', name: 'IBOVI', lat: 23.00, lng: 78.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'IBOVI', name: 'IBOVI', lat: 23.00, lng: 78.50, type: 'FIX' }, to: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, to: { id: 'PESOT', name: 'PESOT', lat: 14.80, lng: 79.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'PESOT', name: 'PESOT', lat: 14.80, lng: 79.50, type: 'FIX' }, to: { id: 'VOMM', name: 'CHENNAI', lat: 12.9941, lng: 80.1709, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // A791: Mumbai → Chennai
  {
    designator: 'A791',
    type: 'LOWER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'PEDAM', name: 'PEDAM', lat: 18.00, lng: 75.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'PEDAM', name: 'PEDAM', lat: 18.00, lng: 75.50, type: 'FIX' }, to: { id: 'TELEM', name: 'TELEM', lat: 14.50, lng: 78.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'TELEM', name: 'TELEM', lat: 14.50, lng: 78.00, type: 'FIX' }, to: { id: 'VOMM', name: 'CHENNAI', lat: 12.9941, lng: 80.1709, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // G204: Delhi → Kolkata
  {
    designator: 'G204',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VNS', name: 'VARANASI', lat: 25.4522, lng: 82.8593, type: 'VOR' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VNS', name: 'VARANASI', lat: 25.4522, lng: 82.8593, type: 'VOR' }, to: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // G450: Mumbai → Kolkata
  {
    designator: 'G450',
    type: 'LOWER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'BUBOS', name: 'BUBOS', lat: 20.50, lng: 77.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'BUBOS', name: 'BUBOS', lat: 20.50, lng: 77.00, type: 'FIX' }, to: { id: 'POLER', name: 'POLER', lat: 21.50, lng: 83.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'POLER', name: 'POLER', lat: 21.50, lng: 83.00, type: 'FIX' }, to: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W34: Delhi → Goa
  {
    designator: 'W34',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'LALUT', name: 'LALUT', lat: 25.50, lng: 76.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'LALUT', name: 'LALUT', lat: 25.50, lng: 76.00, type: 'FIX' }, to: { id: 'NIKAB', name: 'NIKAB', lat: 21.50, lng: 74.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'NIKAB', name: 'NIKAB', lat: 21.50, lng: 74.50, type: 'FIX' }, to: { id: 'VAGO', name: 'GOA', lat: 15.3808, lng: 73.8314, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // B345: Kolkata → Bangalore
  {
    designator: 'B345',
    type: 'LOWER',
    segments: [
      { from: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, to: { id: 'RUDRA', name: 'RUDRA', lat: 19.00, lng: 83.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'RUDRA', name: 'RUDRA', lat: 19.00, lng: 83.50, type: 'FIX' }, to: { id: 'DOMIL', name: 'DOMIL', lat: 16.00, lng: 80.00, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'DOMIL', name: 'DOMIL', lat: 16.00, lng: 80.00, type: 'FIX' }, to: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W43: Delhi → Ahmedabad → Mumbai (western corridor)
  {
    designator: 'W43',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'AMVIG', name: 'AMVIG', lat: 22.85, lng: 73.38, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'AMVIG', name: 'AMVIG', lat: 22.85, lng: 73.38, type: 'FIX' }, to: { id: 'LUMAN', name: 'LUMAN', lat: 23.00, lng: 72.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'LUMAN', name: 'LUMAN', lat: 23.00, lng: 72.50, type: 'FIX' }, to: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, to: { id: 'AKTIV', name: 'AKTIV', lat: 20.25, lng: 73.26, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'AKTIV', name: 'AKTIV', lat: 20.25, lng: 73.26, type: 'FIX' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W47: Delhi → Jaipur → Indore → Ahmedabad
  {
    designator: 'W47',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VIJP', name: 'JAIPUR', lat: 26.8242, lng: 75.8122, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VIJP', name: 'JAIPUR', lat: 26.8242, lng: 75.8122, type: 'AIRPORT' }, to: { id: 'VAID', name: 'INDORE', lat: 22.7218, lng: 75.8011, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VAID', name: 'INDORE', lat: 22.7218, lng: 75.8011, type: 'AIRPORT' }, to: { id: 'VAAH', name: 'AHMEDABAD', lat: 23.0772, lng: 72.6347, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W19: Kolkata → Patna → Varanasi → Lucknow (eastern corridor)
  {
    designator: 'W19',
    type: 'LOWER',
    segments: [
      { from: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, to: { id: 'VEPT', name: 'PATNA', lat: 25.5913, lng: 85.0880, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VEPT', name: 'PATNA', lat: 25.5913, lng: 85.0880, type: 'AIRPORT' }, to: { id: 'VIBN', name: 'VARANASI', lat: 25.4524, lng: 82.8593, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VIBN', name: 'VARANASI', lat: 25.4524, lng: 82.8593, type: 'AIRPORT' }, to: { id: 'VILK', name: 'LUCKNOW', lat: 26.7606, lng: 80.8893, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W20: Delhi → Lucknow → Varanasi → Patna
  {
    designator: 'W20',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VILK', name: 'LUCKNOW', lat: 26.7606, lng: 80.8893, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VILK', name: 'LUCKNOW', lat: 26.7606, lng: 80.8893, type: 'AIRPORT' }, to: { id: 'VIBN', name: 'VARANASI', lat: 25.4524, lng: 82.8593, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VIBN', name: 'VARANASI', lat: 25.4524, lng: 82.8593, type: 'AIRPORT' }, to: { id: 'VEPT', name: 'PATNA', lat: 25.5913, lng: 85.0880, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W29: Delhi → Chandigarh → Amritsar (northern corridor)
  {
    designator: 'W29',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VICG', name: 'CHANDIGARH', lat: 30.6735, lng: 76.7885, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VICG', name: 'CHANDIGARH', lat: 30.6735, lng: 76.7885, type: 'AIRPORT' }, to: { id: 'VIAR', name: 'AMRITSAR', lat: 31.7096, lng: 74.7973, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W41: Kolkata → Ranchi → Nagpur → Mumbai
  {
    designator: 'W41',
    type: 'LOWER',
    segments: [
      { from: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, to: { id: 'VEBP', name: 'RANCHI', lat: 23.3143, lng: 85.3217, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VEBP', name: 'RANCHI', lat: 23.3143, lng: 85.3217, type: 'AIRPORT' }, to: { id: 'VANP', name: 'NAGPUR', lat: 21.0922, lng: 79.0472, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VANP', name: 'NAGPUR', lat: 21.0922, lng: 79.0472, type: 'AIRPORT' }, to: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W45: Delhi → Jaipur → Udaipur
  {
    designator: 'W45',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VIJP', name: 'JAIPUR', lat: 26.8242, lng: 75.8122, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VIJP', name: 'JAIPUR', lat: 26.8242, lng: 75.8122, type: 'AIRPORT' }, to: { id: 'VIUT', name: 'UDAIPUR', lat: 24.6177, lng: 73.8961, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W56: Bangalore → Chennai
  {
    designator: 'W56',
    type: 'LOWER',
    segments: [
      { from: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, to: { id: 'TONAK', name: 'TONAK', lat: 12.80, lng: 78.50, type: 'FIX' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'TONAK', name: 'TONAK', lat: 12.80, lng: 78.50, type: 'FIX' }, to: { id: 'VOMM', name: 'CHENNAI', lat: 12.9941, lng: 80.1709, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W67: Bangalore → Mangalore → Calicut → Cochin → Trivandrum (west coast)
  {
    designator: 'W67',
    type: 'LOWER',
    segments: [
      { from: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, to: { id: 'VOML', name: 'MANGALORE', lat: 12.9613, lng: 74.8901, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VOML', name: 'MANGALORE', lat: 12.9613, lng: 74.8901, type: 'AIRPORT' }, to: { id: 'VOCL', name: 'CALICUT', lat: 11.1368, lng: 75.9553, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VOCL', name: 'CALICUT', lat: 11.1368, lng: 75.9553, type: 'AIRPORT' }, to: { id: 'VOCI', name: 'COCHIN', lat: 9.9471, lng: 76.2673, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VOCI', name: 'COCHIN', lat: 9.9471, lng: 76.2673, type: 'AIRPORT' }, to: { id: 'VOTV', name: 'TRIVANDRUM', lat: 8.4821, lng: 76.9200, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W111: Mumbai → Goa → Mangalore (Konkan coast)
  {
    designator: 'W111',
    type: 'LOWER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'VAGO', name: 'GOA', lat: 15.3808, lng: 73.8314, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VAGO', name: 'GOA', lat: 15.3808, lng: 73.8314, type: 'AIRPORT' }, to: { id: 'VOML', name: 'MANGALORE', lat: 12.9613, lng: 74.8901, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W114: Mumbai → Pune → Bangalore
  {
    designator: 'W114',
    type: 'LOWER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'VAPO', name: 'PUNE', lat: 18.5822, lng: 73.9197, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VAPO', name: 'PUNE', lat: 18.5822, lng: 73.9197, type: 'AIRPORT' }, to: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W115: Bangalore → Hyderabad → Nagpur (central corridor)
  {
    designator: 'W115',
    type: 'LOWER',
    segments: [
      { from: { id: 'VOBL', name: 'BANGALORE', lat: 13.1986, lng: 77.7066, type: 'AIRPORT' }, to: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VOHY', name: 'HYDERABAD', lat: 17.2403, lng: 78.4294, type: 'AIRPORT' }, to: { id: 'VANP', name: 'NAGPUR', lat: 21.0922, lng: 79.0472, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W118: Kolkata → Guwahati → Dibrugarh (northeast corridor)
  {
    designator: 'W118',
    type: 'LOWER',
    segments: [
      { from: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, to: { id: 'VEGT', name: 'GUWAHATI', lat: 26.1061, lng: 91.5859, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VEGT', name: 'GUWAHATI', lat: 26.1061, lng: 91.5859, type: 'AIRPORT' }, to: { id: 'VEDI', name: 'DIBRUGARH', lat: 27.4839, lng: 95.0169, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // W153: Delhi → Dehradun → Shimla (Himalayan corridor)
  {
    designator: 'W153',
    type: 'LOWER',
    segments: [
      { from: { id: 'VIDP', name: 'DELHI', lat: 28.5665, lng: 77.1031, type: 'AIRPORT' }, to: { id: 'VIDX', name: 'DEHRADUN', lat: 30.1897, lng: 78.1803, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
      { from: { id: 'VIDX', name: 'DEHRADUN', lat: 30.1897, lng: 78.1803, type: 'AIRPORT' }, to: { id: 'VISM', name: 'SHIMLA', lat: 31.0818, lng: 77.0681, type: 'AIRPORT' }, minAltitude: 5000, maxAltitude: 24500 },
    ],
  },
  // B466: Mumbai → Nagpur → Kolkata (upper trunk)
  {
    designator: 'B466',
    type: 'UPPER',
    segments: [
      { from: { id: 'VABB', name: 'MUMBAI', lat: 19.0896, lng: 72.8656, type: 'AIRPORT' }, to: { id: 'VANP', name: 'NAGPUR', lat: 21.0922, lng: 79.0472, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
      { from: { id: 'VANP', name: 'NAGPUR', lat: 21.0922, lng: 79.0472, type: 'AIRPORT' }, to: { id: 'VECC', name: 'KOLKATA', lat: 22.6547, lng: 88.4467, type: 'AIRPORT' }, minAltitude: 24500, maxAltitude: 46000 },
    ],
  },
];

export function getAirwayByDesignator(designator: string): Airway | undefined {
  return INDIAN_AIRWAYS.find(a => a.designator === designator.toUpperCase());
}

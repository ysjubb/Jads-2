export interface AirlineEntry {
  icao3LD: string;
  callsignTelephony: string;
  airlineName: string;
  active: boolean;
}

export const INDIAN_AIRLINES: AirlineEntry[] = [
  // Active airlines — verified ICAO Doc 8585, March 2026
  { icao3LD: 'AIC', callsignTelephony: 'AIRINDIA', airlineName: 'Air India', active: true },
  { icao3LD: 'AKJ', callsignTelephony: 'AKASA', airlineName: 'Akasa Air', active: true },
  { icao3LD: 'AXB', callsignTelephony: 'EXPRESS INDIA', airlineName: 'Air India Express', active: true },
  { icao3LD: 'IGO', callsignTelephony: 'IFLY', airlineName: 'IndiGo', active: true },
  { icao3LD: 'SDG', callsignTelephony: 'STARAIR', airlineName: 'Star Air', active: true },
  { icao3LD: 'SLI', callsignTelephony: 'BLUEBIRD', airlineName: 'Star Air (SLI)', active: true },
  { icao3LD: 'SEJ', callsignTelephony: 'SPICEJET', airlineName: 'SpiceJet', active: true },
  { icao3LD: 'ALW', callsignTelephony: 'ALL WINGS', airlineName: 'Alliance Air', active: true },
  { icao3LD: 'TRJ', callsignTelephony: 'TRUJET', airlineName: 'TruJet', active: true },
  { icao3LD: 'IFC', callsignTelephony: 'INDIAN AIRFORCE', airlineName: 'Indian Air Force', active: true },
  { icao3LD: 'ICG', callsignTelephony: 'COAST GUARD', airlineName: 'Indian Coast Guard', active: true },
  { icao3LD: 'INV', callsignTelephony: 'INDIAN NAVY', airlineName: 'Indian Navy', active: true },

  // Defunct airlines — do NOT use as active
  { icao3LD: 'VTI', callsignTelephony: 'VISTARA', airlineName: 'Vistara (merged into Air India)', active: false },
  { icao3LD: 'GOW', callsignTelephony: 'GOAIR', airlineName: 'Go First (ceased operations)', active: false },
  { icao3LD: 'IAD', callsignTelephony: 'AIRASIA', airlineName: 'AirAsia India (merged into AIX Connect)', active: false },
];

export function lookupByICAO(code: string): AirlineEntry | undefined {
  return INDIAN_AIRLINES.find(a => a.icao3LD === code.toUpperCase());
}

export function lookupByRegistration(reg: string): { prefix: string; isIndian: boolean } {
  const cleaned = reg.replace(/-/g, '').toUpperCase();
  const isIndian = cleaned.startsWith('VT');
  return { prefix: isIndian ? 'VT' : cleaned.slice(0, 2), isIndian };
}

export function getActiveAirlines(): AirlineEntry[] {
  return INDIAN_AIRLINES.filter(a => a.active);
}

export function getDefunctAirlines(): AirlineEntry[] {
  return INDIAN_AIRLINES.filter(a => !a.active);
}

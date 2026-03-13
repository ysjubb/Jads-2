/**
 * FP16 — Indian AIP Transition Altitude Database
 *
 * Wraps and extends the existing indiaAIP.ts data with transition
 * altitude/level lookup, Field 15 altitude formatting, and FIR defaults.
 * Source: India AIP ENR 1.7.
 *
 * Re-exports core data from indiaAIP.ts and adds the specific functions
 * required by the AFTN FPL builder pipeline.
 */

import { INDIA_AIP_AERODROMES } from '../indiaAIP';

// ── Types ──────────────────────────────────────────────────────────────

export interface AIPTransitionData {
  icao: string;
  iata: string;
  city: string;
  transitionAltitudeFt: number;
  transitionLevelFL: number;
  elevation: number;
  fir: 'VIDF' | 'VABF' | 'VOMF' | 'VECF';
  notes?: string;
}

// ── Extended Transition Data ───────────────────────────────────────────

/**
 * High-elevation and terrain-affected airports with special TA values.
 * These override or supplement the base indiaAIP data.
 */
const SPECIAL_TRANSITIONS: Record<string, Partial<AIPTransitionData>> = {
  VILH: { transitionAltitudeFt: 23000, transitionLevelFL: 250, notes: 'Highest civil airport in India (10,682 ft) — Leh Kushok Bakula' },
  VISR: { transitionAltitudeFt: 18000, transitionLevelFL: 180, notes: 'Mountain terrain (5,228 ft elevation) — Srinagar' },
  VEBD: { transitionAltitudeFt: 13000, transitionLevelFL: 140, notes: 'Close to Himalayas — Bagdogra' },
  VIDP: { transitionAltitudeFt: 14000, transitionLevelFL: 150 },
  VABB: { transitionAltitudeFt: 10000, transitionLevelFL: 110 },
  VOBL: { transitionAltitudeFt: 11000, transitionLevelFL: 120, notes: 'Terrain: 2,900 ft elevation — Bengaluru' },
  VOMM: { transitionAltitudeFt: 9000,  transitionLevelFL: 100 },
  VOHS: { transitionAltitudeFt: 10000, transitionLevelFL: 110 },
  VECC: { transitionAltitudeFt: 10000, transitionLevelFL: 110 },
  VAAH: { transitionAltitudeFt: 10000, transitionLevelFL: 110 },
  VIAR: { transitionAltitudeFt: 11000, transitionLevelFL: 120 },
  VIJP: { transitionAltitudeFt: 11000, transitionLevelFL: 120 },
  VEGT: { transitionAltitudeFt: 11000, transitionLevelFL: 120 },
  VAPO: { transitionAltitudeFt: 11000, transitionLevelFL: 120, notes: 'Deccan plateau (1,853 ft elevation) — Pune' },
};

// ── FIR Default Transitions ────────────────────────────────────────────

const FIR_DEFAULTS: Record<string, { taFt: number; tlFL: number }> = {
  VIDF: { taFt: 14000, tlFL: 150 },  // Delhi FIR — higher due to terrain
  VABF: { taFt: 10000, tlFL: 110 },  // Mumbai FIR — coastal/plains
  VECF: { taFt: 10000, tlFL: 110 },  // Kolkata FIR — plains
  VOMF: { taFt: 9000,  tlFL: 100 },  // Chennai FIR — coastal
};

// ── Functions ──────────────────────────────────────────────────────────

/**
 * Get transition altitude data for an ICAO aerodrome.
 * Returns enhanced data with special transitions applied.
 */
export function getTransitionDataFull(icao: string): AIPTransitionData | null {
  const upper = icao.toUpperCase();
  const entry = INDIA_AIP_AERODROMES[upper];
  if (!entry) return null;

  const special = SPECIAL_TRANSITIONS[upper];

  // Determine FIR from ICAO prefix
  let fir: 'VIDF' | 'VABF' | 'VOMF' | 'VECF' = 'VIDF';
  if (upper.startsWith('VI')) fir = 'VIDF';
  else if (upper.startsWith('VA')) fir = 'VABF';
  else if (upper.startsWith('VE')) fir = 'VECF';
  else if (upper.startsWith('VO')) fir = 'VOMF';

  // Parse transition level from string like "FL140" to number 140
  const tlStr = entry.transitionLevel;
  const tlNum = parseInt(tlStr.replace(/^FL/i, ''), 10) || 100;

  return {
    icao: upper,
    iata: '',  // Base data doesn't include IATA
    city: entry.name,
    transitionAltitudeFt: special?.transitionAltitudeFt ?? entry.transitionAltitude,
    transitionLevelFL: special?.transitionLevelFL ?? tlNum,
    elevation: entry.elevation,
    fir,
    notes: special?.notes,
  };
}

/**
 * Check whether an altitude is above the transition altitude for an aerodrome.
 */
export function isAboveTransitionAltitude(icao: string, altitudeFt: number): boolean {
  const data = getTransitionDataFull(icao);
  if (!data) {
    // Default: assume 9,000 ft TA for unknown airports
    return altitudeFt > 9000;
  }
  return altitudeFt > data.transitionAltitudeFt;
}

/**
 * Format an altitude for AFTN Field 15 speed/level group.
 *
 * Above TA → Flight Level: F350
 * At/below TA → Altitude: A050
 *
 * @param icao   Departure aerodrome ICAO code
 * @param altFt  Requested altitude in feet
 * @returns      Field 15 level string (e.g. 'F350' or 'A050')
 */
export function formatAltitudeForField15(icao: string, altFt: number): string {
  if (isAboveTransitionAltitude(icao, altFt)) {
    // Flight level: divide by 100, round, zero-pad to 3 digits
    const fl = Math.round(altFt / 100);
    return 'F' + fl.toString().padStart(3, '0');
  } else {
    // Altitude in hundreds of feet, zero-pad to 3 digits
    const alt = Math.round(altFt / 100);
    return 'A' + alt.toString().padStart(3, '0');
  }
}

/**
 * Get default TA and TL for a FIR (used when specific airport is unknown).
 */
export function getFirTransitionDefaults(fir: string): { taFt: number; tlFL: number } {
  return FIR_DEFAULTS[fir.toUpperCase()] ?? { taFt: 9000, tlFL: 100 };
}

/**
 * Check if a requested cruise level falls in the transition layer
 * (between TA and TL) — this is generally not permitted.
 */
export function isInTransitionLayer(icao: string, altFt: number): boolean {
  const data = getTransitionDataFull(icao);
  if (!data) return false;

  const tlAltFt = data.transitionLevelFL * 100;
  return altFt > data.transitionAltitudeFt && altFt < tlAltFt;
}

// Re-export base data for convenience
export { INDIA_AIP_AERODROMES };

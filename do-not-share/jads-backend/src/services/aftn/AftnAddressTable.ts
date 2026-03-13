/**
 * FP02 — AFTN Address Routing Table
 *
 * Complete AFTN 8-letter address table for all Indian FIRs, towers,
 * AROs, and special-purpose addresses.  Extends the existing
 * AftnAddresseeService with a canonical, self-contained data file.
 *
 * AFTN address format (ICAO Doc 8585):
 *   LLLLTTXX
 *   LLLL = 4-letter location indicator (e.g. VIDP)
 *   TT   = unit designator (e.g. ZQ = ACC, ZD = approach, YD = ops)
 *   XX   = department (e.g. ZX = FPL filing)
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface AftnAddress {
  address: string;        // 8-char AFTN address
  icao: string;           // 4-char location indicator
  unitType: AftnUnitType;
  unitName: string;       // Human-readable name
  fir: IndianFir;
}

export type IndianFir = 'VIDF' | 'VABF' | 'VECF' | 'VOMF';

export type AftnUnitType =
  | 'ACC'           // Area Control Centre
  | 'APP'           // Approach Control
  | 'TWR'           // Tower (Aerodrome Control)
  | 'ARO'           // ATS Reporting Office (flight plan filing)
  | 'FIC'           // Flight Information Centre
  | 'NOF'           // NOTAM Office
  | 'MET'           // Meteorological
  | 'OPS'           // Airline Operations
  | 'AFMLU'         // Air Force Movement Liaison Unit
  | 'COM'           // Communications
  | 'COMPANY';      // Company/Operator address

// ── FIR Data ───────────────────────────────────────────────────────────

export const INDIAN_FIRS: Record<IndianFir, { name: string; acc: string }> = {
  VIDF: { name: 'Delhi FIR', acc: 'VIDPZQZX' },
  VABF: { name: 'Mumbai FIR', acc: 'VABORQZX' },   // VABB ACC → use VABO prefix per AAI
  VECF: { name: 'Kolkata FIR', acc: 'VECCZQZX' },
  VOMF: { name: 'Chennai FIR', acc: 'VOMMZQZX' },
};

// ── Complete Address Table ─────────────────────────────────────────────

/**
 * All Indian AFTN addresses grouped by aerodrome/unit.
 *
 * Unit designator key:
 *   ZQZX = ACC (Area Control Centre, flight plan section)
 *   ZDZX = Approach Control
 *   ZTZX = Tower/Aerodrome Control
 *   YAZX = ARO (ATS Reporting Office — primary FPL filing point)
 *   YDZX = Operations
 *   YMZX = Meteorological office
 *   YNZX = NOTAM Office
 */
export const AFTN_ADDRESS_TABLE: AftnAddress[] = [
  // ══════════════════════════════════════════════════════════════════════
  // DELHI FIR (VIDF)
  // ══════════════════════════════════════════════════════════════════════

  // Delhi IGI (VIDP)
  { address: 'VIDPZQZX', icao: 'VIDP', unitType: 'ACC',  unitName: 'Delhi ACC', fir: 'VIDF' },
  { address: 'VIDPZDZX', icao: 'VIDP', unitType: 'APP',  unitName: 'Delhi Approach', fir: 'VIDF' },
  { address: 'VIDPZTZX', icao: 'VIDP', unitType: 'TWR',  unitName: 'Delhi Tower', fir: 'VIDF' },
  { address: 'VIDPYAZX', icao: 'VIDP', unitType: 'ARO',  unitName: 'Delhi ARO', fir: 'VIDF' },
  { address: 'VIDPYDZX', icao: 'VIDP', unitType: 'OPS',  unitName: 'Delhi Operations', fir: 'VIDF' },
  { address: 'VIDPYMZX', icao: 'VIDP', unitType: 'MET',  unitName: 'Delhi MET', fir: 'VIDF' },

  // Jaipur (VIJP)
  { address: 'VIJPZDZX', icao: 'VIJP', unitType: 'APP',  unitName: 'Jaipur Approach', fir: 'VIDF' },
  { address: 'VIJPZTZX', icao: 'VIJP', unitType: 'TWR',  unitName: 'Jaipur Tower', fir: 'VIDF' },
  { address: 'VIJPYAZX', icao: 'VIJP', unitType: 'ARO',  unitName: 'Jaipur ARO', fir: 'VIDF' },

  // Lucknow (VILK)
  { address: 'VILKZDZX', icao: 'VILK', unitType: 'APP',  unitName: 'Lucknow Approach', fir: 'VIDF' },
  { address: 'VILKZTZX', icao: 'VILK', unitType: 'TWR',  unitName: 'Lucknow Tower', fir: 'VIDF' },
  { address: 'VILKYAZX', icao: 'VILK', unitType: 'ARO',  unitName: 'Lucknow ARO', fir: 'VIDF' },

  // Amritsar (VIAR)
  { address: 'VIARZDZX', icao: 'VIAR', unitType: 'APP',  unitName: 'Amritsar Approach', fir: 'VIDF' },
  { address: 'VIARZTZX', icao: 'VIAR', unitType: 'TWR',  unitName: 'Amritsar Tower', fir: 'VIDF' },
  { address: 'VIARYAZX', icao: 'VIAR', unitType: 'ARO',  unitName: 'Amritsar ARO', fir: 'VIDF' },

  // Srinagar (VISR)
  { address: 'VISRZDZX', icao: 'VISR', unitType: 'APP',  unitName: 'Srinagar Approach', fir: 'VIDF' },
  { address: 'VISRZTZX', icao: 'VISR', unitType: 'TWR',  unitName: 'Srinagar Tower', fir: 'VIDF' },

  // Leh (VILH)
  { address: 'VILHZTZX', icao: 'VILH', unitType: 'TWR',  unitName: 'Leh Tower', fir: 'VIDF' },

  // Varanasi (VIBN)
  { address: 'VIBNZTZX', icao: 'VIBN', unitType: 'TWR',  unitName: 'Varanasi Tower', fir: 'VIDF' },
  { address: 'VIBNYAZX', icao: 'VIBN', unitType: 'ARO',  unitName: 'Varanasi ARO', fir: 'VIDF' },

  // Chandigarh (VICG)
  { address: 'VICGZTZX', icao: 'VICG', unitType: 'TWR',  unitName: 'Chandigarh Tower', fir: 'VIDF' },

  // Delhi NOF
  { address: 'VIDPYNZX', icao: 'VIDP', unitType: 'NOF',  unitName: 'Delhi NOTAM Office', fir: 'VIDF' },

  // AFMLU Delhi
  { address: 'VIDPYFZX', icao: 'VIDP', unitType: 'AFMLU', unitName: 'Delhi Air Force Movement Liaison Unit', fir: 'VIDF' },

  // ══════════════════════════════════════════════════════════════════════
  // MUMBAI FIR (VABF)
  // ══════════════════════════════════════════════════════════════════════

  // Mumbai CSIA (VABB)
  { address: 'VABORQZX', icao: 'VABB', unitType: 'ACC',  unitName: 'Mumbai ACC', fir: 'VABF' },
  { address: 'VABBZDZX', icao: 'VABB', unitType: 'APP',  unitName: 'Mumbai Approach', fir: 'VABF' },
  { address: 'VABBZTZX', icao: 'VABB', unitType: 'TWR',  unitName: 'Mumbai Tower', fir: 'VABF' },
  { address: 'VABBYAZX', icao: 'VABB', unitType: 'ARO',  unitName: 'Mumbai ARO', fir: 'VABF' },
  { address: 'VABBYDZX', icao: 'VABB', unitType: 'OPS',  unitName: 'Mumbai Operations', fir: 'VABF' },

  // Goa (VOGO)
  { address: 'VOGOZDZX', icao: 'VOGO', unitType: 'APP',  unitName: 'Goa Approach', fir: 'VABF' },
  { address: 'VOGOZTZX', icao: 'VOGO', unitType: 'TWR',  unitName: 'Goa Tower', fir: 'VABF' },
  { address: 'VOGOYAZX', icao: 'VOGO', unitType: 'ARO',  unitName: 'Goa ARO', fir: 'VABF' },

  // Ahmedabad (VAAH)
  { address: 'VAAHZDZX', icao: 'VAAH', unitType: 'APP',  unitName: 'Ahmedabad Approach', fir: 'VABF' },
  { address: 'VAAHZTZX', icao: 'VAAH', unitType: 'TWR',  unitName: 'Ahmedabad Tower', fir: 'VABF' },
  { address: 'VAAHYAZX', icao: 'VAAH', unitType: 'ARO',  unitName: 'Ahmedabad ARO', fir: 'VABF' },

  // Pune (VAPO)
  { address: 'VAPOZDZX', icao: 'VAPO', unitType: 'APP',  unitName: 'Pune Approach', fir: 'VABF' },
  { address: 'VAPOZTZX', icao: 'VAPO', unitType: 'TWR',  unitName: 'Pune Tower', fir: 'VABF' },

  // Nagpur (VANP)
  { address: 'VANPZDZX', icao: 'VANP', unitType: 'APP',  unitName: 'Nagpur Approach', fir: 'VABF' },
  { address: 'VANPZTZX', icao: 'VANP', unitType: 'TWR',  unitName: 'Nagpur Tower', fir: 'VABF' },

  // Mumbai NOF
  { address: 'VABBYNZX', icao: 'VABB', unitType: 'NOF',  unitName: 'Mumbai NOTAM Office', fir: 'VABF' },

  // ══════════════════════════════════════════════════════════════════════
  // KOLKATA FIR (VECF)
  // ══════════════════════════════════════════════════════════════════════

  // Kolkata (VECC)
  { address: 'VECCZQZX', icao: 'VECC', unitType: 'ACC',  unitName: 'Kolkata ACC', fir: 'VECF' },
  { address: 'VECCZDZX', icao: 'VECC', unitType: 'APP',  unitName: 'Kolkata Approach', fir: 'VECF' },
  { address: 'VECCZTZX', icao: 'VECC', unitType: 'TWR',  unitName: 'Kolkata Tower', fir: 'VECF' },
  { address: 'VECCYAZX', icao: 'VECC', unitType: 'ARO',  unitName: 'Kolkata ARO', fir: 'VECF' },
  { address: 'VECCYDZX', icao: 'VECC', unitType: 'OPS',  unitName: 'Kolkata Operations', fir: 'VECF' },

  // Guwahati (VEGT)
  { address: 'VEGTZDZX', icao: 'VEGT', unitType: 'APP',  unitName: 'Guwahati Approach', fir: 'VECF' },
  { address: 'VEGTZTZX', icao: 'VEGT', unitType: 'TWR',  unitName: 'Guwahati Tower', fir: 'VECF' },
  { address: 'VEGTYAZX', icao: 'VEGT', unitType: 'ARO',  unitName: 'Guwahati ARO', fir: 'VECF' },

  // Bagdogra (VEBD)
  { address: 'VEBDZTZX', icao: 'VEBD', unitType: 'TWR',  unitName: 'Bagdogra Tower', fir: 'VECF' },

  // Bhubaneswar (VEBS)
  { address: 'VEBSZDZX', icao: 'VEBS', unitType: 'APP',  unitName: 'Bhubaneswar Approach', fir: 'VECF' },
  { address: 'VEBSZTZX', icao: 'VEBS', unitType: 'TWR',  unitName: 'Bhubaneswar Tower', fir: 'VECF' },

  // Patna (VEPT)
  { address: 'VEPTZTZX', icao: 'VEPT', unitType: 'TWR',  unitName: 'Patna Tower', fir: 'VECF' },

  // Ranchi (VERC)
  { address: 'VERCZTZX', icao: 'VERC', unitType: 'TWR',  unitName: 'Ranchi Tower', fir: 'VECF' },

  // Kolkata NOF
  { address: 'VECCYNZX', icao: 'VECC', unitType: 'NOF',  unitName: 'Kolkata NOTAM Office', fir: 'VECF' },

  // ══════════════════════════════════════════════════════════════════════
  // CHENNAI FIR (VOMF)
  // ══════════════════════════════════════════════════════════════════════

  // Chennai (VOMM)
  { address: 'VOMMZQZX', icao: 'VOMM', unitType: 'ACC',  unitName: 'Chennai ACC', fir: 'VOMF' },
  { address: 'VOMMZDZX', icao: 'VOMM', unitType: 'APP',  unitName: 'Chennai Approach', fir: 'VOMF' },
  { address: 'VOMMZTZX', icao: 'VOMM', unitType: 'TWR',  unitName: 'Chennai Tower', fir: 'VOMF' },
  { address: 'VOMMYAZX', icao: 'VOMM', unitType: 'ARO',  unitName: 'Chennai ARO', fir: 'VOMF' },
  { address: 'VOMMYDZX', icao: 'VOMM', unitType: 'OPS',  unitName: 'Chennai Operations', fir: 'VOMF' },

  // Bengaluru (VOBL)
  { address: 'VOBLZDZX', icao: 'VOBL', unitType: 'APP',  unitName: 'Bengaluru Approach', fir: 'VOMF' },
  { address: 'VOBLZTZX', icao: 'VOBL', unitType: 'TWR',  unitName: 'Bengaluru Tower', fir: 'VOMF' },
  { address: 'VOBLYAZX', icao: 'VOBL', unitType: 'ARO',  unitName: 'Bengaluru ARO', fir: 'VOMF' },

  // Hyderabad (VOHS)
  { address: 'VOHSZDZX', icao: 'VOHS', unitType: 'APP',  unitName: 'Hyderabad Approach', fir: 'VOMF' },
  { address: 'VOHSZTZX', icao: 'VOHS', unitType: 'TWR',  unitName: 'Hyderabad Tower', fir: 'VOMF' },
  { address: 'VOHSYAZX', icao: 'VOHS', unitType: 'ARO',  unitName: 'Hyderabad ARO', fir: 'VOMF' },

  // Kochi (VOCI)
  { address: 'VOCIZDZX', icao: 'VOCI', unitType: 'APP',  unitName: 'Kochi Approach', fir: 'VOMF' },
  { address: 'VOCIZTZX', icao: 'VOCI', unitType: 'TWR',  unitName: 'Kochi Tower', fir: 'VOMF' },
  { address: 'VOCIYAZX', icao: 'VOCI', unitType: 'ARO',  unitName: 'Kochi ARO', fir: 'VOMF' },

  // Thiruvananthapuram (VOTV)
  { address: 'VOTVZDZX', icao: 'VOTV', unitType: 'APP',  unitName: 'Thiruvananthapuram Approach', fir: 'VOMF' },
  { address: 'VOTVZTZX', icao: 'VOTV', unitType: 'TWR',  unitName: 'Thiruvananthapuram Tower', fir: 'VOMF' },

  // Coimbatore (VOCB)
  { address: 'VOCBZTZX', icao: 'VOCB', unitType: 'TWR',  unitName: 'Coimbatore Tower', fir: 'VOMF' },

  // Mangaluru (VOML)
  { address: 'VOMLZTZX', icao: 'VOML', unitType: 'TWR',  unitName: 'Mangaluru Tower', fir: 'VOMF' },

  // Visakhapatnam (VOVZ)
  { address: 'VOVZZDZX', icao: 'VOVZ', unitType: 'APP',  unitName: 'Visakhapatnam Approach', fir: 'VOMF' },
  { address: 'VOVZZTZX', icao: 'VOVZ', unitType: 'TWR',  unitName: 'Visakhapatnam Tower', fir: 'VOMF' },

  // Madurai (VOMD)
  { address: 'VOMDZTZX', icao: 'VOMD', unitType: 'TWR',  unitName: 'Madurai Tower', fir: 'VOMF' },

  // Tiruchirappalli (VOTR)
  { address: 'VOTRZTZX', icao: 'VOTR', unitType: 'TWR',  unitName: 'Tiruchirappalli Tower', fir: 'VOMF' },

  // Chennai NOF
  { address: 'VOMMYNZX', icao: 'VOMM', unitType: 'NOF',  unitName: 'Chennai NOTAM Office', fir: 'VOMF' },

  // ══════════════════════════════════════════════════════════════════════
  // SPECIAL / NATIONAL
  // ══════════════════════════════════════════════════════════════════════

  // AFMLU (Air Force Movement Liaison Unit) — national
  { address: 'VIDPYFZX', icao: 'VIDP', unitType: 'AFMLU', unitName: 'AFMLU Delhi (National)', fir: 'VIDF' },
];

// ── Lookup Functions ───────────────────────────────────────────────────

/** Get all AFTN addresses for an ICAO aerodrome */
export function getAddressesForAerodrome(icao: string): AftnAddress[] {
  return AFTN_ADDRESS_TABLE.filter(a => a.icao === icao.toUpperCase());
}

/** Get all addresses in a FIR */
export function getAddressesForFir(fir: IndianFir): AftnAddress[] {
  return AFTN_ADDRESS_TABLE.filter(a => a.fir === fir);
}

/** Get the ARO address for filing at a given aerodrome */
export function getAroAddress(icao: string): string | null {
  const entry = AFTN_ADDRESS_TABLE.find(
    a => a.icao === icao.toUpperCase() && a.unitType === 'ARO'
  );
  return entry?.address ?? null;
}

/** Get the ACC address for a FIR */
export function getAccAddress(fir: IndianFir): string {
  return INDIAN_FIRS[fir].acc;
}

/** Get the tower address for an aerodrome */
export function getTowerAddress(icao: string): string | null {
  const entry = AFTN_ADDRESS_TABLE.find(
    a => a.icao === icao.toUpperCase() && a.unitType === 'TWR'
  );
  return entry?.address ?? null;
}

/** Get the approach address for an aerodrome */
export function getApproachAddress(icao: string): string | null {
  const entry = AFTN_ADDRESS_TABLE.find(
    a => a.icao === icao.toUpperCase() && a.unitType === 'APP'
  );
  return entry?.address ?? null;
}

/** Get the NOF address for a FIR */
export function getNofAddress(fir: IndianFir): string | null {
  const entry = AFTN_ADDRESS_TABLE.find(
    a => a.fir === fir && a.unitType === 'NOF'
  );
  return entry?.address ?? null;
}

/** Determine which FIR an aerodrome belongs to */
export function getFirForAerodrome(icao: string): IndianFir | null {
  const upper = icao.toUpperCase();

  // Indian ICAO prefix conventions:
  // VI** → Delhi FIR (VIDF)
  // VA** → Mumbai FIR (VABF)
  // VE** → Kolkata FIR (VECF)
  // VO** → Chennai FIR (VOMF)
  if (upper.startsWith('VI')) return 'VIDF';
  if (upper.startsWith('VA')) return 'VABF';
  if (upper.startsWith('VE')) return 'VECF';
  if (upper.startsWith('VO')) return 'VOMF';

  // Check address table as fallback
  const entry = AFTN_ADDRESS_TABLE.find(a => a.icao === upper);
  return entry?.fir ?? null;
}

/**
 * Build the standard FPL addressee list for an Indian domestic flight.
 * Returns addresses in priority order: departure ARO/APP, ACC(s), destination ARO/APP.
 */
export function buildFplAddressees(
  adep: string,
  ades: string,
  alternatIcao?: string
): string[] {
  const addresses: string[] = [];
  const seen = new Set<string>();

  const add = (addr: string | null) => {
    if (addr && !seen.has(addr)) {
      seen.add(addr);
      addresses.push(addr);
    }
  };

  // 1. Departure ARO + approach
  add(getAroAddress(adep));
  add(getApproachAddress(adep));

  // 2. Departure FIR ACC
  const depFir = getFirForAerodrome(adep);
  if (depFir) add(getAccAddress(depFir));

  // 3. Destination FIR ACC (if different)
  const destFir = getFirForAerodrome(ades);
  if (destFir && destFir !== depFir) add(getAccAddress(destFir));

  // 4. Destination ARO + approach
  add(getAroAddress(ades));
  add(getApproachAddress(ades));

  // 5. Alternate if provided
  if (alternatIcao) {
    add(getAroAddress(alternatIcao));
    add(getApproachAddress(alternatIcao));
  }

  return addresses;
}

/**
 * Validate that an 8-character string is a valid AFTN address format.
 */
export function isValidAftnAddress(address: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z]{2}$/.test(address.toUpperCase());
}

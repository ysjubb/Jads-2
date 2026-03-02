/**
 * AftnAddresseeService.ts
 *
 * Auto-generates the AFTN addressee list for a flight plan.
 *
 * Sequence per ICAO Doc 4444 + AAI AFTN practice:
 *   1. Departure aerodrome ATC    (VIDPZDZX)
 *   2. Departure ACC              (VIDPZQZX)
 *   3. Departure alternate ATC    (if filed)
 *   4. Enroute ACCs               (in order of FIR crossing)
 *   5. Enroute alternate ATC      (if filed)
 *   6. Destination ACC            (dedup if same as enroute)
 *   7. Destination aerodrome ATC  (VABBZDZX)
 *   8. Destination alternate ATC  (if filed)
 *
 * Plus a separate INFO addressee bar for company ops, dispatch, co-pilot etc.
 *
 * AFTN address format: [4-char ICAO][2-char unit][ZX]
 *   ZQ = Area Control (ACC/FIC)
 *   ZD = Approach/Departure/Aerodrome control
 *   YD = Aerodrome operations (ops room)
 *   YA = ATIS
 */

import { createServiceLogger } from '../logger'

const log = createServiceLogger('AftnAddresseeService')

// ── Types ─────────────────────────────────────────────────────────────────────

export type AftnUnitType =
  | 'DEPARTURE_ATC'
  | 'DEPARTURE_ACC'
  | 'DEPARTURE_ALTERNATE_ATC'
  | 'ENROUTE_ACC'
  | 'ENROUTE_ALTERNATE_ATC'
  | 'DESTINATION_ACC'
  | 'DESTINATION_ATC'
  | 'DESTINATION_ALTERNATE_ATC'
  | 'COMPANY_OPS'
  | 'INFO_ONLY'

export interface AftnAddresseeEntry {
  aftnAddress: string         // 8-char: VIDPZDZX
  unitName:    string         // Human: "Delhi Approach/Departure"
  unitType:    AftnUnitType
  icaoCode:    string
  addedBy:     'AUTO' | 'MANUAL'
  reason?:     string         // Why auto-added
}

export interface AftnAddresseeStructure {
  actionAddressees: AftnAddresseeEntry[]   // Must receive the FPL
  infoAddressees:   AftnAddresseeEntry[]   // Informational copies
}

export interface FirCrossing {
  firCode:       string   // 'VIDF', 'VABB', 'VECC', 'VOMF'
  firName:       string
  entryWaypoint: string
}

export interface AddresseeGenerationInput {
  adep:              string
  ades:              string
  depAlternate?:     string
  destAlternate?:    string
  enrouteAlternates?: string[]
  firSequence:       FirCrossing[]  // From RouteSemanticEngine
}

// ── AFTN address book ─────────────────────────────────────────────────────────
// Source: AIP India GEN 3.3 — AFTN addresses of Indian ATS units
// Updated with AIRAC. These are real Indian ATC AFTN addresses.

interface UnitAddresses {
  approach: string   // Approach/Departure/TWR
  acc:      string   // Area Control Centre
  ops:      string   // Operations room
  atis?:    string
}

const AFTN_ADDRESS_BOOK: Record<string, UnitAddresses> = {
  // ── Mumbai FIR (VABB) ───────────────────────────────────────────────────
  'VABB': { approach: 'VABBZDZX', acc: 'VABBZQZX', ops: 'VABBYDYX', atis: 'VABBCAYX' },
  'VAAH': { approach: 'VAAHZDZX', acc: 'VABBZQZX', ops: 'VAAHZDYX' },  // Ahmedabad → Mumbai ACC
  'VAPB': { approach: 'VAPBZDZX', acc: 'VABBZQZX', ops: 'VAPBZDYX' },  // Pune
  'VAGN': { approach: 'VAGNZDZX', acc: 'VABBZQZX', ops: 'VAGNZDYX' },  // Goa/Dabolim
  'VOCL': { approach: 'VOCLZDZX', acc: 'VOMFZQZX', ops: 'VOCLZDYX' },  // Cochin → Chennai ACC
  'VOGP': { approach: 'VOGPZDZX', acc: 'VABBZQZX', ops: 'VOGPZDYX' },  // Goa civil
  // ── Delhi FIR (VIDF) ────────────────────────────────────────────────────
  'VIDP': { approach: 'VIDPZDZX', acc: 'VIDFZQZX', ops: 'VIDPYDYX', atis: 'VIDPCAYX' },
  'VILK': { approach: 'VILKZDZX', acc: 'VIDFZQZX', ops: 'VILKZDYX' },  // Lucknow
  'VIAR': { approach: 'VIARZDZX', acc: 'VIDFZQZX', ops: 'VIARZDYX' },  // Amritsar
  'VIDD': { approach: 'VIDDZDZX', acc: 'VIDFZQZX', ops: 'VIDDZDYX' },  // Hindon
  'VIBK': { approach: 'VIBKZDZX', acc: 'VIDFZQZX', ops: 'VIBKZDYX' },  // Bareilly
  'VIBN': { approach: 'VIBNZDZX', acc: 'VIDFZQZX', ops: 'VIBNZDYX' },  // Varanasi
  'VIJR': { approach: 'VIJRZDZX', acc: 'VIDFZQZX', ops: 'VIJRZDYX' },  // Jodhpur
  'VIGG': { approach: 'VIGGZDZX', acc: 'VIDFZQZX', ops: 'VIGGZDYX' },  // Gwalior
  // ── Kolkata FIR (VECC) ──────────────────────────────────────────────────
  'VECC': { approach: 'VECCZDZX', acc: 'VECCZQZX', ops: 'VECCYDYX' },
  'VEPB': { approach: 'VEPBZDZX', acc: 'VECCZQZX', ops: 'VEPBZDYX' },  // Bhubaneswar
  'VEJH': { approach: 'VEJHZDZX', acc: 'VECCZQZX', ops: 'VEJHZDYX' },  // Jharsuguda
  'VOPB': { approach: 'VOPBZDZX', acc: 'VECCZQZX', ops: 'VOPBZDYX' },  // Port Blair
  // ── Chennai FIR (VOMF) ──────────────────────────────────────────────────
  'VOMM': { approach: 'VOMMZDZX', acc: 'VOMFZQZX', ops: 'VOMMYDYX' },
  'VOHS': { approach: 'VOHSZDZX', acc: 'VOMFZQZX', ops: 'VOHSYDYX' },  // Hyderabad
  'VOBL': { approach: 'VOBLZDZX', acc: 'VOMFZQZX', ops: 'VOBLYDYX' },  // Bengaluru
  'VOYR': { approach: 'VOYRZDZX', acc: 'VOMFZQZX', ops: 'VOYRZDYX' },  // Yelahanka
}

// FIR ACC addresses (for routing when FIR code ≠ aerodrome code)
const FIR_ACC_ADDRESSES: Record<string, { address: string; name: string }> = {
  'VIDF': { address: 'VIDFZQZX', name: 'Delhi Area Control Centre' },
  'VABB': { address: 'VABBZQZX', name: 'Mumbai Area Control Centre' },
  'VECC': { address: 'VECCZQZX', name: 'Kolkata Area Control Centre' },
  'VOMF': { address: 'VOMFZQZX', name: 'Chennai Area Control Centre' },
}

// ── Address book lookup helpers ───────────────────────────────────────────────

function lookupApproach(
  icao: string
): { address: string; name: string } | null {
  const entry = AFTN_ADDRESS_BOOK[icao]
  if (!entry) return null
  return { address: entry.approach, name: `${icao} Approach/Departure` }
}

function lookupAcc(icao: string): { address: string; name: string } | null {
  // Try direct lookup
  const entry = AFTN_ADDRESS_BOOK[icao]
  if (entry) return { address: entry.acc, name: `${icao} Area Control` }
  // Try FIR ACC directly
  const fir = FIR_ACC_ADDRESSES[icao]
  if (fir) return { address: fir.address, name: fir.name }
  return null
}

// ── Main generator ────────────────────────────────────────────────────────────

export class AftnAddresseeService {

  generateAddressees(
    input: AddresseeGenerationInput
  ): AftnAddresseeStructure {
    const action: AftnAddresseeEntry[] = []
    const seen    = new Set<string>()

    const add = (entry: AftnAddresseeEntry | null) => {
      if (!entry || seen.has(entry.aftnAddress)) return
      seen.add(entry.aftnAddress)
      action.push(entry)
    }

    // ── 1. Departure aerodrome ATC ─────────────────────────────────────────
    const depApproach = lookupApproach(input.adep)
    if (depApproach) {
      add({
        aftnAddress: depApproach.address,
        unitName:    depApproach.name,
        unitType:    'DEPARTURE_ATC',
        icaoCode:    input.adep,
        addedBy:     'AUTO',
        reason:      'Departure aerodrome',
      })
    } else {
      log.warn('aftn_address_not_found', { data: { icao: input.adep, role: 'departure' } })
    }

    // ── 2. Departure ACC ───────────────────────────────────────────────────
    const depAcc = lookupAcc(input.adep)
    if (depAcc) {
      add({
        aftnAddress: depAcc.address,
        unitName:    depAcc.name,
        unitType:    'DEPARTURE_ACC',
        icaoCode:    input.adep,
        addedBy:     'AUTO',
        reason:      'Departure FIR area control',
      })
    }

    // ── 3. Departure alternate ─────────────────────────────────────────────
    if (input.depAlternate) {
      const altApproach = lookupApproach(input.depAlternate)
      if (altApproach) {
        add({
          aftnAddress: altApproach.address,
          unitName:    altApproach.name,
          unitType:    'DEPARTURE_ALTERNATE_ATC',
          icaoCode:    input.depAlternate,
          addedBy:     'AUTO',
          reason:      'Departure alternate aerodrome',
        })
      }
    }

    // ── 4. Enroute ACCs (in order of FIR crossing) ────────────────────────
    for (const crossing of input.firSequence) {
      const firAcc = FIR_ACC_ADDRESSES[crossing.firCode]
      if (firAcc) {
        add({
          aftnAddress: firAcc.address,
          unitName:    firAcc.name,
          unitType:    'ENROUTE_ACC',
          icaoCode:    crossing.firCode,
          addedBy:     'AUTO',
          reason:      `Route enters ${crossing.firName} at ${crossing.entryWaypoint}`,
        })
      }
    }

    // ── 5. Enroute alternates ──────────────────────────────────────────────
    for (const alt of (input.enrouteAlternates ?? [])) {
      const altApproach = lookupApproach(alt)
      if (altApproach) {
        add({
          aftnAddress: altApproach.address,
          unitName:    altApproach.name,
          unitType:    'ENROUTE_ALTERNATE_ATC',
          icaoCode:    alt,
          addedBy:     'AUTO',
          reason:      'Enroute alternate aerodrome',
        })
      }
    }

    // ── 6. Destination ACC ─────────────────────────────────────────────────
    const desAcc = lookupAcc(input.ades)
    if (desAcc) {
      add({
        aftnAddress: desAcc.address,
        unitName:    desAcc.name,
        unitType:    'DESTINATION_ACC',
        icaoCode:    input.ades,
        addedBy:     'AUTO',
        reason:      'Destination FIR area control',
      })
    }

    // ── 7. Destination aerodrome ATC ───────────────────────────────────────
    const desApproach = lookupApproach(input.ades)
    if (desApproach) {
      add({
        aftnAddress: desApproach.address,
        unitName:    desApproach.name,
        unitType:    'DESTINATION_ATC',
        icaoCode:    input.ades,
        addedBy:     'AUTO',
        reason:      'Destination aerodrome',
      })
    }

    // ── 8. Destination alternate ───────────────────────────────────────────
    if (input.destAlternate) {
      const destAltApproach = lookupApproach(input.destAlternate)
      if (destAltApproach) {
        add({
          aftnAddress: destAltApproach.address,
          unitName:    destAltApproach.name,
          unitType:    'DESTINATION_ALTERNATE_ATC',
          icaoCode:    input.destAlternate,
          addedBy:     'AUTO',
          reason:      'Destination alternate aerodrome',
        })
      }
    }

    log.info('addressees_generated', {
      data: {
        adep:             input.adep,
        ades:             input.ades,
        actionCount:      action.length,
        firsCrossed:      input.firSequence.length,
      }
    })

    return { actionAddressees: action, infoAddressees: [] }
  }

  /**
   * Build the AFTN message priority line from the addressee list.
   * Format: GG VIDPZDZX VIDFZQZX VABBZQZX VABBZDZX
   */
  buildAftnHeader(addressees: AftnAddresseeStructure, originatorAddress: string): string {
    const allAddresses = [
      ...addressees.actionAddressees.map(a => a.aftnAddress),
      ...addressees.infoAddressees.map(a => a.aftnAddress),
    ]

    const timestamp = new Date().toISOString()
      .replace(/[-:T]/g, '')
      .slice(4, 12)  // DDHHmmss

    return [
      `GG ${allAddresses.join(' ')}`,
      `${timestamp} ${originatorAddress}`,
    ].join('\n')
  }
}

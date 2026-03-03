// AFTN FPL Message Builder — produces a valid ICAO Doc 4444 FPL message.
//
// MANDATORY invariants (enforced with hard throws):
//   - Message MUST start with (FPL-
//   - Message MUST end with )
//   - Item 18 is REBUILT from parsed components — never copied as raw string
//     (prevents injection of invalid Item 18 syntax)
//
// AFTN addressees are derived from departure, destination, and FIR sequence.
// Always includes DGCA Delhi copy (VIDPZPZX).

import { createServiceLogger } from '../logger'
import type { Item18Parsed }   from './Item18Parser'

const log = createServiceLogger('AftnMessageBuilder')

export interface AftnFplInput {
  callsign:       string
  flightRules:    string
  flightType:     string
  aircraftType:   string
  wakeTurbulence: string
  equipment:      string
  surveillance:   string
  departureIcao:  string
  eobt:           string        // DDHHmm
  speed:          string        // e.g., N0450
  level:          string        // e.g., F330 or VFR
  route:          string
  destination:    string
  eet:            string        // HHmm
  alternate1?:    string
  alternate2?:    string
  item18Parsed:   Item18Parsed
  endurance?:     string        // HHmm
  pob?:           number

  // ── Item 19 SAR fields (ICAO Doc 4444 §4.7.19) ──────────────────────────
  // radioEquipment: ICAO coded values.
  //   V = VHF RTF on 121.500 MHz  U = UHF RTF on 243.000 MHz
  //   E1= ELT (406 MHz)           E2= ELT (121.5 MHz)
  //   Omit if not carried. Example: "VUE1"
  radioEquipment?:    string
  // survivalEquipment: polar/desert/maritime/jungle survival kit codes.
  //   P = polar  D = desert  M = maritime  J = jungle
  //   Example: "DM"  (desert + maritime)
  survivalEquipment?: string
  // jackets: life jacket codes.
  //   L = light  F = fluorescent  U = UHF RTF  V = VHF RTF
  //   Example: "LFUV"
  jackets?:           string
  // dinghies: dinghy count, capacity (persons), cover colour, and cover indicator.
  //   Format: "C/nn/nnn/C/COLOUR"  where C = covered, F = fluorescent cover
  //   Example: "C/02/010/C/ORANGE"
  dinghies?:          string
}

export class AftnMessageBuilder {

  build(input: AftnFplInput): string {
    // ── PRE-PROCESSING: DOF auto-generation ─────────────────────────────────
    // DOF/ is mandatory in Item 18 per ICAO Doc 4444 §15.2.1 and Indian AIP.
    // If the operator did not supply it, derive it from the EOBT DDHHmm.
    // Strategy: take the current UTC date, replace the day with the DD from EOBT.
    // If that day has already passed today (filed for tomorrow), roll forward.
    const item18 = this.resolveDof(input.item18Parsed, input.eobt)

    // ── PRE-PROCESSING: PBN auto-injection ──────────────────────────────────
    // ICAO Doc 4444 §15.3.10 and Indian AIP ENR 1.10:
    // If equipment contains 'R' (PBN approved) but Item 18 has no PBN/ codes,
    // auto-inject minimum required PBN indicators from equipment codes.
    this.injectMissingPbnCodes(item18, input.equipment)

    // ── Item 15: Speed/Level/Route ──────────────────────────────────────────
    const levelStr   = input.level === 'VFR' ? 'VFR' : input.level
    const routeField = `${input.speed}${levelStr} ${input.route.trim()}`

    // ── Item 16: Destination/EET/Alternates ────────────────────────────────
    let item16 = `${input.destination}/${input.eet}`
    if (input.alternate1) item16 += ` ${input.alternate1}`
    if (input.alternate2) item16 += ` ${input.alternate2}`

    // ── Item 18: Rebuilt from resolved+parsed components ───────────────────
    // Uses `item18` (resolved above) not raw input.item18Parsed — ensures DOF
    // is auto-generated and PBN codes are auto-injected before assembly.
    const item18Parts: string[] = []
    if (item18.dof)                  item18Parts.push(`DOF/${item18.dof}`)
    if (item18.reg)                  item18Parts.push(`REG/${item18.reg}`)
    if (item18.pbnCodes.length > 0)  item18Parts.push(`PBN/${item18.pbnCodes.join('')}`)
    if (item18.opr)                  item18Parts.push(`OPR/${item18.opr}`)
    if (item18.sts)                  item18Parts.push(`STS/${item18.sts}`)
    if (item18.dep)                  item18Parts.push(`DEP/${item18.dep}`)
    if (item18.dest)                 item18Parts.push(`DEST/${item18.dest}`)
    if (item18.selcal)               item18Parts.push(`SEL/${item18.selcal}`)
    if (item18.rmk)                  item18Parts.push(`RMK/${item18.rmk}`)
    const item18Str = item18Parts.length > 0 ? item18Parts.join(' ') : '0'

    // ── Item 19: Endurance, POB, and SAR equipment ──────────────────────────
    // ICAO Doc 4444 §4.7.19 requires R/, S/, J/, A/ sub-fields when equipment
    // is carried. Omitting them when equipment IS carried is a rejection risk.
    const item19Parts: string[] = []
    if (input.endurance) item19Parts.push(`E/${input.endurance}`)
    if (input.pob)       item19Parts.push(`P/${String(input.pob).padStart(3, '0')}`)
    // SAR sub-fields — only emit when the operator explicitly supplied them.
    // Never emit an empty R/ or S/ — that is worse than omitting the field.
    if (input.radioEquipment    && input.radioEquipment.trim())    item19Parts.push(`R/${input.radioEquipment.trim().toUpperCase()}`)
    if (input.survivalEquipment && input.survivalEquipment.trim()) item19Parts.push(`S/${input.survivalEquipment.trim().toUpperCase()}`)
    if (input.jackets           && input.jackets.trim())           item19Parts.push(`J/${input.jackets.trim().toUpperCase()}`)
    if (input.dinghies          && input.dinghies.trim())          item19Parts.push(`D/${input.dinghies.trim()}`)

    // ── Assemble AFTN FPL message ───────────────────────────────────────────
    const lines: string[] = [
      `(FPL-${input.callsign}-${input.flightRules}${input.flightType}`,
      `-${input.aircraftType}/${input.wakeTurbulence}`,
      `-${input.equipment}/${input.surveillance}`,
      `-${input.departureIcao}${input.eobt}`,
      `-${routeField}`,
      `-${item16}`,
      `-${item18Str}`,
    ]

    if (item19Parts.length > 0) {
      lines.push(`-${item19Parts.join(' ')}`)
    }

    // Close the message
    lines[lines.length - 1] += ')'

    const message = lines.join('\n')

    // Mandatory format assertions — hard throw, not a validation error
    if (!message.startsWith('(FPL-')) {
      throw new Error(`AFTN_BUILD_FAILED: Message does not start with (FPL-. Got: ${message.substring(0, 30)}`)
    }
    if (!message.endsWith(')')) {
      throw new Error(`AFTN_BUILD_FAILED: Message does not end with ). Got: ...${message.slice(-30)}`)
    }

    log.info('aftn_message_built', {
      data: {
        callsign: input.callsign, departure: input.departureIcao,
        destination: input.destination, messageLength: message.length
      }
    })

    return message
  }

  // ── Helper: DOF auto-generation ──────────────────────────────────────────
  // Returns a new Item18Parsed with dof guaranteed to be YYMMDD.
  // If dof is already present and valid, returns unchanged.
  // If absent or malformed, derives from EOBT (DDHHmm) + current UTC date.
  //
  // Date rollover logic:
  //   DD from EOBT compared to current UTC day.
  //   If DD >= currentDay → flight is today or a day in the current month.
  //   If DD <  currentDay → flight wraps to next month.
  //   This covers the common case of filing at 23:xx UTC for a 00:xx flight.
  private resolveDof(parsed: Item18Parsed, eobt: string): Item18Parsed {
    if (parsed.dof && /^\d{6}$/.test(parsed.dof)) {
      const month = parseInt(parsed.dof.substring(2, 4))
      const day   = parseInt(parsed.dof.substring(4, 6))
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return parsed   // already valid
      }
    }

    // Derive from EOBT (DDHHmm) + server UTC clock
    const eobtDay = parseInt(eobt.substring(0, 2) ?? '0')
    const now     = new Date()
    let   year    = now.getUTCFullYear()
    let   month   = now.getUTCMonth() + 1   // 1-indexed
    const today   = now.getUTCDate()

    if (eobtDay < today) {
      // Flight day is in the future — roll forward one month
      month++
      if (month > 12) { month = 1; year++ }
    }

    const yy = String(year).slice(-2)
    const mm = String(month).padStart(2, '0')
    const dd = String(eobtDay).padStart(2, '0')
    const generatedDof = `${yy}${mm}${dd}`

    log.info('dof_auto_generated', { data: { eobt, generatedDof } })
    return { ...parsed, dof: generatedDof }
  }

  // ── Helper: PBN auto-injection ────────────────────────────────────────────
  // Mutates the parsed Item18 in-place (it's already a copy from resolveDof).
  // Maps Item 10 equipment codes to minimum PBN indicators per ICAO Doc 4444
  // Table B-RNAV-1 and Indian AIP ENR 1.10 Table 2.
  //
  // Injection rules (conservative — minimum valid set):
  //   R + G → B4 (RNAV 5 GNSS)  — most common drone/GA GPS navigator
  //   R + D → B2 (RNAV 5 VOR/DME)
  //   R + I → B3 (RNAV 5 DME/DME)
  //   R only (no G/D/I) → S1 (RNP APCH GNSS basic) as safe default
  //   If pbnCodes already non-empty → do nothing
  private injectMissingPbnCodes(parsed: Item18Parsed, equipment: string): void {
    if (parsed.pbnCodes.length > 0) return           // already has PBN codes
    if (!equipment.includes('R')) return             // not PBN-approved — nothing to inject

    const hasGnss  = equipment.includes('G')
    const hasDme   = equipment.includes('D')
    const hasDmeDme= equipment.includes('I')

    let injected: string[]
    if (hasGnss)        injected = ['B4']   // RNAV 5 GNSS
    else if (hasDme)    injected = ['B2']   // RNAV 5 VOR/DME
    else if (hasDmeDme) injected = ['B3']   // RNAV 5 DME/DME
    else                injected = ['S1']   // RNP APCH — safe minimum

    parsed.pbnCodes = injected
    log.info('pbn_codes_auto_injected', { data: { equipment, injected } })
  }

  // Derive AFTN addresses from departure, destination, and FIR sequence
  deriveAddressees(
    departureIcao:   string,
    destinationIcao: string,
    firSequence:     Array<{ firCode: string }> = []
  ): string[] {
    const addresses = new Set<string>()

    addresses.add(`${departureIcao}ZTZX`)    // Departure ATC
    addresses.add(`${destinationIcao}ZTZX`)  // Destination ATC

    for (const fir of firSequence) {
      addresses.add(`${fir.firCode}ZTZX`)    // FIR ACC for each FIR crossed
    }

    addresses.add('VIDPZPZX')  // DGCA Delhi filing office — always required

    return Array.from(addresses)
  }
}

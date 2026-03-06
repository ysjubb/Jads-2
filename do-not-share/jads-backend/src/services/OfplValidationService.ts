// ICAO OFPL (Operational Flight Plan) validation service.
// Steps:
//   1. Field syntax validation (callsign, ICAO codes, speed/level formats)
//   2. Item 18 semantic parsing
//   3. Cross-field consistency (RVSM, PBN, VFR/IFR conflicts)
//   4. Aerodrome existence check (departure, destination, alternates)
// Returns errors (blocking), warnings (advisory), and usedVersionIds for snapshot.

import { PrismaClient }      from '@prisma/client'
import { Item18Parser }      from './Item18Parser'
import { createServiceLogger } from '../logger'
import { RVSM_LOWER_FL, RVSM_UPPER_FL } from '../constants'

const log = createServiceLogger('OfplValidationService')

export interface OfplInput {
  callsign:          string
  flightRules:       'I' | 'V' | 'Y' | 'Z'
  flightType:        'S' | 'N' | 'G' | 'M' | 'X'
  aircraftType:      string
  wakeTurbulence:    'L' | 'M' | 'H' | 'J'
  equipment:         string
  surveillance:      string
  departureIcao:     string
  estimatedOffBlock: string       // DDHHmm UTC
  speedIndicator:    'N' | 'K' | 'M'
  speedValue:        string
  levelIndicator:    'A' | 'F' | 'S' | 'M' | 'VFR'
  levelValue:        string
  route:             string
  destinationIcao:   string
  eet:               string       // HHmm
  alternate1?:       string
  alternate2?:       string
  otherInfo?:         string
  enduranceHHmm?:     string
  personsOnBoard?:    number
  // Item 19 SAR fields — optional, passed through to AftnMessageBuilder unchanged
  radioEquipment?:    string   // R/ codes: V=VHF, U=UHF, E1=ELT(406), E2=ELT(121.5)
  survivalEquipment?: string   // S/ codes: P=polar, D=desert, M=maritime, J=jungle
  jackets?:           string   // J/ codes: L=light, F=fluorescent, U=UHF, V=VHF
  dinghies?:          string   // D/ count/capacity/cover/colour
}

export interface ValidationError   { field: string; code: string; message: string }
export interface ValidationWarning { field: string; code: string; message: string }

export interface AerodromeRecord {
  icaoCode: string; name: string; city: string
  latDeg: number; lonDeg: number; elevationFt: number
  magneticVariation: number; firCode: string
  transitionAltitudeFt: number | null; transitionLevelFl: number | null
  aerodromeType: string; status: string
}

export interface ValidationResult {
  valid:          boolean
  errors:         ValidationError[]
  warnings:       ValidationWarning[]
  usedVersionIds: string[]
  item18Parsed:   ReturnType<Item18Parser['parse']>
  computedData: {
    depAerodrome?:  AerodromeRecord
    destAerodrome?: AerodromeRecord
  }
}

export class OfplValidationService {
  private item18Parser = new Item18Parser()

  constructor(private readonly prisma: PrismaClient) {}

  async validate(
    input:                OfplInput,
    filingUserRole:       string,
    filingUserCallsigns?: string[]
  ): Promise<ValidationResult> {
    const errors:         ValidationError[]   = []
    const warnings:       ValidationWarning[] = []
    const usedVersionIds: string[]            = []
    const computedData:   ValidationResult['computedData'] = {}

    // ── STEP 1: FIELD SYNTAX ─────────────────────────────────────────────

    const callsignValid =
      /^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(input.callsign) ||
      /^VT-[A-Z]{3}$/.test(input.callsign) ||
      /^[A-Z]{1,4}\d{2,4}[A-Z]?$/.test(input.callsign)   // Military

    if (!callsignValid) {
      errors.push({ field: 'callsign', code: 'CALLSIGN_FORMAT',
        message: `'${input.callsign}' is not a valid callsign. ` +
                 `Use airline+flight (IC101), registration (VT-ABC), or military format.` })
    }

    if (filingUserCallsigns !== undefined && !filingUserCallsigns.includes(input.callsign)) {
      errors.push({ field: 'callsign', code: 'CALLSIGN_NOT_AUTHORISED',
        message: `Callsign '${input.callsign}' is not in your authorised callsign list. ` +
                 `Contact your entity admin to add this callsign.` })
    }

    if (!['I','V','Y','Z'].includes(input.flightRules)) {
      errors.push({ field: 'flightRules', code: 'FLIGHT_RULES_INVALID',
        message: `Flight rules must be I (IFR), V (VFR), Y (IFR→VFR), or Z (VFR→IFR)` })
    }

    if (!['S','N','G','M','X'].includes(input.flightType)) {
      errors.push({ field: 'flightType', code: 'FLIGHT_TYPE_INVALID',
        message: `Flight type must be S (scheduled), N (non-scheduled), G (general aviation), M (military), or X (other)` })
    }

    if (!/^[A-Z][A-Z0-9]{1,3}$/.test(input.aircraftType) && input.aircraftType !== 'ZZZZ') {
      errors.push({ field: 'aircraftType', code: 'AIRCRAFT_TYPE_FORMAT',
        message: `'${input.aircraftType}' is not a valid ICAO aircraft designator (e.g. C172, B738, A320)` })
    }

    if (!['L','M','H','J'].includes(input.wakeTurbulence)) {
      errors.push({ field: 'wakeTurbulence', code: 'WAKE_TURBULENCE_INVALID',
        message: `Wake turbulence must be L (Light), M (Medium), H (Heavy), or J (Super)` })
    }

    if (!/^[SDFGLOPRVWXYZABCHIJK]+$/.test(input.equipment) && input.equipment !== 'N') {
      errors.push({ field: 'equipment', code: 'EQUIPMENT_CODE_INVALID',
        message: `Equipment code '${input.equipment}' contains invalid characters` })
    }

    if (!/^[A-Z]{4}$/.test(input.departureIcao)) {
      errors.push({ field: 'departureIcao', code: 'DEPARTURE_ICAO_FORMAT',
        message: `'${input.departureIcao}' must be 4 ICAO letters. Use ZZZZ for unlisted aerodromes.` })
    }

    if (!/^\d{6}$/.test(input.estimatedOffBlock)) {
      errors.push({ field: 'estimatedOffBlock', code: 'EOBT_FORMAT',
        message: `EOBT '${input.estimatedOffBlock}' must be DDHHmm (day-hour-minute UTC)` })
    } else {
      const day = parseInt(input.estimatedOffBlock.substring(0,2))
      const hr  = parseInt(input.estimatedOffBlock.substring(2,4))
      const mn  = parseInt(input.estimatedOffBlock.substring(4,6))
      if (day < 1 || day > 31) errors.push({ field:'estimatedOffBlock', code:'EOBT_DAY_INVALID',   message:`EOBT day ${day} invalid (1-31)` })
      if (hr > 23)              errors.push({ field:'estimatedOffBlock', code:'EOBT_HOUR_INVALID',  message:`EOBT hour ${hr} invalid (00-23)` })
      if (mn > 59)              errors.push({ field:'estimatedOffBlock', code:'EOBT_MINUTE_INVALID',message:`EOBT minute ${mn} invalid (00-59)` })
    }

    const speedStr = `${input.speedIndicator}${input.speedValue}`
    if (!/^(N\d{4}|K\d{4}|M\d{3})$/.test(speedStr)) {
      errors.push({ field: 'speed', code: 'SPEED_FORMAT',
        message: `'${speedStr}' invalid. Use N0450 (knots), K0800 (km/h), or M082 (Mach)` })
    }

    if (input.levelIndicator !== 'VFR') {
      const levelStr = `${input.levelIndicator}${input.levelValue}`
      if (!/^[AFMS]\d{3,5}$/.test(levelStr)) {
        errors.push({ field: 'level', code: 'LEVEL_FORMAT',
          message: `'${levelStr}' invalid. Use A045 (altitude), F330 (flight level), S0900 (metric)` })
      }
    }

    if (!/^[A-Z]{4}$/.test(input.destinationIcao)) {
      errors.push({ field: 'destinationIcao', code: 'DESTINATION_ICAO_FORMAT',
        message: `'${input.destinationIcao}' must be 4 ICAO letters. Use ZZZZ for unlisted.` })
    }

    if (!/^\d{4}$/.test(input.eet)) {
      errors.push({ field: 'eet', code: 'EET_FORMAT',
        message: `EET '${input.eet}' must be HHmm (e.g. 0130 for 1h30m)` })
    }

    if (input.alternate1 && !/^[A-Z]{4}$/.test(input.alternate1)) {
      errors.push({ field: 'alternate1', code: 'ALTERNATE_ICAO_FORMAT',
        message: `Alternate '${input.alternate1}' must be 4 ICAO letters or ZZZZ` })
    }
    if (input.alternate2 && !/^[A-Z]{4}$/.test(input.alternate2)) {
      errors.push({ field: 'alternate2', code: 'ALTERNATE_ICAO_FORMAT',
        message: `Alternate '${input.alternate2}' must be 4 ICAO letters or ZZZZ` })
    }

    // ── STEP 2: ITEM 18 PARSING ──────────────────────────────────────────

    const item18 = this.item18Parser.parse(input.otherInfo)

    if (input.departureIcao === 'ZZZZ' && !item18.dep) {
      errors.push({ field: 'otherInfo', code: 'DEP_REQUIRED_FOR_ZZZZ',
        message: `Departure is ZZZZ (unlisted). Item 18 must include DEP/ with coordinates or name.` })
    }

    if (input.destinationIcao === 'ZZZZ' && !item18.dest) {
      errors.push({ field: 'otherInfo', code: 'DEST_REQUIRED_FOR_ZZZZ',
        message: `Destination is ZZZZ. Item 18 must include DEST/ with coordinates or name.` })
    }

    if (item18.dof) {
      if (!this.item18Parser.validateDof(item18.dof)) {
        errors.push({ field: 'otherInfo', code: 'DOF_FORMAT_INVALID',
          message: `DOF '${item18.dof}' invalid. Format is YYMMDD (e.g. DOF/240115)` })
      }
    } else {
      const today   = new Date().getUTCDate()
      const eobtDay = parseInt(input.estimatedOffBlock.substring(0, 2))
      if (eobtDay !== today) {
        warnings.push({ field: 'otherInfo', code: 'DOF_AUTO_GENERATED',
          message: `DOF/ not supplied. EOBT day ${eobtDay} differs from today ${today}. ` +
                   `DOF will be auto-generated as ${String(new Date().getUTCFullYear()).slice(-2)}` +
                   `${String(new Date().getUTCMonth()+1).padStart(2,'0')}` +
                   `${String(eobtDay).padStart(2,'0')}. ` +
                   `Verify this is the correct date of flight.` })
      }
    }

    for (const unknown of item18.unknown) {
      warnings.push({ field: 'otherInfo', code: 'ITEM18_UNKNOWN_TOKEN',
        message: `Unrecognised Item 18 token: '${unknown}'` })
    }

    // ── STEP 3: CROSS-FIELD CONSISTENCY ─────────────────────────────────

    if (input.flightRules === 'I' && input.levelIndicator === 'VFR') {
      errors.push({ field: 'level', code: 'IFR_VFR_LEVEL_CONFLICT',
        message: `IFR flight rules cannot have VFR as the level. Use a numeric level e.g. F330` })
    }

    if (input.equipment.includes('R') && item18.pbnCodes.length === 0) {
      // Downgraded to warning: AftnMessageBuilder will auto-inject minimum PBN codes.
      // The pilot should still supply explicit PBN codes for ATC situational awareness,
      // but we do not block filing over a missing auto-injectable field.
      warnings.push({ field: 'equipment', code: 'PBN_CODE_AUTO_INJECTED',
        message: `Equipment 'R' (PBN approved) declared but no PBN/ in Item 18. ` +
                 `Minimum PBN codes will be auto-injected from equipment (e.g. B4 for GNSS). ` +
                 `Supply explicit PBN/B4D3S1 to override.` })
    }

    for (const pbnCode of item18.pbnCodes) {
      const reqEquip = this.item18Parser.getRequiredEquipmentForPbn(pbnCode)
      for (const req of reqEquip) {
        if (!input.equipment.includes(req)) {
          warnings.push({ field: 'otherInfo', code: 'PBN_EQUIPMENT_MISMATCH',
            message: `PBN code '${pbnCode}' requires equipment '${req}' in Item 10, but '${req}' not declared.` })
        }
      }
    }

    if (input.levelIndicator === 'F') {
      const fl = parseInt(input.levelValue)
      if (fl >= RVSM_LOWER_FL && fl <= RVSM_UPPER_FL && !input.equipment.includes('W')) {
        errors.push({ field: 'equipment', code: 'RVSM_EQUIPMENT_MISSING',
          message: `FL${fl} is in RVSM airspace (FL${RVSM_LOWER_FL}–FL${RVSM_UPPER_FL}). ` +
                   `Equipment 'W' (RVSM approved) required in Item 10.` })
      }
    }

    if ((input.flightRules === 'Y' || input.flightRules === 'Z') &&
        !input.route.includes(' VFR') && !input.route.includes('VFR ')) {
      warnings.push({ field: 'route', code: 'MIXED_RULES_VFR_MARKER',
        message: `Flight rules ${input.flightRules} indicates IFR/VFR change. Mark change point with VFR/IFR in route string.` })
    }

    // ── STEP 3b: ITEM 19 SAR CODE VALIDATION (ICAO Doc 4444 §4.7.19) ───
    // Validate SAR equipment codes against ICAO-defined code sets.
    // Non-blocking (warnings only) — operators may use codes not in our list.

    const VALID_SAR_RADIO   = ['V', 'U', 'E']   // V=VHF, U=UHF, E=ELT
    const VALID_SAR_SURVIVAL = ['P', 'D', 'M', 'J']   // Polar, Desert, Maritime, Jungle
    const VALID_SAR_JACKETS  = ['L', 'F', 'U', 'V']   // Light, Fluorescent, UHF, VHF

    if (input.radioEquipment) {
      const chars = input.radioEquipment.toUpperCase().replace(/[0-9]/g, '')
      for (const c of chars) {
        if (!VALID_SAR_RADIO.includes(c)) {
          warnings.push({ field: 'radioEquipment', code: 'SAR_RADIO_CODE_UNKNOWN',
            message: `Item 19 R/ code '${c}' is not a standard ICAO SAR radio code (V/U/E)` })
          break
        }
      }
    }
    if (input.survivalEquipment) {
      for (const c of input.survivalEquipment.toUpperCase()) {
        if (!VALID_SAR_SURVIVAL.includes(c)) {
          warnings.push({ field: 'survivalEquipment', code: 'SAR_SURVIVAL_CODE_UNKNOWN',
            message: `Item 19 S/ code '${c}' is not a standard ICAO survival code (P/D/M/J)` })
          break
        }
      }
    }
    if (input.jackets) {
      for (const c of input.jackets.toUpperCase()) {
        if (!VALID_SAR_JACKETS.includes(c)) {
          warnings.push({ field: 'jackets', code: 'SAR_JACKET_CODE_UNKNOWN',
            message: `Item 19 J/ code '${c}' is not a standard ICAO jacket code (L/F/U/V)` })
          break
        }
      }
    }

    // ── STEP 3c: ITEM 18 RMK/ LENGTH CHECK ─────────────────────────────
    // ICAO PANS-ATM recommends ≤350 characters for remarks.
    if (item18.rmk && item18.rmk.length > 350) {
      warnings.push({ field: 'otherInfo', code: 'RMK_LENGTH_EXCEEDED',
        message: `Item 18 RMK/ is ${item18.rmk.length} characters (ICAO recommends ≤350). ATC may truncate.` })
    }

    // ── STEP 3d: EQUIPMENT CODE DUPLICATE DETECTION ────────────────────
    // Warn if the same equipment code is repeated (likely typo).
    if (input.equipment !== 'N') {
      const seen = new Set<string>()
      for (const c of input.equipment) {
        if (seen.has(c)) {
          warnings.push({ field: 'equipment', code: 'EQUIPMENT_CODE_DUPLICATE',
            message: `Equipment code '${c}' appears more than once in '${input.equipment}'` })
          break
        }
        seen.add(c)
      }
    }

    // ── STEP 4: AERODROME EXISTENCE CHECKS ──────────────────────────────

    if (input.departureIcao !== 'ZZZZ') {
      const dep = await this.lookupAerodrome(input.departureIcao)
      if (!dep) {
        errors.push({ field: 'departureIcao', code: 'DEPARTURE_AERODROME_NOT_FOUND',
          message: `Aerodrome '${input.departureIcao}' not found. Use ZZZZ with DEP/ for unlisted aerodromes.` })
      } else {
        computedData.depAerodrome = dep
        if (dep.status === 'CLOSED') {
          errors.push({ field: 'departureIcao', code: 'DEPARTURE_AERODROME_CLOSED',
            message: `Aerodrome '${input.departureIcao}' (${dep.name}) is CLOSED.` })
        }
        if (dep.aerodromeType === 'MILITARY' &&
            !['GOVT_PILOT', 'GOVT_DRONE_OPERATOR', 'IAF_AUDITOR'].includes(filingUserRole)) {
          warnings.push({ field: 'departureIcao', code: 'MILITARY_AERODROME_CIVILIAN_USER',
            message: `'${input.departureIcao}' is a military aerodrome. Civilian operations require prior coordination.` })
        }
      }
    }

    if (input.destinationIcao !== 'ZZZZ') {
      const dest = await this.lookupAerodrome(input.destinationIcao)
      if (!dest) {
        errors.push({ field: 'destinationIcao', code: 'DESTINATION_AERODROME_NOT_FOUND',
          message: `Aerodrome '${input.destinationIcao}' not found.` })
      } else {
        computedData.destAerodrome = dest
        if (dest.status === 'CLOSED') {
          errors.push({ field: 'destinationIcao', code: 'DESTINATION_AERODROME_CLOSED',
            message: `Destination '${input.destinationIcao}' (${dest.name}) is CLOSED.` })
        }
      }
    }

    for (const altIcao of [input.alternate1, input.alternate2].filter(Boolean) as string[]) {
      if (altIcao === 'ZZZZ') continue
      const alt = await this.lookupAerodrome(altIcao)
      if (!alt) {
        warnings.push({ field: 'alternate1', code: 'ALTERNATE_NOT_FOUND',
          message: `Alternate '${altIcao}' not found in JADS aerodrome database.` })
      } else if (alt.status === 'CLOSED') {
        errors.push({ field: 'alternate1', code: 'ALTERNATE_AERODROME_CLOSED',
          message: `Alternate '${altIcao}' (${alt.name}) is CLOSED. Select a different alternate.` })
      }
    }

    log.info('fpl_validation_complete', {
      data: { callsign: input.callsign, errorCount: errors.length, warningCount: warnings.length }
    })

    return {
      valid:          errors.length === 0,
      errors, warnings,
      usedVersionIds: [...new Set(usedVersionIds)],
      item18Parsed:   item18,
      computedData
    }
  }

  private async lookupAerodrome(icaoCode: string): Promise<AerodromeRecord | null> {
    const r = await this.prisma.aerodromeRecord.findFirst({ where: { icaoCode, isActive: true } })
    if (!r) return null
    return {
      icaoCode: r.icaoCode ?? r.icao ?? '', name: r.name, city: r.city,
      latDeg: r.latDeg ?? r.latitudeDeg ?? 0,
      lonDeg: r.lonDeg ?? r.longitudeDeg ?? 0,
      elevationFt: r.elevationFt ?? 0,
      magneticVariation: r.magneticVariation ?? 0,
      firCode: r.firCode ?? '',
      transitionAltitudeFt: r.transitionAltitudeFt ?? null,
      transitionLevelFl:    r.transitionLevelFl ?? null,
      aerodromeType: r.aerodromeType ?? r.type ?? '',
      status: r.status ?? 'ACTIVE'
    }
  }
}

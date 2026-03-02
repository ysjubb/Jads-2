// Altitude Compliance Engine — checks IFR semicircular rule, RVSM equipment,
// and transition altitude advisories.
//
// India IFR Semicircular Rule (ICAO Annex 2, Table 3-1):
//   Magnetic track 000–179° (Eastbound): ODD hundreds of feet
//     Below RVSM: FL070, 090, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290
//     RVSM band:  FL290, 310, 330, 350, 370, 390, 410
//   Magnetic track 180–359° (Westbound): EVEN hundreds of feet
//     Below RVSM: FL080, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280
//     RVSM band:  FL300, 320, 340, 360, 380, 400
//
// WARNINGS:
//   - magneticTrackDeg=null: emit SEMICIRCULAR_UNABLE_NO_TRACK, never silently pass
//   - Transition altitude: aerodrome-specific first, then national default (9000 ft)

import { createServiceLogger }    from '../logger'
import {
  RVSM_LOWER_FL,
  RVSM_UPPER_FL,
  TRANSITION_ALTITUDE_DEFAULT_FT,
} from '../constants'

const log = createServiceLogger('AltitudeComplianceEngine')

const EASTBOUND_VALID_FL_BELOW_RVSM = [70, 90, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290]
const WESTBOUND_VALID_FL_BELOW_RVSM = [80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280]
const EASTBOUND_VALID_FL_RVSM       = [290, 310, 330, 350, 370, 390, 410]
const WESTBOUND_VALID_FL_RVSM       = [300, 320, 340, 360, 380, 400]

export interface AltitudeComplianceInput {
  flightRules:                    'I' | 'V' | 'Y' | 'Z'
  levelIndicator:                 'A' | 'F' | 'S' | 'M' | 'VFR'
  levelValue:                     string
  magneticTrackDeg:               number | null
  equipment:                      string
  destinationTransitionAltFt?:    number
  destinationTransitionLevelFl?:  number
}

export interface AltitudeComplianceResult {
  errors:          Array<{ field: string; code: string; message: string }>
  warnings:        Array<{ field: string; code: string; message: string }>
  info:            Array<{ code: string; message: string }>
  flightLevelFt?:  number
}

export class AltitudeComplianceEngine {

  checkCompliance(input: AltitudeComplianceInput): AltitudeComplianceResult {
    const errors:   Array<{ field: string; code: string; message: string }> = []
    const warnings: Array<{ field: string; code: string; message: string }> = []
    const info:     Array<{ code: string; message: string }> = []

    const fl             = this.resolveToFl(input.levelIndicator, input.levelValue)
    const flightLevelFt  = fl !== null ? fl * 100 : undefined

    // VFR: hemispherical advisory only, no blocking checks
    if (input.flightRules === 'V' && fl !== null) {
      info.push({ code: 'VFR_HEMISPHERICAL_ADVISORY',
        message: `VFR hemispherical rule advisory: even altitudes westbound, odd eastbound. Confirm with ATC.` })
      return { errors, warnings, info, flightLevelFt }
    }

    // IFR (I, Y, Z): semicircular rule
    if (['I', 'Y', 'Z'].includes(input.flightRules) && fl !== null) {
      if (input.magneticTrackDeg === null) {
        // NEVER silently skip — always emit warning
        warnings.push({ field: 'level', code: 'SEMICIRCULAR_UNABLE_NO_TRACK',
          message: `IFR semicircular rule could not be checked — departure or destination ` +
                   `aerodrome coordinates not available. Verify filed altitude is correct for your track.` })
      } else {
        const isEastbound = input.magneticTrackDeg >= 0 && input.magneticTrackDeg < 180
        const isRvsm      = fl >= RVSM_LOWER_FL && fl <= RVSM_UPPER_FL

        const validLevels = isRvsm
          ? (isEastbound ? EASTBOUND_VALID_FL_RVSM       : WESTBOUND_VALID_FL_RVSM)
          : (isEastbound ? EASTBOUND_VALID_FL_BELOW_RVSM : WESTBOUND_VALID_FL_BELOW_RVSM)

        if (!validLevels.includes(fl)) {
          const direction = isEastbound ? 'eastbound' : 'westbound'
          const examples  = validLevels.slice(0, 4).map(l => `FL${l}`).join(', ')
          errors.push({ field: 'level', code: 'SEMICIRCULAR_RULE_VIOLATION',
            message: `FL${fl} is not valid for ${direction} IFR ` +
                     `(magnetic track ${Math.round(input.magneticTrackDeg)}°). ` +
                     `Valid ${direction} IFR levels: ${examples}... Ref: ICAO Annex 2 Table 3-1` })
        } else {
          info.push({ code: 'SEMICIRCULAR_RULE_COMPLIANT',
            message: `FL${fl} valid for ${isEastbound ? 'eastbound' : 'westbound'} IFR ` +
                     `(magnetic track ${Math.round(input.magneticTrackDeg)}°)` })
        }
      }

      // RVSM equipment check
      if (fl !== null && fl >= RVSM_LOWER_FL && fl <= RVSM_UPPER_FL) {
        if (!input.equipment.includes('W')) {
          errors.push({ field: 'level', code: 'RVSM_EQUIPMENT_MISSING',
            message: `FL${fl} is within RVSM airspace (FL${RVSM_LOWER_FL}–FL${RVSM_UPPER_FL}). ` +
                     `Equipment code 'W' required in Item 10.` })
        } else {
          info.push({ code: 'RVSM_COMPLIANT',
            message: `FL${fl} in RVSM airspace. Equipment 'W' declared. Compliant.` })
        }
      }
    }

    // Transition altitude advisory
    const transAlt    = input.destinationTransitionAltFt ?? TRANSITION_ALTITUDE_DEFAULT_FT
    const transSource = input.destinationTransitionAltFt ? 'aerodrome-specific' : 'national default'

    if (flightLevelFt !== undefined) {
      info.push({ code: 'TRANSITION_ALTITUDE_INFO',
        message: `Destination transition altitude: ${transAlt}ft (${transSource}). ` +
                 `Below ${transAlt}ft: use QNH. At or above: use 1013.25 hPa.` +
                 (input.destinationTransitionLevelFl
                   ? ` Transition level: FL${input.destinationTransitionLevelFl}.`
                   : ' Transition level: obtain from ATC at destination.') })
    }

    // High altitude advisory
    if (fl !== null && fl > 450) {
      warnings.push({ field: 'level', code: 'LEVEL_ABOVE_FL450',
        message: `FL${fl} is above FL450. Verify ATC can provide service at this altitude in Indian airspace.` })
    }

    log.info('altitude_compliance_checked', {
      data: { fl, magneticTrack: input.magneticTrackDeg, errorCount: errors.length }
    })

    return { errors, warnings, info, flightLevelFt }
  }

  // Resolve level indicator + value to integer FL (e.g. 330 for FL330)
  resolveToFl(indicator: string, value: string): number | null {
    if (indicator === 'VFR') return null
    const num = parseInt(value)
    if (isNaN(num)) return null
    switch (indicator) {
      case 'F': return num                               // F330 → 330
      case 'A': return Math.round(num * 100 / 100)      // A045 → ~45
      case 'S': return Math.round(num * 3.28084 / 100)  // S0900 metric → rough FL
      default:  return num
    }
  }
}

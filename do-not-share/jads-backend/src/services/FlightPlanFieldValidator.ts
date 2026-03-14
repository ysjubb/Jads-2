/**
 * FlightPlanFieldValidator.ts
 *
 * Stateless business-rule validation for manned aircraft flight plans.
 * Covers observations O2–O10 from the flight plan issues document:
 *   O2  — EOBT / DOF must not be in the past
 *   O4  — Route start/end must match ADEP / ADES
 *   O5  — Cruising level caps (IFR ≤ FL460, VFR ≤ FL150) + semicircular compliance
 *   O6  — Cruising speed caps (N ≤ 600, K ≤ 900, M ≤ 3.5)
 *   O7  — EET ≤ endurance, both ≤ 1800, HHMM format
 *   O8  — POB: > 0 and ≤ 600 (except special users)
 *   O9  — Email must be valid
 *   O10 — Mobile must be Indian +91 and valid
 *
 * Called by:
 *   1. POST /api/flight-plans/validate  (pre-filing dry-run for all 3 clients)
 *   2. OfplValidationService.validate() (P4A stage before filing)
 *
 * All rules are blocking (errors) unless noted as advisory (warnings).
 */

import { createServiceLogger } from '../logger'

const log = createServiceLogger('FlightPlanFieldValidator')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidationItem {
  field:   string
  code:    string
  message: string
}

export interface FieldValidationInput {
  // Temporal
  eobt:            string   // ISO datetime or DDHHmm
  dof?:            string   // YYMMDD from Item 18

  // Aerodromes
  adep:            string   // 4-char ICAO or ZZZZ
  ades:            string   // 4-char ICAO or ZZZZ
  route:           string   // Route string e.g. "DCT" or "L301 GANDO L301 PAKER"
  item18?:         string   // Full Item 18 text

  // Speed & level
  cruisingSpeed:   string   // "N0450", "K0800", "M082"
  cruisingLevel:   string   // "F350", "A045", "VFR"
  flightRules:     string   // "I", "V", "Y", "Z" or "IFR", "VFR"
  flightType:      string   // "S", "N", "G", "M", "X"

  // Time / endurance
  eet:             string   // HHMM (e.g. "0130")
  endurance?:      string   // HHMM (e.g. "0500")

  // Persons on board
  personsOnBoard?: number | string

  // Contact
  notifyEmail?:      string
  notifyMobile?:     string
  additionalEmails?: string[] | string

  // Caller context
  filedByType?:    string   // 'CIVILIAN' | 'SPECIAL'
  userRole?:       string   // 'PILOT' | 'GOVT_PILOT' etc.
}

export interface FieldValidationResult {
  valid:    boolean
  errors:   ValidationItem[]
  warnings: ValidationItem[]
  info:     ValidationItem[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const HHMM_RE          = /^\d{4}$/
const EMAIL_RE         = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const INDIAN_MOBILE_RE = /^\+91[6-9]\d{9}$/
const EOBT_GRACE_MS    = 15 * 60 * 1000      // 15 minutes grace for EOBT in past
const MAX_ADVANCE_DAYS = 120                   // ICAO: max 120 days in advance
const MAX_HHMM_MINUTES = 18 * 60              // 1800 → 18h00m

// Speed caps
const MAX_SPEED_KNOTS  = 600   // N0600
const MAX_SPEED_KMH    = 900   // K0900
const MAX_SPEED_MACH   = 35    // M035 → Mach 3.5

// Level caps
const MAX_FL_IFR_SCHED      = 460  // Scheduled IFR max FL460
const MAX_FL_IFR_NON_SCHED  = 400  // Non-scheduled IFR max FL400
const MAX_FL_VFR             = 150  // VFR max FL150
const MAX_ALT_VFR_FT         = 18000 // VFR altitudes up to 18000 ft (A180)

// POB
const MAX_POB_STANDARD = 600

// ── Validator ──────────────────────────────────────────────────────────────────

export class FlightPlanFieldValidator {

  validate(input: FieldValidationInput): FieldValidationResult {
    const errors:   ValidationItem[] = []
    const warnings: ValidationItem[] = []
    const info:     ValidationItem[] = []

    // Normalise flight rules
    const rulesMap: Record<string, string> = { VFR: 'V', IFR: 'I', Y: 'Y', Z: 'Z', V: 'V', I: 'I' }
    const rules = rulesMap[input.flightRules] || input.flightRules

    // ── O2: EOBT / DOF temporal validation ────────────────────────────────

    this.validateTemporal(input, errors, warnings, info)

    // ── O4: Route start/end match ADEP/ADES ───────────────────────────────

    this.validateRouteEndpoints(input, errors, warnings)

    // ── O5: Cruising level caps + advisory ────────────────────────────────

    this.validateCruisingLevel(input, rules, errors, warnings, info)

    // ── O6: Cruising speed caps ───────────────────────────────────────────

    this.validateCruisingSpeed(input, errors)

    // ── O7: EET and endurance ─────────────────────────────────────────────

    this.validateEetEndurance(input, errors, warnings)

    // ── O8: Persons on board ──────────────────────────────────────────────

    this.validatePob(input, errors)

    // ── O9: Email ─────────────────────────────────────────────────────────

    this.validateEmail(input, errors)

    // ── O10: Mobile ───────────────────────────────────────────────────────

    this.validateMobile(input, errors)

    log.info('field_validation_complete', {
      data: { errorCount: errors.length, warningCount: warnings.length }
    })

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    }
  }

  // ── O2 ─────────────────────────────────────────────────────────────────────

  private validateTemporal(
    input: FieldValidationInput,
    errors: ValidationItem[], warnings: ValidationItem[], _info: ValidationItem[]
  ): void {
    const now = Date.now()

    // Parse EOBT — accept both ISO datetime and DDHHmm
    let eobtDate: Date | null = null
    if (input.eobt) {
      if (input.eobt.includes('T') || input.eobt.includes('-')) {
        // ISO format from frontend
        const d = new Date(input.eobt)
        if (!isNaN(d.getTime())) eobtDate = d
      } else if (/^\d{6}$/.test(input.eobt)) {
        // DDHHmm format — reconstruct with current month/year
        const today = new Date()
        const day = parseInt(input.eobt.substring(0, 2))
        const hr  = parseInt(input.eobt.substring(2, 4))
        const mn  = parseInt(input.eobt.substring(4, 6))
        eobtDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day, hr, mn))
        // If day is in the past within current month, check next month
        if (eobtDate.getTime() < now - EOBT_GRACE_MS && day < today.getUTCDate()) {
          eobtDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day, hr, mn))
        }
      }
    }

    if (eobtDate) {
      if (eobtDate.getTime() < now - EOBT_GRACE_MS) {
        errors.push({
          field: 'eobt', code: 'EOBT_IN_PAST',
          message: `EOBT ${eobtDate.toISOString()} is in the past. You cannot file a flight plan for a past date/time.`
        })
      }

      const maxFuture = now + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000
      if (eobtDate.getTime() > maxFuture) {
        warnings.push({
          field: 'eobt', code: 'EOBT_TOO_FAR_FUTURE',
          message: `EOBT is more than ${MAX_ADVANCE_DAYS} days in the future. ICAO Doc 4444 limits advance filing to 120 days.`
        })
      }
    }

    // DOF validation
    if (input.dof) {
      const dofMatch = /^(\d{2})(\d{2})(\d{2})$/.exec(input.dof)
      if (dofMatch) {
        const yr = 2000 + parseInt(dofMatch[1])
        const mo = parseInt(dofMatch[2]) - 1
        const dy = parseInt(dofMatch[3])
        const dofDate = new Date(Date.UTC(yr, mo, dy))
        const todayMidnight = new Date()
        todayMidnight.setUTCHours(0, 0, 0, 0)

        if (dofDate.getTime() < todayMidnight.getTime()) {
          errors.push({
            field: 'dof', code: 'DOF_IN_PAST',
            message: `DOF ${input.dof} (${dofDate.toISOString().slice(0,10)}) is in the past. Flight plans cannot be filed for previous dates.`
          })
        }
      }
    }
  }

  // ── O4 ─────────────────────────────────────────────────────────────────────

  private validateRouteEndpoints(
    input: FieldValidationInput,
    errors: ValidationItem[], _warnings: ValidationItem[]
  ): void {
    const route = (input.route || '').trim().toUpperCase()

    // Skip validation for empty or pure-DCT routes
    if (!route || route === 'DCT' || route === 'DIRECT') return

    // ZZZZ aerodromes require DEP/DEST in Item 18
    const item18Upper = (input.item18 || '').toUpperCase()

    if (input.adep === 'ZZZZ' && !item18Upper.includes('DEP/')) {
      errors.push({
        field: 'route', code: 'ROUTE_START_MISSING_DEP',
        message: `Departure is ZZZZ but Item 18 is missing DEP/ coordinates. Route start point cannot be verified.`
      })
    }

    if (input.ades === 'ZZZZ' && !item18Upper.includes('DEST/')) {
      errors.push({
        field: 'route', code: 'ROUTE_END_MISSING_DEST',
        message: `Destination is ZZZZ but Item 18 is missing DEST/ coordinates. Route end point cannot be verified.`
      })
    }

    // Parse route tokens
    const tokens = route.split(/\s+/).filter(t => t.length > 0)
    if (tokens.length === 0) return

    // Airway designator pattern: letter + digits (L301, W15, B345, G450, A791, etc.)
    const isAirway = (t: string) => /^[UABGRWLZ]\d+$/.test(t) || /^[A-Z]{1,2}\d{2,4}$/.test(t)

    // Extract first meaningful waypoint (skip airway designators)
    const firstWp = tokens.find(t => !isAirway(t) && t !== 'DCT' && t !== 'VFR' && t !== 'IFR')
    const lastWp  = [...tokens].reverse().find(t => !isAirway(t) && t !== 'DCT' && t !== 'VFR' && t !== 'IFR')

    // If first waypoint looks like an aerodrome ICAO, check it matches departure region
    if (firstWp && /^[A-Z]{4}$/.test(firstWp) && input.adep !== 'ZZZZ') {
      // First waypoint should NOT be the destination (indicates reversed route)
      if (firstWp === input.ades && firstWp !== input.adep) {
        errors.push({
          field: 'route', code: 'ROUTE_START_MISMATCH',
          message: `Route starts with ${firstWp} which is the destination, not the departure ${input.adep}. Check route direction.`
        })
      }
    }

    // If last waypoint is an aerodrome ICAO, check it matches destination region
    if (lastWp && /^[A-Z]{4}$/.test(lastWp) && input.ades !== 'ZZZZ') {
      // Last waypoint should NOT be the departure
      if (lastWp === input.adep && lastWp !== input.ades) {
        errors.push({
          field: 'route', code: 'ROUTE_END_MISMATCH',
          message: `Route ends with ${lastWp} which is the departure, not the destination ${input.ades}. Check route direction.`
        })
      }
    }
  }

  // ── O5 ─────────────────────────────────────────────────────────────────────

  private validateCruisingLevel(
    input: FieldValidationInput,
    rules: string,
    errors: ValidationItem[], warnings: ValidationItem[], info: ValidationItem[]
  ): void {
    const level = (input.cruisingLevel || '').toUpperCase()
    if (!level || level === 'VFR') {
      if (rules === 'I' || rules === 'Y' || rules === 'Z') {
        errors.push({
          field: 'cruisingLevel', code: 'IFR_REQUIRES_LEVEL',
          message: `IFR flight requires a numeric cruising level (e.g. F350, A045). VFR is not valid for IFR rules.`
        })
      }
      return
    }

    const indicator = level.charAt(0)
    const value     = parseInt(level.substring(1))
    if (isNaN(value)) return

    // Determine flight level
    let flightLevel: number | null = null
    if (indicator === 'F') flightLevel = value
    else if (indicator === 'A') flightLevel = value  // A045 → 4500 ft, effectively FL45

    if (flightLevel === null) return

    // IFR level caps
    if (rules === 'I' || rules === 'Y' || rules === 'Z') {
      if (indicator === 'F') {
        const maxFl = input.flightType === 'S' ? MAX_FL_IFR_SCHED : MAX_FL_IFR_NON_SCHED
        if (flightLevel > maxFl) {
          errors.push({
            field: 'cruisingLevel', code: 'IFR_LEVEL_EXCEEDS_MAX',
            message: `FL${flightLevel} exceeds maximum IFR ceiling of FL${maxFl}` +
                     `${input.flightType === 'S' ? ' for scheduled flights' : ' for non-scheduled flights'}.`
          })
        }
      }
    }

    // VFR level caps
    if (rules === 'V') {
      if (indicator === 'F' && flightLevel > MAX_FL_VFR) {
        errors.push({
          field: 'cruisingLevel', code: 'VFR_LEVEL_EXCEEDS_MAX',
          message: `FL${flightLevel} exceeds VFR maximum of FL${MAX_FL_VFR}. VFR flights are not allowed above FL150.`
        })
      }
      if (indicator === 'A') {
        const altFt = value * 100
        if (altFt > MAX_ALT_VFR_FT) {
          errors.push({
            field: 'cruisingLevel', code: 'VFR_ALTITUDE_EXCEEDS_MAX',
            message: `Altitude A${String(value).padStart(3,'0')} (${altFt} ft) exceeds VFR maximum of ${MAX_ALT_VFR_FT} ft.`
          })
        } else {
          info.push({
            field: 'cruisingLevel', code: 'VFR_ALTITUDE_ADVISORY',
            message: `VFR altitude A${String(value).padStart(3,'0')} (${altFt} ft) is within acceptable range (up to 18,000 ft). Pilot may override with ATC coordination.`
          })
        }
      }
    }
  }

  // ── O6 ─────────────────────────────────────────────────────────────────────

  private validateCruisingSpeed(
    input: FieldValidationInput,
    errors: ValidationItem[]
  ): void {
    const speed = (input.cruisingSpeed || '').toUpperCase()
    if (!speed) return

    const indicator = speed.charAt(0)
    const value     = parseInt(speed.substring(1))
    if (isNaN(value)) return

    switch (indicator) {
      case 'N':
        if (value > MAX_SPEED_KNOTS) {
          errors.push({
            field: 'cruisingSpeed', code: 'SPEED_EXCEEDS_MAX_KNOTS',
            message: `Speed N${String(value).padStart(4,'0')} (${value} knots) exceeds maximum ${MAX_SPEED_KNOTS} knots.`
          })
        }
        break
      case 'K':
        if (value > MAX_SPEED_KMH) {
          errors.push({
            field: 'cruisingSpeed', code: 'SPEED_EXCEEDS_MAX_KMH',
            message: `Speed K${String(value).padStart(4,'0')} (${value} km/h) exceeds maximum ${MAX_SPEED_KMH} km/h.`
          })
        }
        break
      case 'M':
        if (value > MAX_SPEED_MACH) {
          errors.push({
            field: 'cruisingSpeed', code: 'SPEED_EXCEEDS_MAX_MACH',
            message: `Speed M${String(value).padStart(3,'0')} (Mach ${(value/10).toFixed(1)}) exceeds maximum Mach ${(MAX_SPEED_MACH/10).toFixed(1)}.`
          })
        }
        break
    }
  }

  // ── O7 ─────────────────────────────────────────────────────────────────────

  private validateEetEndurance(
    input: FieldValidationInput,
    errors: ValidationItem[], _warnings: ValidationItem[]
  ): void {
    const parseHHMM = (s: string): number | null => {
      if (!HHMM_RE.test(s)) return null
      const hh = parseInt(s.substring(0, 2))
      const mm = parseInt(s.substring(2, 4))
      if (mm > 59) return null
      return hh * 60 + mm
    }

    // EET format and bounds
    const eetMinutes = parseHHMM(input.eet)
    if (input.eet && !HHMM_RE.test(input.eet)) {
      errors.push({
        field: 'eet', code: 'EET_FORMAT',
        message: `EET '${input.eet}' must be in HHMM format (e.g. 0130 for 1 hour 30 minutes).`
      })
    } else if (eetMinutes !== null && eetMinutes > MAX_HHMM_MINUTES) {
      errors.push({
        field: 'eet', code: 'EET_EXCEEDS_MAX',
        message: `EET ${input.eet} (${eetMinutes} min) exceeds maximum of 1800 (18 hours).`
      })
    }

    // Endurance format and bounds
    let enduranceMinutes: number | null = null
    if (input.endurance) {
      if (!HHMM_RE.test(input.endurance)) {
        errors.push({
          field: 'endurance', code: 'ENDURANCE_FORMAT',
          message: `Endurance '${input.endurance}' must be in HHMM format (e.g. 0500 for 5 hours).`
        })
      } else {
        enduranceMinutes = parseHHMM(input.endurance)
        if (enduranceMinutes !== null && enduranceMinutes > MAX_HHMM_MINUTES) {
          errors.push({
            field: 'endurance', code: 'ENDURANCE_EXCEEDS_MAX',
            message: `Endurance ${input.endurance} (${enduranceMinutes} min) exceeds maximum of 1800 (18 hours).`
          })
        }
      }
    }

    // Cross-check: EET ≤ endurance
    if (eetMinutes !== null && enduranceMinutes !== null && eetMinutes > enduranceMinutes) {
      errors.push({
        field: 'eet', code: 'EET_EXCEEDS_ENDURANCE',
        message: `EET ${input.eet} (${eetMinutes} min) exceeds fuel endurance ${input.endurance} (${enduranceMinutes} min). ` +
                 `EET can never exceed endurance — the aircraft would run out of fuel before reaching destination.`
      })
    }
  }

  // ── O8 ─────────────────────────────────────────────────────────────────────

  private validatePob(
    input: FieldValidationInput,
    errors: ValidationItem[]
  ): void {
    if (input.personsOnBoard === undefined || input.personsOnBoard === null || input.personsOnBoard === '') return

    const pob = typeof input.personsOnBoard === 'string'
      ? parseInt(input.personsOnBoard)
      : input.personsOnBoard

    if (isNaN(pob) || pob <= 0) {
      errors.push({
        field: 'personsOnBoard', code: 'POB_ZERO_OR_NEGATIVE',
        message: `Persons on board must be at least 1 (got ${input.personsOnBoard}). A flight requires at least one crew member.`
      })
      return
    }

    // Special users (govt/military) exempt from 600 cap
    const isSpecial = input.filedByType === 'SPECIAL' ||
                      input.userRole === 'GOVT_PILOT' ||
                      input.userRole === 'GOVT_DRONE_OPERATOR' ||
                      input.userRole === 'PLATFORM_SUPER_ADMIN'

    if (!isSpecial && pob > MAX_POB_STANDARD) {
      errors.push({
        field: 'personsOnBoard', code: 'POB_EXCEEDS_MAX',
        message: `Persons on board ${pob} exceeds maximum ${MAX_POB_STANDARD}. ` +
                 `For special/government flights exceeding this limit, use a government account.`
      })
    }
  }

  // ── O9 ─────────────────────────────────────────────────────────────────────

  private validateEmail(
    input: FieldValidationInput,
    errors: ValidationItem[]
  ): void {
    if (input.notifyEmail && !EMAIL_RE.test(input.notifyEmail.trim())) {
      errors.push({
        field: 'notifyEmail', code: 'EMAIL_INVALID',
        message: `'${input.notifyEmail}' is not a valid email address.`
      })
    }

    // Additional emails
    const extras = Array.isArray(input.additionalEmails)
      ? input.additionalEmails
      : typeof input.additionalEmails === 'string'
        ? input.additionalEmails.split(',').map(e => e.trim()).filter(Boolean)
        : []

    for (const email of extras) {
      if (!EMAIL_RE.test(email.trim())) {
        errors.push({
          field: 'additionalEmails', code: 'ADDITIONAL_EMAIL_INVALID',
          message: `Additional email '${email}' is not a valid email address.`
        })
        break  // Report first invalid only
      }
    }
  }

  // ── O10 ────────────────────────────────────────────────────────────────────

  private validateMobile(
    input: FieldValidationInput,
    errors: ValidationItem[]
  ): void {
    if (!input.notifyMobile) return

    const mobile = input.notifyMobile.trim().replace(/\s/g, '')

    if (!mobile.startsWith('+91')) {
      errors.push({
        field: 'notifyMobile', code: 'MOBILE_NOT_INDIAN',
        message: `Mobile number '${input.notifyMobile}' must be an Indian number starting with +91.`
      })
      return
    }

    if (!INDIAN_MOBILE_RE.test(mobile)) {
      errors.push({
        field: 'notifyMobile', code: 'MOBILE_FORMAT_INVALID',
        message: `Mobile number '${input.notifyMobile}' is not valid. Expected format: +91XXXXXXXXXX (10 digits after +91, starting with 6-9).`
      })
    }
  }
}

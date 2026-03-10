import type { ICAOFlightPlan } from '../types/flightPlan'
import { findAircraftType, findAerodrome, findAirline } from '../data/icaoData'
import { getCurrentAIRACCycle } from './chartService'

export type ComplianceStatus = 'PASS' | 'FAIL' | 'WARN' | 'PENDING'

export interface ComplianceItem {
  ruleId: string
  category: string
  label: string
  status: ComplianceStatus
  detail: string
  dgcaReference?: string
  fixGuidance?: string
}

export interface ComplianceReport {
  items: ComplianceItem[]
  overallStatus: ComplianceStatus
  failCount: number
  warnCount: number
  passCount: number
}

// ── Drone Pre-Flight Compliance ────────────────────────────────────────────────
// Pilot/operator has override on WARN items (not ADMIN)
export function checkDroneCompliance(params: {
  droneCategory: string
  zoneType: string
  uaopExpiry: string
  rplValid: boolean
  npntLevel: number
  maxAltAGL: number
  insuranceValid: boolean
  bvlosEnabled: boolean
  bvlosAuthExists: boolean
  proximityOk: boolean
}): ComplianceReport {
  const items: ComplianceItem[] = []

  // ZONE_ELIGIBILITY
  const zoneOk = params.zoneType !== 'RED' && !(params.droneCategory === 'NANO' && params.zoneType !== 'GREEN')
  items.push({
    ruleId: 'ZONE_ELIGIBILITY', category: 'Airspace', label: 'Zone Eligibility',
    status: zoneOk ? 'PASS' : 'FAIL',
    detail: zoneOk ? `${params.droneCategory} drone allowed in ${params.zoneType} zone` : `${params.droneCategory} drone NOT allowed in ${params.zoneType} zone`,
    dgcaReference: 'Drone Rules 2021 Rule 12',
    fixGuidance: 'Select a compatible airspace zone for your drone category',
  })

  // UAOP_VALIDITY
  const uaopDays = Math.floor((new Date(params.uaopExpiry).getTime() - Date.now()) / 86400000)
  items.push({
    ruleId: 'UAOP_VALIDITY', category: 'Licensing', label: 'UAOP Validity',
    status: uaopDays < 0 ? 'FAIL' : uaopDays < 30 ? 'WARN' : 'PASS',
    detail: uaopDays < 0 ? 'UAOP expired' : `UAOP valid (${uaopDays} days remaining)`,
    dgcaReference: 'Drone Rules 2021 Rule 10',
    fixGuidance: 'Renew UAOP before expiry',
  })

  // RPL_CURRENCY
  items.push({
    ruleId: 'RPL_CURRENCY', category: 'Licensing', label: 'RPL Currency',
    status: params.rplValid ? 'PASS' : 'FAIL',
    detail: params.rplValid ? 'Remote Pilot Licence current' : 'RPL expired or not found',
    dgcaReference: 'Drone Rules 2021 Rule 11',
  })

  // NPNT_HARDWARE
  const npntOk = params.npntLevel >= 2 || params.zoneType === 'GREEN'
  items.push({
    ruleId: 'NPNT_HARDWARE', category: 'Equipment', label: 'NPNT Hardware',
    status: npntOk ? 'PASS' : 'FAIL',
    detail: npntOk ? `NPNT Level ${params.npntLevel} compliant` : 'NPNT v2 required for Yellow zone operations',
    dgcaReference: 'DGCA CAR Section 7 Series X Part I',
  })

  // ALTITUDE_LIMIT
  const altLimit = params.zoneType === 'GREEN' ? 400 : 200
  items.push({
    ruleId: 'ALTITUDE_LIMIT', category: 'Operations', label: 'Altitude Limit',
    status: params.maxAltAGL <= altLimit ? 'PASS' : 'WARN',
    detail: `Max ${params.maxAltAGL}ft vs limit ${altLimit}ft for ${params.zoneType} zone`,
    dgcaReference: 'Drone Rules 2021 Rule 36',
  })

  // INSURANCE_STATUS
  items.push({
    ruleId: 'INSURANCE_STATUS', category: 'Legal', label: 'Insurance Status',
    status: params.insuranceValid ? 'PASS' : 'FAIL',
    detail: params.insuranceValid ? 'Third-party liability insurance valid' : 'Insurance required per Rule 38',
    dgcaReference: 'Drone Rules 2021 Rule 38',
  })

  // BVLOS_APPROVAL
  if (params.bvlosEnabled) {
    items.push({
      ruleId: 'BVLOS_APPROVAL', category: 'Operations', label: 'BVLOS Authorization',
      status: params.bvlosAuthExists ? 'PASS' : 'FAIL',
      detail: params.bvlosAuthExists ? 'DGCA BVLOS authorization on file' : 'BVLOS requires DGCA authorization letter',
      dgcaReference: 'Drone Rules 2021 Rule 26',
    })
  }

  // RESTRICTED_PROXIMITY
  items.push({
    ruleId: 'RESTRICTED_PROXIMITY', category: 'Safety', label: 'Restricted Proximity',
    status: params.proximityOk ? 'PASS' : 'FAIL',
    detail: params.proximityOk ? 'Clear of restricted proximity zones' : 'Too close to airport/border/military base',
    dgcaReference: 'Drone Rules 2021 Rule 36.1',
  })

  return buildReport(items)
}

// ── Aircraft Flight Plan Compliance ────────────────────────────────────────────
// Filing authority controls submission; approving authority has final say
export function checkFlightPlanCompliance(fpl: Partial<ICAOFlightPlan>): ComplianceReport {
  const items: ComplianceItem[] = []

  // CALLSIGN_FORMAT
  const csOk = !!fpl.aircraftId && fpl.aircraftId.length <= 7 && /^[A-Z0-9]+$/.test(fpl.aircraftId)
  items.push({
    ruleId: 'CALLSIGN_FORMAT', category: 'Field 7', label: 'Callsign Format',
    status: csOk ? 'PASS' : 'FAIL',
    detail: csOk ? `Callsign "${fpl.aircraftId}" valid` : 'Max 7 alphanumeric, no hyphens in transmitted Field 7',
    dgcaReference: 'ICAO Doc 4444 Para 4.4.1',
  })

  // AIRCRAFT_TYPE
  const acType = fpl.aircraftType ? findAircraftType(fpl.aircraftType) : null
  items.push({
    ruleId: 'AIRCRAFT_TYPE', category: 'Field 9', label: 'Aircraft Type',
    status: acType ? 'PASS' : fpl.aircraftType ? 'WARN' : 'FAIL',
    detail: acType ? `${acType.name} (${acType.wake})` : fpl.aircraftType ? 'Type not in Doc 8643 database' : 'Aircraft type required',
    dgcaReference: 'ICAO Doc 8643',
  })

  // MILITARY_FIELD8
  if (fpl.aircraftId?.toUpperCase().startsWith('IFC')) {
    items.push({
      ruleId: 'MILITARY_FIELD8', category: 'Field 8', label: 'Military Type Check',
      status: fpl.flightType === 'M' ? 'PASS' : 'FAIL',
      detail: fpl.flightType === 'M' ? 'IFC callsign with Military type' : 'IFC callsign requires Flight Type = M',
    })
  }

  // AERODROME_CODES
  const depOk = fpl.departureAerodrome ? /^[A-Z]{4}$/.test(fpl.departureAerodrome) : false
  const destOk = fpl.destinationAerodrome ? /^[A-Z]{4}$/.test(fpl.destinationAerodrome) : false
  items.push({
    ruleId: 'AERODROME_CODES', category: 'Fields 13/16', label: 'Aerodrome Codes',
    status: depOk && destOk ? 'PASS' : 'FAIL',
    detail: `DEP: ${fpl.departureAerodrome || 'missing'}, DEST: ${fpl.destinationAerodrome || 'missing'}`,
    dgcaReference: 'ICAO Doc 7910',
  })

  // EOBT_VALIDITY
  items.push({
    ruleId: 'EOBT_VALIDITY', category: 'Field 13', label: 'EOBT Validity',
    status: fpl.eobt ? 'PASS' : 'FAIL',
    detail: fpl.eobt ? `EOBT: ${fpl.eobt}` : 'EOBT required',
    dgcaReference: 'ICAO Doc 4444',
  })

  // ROUTE_VALIDITY
  items.push({
    ruleId: 'ROUTE_VALIDITY', category: 'Field 15', label: 'Route',
    status: fpl.route ? 'PASS' : 'WARN',
    detail: fpl.route ? 'Route specified' : 'No route entered',
    dgcaReference: 'ICAO Doc 4444 Para 4.4.1.4',
  })

  // AIRAC_CURRENCY
  const cycle = getCurrentAIRACCycle()
  const daysLeft = Math.ceil((cycle.expiryDate.getTime() - Date.now()) / 86400000)
  items.push({
    ruleId: 'AIRAC_CURRENCY', category: 'NavData', label: 'AIRAC Currency',
    status: daysLeft > 3 ? 'PASS' : daysLeft > 0 ? 'WARN' : 'FAIL',
    detail: `AIRAC ${cycle.cycleNumber} — ${daysLeft > 0 ? `${daysLeft} days remaining` : 'EXPIRED'}`,
  })

  // EQUIPMENT_CONSISTENCY - RVSM
  const hasRVSM = fpl.equipment?.includes('W')
  const flInRVSM = fpl.cruisingLevel && /^F(29[0-9]|[34]\d{2}|410)$/.test(fpl.cruisingLevel)
  if (flInRVSM && !hasRVSM) {
    items.push({
      ruleId: 'RVSM_EQUIPMENT', category: 'Field 10', label: 'RVSM Equipment',
      status: 'WARN',
      detail: 'FL290-FL410 requires RVSM (W) in Field 10',
    })
  }

  return buildReport(items)
}

function buildReport(items: ComplianceItem[]): ComplianceReport {
  const failCount = items.filter(i => i.status === 'FAIL').length
  const warnCount = items.filter(i => i.status === 'WARN').length
  const passCount = items.filter(i => i.status === 'PASS').length
  return {
    items,
    overallStatus: failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS',
    failCount, warnCount, passCount,
  }
}

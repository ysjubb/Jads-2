import type { ComplianceReport, ComplianceResult } from '../types/compliance';
import type { DroneMission, FlightPlan } from '../types/flightPlan';
import { DRONE_RULES, AIRCRAFT_RULES } from '../data/complianceRules';

export function runDroneCompliance(mission: DroneMission): ComplianceReport {
  const results: ComplianceResult[] = [];

  // ZONE_ELIGIBILITY — Drone Rules 2021, Rule 18
  if (mission.operationZone.type === 'RED') {
    results.push({ ruleId: 'ZONE_ELIGIBILITY', status: 'FAIL', message: 'RED zone — no operations permitted without DGCA exemption' });
  } else if (mission.operationZone.type === 'YELLOW') {
    results.push({ ruleId: 'ZONE_ELIGIBILITY', status: 'WARNING', message: 'YELLOW zone — prior permission required from relevant authority' });
  } else {
    results.push({ ruleId: 'ZONE_ELIGIBILITY', status: 'PASS', message: 'GREEN zone — operations permitted' });
  }

  // UAOP_VALIDITY — Rule 11
  // In production, would check against backend; for now validate field presence
  results.push({
    ruleId: 'UAOP_VALIDITY',
    status: mission.droneUIN ? 'PASS' : 'FAIL',
    message: mission.droneUIN ? 'Drone UIN registered' : 'Drone UIN required for UAOP verification',
  });

  // RPL_CURRENCY — Rule 12
  results.push({
    ruleId: 'RPL_CURRENCY',
    status: mission.pilotRPL ? 'PASS' : 'FAIL',
    message: mission.pilotRPL ? 'Remote pilot license provided' : 'Valid Remote Pilot License required',
  });

  // NPNT_HARDWARE — CAR Section 3 Series X Part I
  results.push({
    ruleId: 'NPNT_HARDWARE',
    status: mission.npntRequired ? 'WARNING' : 'PASS',
    message: mission.npntRequired ? 'NPNT compliance must be verified on drone hardware' : 'NPNT not required for this category',
  });

  // ALTITUDE_LIMIT — Rule 36: 400ft AGL = 121.92m
  const maxAltMeters = 121.92;
  if (mission.altitude > maxAltMeters) {
    results.push({ ruleId: 'ALTITUDE_LIMIT', status: 'FAIL', message: `Altitude ${mission.altitude}m exceeds 400ft AGL (${maxAltMeters}m) limit`, details: 'Drone Rules 2021 Rule 36' });
  } else {
    results.push({ ruleId: 'ALTITUDE_LIMIT', status: 'PASS', message: `Altitude ${mission.altitude}m within 400ft AGL limit` });
  }

  // RESTRICTED_PROXIMITY — Schedule III
  if (mission.operationZone.restrictions && mission.operationZone.restrictions.length > 0) {
    results.push({ ruleId: 'RESTRICTED_PROXIMITY', status: 'WARNING', message: `Zone has restrictions: ${mission.operationZone.restrictions.join(', ')}` });
  } else {
    results.push({ ruleId: 'RESTRICTED_PROXIMITY', status: 'PASS', message: 'No proximity restrictions in selected zone' });
  }

  // INSURANCE_STATUS — Rule 42
  results.push({
    ruleId: 'INSURANCE_STATUS',
    status: 'WARNING',
    message: 'Third-party liability insurance status must be verified before flight',
  });

  // BVLOS_APPROVAL — CAR Section 3 Series X Part II
  if (mission.missionType === 'BVLOS') {
    results.push({ ruleId: 'BVLOS_APPROVAL', status: 'FAIL', message: 'BVLOS operations require specific DGCA approval — verify approval document' });
  } else {
    results.push({ ruleId: 'BVLOS_APPROVAL', status: 'NOT_APPLICABLE', message: `${mission.missionType} — BVLOS approval not required` });
  }

  // NIGHT_OPS — Rule 37
  const startHour = new Date(mission.startTime).getUTCHours();
  const endHour = new Date(mission.endTime).getUTCHours();
  const isNight = startHour >= 18 || startHour < 6 || endHour >= 18 || endHour < 6;
  if (isNight) {
    results.push({ ruleId: 'NIGHT_OPS', status: 'WARNING', message: 'Mission includes night hours — additional DGCA approval and anti-collision lighting required' });
  } else {
    results.push({ ruleId: 'NIGHT_OPS', status: 'PASS', message: 'Daytime operation' });
  }

  const hasFailure = results.some(r => r.status === 'FAIL');
  const hasWarning = results.some(r => r.status === 'WARNING');

  return {
    missionId: mission.id,
    timestamp: new Date(),
    results,
    overallStatus: hasFailure ? 'NON_COMPLIANT' : hasWarning ? 'WARNINGS' : 'COMPLIANT',
  };
}

export function runAircraftCompliance(plan: FlightPlan): ComplianceReport {
  const results: ComplianceResult[] = [];

  // CALLSIGN_FORMAT — ICAO Doc 4444 Appendix 2 Para 2.3
  const cleanCallsign = plan.callsign.replace(/-/g, '');
  if (/^[A-Z0-9]{2,7}$/.test(cleanCallsign)) {
    results.push({ ruleId: 'CALLSIGN_FORMAT', status: 'PASS', message: 'Callsign format valid' });
  } else {
    results.push({ ruleId: 'CALLSIGN_FORMAT', status: 'FAIL', message: 'Callsign must be 2-7 alphanumeric uppercase characters' });
  }

  // AIRCRAFT_TYPE — ICAO Doc 8643
  if (/^[A-Z0-9]{2,4}$/.test(plan.aircraftType)) {
    results.push({ ruleId: 'AIRCRAFT_TYPE', status: 'PASS', message: 'Aircraft type designator valid' });
  } else {
    results.push({ ruleId: 'AIRCRAFT_TYPE', status: 'FAIL', message: 'Aircraft type must be 2-4 character ICAO designator' });
  }

  // MILITARY_FIELD8 — Doc 4444 Para 2.3.3
  if (cleanCallsign.startsWith('IFC') && plan.flightType !== 'M') {
    results.push({ ruleId: 'MILITARY_FIELD8', status: 'FAIL', message: 'IFC callsign requires flight type M' });
  } else {
    results.push({ ruleId: 'MILITARY_FIELD8', status: 'PASS', message: 'Flight type consistent' });
  }

  // ROUTE_VALIDITY — Doc 4444 Appendix 2 Para 2.6
  if (plan.route && plan.route.trim().length > 0) {
    results.push({ ruleId: 'ROUTE_VALIDITY', status: 'PASS', message: 'Route string provided' });
  } else {
    results.push({ ruleId: 'ROUTE_VALIDITY', status: 'FAIL', message: 'Route field is empty' });
  }

  // AERODROME_CODES — ICAO Doc 7910
  const icaoRe = /^[A-Z]{4}$/;
  if (icaoRe.test(plan.departureAerodrome) && icaoRe.test(plan.destinationAerodrome)) {
    results.push({ ruleId: 'AERODROME_CODES', status: 'PASS', message: 'Aerodrome codes valid' });
  } else {
    results.push({ ruleId: 'AERODROME_CODES', status: 'FAIL', message: 'Aerodromes must be 4-letter ICAO codes' });
  }

  // EOBT_VALIDITY — Doc 4444 Appendix 2 Para 2.5
  if (/^\d{4}$/.test(plan.eobt)) {
    const hh = parseInt(plan.eobt.slice(0, 2));
    const mm = parseInt(plan.eobt.slice(2, 4));
    if (hh <= 23 && mm <= 59) {
      results.push({ ruleId: 'EOBT_VALIDITY', status: 'PASS', message: 'EOBT valid' });
    } else {
      results.push({ ruleId: 'EOBT_VALIDITY', status: 'FAIL', message: `EOBT ${plan.eobt} has invalid hours/minutes` });
    }
  } else {
    results.push({ ruleId: 'EOBT_VALIDITY', status: 'FAIL', message: 'EOBT must be HHMM format' });
  }

  // EET_PLAUSIBILITY — Doc 4444 Appendix 2 Para 2.8
  if (/^\d{4}$/.test(plan.totalEET)) {
    results.push({ ruleId: 'EET_PLAUSIBILITY', status: 'PASS', message: 'EET format valid' });
  } else {
    results.push({ ruleId: 'EET_PLAUSIBILITY', status: 'FAIL', message: 'EET must be HHMM format' });
  }

  // NOTAM_CONFLICTS — CAR Section 4 Series B Part I
  results.push({ ruleId: 'NOTAM_CONFLICTS', status: 'WARNING', message: 'Check active NOTAMs for route conflicts before departure' });

  // AIRAC_CURRENCY — ICAO Annex 15
  results.push({ ruleId: 'AIRAC_CURRENCY', status: 'WARNING', message: 'Verify navigation data is current AIRAC cycle before flight' });

  // RVSM_EQUIPMENT — ICAO Doc 9574
  const flMatch = plan.cruisingLevel.match(/^F(\d{3})$/);
  if (flMatch) {
    const fl = parseInt(flMatch[1]);
    if (fl >= 290 && fl <= 410) {
      if (plan.equipment.includes('W')) {
        results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'PASS', message: 'RVSM equipment approved' });
      } else {
        results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'FAIL', message: `FL${fl} requires RVSM approval (W in equipment)` });
      }
    } else {
      results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'NOT_APPLICABLE', message: 'Flight level outside RVSM airspace' });
    }
  } else {
    results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'NOT_APPLICABLE', message: 'Non-FL cruising level' });
  }

  // ADS_B_REQUIREMENT — DGCA CAR Section 2 Series R Part V
  if (flMatch && parseInt(flMatch[1]) >= 290) {
    if (plan.surveillance.includes('B1') || plan.surveillance.includes('B2')) {
      results.push({ ruleId: 'ADS_B_REQUIREMENT', status: 'PASS', message: 'ADS-B Out capability declared' });
    } else {
      results.push({ ruleId: 'ADS_B_REQUIREMENT', status: 'FAIL', message: 'ADS-B Out required above FL290 in Indian airspace' });
    }
  } else {
    results.push({ ruleId: 'ADS_B_REQUIREMENT', status: 'NOT_APPLICABLE', message: 'Below FL290 — ADS-B not mandatory' });
  }

  const hasFailure = results.some(r => r.status === 'FAIL');
  const hasWarning = results.some(r => r.status === 'WARNING');

  return {
    missionId: plan.id,
    timestamp: new Date(),
    results,
    overallStatus: hasFailure ? 'NON_COMPLIANT' : hasWarning ? 'WARNINGS' : 'COMPLIANT',
  };
}

export { DRONE_RULES, AIRCRAFT_RULES };

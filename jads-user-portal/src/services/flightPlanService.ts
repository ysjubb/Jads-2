import type { FlightPlan, DroneMission } from '../types/flightPlan';
import type { ComplianceResult } from '../types/compliance';
import { userApi } from '../api/client';

export async function createFlightPlan(plan: Partial<FlightPlan>): Promise<FlightPlan> {
  const { data } = await userApi().post<FlightPlan>('/api/flight-plans', plan);
  return data;
}

export async function getFlightPlans(): Promise<FlightPlan[]> {
  const { data } = await userApi().get<FlightPlan[]>('/api/flight-plans');
  return data;
}

export async function getFlightPlan(id: string): Promise<FlightPlan> {
  const { data } = await userApi().get<FlightPlan>(`/api/flight-plans/${id}`);
  return data;
}

export async function updateFlightPlan(id: string, updates: Partial<FlightPlan>): Promise<FlightPlan> {
  const { data } = await userApi().put<FlightPlan>(`/api/flight-plans/${id}`, updates);
  return data;
}

export function validateFlightPlan(plan: FlightPlan): ComplianceResult[] {
  const results: ComplianceResult[] = [];

  // CALLSIGN_FORMAT: 2-7 alphanumeric uppercase
  if (!/^[A-Z0-9]{2,7}$/.test(plan.callsign.replace(/-/g, ''))) {
    results.push({ ruleId: 'CALLSIGN_FORMAT', status: 'FAIL', message: 'Callsign must be 2-7 alphanumeric characters (hyphens stripped)' });
  } else {
    results.push({ ruleId: 'CALLSIGN_FORMAT', status: 'PASS', message: 'Callsign format valid' });
  }

  // AERODROME_CODES: valid 4-letter ICAO
  const icaoRe = /^[A-Z]{4}$/;
  if (!icaoRe.test(plan.departureAerodrome)) {
    results.push({ ruleId: 'AERODROME_CODES', status: 'FAIL', message: `Departure ${plan.departureAerodrome} is not a valid ICAO code` });
  } else if (!icaoRe.test(plan.destinationAerodrome)) {
    results.push({ ruleId: 'AERODROME_CODES', status: 'FAIL', message: `Destination ${plan.destinationAerodrome} is not a valid ICAO code` });
  } else {
    results.push({ ruleId: 'AERODROME_CODES', status: 'PASS', message: 'Aerodrome codes valid' });
  }

  // EOBT_VALIDITY: HHMM format, valid time
  if (!/^\d{4}$/.test(plan.eobt)) {
    results.push({ ruleId: 'EOBT_VALIDITY', status: 'FAIL', message: 'EOBT must be in HHMM format' });
  } else {
    const hh = parseInt(plan.eobt.slice(0, 2));
    const mm = parseInt(plan.eobt.slice(2, 4));
    if (hh > 23 || mm > 59) {
      results.push({ ruleId: 'EOBT_VALIDITY', status: 'FAIL', message: `EOBT ${plan.eobt} is not a valid time` });
    } else {
      results.push({ ruleId: 'EOBT_VALIDITY', status: 'PASS', message: 'EOBT valid' });
    }
  }

  // EET_PLAUSIBILITY: HHMM format
  if (!/^\d{4}$/.test(plan.totalEET)) {
    results.push({ ruleId: 'EET_PLAUSIBILITY', status: 'FAIL', message: 'EET must be in HHMM format' });
  } else {
    results.push({ ruleId: 'EET_PLAUSIBILITY', status: 'PASS', message: 'EET format valid' });
  }

  // MILITARY_FIELD8: IFC prefix must have type M
  if (plan.callsign.startsWith('IFC') && plan.flightType !== 'M') {
    results.push({ ruleId: 'MILITARY_FIELD8', status: 'FAIL', message: 'IFC callsign requires flight type M (military)' });
  } else {
    results.push({ ruleId: 'MILITARY_FIELD8', status: 'PASS', message: 'Flight type consistent with callsign' });
  }

  // RVSM_EQUIPMENT: FL290-FL410 requires W in equipment
  const flMatch = plan.cruisingLevel.match(/^F(\d{3})$/);
  if (flMatch) {
    const fl = parseInt(flMatch[1]);
    if (fl >= 290 && fl <= 410 && !plan.equipment.includes('W')) {
      results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'FAIL', message: `FL${fl} requires RVSM approval (W in Field 10)` });
    } else {
      results.push({ ruleId: 'RVSM_EQUIPMENT', status: 'PASS', message: 'RVSM equipment check passed' });
    }
  }

  return results;
}

export async function createDroneMission(mission: Partial<DroneMission>): Promise<DroneMission> {
  const { data } = await userApi().post<DroneMission>('/api/drone-plans', mission);
  return data;
}

export async function getDroneMissions(): Promise<DroneMission[]> {
  const { data } = await userApi().get<DroneMission[]>('/api/drone-plans');
  return data;
}

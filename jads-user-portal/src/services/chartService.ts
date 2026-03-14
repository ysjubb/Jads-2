import type { AeroChart } from '../types/charts';
import { SID_STAR_DATA } from '../data/sidStarData';

/** AIRAC cycle is 28 days. Base: cycle 2601 effective 23 Jan 2026 */
const AIRAC_BASE_DATE = new Date('2026-01-23T00:00:00Z');
const AIRAC_BASE_CYCLE = 2601;
const AIRAC_CYCLE_DAYS = 28;

export function getCurrentAIRACCycle(): { cycle: string; effective: Date; expiry: Date } {
  const now = new Date();
  const diffMs = now.getTime() - AIRAC_BASE_DATE.getTime();
  const cyclesSinceBase = Math.floor(diffMs / (AIRAC_CYCLE_DAYS * 24 * 60 * 60 * 1000));

  const cycleNumber = AIRAC_BASE_CYCLE + cyclesSinceBase;
  const effective = new Date(AIRAC_BASE_DATE.getTime() + cyclesSinceBase * AIRAC_CYCLE_DAYS * 24 * 60 * 60 * 1000);
  const expiry = new Date(effective.getTime() + AIRAC_CYCLE_DAYS * 24 * 60 * 60 * 1000);

  return {
    cycle: String(cycleNumber),
    effective,
    expiry,
  };
}

export function isChartCurrent(chart: AeroChart): boolean {
  const { cycle } = getCurrentAIRACCycle();
  return chart.airacCycle === cycle;
}

export function daysUntilAIRACExpiry(): number {
  const { expiry } = getCurrentAIRACCycle();
  const diffMs = expiry.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export function getChartsForAirport(icaoCode: string): AeroChart[] {
  const airport = SID_STAR_DATA[icaoCode.toUpperCase()];
  if (!airport) return [];

  const { cycle } = getCurrentAIRACCycle();

  return airport.procedures.map((proc, idx) => ({
    id: `${icaoCode}-${proc.type}-${idx}`,
    icaoCode: icaoCode.toUpperCase(),
    chartType: proc.type as AeroChart['chartType'],
    name: `${proc.name}${proc.runway ? ` RWY ${proc.runway}` : ''}`,
    airacCycle: cycle,
    effectiveDate: new Date().toISOString(),
  }));
}

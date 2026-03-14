import type { NOTAM } from '../types/charts';
import { SAMPLE_NOTAMS, getNotamsForLocation, getActiveNotams } from '../data/sampleNotams';
import { userApi } from '../api/client';

export async function getNotams(icaoCode?: string): Promise<NOTAM[]> {
  try {
    const params = icaoCode ? { location: icaoCode } : {};
    const { data } = await userApi().get<NOTAM[]>('/api/notams', { params });
    return data;
  } catch {
    // Fallback to sample data
    return icaoCode ? getNotamsForLocation(icaoCode) : SAMPLE_NOTAMS;
  }
}

export function checkNotamConflicts(route: string, eobt: string): NOTAM[] {
  const activeNotams = getActiveNotams();
  const routePoints = route.split(/\s+/);

  return activeNotams.filter(notam => {
    // Check if any route point matches a NOTAM location
    for (const point of routePoints) {
      if (point === notam.icaoLocation) return true;
    }
    // Check restricted area NOTAMs with radius
    if (notam.qCode.startsWith('QR') && notam.coordinates && notam.radius) {
      return true; // Simplified: flag all restricted area NOTAMs on active routes
    }
    return false;
  });
}

export function formatNotamBriefing(notams: NOTAM[]): string {
  if (notams.length === 0) return 'NIL SIGNIFICANT NOTAMS';

  const lines: string[] = ['=== PRE-FLIGHT NOTAM BRIEFING ===', ''];

  for (const notam of notams) {
    lines.push(`${notam.id} (${notam.icaoLocation}) [${notam.type}]`);
    lines.push(`  VALID: ${notam.startTime} TO ${notam.endTime}`);
    lines.push(`  ${notam.text}`);
    if (notam.radius) lines.push(`  RADIUS: ${notam.radius}NM`);
    lines.push('');
  }

  lines.push(`=== END BRIEFING (${notams.length} NOTAM${notams.length > 1 ? 'S' : ''}) ===`);
  return lines.join('\n');
}

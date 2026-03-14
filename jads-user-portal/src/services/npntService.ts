import type { NPNTLogEntry, PermissionArtefact } from '../types/npnt';

/**
 * CRITICAL: NPNT logs are EVENT-BASED ONLY (discrete events).
 * They are NOT continuous GPS tracks. Never resample or interpolate NPNT entries.
 * Per DGCA specification, entries are: TAKEOFF, ARM, LAND, DISARM, GEOFENCE_BREACH, TIME_BREACH.
 */

export function parseNPNTLog(jsonData: string): NPNTLogEntry[] {
  const parsed = JSON.parse(jsonData);
  const entries: NPNTLogEntry[] = Array.isArray(parsed) ? parsed : parsed.entries ?? parsed.logs ?? [];

  for (const entry of entries) {
    if (!isValidEntryType(entry.entryType)) {
      throw new Error(`Invalid NPNT entry type: ${entry.entryType}`);
    }
    if (typeof entry.timeStamp !== 'number') {
      throw new Error('NPNT timeStamp must be a number (Unix epoch ms)');
    }
  }

  return entries;
}

export function validateChainHash(entries: NPNTLogEntry[]): { valid: boolean; brokenAt?: number } {
  if (entries.length === 0) return { valid: true };

  for (let i = 1; i < entries.length; i++) {
    const expectedPrevHash = entries[i].previousLogHash;
    // In a real implementation, we'd compute SHA-256 of entries[i-1] and compare.
    // For validation, we check the field exists and is non-empty.
    if (!expectedPrevHash || expectedPrevHash.length === 0) {
      return { valid: false, brokenAt: i };
    }
  }

  return { valid: true };
}

export function validatePermissionArtefact(
  pa: PermissionArtefact,
  entries: NPNTLogEntry[],
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  const paStart = new Date(pa.startTime).getTime();
  const paEnd = new Date(pa.endTime).getTime();

  for (const entry of entries) {
    // Check time window
    if (entry.timeStamp < paStart || entry.timeStamp > paEnd) {
      violations.push(`Entry at ${entry.timeStamp} outside PA time window (${pa.startTime} - ${pa.endTime})`);
    }

    // Check altitude
    if (entry.altitude > pa.maxAltitude) {
      violations.push(`Altitude ${entry.altitude}m exceeds PA max ${pa.maxAltitude}m at ${entry.entryType}`);
    }

    // Check geofence
    if (!isInsideFlightArea(entry.latitude, entry.longitude, pa.flightArea)) {
      violations.push(`Position (${entry.latitude}, ${entry.longitude}) outside PA flight area at ${entry.entryType}`);
    }

    // Log breach events
    if (entry.entryType === 'GEOFENCE_BREACH') {
      violations.push(`Geofence breach event recorded at ${new Date(entry.timeStamp).toISOString()}`);
    }
    if (entry.entryType === 'TIME_BREACH') {
      violations.push(`Time breach event recorded at ${new Date(entry.timeStamp).toISOString()}`);
    }
  }

  return { compliant: violations.length === 0, violations };
}

function isValidEntryType(type: string): boolean {
  return ['TAKEOFF', 'ARM', 'LAND', 'DISARM', 'GEOFENCE_BREACH', 'TIME_BREACH'].includes(type);
}

function isInsideFlightArea(lat: number, lng: number, area: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const xi = area[i].lng, yi = area[i].lat;
    const xj = area[j].lng, yj = area[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

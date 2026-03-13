import type { DJILogEntry, FlightLogFormat, NPNTLogEntry } from '../types/npnt';

/**
 * CRITICAL DISTINCTION:
 * - DJI CSV: continuous GPS track — CAN be resampled/interpolated for visualization
 * - NPNT JSON: discrete event log — CANNOT be resampled or interpolated (DGCA spec)
 * - DJI Binary (.txt): proprietary format — must be uploaded to server for decoding
 */

export function detectLogFormat(fileContent: string): FlightLogFormat {
  const trimmed = fileContent.trim();

  // NPNT signed JSON — starts with { or [
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? parsed.logs;
      if (Array.isArray(entries) && entries.length > 0 && entries[0].entryType) {
        return 'NPNT_JSON';
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // DJI AirData CSV — has characteristic headers
  if (
    trimmed.includes('datetime(utc)') ||
    trimmed.includes('latitude') ||
    trimmed.includes('OSD.latitude') ||
    trimmed.includes('GPS:Lat')
  ) {
    return 'DJI_CSV';
  }

  // Default: binary
  return 'DJI_BINARY';
}

export function parseDJICSV(csvText: string): DJILogEntry[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const latIdx = headers.findIndex(h => h.includes('latitude') || h.includes('lat'));
  const lngIdx = headers.findIndex(h => h.includes('longitude') || h.includes('lng') || h.includes('lon'));
  const altIdx = headers.findIndex(h => h.includes('altitude') || h.includes('alt'));
  const spdIdx = headers.findIndex(h => h.includes('speed'));
  const batIdx = headers.findIndex(h => h.includes('battery') || h.includes('bat'));
  const hdgIdx = headers.findIndex(h => h.includes('heading') || h.includes('compass'));
  const tsIdx = headers.findIndex(h => h.includes('time') || h.includes('datetime'));

  const entries: DJILogEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < 3) continue;

    entries.push({
      timestamp: tsIdx >= 0 ? cols[tsIdx] : `row-${i}`,
      lat: latIdx >= 0 ? parseFloat(cols[latIdx]) : 0,
      lng: lngIdx >= 0 ? parseFloat(cols[lngIdx]) : 0,
      altitude: altIdx >= 0 ? parseFloat(cols[altIdx]) : 0,
      speed: spdIdx >= 0 ? parseFloat(cols[spdIdx]) : 0,
      battery: batIdx >= 0 ? parseFloat(cols[batIdx]) : 0,
      heading: hdgIdx >= 0 ? parseFloat(cols[hdgIdx]) : 0,
    });
  }

  return entries;
}

export function convertDJIToTrack(entries: DJILogEntry[]): { lat: number; lng: number; alt: number }[] {
  return entries
    .filter(e => !isNaN(e.lat) && !isNaN(e.lng) && e.lat !== 0 && e.lng !== 0)
    .map(e => ({ lat: e.lat, lng: e.lng, alt: e.altitude }));
}

/**
 * Parse NPNT log from JSON string.
 * NPNT logs MUST NOT be resampled — they are discrete events only.
 */
export function parseNPNTFromFile(jsonText: string): NPNTLogEntry[] {
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : parsed.entries ?? parsed.logs ?? [];
}

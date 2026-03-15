import type { AirspaceZone, FIR, LatLng, AerodromeMapItem, NavaidMapItem, FixMapItem, Airway } from '../types/airspace';
import { INDIAN_FIRS, getFIRForPosition } from '../data/firData';
import { userApi } from '../api/client';

export async function getZones(bounds?: { ne: LatLng; sw: LatLng }): Promise<AirspaceZone[]> {
  try {
    const params = bounds
      ? { neLat: bounds.ne.lat, neLng: bounds.ne.lng, swLat: bounds.sw.lat, swLng: bounds.sw.lng }
      : {};
    const { data } = await userApi().get<AirspaceZone[]>('/api/airspace/zones', { params });
    return data;
  } catch {
    return [];
  }
}

export function getZoneByCoordinate(lat: number, lng: number, zones: AirspaceZone[]): AirspaceZone | null {
  for (const zone of zones) {
    if (pointInPolygon(lat, lng, zone.boundary)) return zone;
  }
  return null;
}

export function getFIRs(): FIR[] {
  return INDIAN_FIRS;
}

export function getFIRAtPosition(lat: number, lng: number): FIR | undefined {
  return getFIRForPosition(lat, lng);
}

export function checkZoneEligibility(
  droneCategory: 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE',
  zone: AirspaceZone,
): { allowed: boolean; reason?: string } {
  if (zone.type === 'GREEN') {
    return { allowed: true };
  }
  if (zone.type === 'YELLOW') {
    if (droneCategory === 'NANO' || droneCategory === 'MICRO') {
      return { allowed: true };
    }
    return { allowed: false, reason: `${droneCategory} drones require prior permission in YELLOW zone` };
  }
  // RED zone
  return { allowed: false, reason: 'RED zone — no drone operations permitted without DGCA exemption' };
}

// ── Chart data fetch (Jeppesen/AAI AIRAC one-way inflow) ────────────────────

export async function getAerodromes(): Promise<AerodromeMapItem[]> {
  try {
    const { data } = await userApi().get('/lookup/chart/aerodromes');
    return data.aerodromes ?? [];
  } catch {
    return [];
  }
}

export async function getNavaids(): Promise<NavaidMapItem[]> {
  try {
    const { data } = await userApi().get('/lookup/chart/navaids');
    return data.navaids ?? [];
  } catch {
    return [];
  }
}

export async function getAirways(): Promise<Airway[]> {
  try {
    const { data } = await userApi().get('/lookup/chart/airways');
    return data.airways ?? [];
  } catch {
    return [];
  }
}

export async function getFixes(): Promise<FixMapItem[]> {
  try {
    const { data } = await userApi().get('/lookup/chart/fixes');
    return data.fixes ?? [];
  } catch {
    return [];
  }
}

function pointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

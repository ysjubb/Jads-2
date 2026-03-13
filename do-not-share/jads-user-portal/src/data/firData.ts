import type { FIR } from '../types/airspace';

/** Indian Flight Information Regions — approximate boundaries */
export const INDIAN_FIRS: FIR[] = [
  {
    code: 'VIDF',
    name: 'Delhi FIR',
    boundary: [
      { lat: 34.0, lng: 73.0 },
      { lat: 34.0, lng: 84.0 },
      { lat: 26.0, lng: 84.0 },
      { lat: 22.0, lng: 82.0 },
      { lat: 22.0, lng: 73.0 },
      { lat: 26.0, lng: 68.0 },
      { lat: 34.0, lng: 73.0 },
    ],
  },
  {
    code: 'VABF',
    name: 'Mumbai FIR',
    boundary: [
      { lat: 26.0, lng: 68.0 },
      { lat: 22.0, lng: 73.0 },
      { lat: 15.5, lng: 73.0 },
      { lat: 15.5, lng: 68.0 },
      { lat: 20.0, lng: 65.0 },
      { lat: 26.0, lng: 68.0 },
    ],
  },
  {
    code: 'VECF',
    name: 'Kolkata FIR',
    boundary: [
      { lat: 26.0, lng: 84.0 },
      { lat: 26.0, lng: 92.0 },
      { lat: 22.0, lng: 92.0 },
      { lat: 18.0, lng: 88.0 },
      { lat: 18.0, lng: 82.0 },
      { lat: 22.0, lng: 82.0 },
      { lat: 26.0, lng: 84.0 },
    ],
  },
  {
    code: 'VOMF',
    name: 'Chennai FIR',
    boundary: [
      { lat: 18.0, lng: 82.0 },
      { lat: 18.0, lng: 88.0 },
      { lat: 8.0, lng: 82.0 },
      { lat: 8.0, lng: 73.0 },
      { lat: 15.5, lng: 73.0 },
      { lat: 18.0, lng: 82.0 },
    ],
  },
];

export function getFIRByCode(code: string): FIR | undefined {
  return INDIAN_FIRS.find(f => f.code === code.toUpperCase());
}

export function getFIRForPosition(lat: number, lng: number): FIR | undefined {
  // Simple point-in-polygon (ray casting)
  for (const fir of INDIAN_FIRS) {
    if (pointInPolygon(lat, lng, fir.boundary)) return fir;
  }
  return undefined;
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

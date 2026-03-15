export type ZoneColor = 'GREEN' | 'YELLOW' | 'RED';
export type WaypointType = 'VOR' | 'NDB' | 'FIX' | 'AIRPORT';
export type AirwayType = 'UPPER' | 'LOWER';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AirspaceZone {
  id: string;
  name: string;
  type: ZoneColor;
  boundary: LatLng[];
  altitudeFloor: number;
  altitudeCeiling: number;
  restrictions?: string[];
}

export interface FIR {
  code: 'VABF' | 'VIDF' | 'VOMF' | 'VECF';
  name: string;
  boundary: LatLng[];
}

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: WaypointType;
}

export interface AirwaySegment {
  from: Waypoint;
  to: Waypoint;
  minAltitude: number;
  maxAltitude: number;
}

export interface Airway {
  designator: string;
  type: AirwayType;
  segments: AirwaySegment[];
}

// ── Chart data DTOs (populated by Jeppesen/AAI AIRAC import) ────────────────

export type NavaidType = 'VOR' | 'NDB' | 'DME' | 'VORDME' | 'ILS' | 'TACAN';

export interface AerodromeMapItem {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevation: number;
  transitionAltitude?: number;
  transitionLevel?: string;
  firCode?: string;
  city?: string;
}

export interface NavaidMapItem {
  id: string;
  name: string;
  type: NavaidType;
  ident: string;
  frequency: string;
  lat: number;
  lon: number;
  firCode?: string;
  elevation?: number;
}

export interface FixMapItem {
  name: string;
  lat: number;
  lon: number;
  waypointType?: string;
  firCode?: string;
}

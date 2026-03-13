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

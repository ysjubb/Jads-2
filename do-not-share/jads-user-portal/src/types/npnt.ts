export type NPNTEntryType =
  | 'TAKEOFF'
  | 'ARM'
  | 'LAND'
  | 'DISARM'
  | 'GEOFENCE_BREACH'
  | 'TIME_BREACH';

export type FlightLogFormat = 'NPNT_JSON' | 'DJI_CSV' | 'DJI_BINARY';

export interface NPNTLogEntry {
  entryType: NPNTEntryType;
  /** Unix epoch milliseconds */
  timeStamp: number;
  longitude: number;
  latitude: number;
  /** Meters AGL */
  altitude: number;
  /** CRC-32 checksum */
  crc: number;
  /** Base64-encoded SHA256withRSA signature */
  signature: string;
  /** SHA-256 hash of previous log entry */
  previousLogHash: string;
}

export interface PermissionArtefact {
  paId: string;
  droneUIN: string;
  pilotId: string;
  flightArea: { lat: number; lng: number }[];
  maxAltitude: number;
  startTime: string;
  endTime: string;
  dgcaSignature: string;
}

export interface DJILogEntry {
  timestamp: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  battery: number;
  heading: number;
}

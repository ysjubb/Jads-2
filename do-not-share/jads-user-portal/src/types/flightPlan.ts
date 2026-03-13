import type { AirspaceZone } from './airspace';

export type FlightRules = 'I' | 'V' | 'Y' | 'Z';
export type FlightType = 'S' | 'N' | 'G' | 'M' | 'X';
export type FlightPlanStatus = 'DRAFT' | 'FILED' | 'APPROVED' | 'REJECTED';
export type MissionType = 'VLOS' | 'EVLOS' | 'BVLOS';
export type DroneMissionStatus = 'PLANNED' | 'APPROVED' | 'IN_FLIGHT' | 'COMPLETED';

export interface FlightPlan {
  id: string;
  callsign: string;
  aircraftType: string;
  /** ICAO 4-character code */
  departureAerodrome: string;
  /** ICAO 4-character code */
  destinationAerodrome: string;
  alternateAerodrome?: string;
  route: string;
  cruisingLevel: string;
  cruisingSpeed: string;
  /** HHMM format */
  eobt: string;
  /** HHMM format */
  totalEET: string;
  flightRules: FlightRules;
  flightType: FlightType;
  equipment: string;
  surveillance: string;
  field18Remarks: string;
  status: FlightPlanStatus;
}

export interface DroneMission {
  id: string;
  droneUIN: string;
  pilotRPL: string;
  missionType: MissionType;
  operationZone: AirspaceZone;
  /** Meters AGL */
  altitude: number;
  startTime: string;
  endTime: string;
  npntRequired: boolean;
  status: DroneMissionStatus;
}

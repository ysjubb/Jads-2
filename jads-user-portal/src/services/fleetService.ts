import { userApi } from '../api/client';

export interface DroneRecord {
  id: string;
  uin: string;
  model: string;
  weightCategory: 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE';
  npntCompliant: boolean;
  insuranceExpiry: string;
  operatorId: string;
}

export interface AircraftRecord {
  id: string;
  registration: string;
  icaoType: string;
  operator: string;
}

export async function getDrones(): Promise<DroneRecord[]> {
  try {
    const { data } = await userApi().get<DroneRecord[]>('/api/drones');
    return data;
  } catch {
    return [];
  }
}

export async function getAircraft(): Promise<AircraftRecord[]> {
  try {
    const { data } = await userApi().get<AircraftRecord[]>('/api/aircraft');
    return data;
  } catch {
    return [];
  }
}

export async function getDroneByUIN(uin: string): Promise<DroneRecord | null> {
  try {
    const { data } = await userApi().get<DroneRecord>(`/api/drones/${uin}`);
    return data;
  } catch {
    return null;
  }
}

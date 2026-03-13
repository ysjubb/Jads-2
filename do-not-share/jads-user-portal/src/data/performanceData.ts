export type AircraftCategory = 'AIRCRAFT' | 'DRONE';

export interface PerformanceProfile {
  icaoType: string;
  name: string;
  category: AircraftCategory;
  /** Knots TAS */
  cruiseSpeed: number;
  /** Feet */
  maxAltitude: number;
  /** kg/hr for aircraft, Wh for drones */
  fuelBurn: number;
  /** Hours */
  endurance: number;
  /** MTOW in kg */
  mtow: number;
}

export const AIRCRAFT_PERFORMANCE: Record<string, PerformanceProfile> = {
  // Commercial aircraft
  B738: { icaoType: 'B738', name: 'Boeing 737-800', category: 'AIRCRAFT', cruiseSpeed: 453, maxAltitude: 41000, fuelBurn: 2530, endurance: 5.5, mtow: 79010 },
  A320: { icaoType: 'A320', name: 'Airbus A320', category: 'AIRCRAFT', cruiseSpeed: 447, maxAltitude: 39800, fuelBurn: 2500, endurance: 5.0, mtow: 78000 },
  A20N: { icaoType: 'A20N', name: 'Airbus A320neo', category: 'AIRCRAFT', cruiseSpeed: 450, maxAltitude: 39800, fuelBurn: 2200, endurance: 5.8, mtow: 79000 },
  B77W: { icaoType: 'B77W', name: 'Boeing 777-300ER', category: 'AIRCRAFT', cruiseSpeed: 490, maxAltitude: 43100, fuelBurn: 6800, endurance: 14.5, mtow: 351500 },
  AT76: { icaoType: 'AT76', name: 'ATR 72-600', category: 'AIRCRAFT', cruiseSpeed: 275, maxAltitude: 25000, fuelBurn: 650, endurance: 5.2, mtow: 23000 },
  DH8D: { icaoType: 'DH8D', name: 'Dash 8 Q400', category: 'AIRCRAFT', cruiseSpeed: 310, maxAltitude: 27000, fuelBurn: 850, endurance: 4.5, mtow: 30481 },

  // General aviation
  C172: { icaoType: 'C172', name: 'Cessna 172 Skyhawk', category: 'AIRCRAFT', cruiseSpeed: 122, maxAltitude: 14000, fuelBurn: 34, endurance: 5.0, mtow: 1111 },
  C208: { icaoType: 'C208', name: 'Cessna 208 Caravan', category: 'AIRCRAFT', cruiseSpeed: 186, maxAltitude: 25000, fuelBurn: 200, endurance: 4.5, mtow: 3969 },
  BE20: { icaoType: 'BE20', name: 'Beechcraft King Air 200', category: 'AIRCRAFT', cruiseSpeed: 270, maxAltitude: 35000, fuelBurn: 340, endurance: 5.2, mtow: 5670 },

  // Drones (fuel burn = Watt-hours, endurance in hours)
  MAVIC3: { icaoType: 'MAVIC3', name: 'DJI Mavic 3', category: 'DRONE', cruiseSpeed: 25, maxAltitude: 400, fuelBurn: 77, endurance: 0.76, mtow: 0.895 },
  MATRICE300: { icaoType: 'M300', name: 'DJI Matrice 300 RTK', category: 'DRONE', cruiseSpeed: 30, maxAltitude: 400, fuelBurn: 238, endurance: 0.92, mtow: 9.0 },
  PHANTOM4: { icaoType: 'P4RTK', name: 'DJI Phantom 4 RTK', category: 'DRONE', cruiseSpeed: 22, maxAltitude: 400, fuelBurn: 89, endurance: 0.50, mtow: 1.391 },
  AGRAS: { icaoType: 'T30', name: 'DJI Agras T30', category: 'DRONE', cruiseSpeed: 18, maxAltitude: 400, fuelBurn: 560, endurance: 0.17, mtow: 41.2 },
};

export function getPerformance(icaoType: string): PerformanceProfile | undefined {
  return AIRCRAFT_PERFORMANCE[icaoType.toUpperCase()];
}

export function getDroneProfiles(): PerformanceProfile[] {
  return Object.values(AIRCRAFT_PERFORMANCE).filter(p => p.category === 'DRONE');
}

export function getAircraftProfiles(): PerformanceProfile[] {
  return Object.values(AIRCRAFT_PERFORMANCE).filter(p => p.category === 'AIRCRAFT');
}

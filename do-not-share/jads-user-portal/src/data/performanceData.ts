// Aircraft performance data for weight & balance and fuel planning

export interface AircraftPerformance {
  icaoType: string
  name: string
  maxTakeoffWeight: number   // kg
  maxLandingWeight: number   // kg
  maxZeroFuelWeight: number  // kg
  operatingEmptyWeight: number // kg
  maxFuelCapacity: number    // kg
  fuelBurnRate: number       // kg/hr at cruise
  cruiseSpeedKts: number
  maxRange: number           // nm
  cg: { fwdLimit: number; aftLimit: number; unit: '%MAC' | 'in' }
  envelopePoints: Array<{ weight: number; cg: number }> // CG envelope polygon
}

export interface FuelPolicy {
  name: string
  description: string
  taxiFuel: number       // minutes
  contingency: number    // % of trip fuel
  alternate: number      // minutes
  finalReserve: number   // minutes (DGCA CAR min 30 for turbine, 45 for piston)
  extraFuel: number      // minutes
}

export const FUEL_POLICIES: Record<string, FuelPolicy> = {
  DGCA_TURBINE: {
    name: 'DGCA CAR — Turbine',
    description: 'Indian DGCA standard fuel policy for turbine-engine aircraft',
    taxiFuel: 10,
    contingency: 5,
    alternate: 30,
    finalReserve: 30,
    extraFuel: 0,
  },
  DGCA_PISTON: {
    name: 'DGCA CAR — Piston',
    description: 'Indian DGCA standard fuel policy for piston-engine aircraft',
    taxiFuel: 10,
    contingency: 10,
    alternate: 45,
    finalReserve: 45,
    extraFuel: 0,
  },
  ICAO_STANDARD: {
    name: 'ICAO Standard',
    description: 'ICAO Annex 6 standard fuel requirements',
    taxiFuel: 10,
    contingency: 5,
    alternate: 30,
    finalReserve: 30,
    extraFuel: 0,
  },
  EXTENDED_OPS: {
    name: 'Extended Operations',
    description: 'EDTO/ETOPS fuel policy with additional reserves',
    taxiFuel: 15,
    contingency: 5,
    alternate: 45,
    finalReserve: 30,
    extraFuel: 15,
  },
}

export const AIRCRAFT_PERFORMANCE: AircraftPerformance[] = [
  {
    icaoType: 'A320',
    name: 'Airbus A320-200',
    maxTakeoffWeight: 77000,
    maxLandingWeight: 66000,
    maxZeroFuelWeight: 62500,
    operatingEmptyWeight: 42600,
    maxFuelCapacity: 24210,
    fuelBurnRate: 2700,
    cruiseSpeedKts: 447,
    maxRange: 3300,
    cg: { fwdLimit: 17, aftLimit: 40, unit: '%MAC' },
    envelopePoints: [
      { weight: 42600, cg: 17 }, { weight: 42600, cg: 40 },
      { weight: 77000, cg: 33 }, { weight: 77000, cg: 22 },
    ],
  },
  {
    icaoType: 'B738',
    name: 'Boeing 737-800',
    maxTakeoffWeight: 79016,
    maxLandingWeight: 66361,
    maxZeroFuelWeight: 62732,
    operatingEmptyWeight: 41413,
    maxFuelCapacity: 21000,
    fuelBurnRate: 2600,
    cruiseSpeedKts: 453,
    maxRange: 2935,
    cg: { fwdLimit: 10, aftLimit: 35, unit: '%MAC' },
    envelopePoints: [
      { weight: 41413, cg: 10 }, { weight: 41413, cg: 35 },
      { weight: 79016, cg: 30 }, { weight: 79016, cg: 15 },
    ],
  },
  {
    icaoType: 'B77W',
    name: 'Boeing 777-300ER',
    maxTakeoffWeight: 351534,
    maxLandingWeight: 251290,
    maxZeroFuelWeight: 237680,
    operatingEmptyWeight: 167829,
    maxFuelCapacity: 181280,
    fuelBurnRate: 7500,
    cruiseSpeedKts: 490,
    maxRange: 7370,
    cg: { fwdLimit: 14, aftLimit: 35, unit: '%MAC' },
    envelopePoints: [
      { weight: 167829, cg: 14 }, { weight: 167829, cg: 35 },
      { weight: 351534, cg: 30 }, { weight: 351534, cg: 18 },
    ],
  },
  {
    icaoType: 'AT76',
    name: 'ATR 72-600',
    maxTakeoffWeight: 23000,
    maxLandingWeight: 22350,
    maxZeroFuelWeight: 21000,
    operatingEmptyWeight: 13500,
    maxFuelCapacity: 5000,
    fuelBurnRate: 650,
    cruiseSpeedKts: 275,
    maxRange: 825,
    cg: { fwdLimit: 15, aftLimit: 38, unit: '%MAC' },
    envelopePoints: [
      { weight: 13500, cg: 15 }, { weight: 13500, cg: 38 },
      { weight: 23000, cg: 33 }, { weight: 23000, cg: 18 },
    ],
  },
  {
    icaoType: 'A21N',
    name: 'Airbus A321neo',
    maxTakeoffWeight: 97000,
    maxLandingWeight: 79200,
    maxZeroFuelWeight: 73500,
    operatingEmptyWeight: 50100,
    maxFuelCapacity: 26730,
    fuelBurnRate: 2900,
    cruiseSpeedKts: 450,
    maxRange: 4000,
    cg: { fwdLimit: 17, aftLimit: 40, unit: '%MAC' },
    envelopePoints: [
      { weight: 50100, cg: 17 }, { weight: 50100, cg: 40 },
      { weight: 97000, cg: 33 }, { weight: 97000, cg: 22 },
    ],
  },
]

export function getPerformance(icaoType: string): AircraftPerformance | undefined {
  return AIRCRAFT_PERFORMANCE.find(a => a.icaoType === icaoType)
}

export function calculateFuelRequired(
  tripDistanceNm: number,
  performance: AircraftPerformance,
  policy: FuelPolicy,
  alternateDistanceNm: number = 150,
): {
  taxiFuel: number
  tripFuel: number
  contingencyFuel: number
  alternateFuel: number
  finalReserve: number
  extraFuel: number
  totalFuel: number
  withinCapacity: boolean
} {
  const tripTimeHrs = tripDistanceNm / performance.cruiseSpeedKts
  const tripFuel = Math.ceil(tripTimeHrs * performance.fuelBurnRate)
  const taxiFuel = Math.ceil((policy.taxiFuel / 60) * performance.fuelBurnRate * 0.4)
  const contingencyFuel = Math.ceil(tripFuel * (policy.contingency / 100))
  const altTimeHrs = alternateDistanceNm / performance.cruiseSpeedKts
  const alternateFuel = Math.ceil(altTimeHrs * performance.fuelBurnRate)
  const finalReserve = Math.ceil((policy.finalReserve / 60) * performance.fuelBurnRate)
  const extraFuel = Math.ceil((policy.extraFuel / 60) * performance.fuelBurnRate)

  const totalFuel = taxiFuel + tripFuel + contingencyFuel + alternateFuel + finalReserve + extraFuel

  return {
    taxiFuel,
    tripFuel,
    contingencyFuel,
    alternateFuel,
    finalReserve,
    extraFuel,
    totalFuel,
    withinCapacity: totalFuel <= performance.maxFuelCapacity,
  }
}

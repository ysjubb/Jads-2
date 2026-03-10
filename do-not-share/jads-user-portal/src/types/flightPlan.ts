export type FlightRules = 'I' | 'V' | 'Y' | 'Z'
export type FlightType = 'S' | 'N' | 'G' | 'M' | 'X'
export type WakeTurbulence = 'J' | 'H' | 'M' | 'L'

export type EquipmentCode = 'S' | 'G' | 'R' | 'D' | 'O' | 'Z' | 'W'
export type SSRCode = 'N' | 'A' | 'C' | 'S'
export type ADSBCode = 'B1' | 'B2' | 'U1' | 'U2' | 'V1' | 'V2'

export type Field18Key = 'PBN' | 'STS' | 'REG' | 'EET' | 'RMK' | 'OPR' | 'PER' | 'CODE' | 'SEL' | 'DOF' | 'DEP' | 'DEST' | 'ALTN'

export interface ICAOFlightPlan {
  // Field 7
  aircraftId: string
  callsignType: 'FORMAT_A' | 'FORMAT_C' | 'NUMERIC' | 'ZZZZ'
  resolvedTelephony?: string
  // Field 8
  flightRules: FlightRules
  flightType: FlightType
  // Field 9
  aircraftType: string
  wakeTurbulence: WakeTurbulence
  // Field 10
  equipment: EquipmentCode[]
  ssr: SSRCode
  adsb: ADSBCode[]
  // Field 13
  departureAerodrome: string
  eobt: string // HHMM
  // Field 15
  route: string
  cruisingSpeed: string
  cruisingLevel: string
  // Field 16
  destinationAerodrome: string
  eet: string // HHMM
  alternate1: string
  alternate2: string
  // Field 18
  field18: Record<Field18Key, string>
  // Field 19
  endurance: string // HHMM
  personsOnBoard: number
  eltType: string
  pilotName: string
  pilotContact: string
  organization: string
}

export interface CallsignResolution {
  type: 'FORMAT_A' | 'FORMAT_C' | 'NUMERIC' | 'ZZZZ'
  transmitted: string
  telephony?: string
  airline?: string
  isDefunct?: boolean
  defunctNote?: string
  warning?: string
  field18Remark?: string
}

export interface AerodromeInfo {
  icao: string
  name: string
  city: string
  lat: number
  lon: number
  elevation: number
  fir: string
}

export interface AircraftTypeInfo {
  icao: string
  name: string
  wake: WakeTurbulence
}

export interface AirlineInfo {
  icao3ld: string
  name: string
  telephony: string
  country: string
  defunct?: boolean
  defunctNote?: string
}

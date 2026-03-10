// UP19: Fleet management service

export interface FleetDrone {
  id: string
  serialNumber: string
  manufacturer: string
  model: string
  category: 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  maxTakeoffWeight: number // grams
  uinNumber: string       // Unique Identification Number (DGCA)
  npntCompliant: boolean
  registrationDate: string
  insuranceExpiry: string
  lastMaintenanceDate: string
  flightHours: number
  status: 'ACTIVE' | 'GROUNDED' | 'MAINTENANCE' | 'DEREGISTERED'
}

export interface FleetAircraft {
  id: string
  registration: string   // VT-XXX
  icaoType: string
  operator: string
  airlineName: string
  certOfAirworthiness: string
  certExpiry: string
  status: 'ACTIVE' | 'GROUNDED' | 'MAINTENANCE'
}

const MOCK_DRONES: FleetDrone[] = [
  {
    id: 'd1', serialNumber: 'DJI-M300-001', manufacturer: 'DJI', model: 'Matrice 300 RTK',
    category: 'SMALL', maxTakeoffWeight: 9000, uinNumber: 'UIN-DJI-SM-001',
    npntCompliant: true, registrationDate: '2024-06-15', insuranceExpiry: '2026-06-15',
    lastMaintenanceDate: '2026-02-01', flightHours: 245, status: 'ACTIVE',
  },
  {
    id: 'd2', serialNumber: 'IDS-HEX-002', manufacturer: 'ideaForge', model: 'Switch 1.0',
    category: 'MEDIUM', maxTakeoffWeight: 15000, uinNumber: 'UIN-IDF-MD-002',
    npntCompliant: true, registrationDate: '2024-03-10', insuranceExpiry: '2026-03-10',
    lastMaintenanceDate: '2026-01-15', flightHours: 180, status: 'ACTIVE',
  },
  {
    id: 'd3', serialNumber: 'DJI-MINI3-003', manufacturer: 'DJI', model: 'Mini 3 Pro',
    category: 'NANO', maxTakeoffWeight: 249, uinNumber: 'UIN-DJI-NA-003',
    npntCompliant: false, registrationDate: '2025-01-20', insuranceExpiry: '2027-01-20',
    lastMaintenanceDate: '2026-01-05', flightHours: 52, status: 'ACTIVE',
  },
]

const MOCK_AIRCRAFT: FleetAircraft[] = [
  {
    id: 'a1', registration: 'VT-AKJ', icaoType: 'B738', operator: 'AKJ',
    airlineName: 'Akasa Air', certOfAirworthiness: 'COA-2024-0891',
    certExpiry: '2026-12-31', status: 'ACTIVE',
  },
  {
    id: 'a2', registration: 'VT-IFC', icaoType: 'C130', operator: 'IFC',
    airlineName: 'Indian Air Force', certOfAirworthiness: 'MIL-COA-4521',
    certExpiry: '2027-06-30', status: 'ACTIVE',
  },
]

export async function fetchFleetDrones(): Promise<FleetDrone[]> {
  await new Promise(r => setTimeout(r, 300))
  return MOCK_DRONES
}

export async function fetchFleetAircraft(): Promise<FleetAircraft[]> {
  await new Promise(r => setTimeout(r, 300))
  return MOCK_AIRCRAFT
}

export function getDroneHealthStatus(drone: FleetDrone): { label: string; color: string } {
  const now = new Date()
  const insuranceExpiry = new Date(drone.insuranceExpiry)
  const daysTillInsExpiry = Math.ceil((insuranceExpiry.getTime() - now.getTime()) / 86400000)

  if (drone.status === 'GROUNDED') return { label: 'GROUNDED', color: '#FF3B3B' }
  if (drone.status === 'MAINTENANCE') return { label: 'IN MAINTENANCE', color: '#FFB800' }
  if (daysTillInsExpiry < 0) return { label: 'INSURANCE EXPIRED', color: '#FF3B3B' }
  if (daysTillInsExpiry < 30) return { label: 'INSURANCE EXPIRING', color: '#FFB800' }
  if (!drone.npntCompliant) return { label: 'NON-NPNT', color: '#FFB800' }
  return { label: 'AIRWORTHY', color: '#00C864' }
}

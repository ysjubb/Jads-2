// Stub implementation of IAAIDataAdapter.
// Returns deterministic aerodrome and airspace data for 12 major Indian aerodromes.
// Government replaces this with their AAI data exchange integration.
// This stub must never make network calls.

import type {
  IAAIDataAdapter, AerodromeInfo, AirspaceUpdate,
  FlightStatusReport, ComplianceReport,
} from '../interfaces/IAAIDataAdapter'

// ── Stub aerodrome data ─────────────────────────────────────

const STUB_AERODROMES: AerodromeInfo[] = [
  {
    icaoCode: 'VIDP', iataCode: 'DEL', name: 'Indira Gandhi International Airport',
    city: 'New Delhi',
    runways: [
      { designator: '28R/10L', lengthM: 4430, widthM: 60, surfaceType: 'ASPHALT', ilsAvailable: true,  status: 'OPEN' },
      { designator: '28L/10R', lengthM: 3810, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true,  status: 'OPEN' },
      { designator: '29/11',   lengthM: 4430, widthM: 75, surfaceType: 'ASPHALT', ilsAvailable: true,  status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 777,
    referencePoint: { lat: 28.5665, lon: 77.1031 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VABB', iataCode: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport',
    city: 'Mumbai',
    runways: [
      { designator: '27/09', lengthM: 3660, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
      { designator: '32/14', lengthM: 2925, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 37,
    referencePoint: { lat: 19.0896, lon: 72.8656 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VOMM', iataCode: 'MAA', name: 'Chennai International Airport',
    city: 'Chennai',
    runways: [
      { designator: '07/25', lengthM: 3658, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
      { designator: '12/30', lengthM: 2895, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 52,
    referencePoint: { lat: 12.9941, lon: 80.1709 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VECC', iataCode: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport',
    city: 'Kolkata',
    runways: [
      { designator: '19R/01L', lengthM: 3627, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
      { designator: '19L/01R', lengthM: 3040, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 16,
    referencePoint: { lat: 22.6547, lon: 88.4467 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VOBL', iataCode: 'BLR', name: 'Kempegowda International Airport',
    city: 'Bengaluru',
    runways: [
      { designator: '09L/27R', lengthM: 4000, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
      { designator: '09R/27L', lengthM: 4000, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 3000,
    referencePoint: { lat: 13.1986, lon: 77.7066 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VOHB', iataCode: 'HYD', name: 'Rajiv Gandhi International Airport',
    city: 'Hyderabad',
    runways: [
      { designator: '09L/27R', lengthM: 4260, widthM: 60, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
      { designator: '09R/27L', lengthM: 3505, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 2024,
    referencePoint: { lat: 17.2403, lon: 78.4294 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VAAH', iataCode: 'AMD', name: 'Sardar Vallabhbhai Patel International Airport',
    city: 'Ahmedabad',
    runways: [
      { designator: '23/05', lengthM: 3505, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 189,
    referencePoint: { lat: 23.0722, lon: 72.6347 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VOGO', iataCode: 'GOI', name: 'Manohar International Airport',
    city: 'Goa',
    runways: [
      { designator: '08/26', lengthM: 3500, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
    ],
    operatingHours: '0030-1830 UTC', elevationFt: 174,
    referencePoint: { lat: 15.3808, lon: 73.8314 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VOCL', iataCode: 'COK', name: 'Cochin International Airport',
    city: 'Kochi',
    runways: [
      { designator: '09/27', lengthM: 3400, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 30,
    referencePoint: { lat: 10.1520, lon: 76.4019 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VIBN', iataCode: 'VNS', name: 'Lal Bahadur Shastri International Airport',
    city: 'Varanasi',
    runways: [
      { designator: '01/19', lengthM: 2745, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: '0130-1530 UTC', elevationFt: 266,
    referencePoint: { lat: 25.4524, lon: 82.8593 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VORY', iataCode: 'BBI', name: 'Biju Patnaik International Airport',
    city: 'Bhubaneswar',
    runways: [
      { designator: '14/32', lengthM: 2745, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' },
    ],
    operatingHours: 'H24', elevationFt: 138,
    referencePoint: { lat: 20.2444, lon: 85.8178 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
  {
    icaoCode: 'VIPT', iataCode: 'PAT', name: 'Jay Prakash Narayan International Airport',
    city: 'Patna',
    runways: [
      { designator: '07/25', lengthM: 2300, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: false, status: 'OPEN' },
    ],
    operatingHours: '0130-1530 UTC', elevationFt: 170,
    referencePoint: { lat: 25.5913, lon: 85.0880 },
    lastUpdated: '2024-01-15T00:00:00Z',
  },
]

// ── Stub airspace updates ───────────────────────────────────

const STUB_AIRSPACE_UPDATES: AirspaceUpdate[] = [
  {
    updateId:      'ASU-2024-001',
    type:          'TRA',
    description:   'Temporary Restricted Area over Rajpath corridor for Republic Day preparations',
    areaGeoJson:   JSON.stringify({
      type: 'Polygon',
      coordinates: [[[77.19, 28.60], [77.24, 28.60], [77.24, 28.63], [77.19, 28.63], [77.19, 28.60]]],
    }),
    effectiveFrom: '2024-01-20T00:00:00Z',
    effectiveTo:   '2024-01-27T23:59:59Z',
  },
  {
    updateId:      'ASU-2024-002',
    type:          'CLASSIFICATION_CHANGE',
    description:   'Airspace classification change — sector 4 of VIDF FIR reclassified from C to D below FL150',
    areaGeoJson:   null,
    effectiveFrom: '2024-02-01T00:00:00Z',
    effectiveTo:   null,
  },
]

// ── Stub class ──────────────────────────────────────────────

export class AAIDataAdapterStub implements IAAIDataAdapter {

  // ── INBOUND ─────────────────────────────────────────────

  async getAerodromeInfo(icaoCode: string): Promise<AerodromeInfo | null> {
    return STUB_AERODROMES.find(a => a.icaoCode === icaoCode) ?? null
  }

  async getAllAerodromes(): Promise<AerodromeInfo[]> {
    return STUB_AERODROMES
  }

  async getAirspaceUpdates(_since: string): Promise<AirspaceUpdate[]> {
    return STUB_AIRSPACE_UPDATES
  }

  // ── OUTBOUND ────────────────────────────────────────────

  async pushFlightStatus(_report: FlightStatusReport): Promise<{ accepted: boolean }> {
    // Stub: always accept — live implementation pushes to AAI's API
    return { accepted: true }
  }

  async pushComplianceReport(_report: ComplianceReport): Promise<{ accepted: boolean; receiptId: string | null }> {
    // Stub: always accept with a stub receipt ID
    return { accepted: true, receiptId: `AAI-RCPT-STUB-${Date.now()}` }
  }

  // ── HEALTH ──────────────────────────────────────────────

  async ping(): Promise<{ connected: boolean; latencyMs: number }> {
    return { connected: true, latencyMs: 8 }
  }
}

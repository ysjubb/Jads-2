export interface FIRInfo {
  icao: string
  name: string
  coverage: string
  oceanic: boolean
  color: string
  majorAirports: string[]
  boundaryGeoJSON: GeoJSON.Polygon
}

export const INDIAN_FIRS: FIRInfo[] = [
  {
    icao: 'VABF',
    name: 'Mumbai FIR',
    coverage: 'Maharashtra, Gujarat, Goa, central MP, southern Rajasthan + Arabian Sea + western Indian Ocean',
    oceanic: true,
    color: '#3366CC',
    majorAirports: ['VABB', 'VAAH', 'VANP', 'VABP'],
    boundaryGeoJSON: {
      type: 'Polygon',
      coordinates: [[
        [68.0, 24.5], [73.0, 26.0], [76.0, 25.5], [79.0, 24.0],
        [80.0, 21.0], [79.5, 18.0], [77.5, 15.5], [73.0, 15.0],
        [65.0, 15.0], [60.0, 18.0], [60.0, 22.0], [68.0, 24.5],
      ]],
    },
  },
  {
    icao: 'VIDF',
    name: 'Delhi FIR',
    coverage: 'NCR, UP, Haryana, Punjab, J&K, Ladakh, HP, Uttarakhand, northern Rajasthan (land only)',
    oceanic: false,
    color: '#33AA55',
    majorAirports: ['VIDP', 'VILK', 'VIAR', 'VIJP', 'VIBN'],
    boundaryGeoJSON: {
      type: 'Polygon',
      coordinates: [[
        [68.0, 24.5], [73.0, 26.0], [76.0, 25.5], [79.0, 24.0],
        [80.0, 26.0], [82.0, 28.0], [80.5, 30.0], [77.0, 33.0],
        [74.0, 35.0], [73.0, 34.0], [70.0, 30.0], [68.0, 24.5],
      ]],
    },
  },
  {
    icao: 'VOMF',
    name: 'Chennai FIR',
    coverage: 'Tamil Nadu, Karnataka, Kerala, AP, Telangana + Bay of Bengal + Andaman & Nicobar',
    oceanic: true,
    color: '#FF8833',
    majorAirports: ['VOMM', 'VOBL', 'VOHY', 'VOCL', 'VOPB'],
    boundaryGeoJSON: {
      type: 'Polygon',
      coordinates: [[
        [77.5, 15.5], [79.5, 18.0], [80.0, 21.0], [83.0, 21.0],
        [86.0, 21.0], [95.0, 14.0], [95.0, 6.0], [85.0, 5.0],
        [80.0, 6.0], [76.0, 8.0], [73.0, 10.0], [73.0, 15.0],
        [77.5, 15.5],
      ]],
    },
  },
  {
    icao: 'VECF',
    name: 'Kolkata FIR',
    coverage: 'West Bengal, Odisha, Bihar, Jharkhand, Chhattisgarh, all northeast states',
    oceanic: false,
    color: '#9933CC',
    majorAirports: ['VECC', 'VEBS', 'VEGT', 'VEPT'],
    boundaryGeoJSON: {
      type: 'Polygon',
      coordinates: [[
        [80.0, 21.0], [79.0, 24.0], [80.0, 26.0], [82.0, 28.0],
        [85.0, 28.5], [88.0, 28.0], [92.0, 28.0], [97.0, 28.0],
        [97.0, 22.0], [92.0, 20.0], [86.0, 21.0], [83.0, 21.0],
        [80.0, 21.0],
      ]],
    },
  },
]

export function findFIR(icao: string): FIRInfo | undefined {
  return INDIAN_FIRS.find(f => f.icao === icao.toUpperCase())
}

export function getFIRForAerodrome(aerodromeIcao: string): FIRInfo | undefined {
  return INDIAN_FIRS.find(f => f.majorAirports.includes(aerodromeIcao))
}

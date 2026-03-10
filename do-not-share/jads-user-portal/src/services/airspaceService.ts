import type { AirspaceZone, BoundingBox } from '../types/airspace'

// Mock zones — representative Indian airspace zones
// TODO: Replace with Digital Sky API GET /api/airspace/zones?bbox=
const MOCK_ZONES: AirspaceZone[] = [
  {
    id: 'VIDP-CTR',
    type: 'YELLOW',
    name: 'Delhi CTR (VIDP)',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [76.95, 28.80], [77.20, 28.80], [77.35, 28.60],
        [77.30, 28.40], [77.00, 28.40], [76.85, 28.55], [76.95, 28.80],
      ]],
    },
    minAlt: 0,
    maxAlt: 200,
    authority: 'AAI Delhi ATC',
  },
  {
    id: 'VABB-TMA',
    type: 'YELLOW',
    name: 'Mumbai TMA (VABB)',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [72.70, 19.20], [73.05, 19.25], [73.10, 19.00],
        [72.95, 18.85], [72.65, 18.90], [72.60, 19.05], [72.70, 19.20],
      ]],
    },
    minAlt: 0,
    maxAlt: 200,
    authority: 'AAI Mumbai ATC',
  },
  {
    id: 'VOBL-CTR',
    type: 'YELLOW',
    name: 'Bengaluru CTR (VOBL)',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [77.55, 13.10], [77.80, 13.10], [77.85, 12.90],
        [77.70, 12.80], [77.50, 12.85], [77.45, 12.95], [77.55, 13.10],
      ]],
    },
    minAlt: 0,
    maxAlt: 200,
    authority: 'AAI Bengaluru ATC',
  },
  {
    id: 'VIDP-NFZ-1',
    type: 'RED',
    name: 'Delhi Cantonment No-Fly Zone',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [77.15, 28.62], [77.22, 28.62], [77.22, 28.58],
        [77.15, 28.58], [77.15, 28.62],
      ]],
    },
    minAlt: 0,
    maxAlt: 400,
    authority: 'Ministry of Defence',
  },
  {
    id: 'RAJASTHAN-GREEN-1',
    type: 'GREEN',
    name: 'Rajasthan Open Zone (Pre-authorized)',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [73.50, 26.00], [74.50, 26.00], [74.50, 25.00],
        [73.50, 25.00], [73.50, 26.00],
      ]],
    },
    minAlt: 0,
    maxAlt: 400,
    authority: 'DGCA Digital Sky',
  },
  {
    id: 'INS-KALINGA-MIL',
    type: 'PURPLE',
    name: 'INS Kalinga Military Zone',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [83.20, 17.80], [83.40, 17.80], [83.40, 17.65],
        [83.20, 17.65], [83.20, 17.80],
      ]],
    },
    minAlt: 0,
    maxAlt: 400,
    authority: 'Indian Navy / MoD',
  },
]

export async function fetchAirspaceZones(_bbox?: BoundingBox): Promise<AirspaceZone[]> {
  // Simulate network latency
  await new Promise(r => setTimeout(r, 300))
  return MOCK_ZONES
}

export async function checkAirspaceForArea(geojson: GeoJSON.Polygon): Promise<{
  zones: AirspaceZone[]
  breakdown: { green: number; yellow: number; red: number; purple: number }
  hasBlocker: boolean
}> {
  const zones = await fetchAirspaceZones()
  // Simple overlap check — in production this would do proper GeoJSON intersection
  const breakdown = { green: 0, yellow: 0, red: 0, purple: 0 }
  const overlapping: AirspaceZone[] = []

  for (const zone of zones) {
    // Simplified: check if any point of the drawn area falls within zone bbox
    const coords = zone.geometry.coordinates[0]
    const zBbox = {
      minLon: Math.min(...coords.map(c => c[0])),
      maxLon: Math.max(...coords.map(c => c[0])),
      minLat: Math.min(...coords.map(c => c[1])),
      maxLat: Math.max(...coords.map(c => c[1])),
    }
    const areaCoords = geojson.coordinates[0]
    const areaInZone = areaCoords.some(
      c => c[0] >= zBbox.minLon && c[0] <= zBbox.maxLon && c[1] >= zBbox.minLat && c[1] <= zBbox.maxLat
    )
    if (areaInZone) {
      overlapping.push(zone)
      breakdown[zone.type.toLowerCase() as keyof typeof breakdown]++
    }
  }

  return {
    zones: overlapping,
    breakdown,
    hasBlocker: overlapping.some(z => z.type === 'RED'),
  }
}

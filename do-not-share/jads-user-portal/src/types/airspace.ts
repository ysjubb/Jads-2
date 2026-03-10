export type ZoneType = 'GREEN' | 'YELLOW' | 'RED' | 'PURPLE'

export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

export interface AirspaceZone {
  id: string
  type: ZoneType
  geometry: GeoJSON.Polygon
  name: string
  minAlt: number
  maxAlt: number
  authority: string
  validFrom?: string
  validTo?: string
}

export interface DroneOperationArea {
  id: string
  polygon: GeoJSON.Polygon
  missionId?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
}

export const ZONE_COLORS: Record<ZoneType, string> = {
  GREEN:  'rgba(0, 200, 100, 0.25)',
  YELLOW: 'rgba(255, 200, 0, 0.35)',
  RED:    'rgba(220, 50, 50, 0.45)',
  PURPLE: 'rgba(140, 50, 200, 0.35)',
}

export const ZONE_STROKE: Record<ZoneType, string> = {
  GREEN:  '#00C864',
  YELLOW: '#FFC800',
  RED:    '#DC3232',
  PURPLE: '#8C32C8',
}

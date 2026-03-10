import type { FIRInfo } from '../data/firData'
import { INDIAN_FIRS } from '../data/firData'
import L from 'leaflet'

export function addFIRBoundaries(map: L.Map): L.LayerGroup {
  const group = L.layerGroup()

  INDIAN_FIRS.forEach((fir: FIRInfo) => {
    const coords = fir.boundaryGeoJSON.coordinates[0].map(
      (c: number[]) => [c[1], c[0]] as L.LatLngTuple
    )
    const color = fir.color

    const polygon = L.polygon(coords, {
      color,
      weight: 2,
      dashArray: '8 4',
      fillColor: color,
      fillOpacity: 0.06,
    })

    polygon.bindPopup(`
      <div style="font-family:monospace;font-size:12px">
        <strong>${fir.name}</strong><br/>
        ICAO: ${fir.icao}<br/>
        Coverage: ${fir.coverage}<br/>
        Major Airports: ${fir.majorAirports.join(', ')}
      </div>
    `)

    // Add FIR label
    const center = polygon.getBounds().getCenter()
    const label = L.marker(center, {
      icon: L.divIcon({
        className: 'fir-label',
        html: `<div style="
          font-family:monospace;font-size:11px;font-weight:700;
          color:${color};text-shadow:0 0 3px rgba(0,0,0,0.8);
          white-space:nowrap;pointer-events:none;
        ">${fir.icao} FIR</div>`,
        iconSize: [80, 20],
        iconAnchor: [40, 10],
      }),
    })

    group.addLayer(polygon)
    group.addLayer(label)
  })

  return group
}

export function getFIRForCoordinate(lat: number, lng: number): FIRInfo | null {
  for (const fir of INDIAN_FIRS) {
    const coords = fir.boundaryGeoJSON.coordinates[0]
    if (isPointInPolygon([lng, lat], coords)) return fir
  }
  return null
}

function isPointInPolygon(point: number[], polygon: number[][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

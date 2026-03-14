import type { FIR } from '../types/airspace'
import { INDIAN_FIRS, getFIRForPosition } from '../data/firData'
import L from 'leaflet'

const FIR_COLORS: Record<string, string> = {
  VIDF: '#00AAFF',
  VABF: '#FFB800',
  VECF: '#4CAF50',
  VOMF: '#FF6B35',
}

export function addFIRBoundaries(map: L.Map): L.LayerGroup {
  const group = L.layerGroup()

  INDIAN_FIRS.forEach((fir: FIR) => {
    const coords = fir.boundary.map(
      (pt) => [pt.lat, pt.lng] as L.LatLngTuple
    )
    const color = FIR_COLORS[fir.code] ?? '#00AAFF'

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
        ICAO: ${fir.code}<br/>
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
        ">${fir.code} FIR</div>`,
        iconSize: [80, 20],
        iconAnchor: [40, 10],
      }),
    })

    group.addLayer(polygon)
    group.addLayer(label)
  })

  return group
}

export function getFIRForCoordinate(lat: number, lng: number): FIR | undefined {
  return getFIRForPosition(lat, lng)
}

import L from 'leaflet'

export type ICAOAirspaceClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'G'

export interface AirspaceClassZone {
  id: string
  name: string
  icaoClass: ICAOAirspaceClass
  geometry: GeoJSON.Polygon
  floorFt: number
  ceilingFt: number
  remarks?: string
}

const CLASS_COLORS: Record<ICAOAirspaceClass, string> = {
  A: '#DC3232',
  B: '#FF6B35',
  C: '#C850C0',
  D: '#00AAFF',
  E: '#00C864',
  G: '#888888',
}

const CLASS_DESCRIPTIONS: Record<ICAOAirspaceClass, string> = {
  A: 'IFR only, ATC clearance required, all aircraft separated',
  B: 'IFR & VFR, ATC clearance required, all aircraft separated',
  C: 'IFR & VFR, ATC clearance required, IFR-IFR and IFR-VFR separated',
  D: 'IFR & VFR, ATC clearance required, IFR-IFR separated, traffic info to VFR',
  E: 'IFR & VFR, ATC clearance for IFR only, traffic info where possible',
  G: 'Uncontrolled, no ATC clearance required, FIS available',
}

// Representative Indian airspace class zones
const MOCK_CLASS_ZONES: AirspaceClassZone[] = [
  {
    id: 'VIDP-CTA',
    name: 'Delhi CTA',
    icaoClass: 'A',
    geometry: { type: 'Polygon', coordinates: [[[76.80,29.00],[77.50,29.00],[77.50,28.30],[76.80,28.30],[76.80,29.00]]] },
    floorFt: 2500,
    ceilingFt: 46000,
    remarks: 'Delhi Terminal Control Area — Class A above FL245',
  },
  {
    id: 'VABB-CTR-D',
    name: 'Mumbai CTR',
    icaoClass: 'D',
    geometry: { type: 'Polygon', coordinates: [[[72.55,19.30],[73.15,19.30],[73.15,18.80],[72.55,18.80],[72.55,19.30]]] },
    floorFt: 0,
    ceilingFt: 2500,
    remarks: 'Mumbai Control Zone — Class D',
  },
  {
    id: 'INDIA-UPR-A',
    name: 'India Upper Airspace',
    icaoClass: 'A',
    geometry: { type: 'Polygon', coordinates: [[[68,8],[68,37],[97,37],[97,8],[68,8]]] },
    floorFt: 24500,
    ceilingFt: 46000,
    remarks: 'All Indian upper airspace FL245+ is Class A',
  },
  {
    id: 'VOBL-TMA-C',
    name: 'Bengaluru TMA',
    icaoClass: 'C',
    geometry: { type: 'Polygon', coordinates: [[[77.30,13.20],[77.95,13.20],[77.95,12.70],[77.30,12.70],[77.30,13.20]]] },
    floorFt: 1500,
    ceilingFt: 12500,
    remarks: 'Bengaluru Terminal Manoeuvring Area — Class C',
  },
  {
    id: 'INDIA-G-LOW',
    name: 'India Uncontrolled (Below CTA)',
    icaoClass: 'G',
    geometry: { type: 'Polygon', coordinates: [[[74,22],[76,22],[76,20],[74,20],[74,22]]] },
    floorFt: 0,
    ceilingFt: 1500,
    remarks: 'Uncontrolled airspace outside CTR/TMA',
  },
]

export function addAirspaceClassLayer(map: L.Map): L.LayerGroup {
  const group = L.layerGroup()

  MOCK_CLASS_ZONES.forEach(zone => {
    const coords = zone.geometry.coordinates[0].map(
      ([lng, lat]) => [lat, lng] as L.LatLngTuple
    )
    const color = CLASS_COLORS[zone.icaoClass]

    const polygon = L.polygon(coords, {
      color,
      weight: 1.5,
      dashArray: '4 2',
      fillColor: color,
      fillOpacity: 0.08,
    })

    polygon.bindPopup(`
      <div style="font-family:monospace;font-size:12px">
        <strong>Class ${zone.icaoClass}: ${zone.name}</strong><br/>
        Floor: ${zone.floorFt} ft &middot; Ceiling: ${zone.ceilingFt} ft<br/>
        <em style="font-size:10px">${CLASS_DESCRIPTIONS[zone.icaoClass]}</em><br/>
        ${zone.remarks ? `<br/><span style="color:#888">${zone.remarks}</span>` : ''}
      </div>
    `)

    group.addLayer(polygon)
  })

  return group
}

export function getAirspaceClassZones(): AirspaceClassZone[] {
  return MOCK_CLASS_ZONES
}

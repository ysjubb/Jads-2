import L from 'leaflet'
import { fetchNavaids, getNavaidColor, getNavaidIcon } from '../services/openAipService'
import type { Navaid } from '../services/openAipService'

export async function addNavaidLayer(map: L.Map): Promise<L.LayerGroup> {
  const group = L.layerGroup()
  const navaids = await fetchNavaids()

  navaids.forEach((nav: Navaid) => {
    const color = getNavaidColor(nav.type)
    const icon = L.divIcon({
      className: 'navaid-icon',
      html: `<div style="
        width:22px;height:22px;border-radius:${nav.type === 'NDB' ? '50%' : '2px'};
        background:${color}25;border:2px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-family:monospace;font-size:8px;font-weight:700;color:${color};
      ">${getNavaidIcon(nav.type)}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })

    const marker = L.marker([nav.lat, nav.lng], { icon })
    marker.bindPopup(`
      <div style="font-family:monospace;font-size:12px">
        <strong>${nav.name}</strong><br/>
        Type: <span style="color:${color}">${nav.type}</span><br/>
        Ident: ${nav.ident}<br/>
        Freq: ${nav.frequency} ${nav.type === 'NDB' ? 'kHz' : 'MHz'}<br/>
        ${nav.elevation ? `Elev: ${nav.elevation} ft` : ''}
      </div>
    `)
    marker.bindTooltip(nav.ident, {
      permanent: false,
      direction: 'top',
      offset: [0, -14],
      className: 'navaid-tooltip',
    })

    group.addLayer(marker)
  })

  return group
}

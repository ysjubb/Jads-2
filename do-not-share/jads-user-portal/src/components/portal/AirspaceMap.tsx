import React, { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import type { AirspaceZone } from '../../types/airspace'
import { ZONE_COLORS, ZONE_STROKE } from '../../types/airspace'
import { fetchAirspaceZones } from '../../services/airspaceService'

// Fix default marker icon (webpack/vite issue)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface AirspaceMapProps {
  height?: string
  drawMode?: boolean
  onAreaSelected?: (geojson: GeoJSON.Polygon) => void
  center?: [number, number]
  zoom?: number
  showLayerControl?: boolean
}

function DrawControl({ onAreaSelected }: { onAreaSelected?: (geojson: GeoJSON.Polygon) => void }) {
  const map = useMap()

  useEffect(() => {
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)

    const drawControl = new (L.Control as any).Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: '#FFB800', weight: 2, fillOpacity: 0.2 },
        },
        rectangle: {
          shapeOptions: { color: '#FFB800', weight: 2, fillOpacity: 0.2 },
        },
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      },
      edit: { featureGroup: drawnItems },
    })
    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers()
      drawnItems.addLayer(e.layer)
      const geojson = e.layer.toGeoJSON().geometry as GeoJSON.Polygon
      onAreaSelected?.(geojson)
    })

    map.on(L.Draw.Event.EDITED, () => {
      drawnItems.eachLayer((layer: any) => {
        const geojson = layer.toGeoJSON().geometry as GeoJSON.Polygon
        onAreaSelected?.(geojson)
      })
    })

    return () => {
      map.removeControl(drawControl)
      map.removeLayer(drawnItems)
    }
  }, [map, onAreaSelected])

  return null
}

function ZoneLayer({ zones }: { zones: AirspaceZone[] }) {
  const geoData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: zones.map(z => ({
      type: 'Feature' as const,
      properties: { id: z.id, name: z.name, zoneType: z.type, authority: z.authority, minAlt: z.minAlt, maxAlt: z.maxAlt },
      geometry: z.geometry,
    })),
  }

  return (
    <GeoJSON
      key={zones.map(z => z.id).join(',')}
      data={geoData}
      style={(feature) => {
        const zt = feature?.properties?.zoneType as keyof typeof ZONE_COLORS
        return {
          fillColor: ZONE_COLORS[zt] ?? 'rgba(128,128,128,0.3)',
          color: ZONE_STROKE[zt] ?? '#888',
          weight: 2,
          fillOpacity: 0.35,
        }
      }}
      onEachFeature={(feature, layer) => {
        const p = feature.properties
        layer.bindPopup(`
          <div style="font-family:monospace;font-size:12px">
            <strong>${p.name}</strong><br/>
            Type: <span style="color:${ZONE_STROKE[p.zoneType as keyof typeof ZONE_STROKE]}">${p.zoneType}</span><br/>
            Alt: ${p.minAlt}–${p.maxAlt} ft AGL<br/>
            Authority: ${p.authority}
          </div>
        `)
      }}
    />
  )
}

export function AirspaceMap({
  height = '500px',
  drawMode = false,
  onAreaSelected,
  center = [20.5937, 78.9629],
  zoom = 5,
  showLayerControl = true,
}: AirspaceMapProps) {
  const [zones, setZones] = useState<AirspaceZone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAirspaceZones().then(z => { setZones(z); setLoading(false) })
  }, [])

  const stableOnArea = useCallback((geojson: GeoJSON.Polygon) => {
    onAreaSelected?.(geojson)
  }, [onAreaSelected])

  return (
    <div style={{ position: 'relative', height, width: '100%', borderRadius: '4px', overflow: 'hidden' }}>
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          zIndex: 1000, padding: '4px 8px', fontSize: '0.65rem',
          background: 'rgba(0,0,0,0.7)', color: '#FFB800', textAlign: 'center',
        }}>
          Loading airspace zones...
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        {showLayerControl ? (
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>

            <LayersControl.Overlay checked name="AAI Airspace Zones">
              <ZoneLayer zones={zones} />
            </LayersControl.Overlay>
          </LayersControl>
        ) : (
          <>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoneLayer zones={zones} />
          </>
        )}

        {drawMode && <DrawControl onAreaSelected={stableOnArea} />}
      </MapContainer>
    </div>
  )
}

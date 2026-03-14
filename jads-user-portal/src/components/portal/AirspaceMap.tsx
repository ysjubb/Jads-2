import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { T } from '../../theme';
import { INDIAN_FIRS } from '../../data/firData';
import type { AirspaceZone } from '../../types/airspace';
import { getZones } from '../../services/airspaceService';

const ZONE_COLORS: Record<string, string> = {
  GREEN: '#22c55e',
  YELLOW: '#eab308',
  RED: '#ef4444',
};

/**
 * Interactive airspace map centered on India.
 * Renders FIR boundaries and drone zones (GREEN/YELLOW/RED).
 */
interface AirspaceMapProps {
  height?: string
  drawMode?: boolean
  onAreaSelected?: (geojson: any) => void
  zoom?: number
  center?: number[]
}

export function AirspaceMap(_props: AirspaceMapProps = {}) {
  const [zones, setZones] = useState<AirspaceZone[]>([]);

  useEffect(() => {
    getZones().then(setZones).catch(() => {});
  }, []);

  const center: LatLngExpression = [22.5, 78.9]; // Center of India

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Airspace Map</h2>
      <div style={{ height: '500px', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
        <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* FIR boundaries */}
          {INDIAN_FIRS.map(fir => (
            <Polygon
              key={fir.code}
              positions={fir.boundary.map(p => [p.lat, p.lng] as LatLngExpression)}
              pathOptions={{ color: '#4488ff', weight: 1, fillOpacity: 0.03, dashArray: '5 5' }}
            >
              <Tooltip>{fir.code} — {fir.name}</Tooltip>
            </Polygon>
          ))}

          {/* Drone zones */}
          {zones.map(zone => (
            <Polygon
              key={zone.id}
              positions={zone.boundary.map(p => [p.lat, p.lng] as LatLngExpression)}
              pathOptions={{
                color: ZONE_COLORS[zone.type] ?? '#888',
                weight: 2,
                fillOpacity: 0.15,
              }}
            >
              <Tooltip>
                {zone.name} ({zone.type})
                {zone.altitudeCeiling ? ` — Max ${zone.altitudeCeiling}ft` : ''}
              </Tooltip>
            </Polygon>
          ))}
        </MapContainer>
      </div>
      <div style={{ display: 'flex', gap: '1.2rem', marginTop: '0.5rem' }}>
        {Object.entries(ZONE_COLORS).map(([label, color]) => (
          <span key={label} style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

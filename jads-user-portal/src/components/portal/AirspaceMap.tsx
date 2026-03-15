import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Tooltip,
  Marker,
  Popup,
  Polyline,
  LayerGroup,
  LayersControl,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { T } from '../../theme';
import { INDIAN_FIRS } from '../../data/firData';
import type {
  AirspaceZone,
  AerodromeMapItem,
  NavaidMapItem,
  FixMapItem,
  Airway,
} from '../../types/airspace';
import {
  getZones,
  getAerodromes,
  getNavaids,
  getAirways,
  getFixes,
} from '../../services/airspaceService';

// ── Zone colors (existing) ──────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  GREEN: '#22c55e',
  YELLOW: '#eab308',
  RED: '#ef4444',
};

// ── Marker icon factories ───────────────────────────────────────────────────

function aerodromeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'aerodrome-icon',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#0066CC30;border:2px solid #0066CC;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function navaidIcon(type: string): L.DivIcon {
  const isNDB = type === 'NDB';
  const color = isNDB ? '#FFB800' : '#00AAFF';
  const radius = isNDB ? '50%' : '3px';
  const label = type.length > 3 ? type.slice(0, 3) : type;
  return L.divIcon({
    className: 'navaid-icon',
    html: `<div style="
      width:20px;height:20px;border-radius:${radius};
      background:${color}20;border:2px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-family:monospace;font-size:7px;font-weight:700;color:${color};
    ">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function fixIcon(): L.DivIcon {
  return L.divIcon({
    className: 'fix-icon',
    html: `<div style="
      width:0;height:0;
      border-left:5px solid transparent;
      border-right:5px solid transparent;
      border-bottom:9px solid #00CCCC;
    "></div>`,
    iconSize: [10, 9],
    iconAnchor: [5, 9],
  });
}

// ── Component props ─────────────────────────────────────────────────────────

interface AirspaceMapProps {
  height?: string;
  drawMode?: boolean;
  onAreaSelected?: (geojson: unknown) => void;
  zoom?: number;
  center?: number[];
}

/**
 * Interactive aviation chart map centered on India.
 * Renders FIR boundaries, drone zones, aerodromes, navaids, fixes, and airways
 * with toggleable layer controls. Data flows one-way from Jeppesen/AAI AIRAC import.
 */
export function AirspaceMap(_props: AirspaceMapProps = {}) {
  const [zones, setZones] = useState<AirspaceZone[]>([]);
  const [aerodromes, setAerodromes] = useState<AerodromeMapItem[]>([]);
  const [navaids, setNavaids] = useState<NavaidMapItem[]>([]);
  const [fixes, setFixes] = useState<FixMapItem[]>([]);
  const [airways, setAirways] = useState<Airway[]>([]);

  useEffect(() => {
    getZones().then(setZones).catch(() => {});
    getAerodromes().then(setAerodromes).catch(() => {});
    getNavaids().then(setNavaids).catch(() => {});
    getFixes().then(setFixes).catch(() => {});
    getAirways().then(setAirways).catch(() => {});
  }, []);

  const center: LatLngExpression = [22.5, 78.9];

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>
        Airspace Map
        <span style={{ color: T.muted, fontSize: '0.65rem', marginLeft: '0.8rem', fontWeight: 400 }}>
          Use layer controls (top-right) to toggle data layers
        </span>
      </h2>

      <div style={{ height: '500px', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
        <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <LayersControl position="topright">
            {/* ── Aerodromes (ON by default) ──────────────────────────── */}
            <LayersControl.Overlay checked name="Aerodromes">
              <LayerGroup>
                {aerodromes.map((ad) => (
                  <Marker
                    key={ad.icao}
                    position={[ad.lat, ad.lon]}
                    icon={aerodromeIcon()}
                  >
                    <Tooltip permanent direction="right" offset={[8, 0]} className="icao-tooltip">
                      <span style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: 700, color: '#0066CC' }}>
                        {ad.icao}
                      </span>
                    </Tooltip>
                    <Popup>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 }}>
                        <strong>{ad.icao}</strong> — {ad.name}<br />
                        Elev: {ad.elevation} ft AMSL<br />
                        TA: {ad.transitionAltitude ?? '—'} ft / {ad.transitionLevel ?? '—'}<br />
                        FIR: {ad.firCode ?? '—'}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            {/* ── FIR Boundaries (ON by default) ──────────────────────── */}
            <LayersControl.Overlay checked name="FIR Boundaries">
              <LayerGroup>
                {INDIAN_FIRS.map((fir) => (
                  <Polygon
                    key={fir.code}
                    positions={fir.boundary.map((p) => [p.lat, p.lng] as LatLngExpression)}
                    pathOptions={{ color: '#4488ff', weight: 1, fillOpacity: 0.03, dashArray: '5 5' }}
                  >
                    <Tooltip>{fir.code} — {fir.name}</Tooltip>
                  </Polygon>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            {/* ── Drone Zones (ON by default) ─────────────────────────── */}
            <LayersControl.Overlay checked name="Drone Zones">
              <LayerGroup>
                {zones.map((zone) => (
                  <Polygon
                    key={zone.id}
                    positions={zone.boundary.map((p) => [p.lat, p.lng] as LatLngExpression)}
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
              </LayerGroup>
            </LayersControl.Overlay>

            {/* ── Navaids VOR/NDB (OFF by default) ────────────────────── */}
            <LayersControl.Overlay name="Navaids VOR/NDB">
              <LayerGroup>
                {navaids.map((nav) => (
                  <Marker
                    key={nav.id}
                    position={[nav.lat, nav.lon]}
                    icon={navaidIcon(nav.type)}
                  >
                    <Tooltip>
                      <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                        {nav.ident} — {nav.frequency} {nav.type === 'NDB' ? 'kHz' : 'MHz'}
                      </span>
                    </Tooltip>
                    <Popup>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 }}>
                        <strong>{nav.ident}</strong> ({nav.type})<br />
                        {nav.name}<br />
                        Freq: {nav.frequency} {nav.type === 'NDB' ? 'kHz' : 'MHz'}<br />
                        {nav.elevation ? `Elev: ${nav.elevation} ft` : ''}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            {/* ── Reporting Points / Fixes (OFF by default) ───────────── */}
            <LayersControl.Overlay name="Reporting Points">
              <LayerGroup>
                {fixes.map((fix, i) => (
                  <Marker
                    key={`${fix.name}-${i}`}
                    position={[fix.lat, fix.lon]}
                    icon={fixIcon()}
                  >
                    <Tooltip>
                      <span style={{ fontFamily: 'monospace', fontSize: '9px' }}>{fix.name}</span>
                    </Tooltip>
                    <Popup>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 }}>
                        <strong>{fix.name}</strong><br />
                        Type: {fix.waypointType ?? 'FIX'}<br />
                        {fix.lat.toFixed(4)}°N {fix.lon.toFixed(4)}°E
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            {/* ── Airways / IFR Routes (OFF by default) ───────────────── */}
            <LayersControl.Overlay name="Airways / Routes">
              <LayerGroup>
                {airways.map((aw) => {
                  const positions: LatLngExpression[] = [];
                  aw.segments.forEach((seg, idx) => {
                    if (idx === 0) positions.push([seg.from.lat, seg.from.lng]);
                    positions.push([seg.to.lat, seg.to.lng]);
                  });
                  const isUpper = aw.type === 'UPPER';
                  return (
                    <Polyline
                      key={aw.designator}
                      positions={positions}
                      pathOptions={{
                        color: isUpper ? '#4488ff' : '#22c55e',
                        weight: isUpper ? 1.5 : 1.5,
                        dashArray: isUpper ? '6 4' : undefined,
                        opacity: 0.7,
                      }}
                    >
                      <Tooltip>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                          {aw.designator} ({aw.type})
                        </span>
                      </Tooltip>
                    </Polyline>
                  );
                })}
              </LayerGroup>
            </LayersControl.Overlay>
          </LayersControl>
        </MapContainer>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.2rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {Object.entries(ZONE_COLORS).map(([label, color]) => (
          <span key={label} style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #0066CC', display: 'inline-block', boxSizing: 'border-box' }} />
          Aerodrome
        </span>
        <span style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, border: '2px solid #00AAFF', display: 'inline-block', boxSizing: 'border-box' }} />
          VOR
        </span>
        <span style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #FFB800', display: 'inline-block', boxSizing: 'border-box' }} />
          NDB
        </span>
        <span style={{ color: T.muted, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #00CCCC', display: 'inline-block' }} />
          Fix
        </span>
      </div>
    </div>
  );
}

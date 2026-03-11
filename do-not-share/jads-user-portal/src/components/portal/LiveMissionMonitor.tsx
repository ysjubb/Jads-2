// T08 — Live Mission Monitor (UP22) — Leaflet map with live drone tracking

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { T } from '../../theme'
import { PositionTrackingService, TelemetryPoint, ViolationEvent } from '../../services/positionTrackingService'
import { useAuth } from '../../hooks/useAuth'
import 'leaflet/dist/leaflet.css'

// ── Drone icon (rotated SVG) ──
function createDroneIcon(heading: number) {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="transform:rotate(${heading}deg);width:28px;height:28px;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="${T.primary}">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>`,
  })
}

// ── Map auto-center component ──
function MapAutoCenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lon) map.flyTo([lat, lon], 15, { duration: 1 })
  }, [lat, lon]) // eslint-disable-line
  return null
}

interface DroneState {
  point: TelemetryPoint
  track: [number, number][]
}

interface ViolationAlert {
  violationType: string
  lat: number
  lon: number
  ts: number
  dismissed: boolean
}

export function LiveMissionMonitor() {
  const { token } = useAuth()
  const serviceRef = useRef<PositionTrackingService | null>(null)
  const [drones, setDrones] = useState<Map<string, DroneState>>(new Map())
  const [violations, setViolations] = useState<ViolationAlert[]>([])
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const [firstCenter, setFirstCenter] = useState<[number, number] | null>(null)

  // Backend URL from env or default
  const wsUrl = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080'

  useEffect(() => {
    if (!token) return

    const svc = new PositionTrackingService()
    serviceRef.current = svc

    svc.setOnStatusChange(setConnectionStatus)

    svc.setOnTelemetry((point: TelemetryPoint) => {
      setDrones(prev => {
        const next = new Map(prev)
        const existing = next.get(point.missionId)
        const track = existing?.track || []
        const newTrack: [number, number][] = [...track, [point.lat, point.lon]]
        if (newTrack.length > 500) newTrack.shift()
        next.set(point.missionId, { point, track: newTrack })
        return next
      })
      if (!firstCenter) setFirstCenter([point.lat, point.lon])
    })

    svc.setOnViolation((event: ViolationEvent) => {
      setViolations(prev => [...prev, {
        violationType: event.violationType,
        lat: event.point.lat,
        lon: event.point.lon,
        ts: event.ts,
        dismissed: false,
      }])
    })

    svc.setOnBatteryCritical((point: TelemetryPoint) => {
      setViolations(prev => [...prev, {
        violationType: 'BATTERY_CRITICAL',
        lat: point.lat,
        lon: point.lon,
        ts: point.ts,
        dismissed: false,
      }])
    })

    // Subscribe to ALL for demo — in production would list specific mission IDs
    svc.connect(wsUrl, token, ['ALL'])

    return () => svc.disconnect()
  }, [token]) // eslint-disable-line

  const dismissViolation = useCallback((idx: number) => {
    setViolations(prev => prev.map((v, i) => i === idx ? { ...v, dismissed: true } : v))
  }, [])

  const activeViolations = violations.filter(v => !v.dismissed)
  const selected = selectedMission ? drones.get(selectedMission) : null
  const center = firstCenter || [28.5562, 77.1000] as [number, number]

  const statusColor = connectionStatus === 'LIVE' ? '#00FF88'
    : connectionStatus === 'RECONNECTING' ? T.amber : T.red

  return (
    <div style={{ display: 'flex', height: '100vh', background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
      {/* ── Sidebar: mission list ── */}
      <div style={{ width: '260px', borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: '0.7rem', color: statusColor, fontWeight: 600 }}>{connectionStatus}</span>
          <span style={{ fontSize: '0.65rem', color: T.muted, marginLeft: 'auto' }}>
            {drones.size} active
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
          {Array.from(drones.entries()).map(([mId, state]) => (
            <div key={mId}
              onClick={() => setSelectedMission(mId)}
              style={{
                padding: '0.5rem 0.75rem', cursor: 'pointer',
                background: selectedMission === mId ? T.primary + '15' : 'transparent',
                borderLeft: selectedMission === mId ? `2px solid ${T.primary}` : '2px solid transparent',
              }}>
              <div style={{ fontSize: '0.7rem', color: T.textBright, fontWeight: 600 }}>
                {state.point.uin}
              </div>
              <div style={{ fontSize: '0.6rem', color: T.muted }}>
                {mId} | {state.point.batteryPct.toFixed(0)}% | {state.point.altAGL.toFixed(0)}m
              </div>
            </div>
          ))}
          {drones.size === 0 && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '0.7rem', color: T.muted }}>
              Waiting for telemetry...
            </div>
          )}
        </div>
      </div>

      {/* ── Main map area ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Violation banners */}
        {activeViolations.map((v, i) => (
          <div key={i} style={{
            position: 'absolute', top: `${i * 48 + 8}px`, left: 8, right: 8, zIndex: 1000,
            background: v.violationType === 'BATTERY_CRITICAL' ? T.amber + 'DD' : T.red + 'DD',
            color: '#000', padding: '0.5rem 1rem', borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: '0.7rem', fontWeight: 600,
          }}>
            <span>{v.violationType} | {v.lat.toFixed(5)}, {v.lon.toFixed(5)} | {new Date(v.ts).toLocaleTimeString()}</span>
            <button onClick={() => dismissViolation(i)}
              style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
              x
            </button>
          </div>
        ))}

        {/* Telemetry panel for selected drone */}
        {selected && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, zIndex: 1000,
            background: T.surface + 'EE', border: `1px solid ${T.border}`,
            borderRadius: '6px', padding: '0.75rem', minWidth: '240px',
          }}>
            <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.4rem' }}>
              {selected.point.uin}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.6rem' }}>
              <span style={{ color: T.muted }}>LAT</span><span>{selected.point.lat.toFixed(6)}</span>
              <span style={{ color: T.muted }}>LON</span><span>{selected.point.lon.toFixed(6)}</span>
              <span style={{ color: T.muted }}>ALT AGL</span><span>{selected.point.altAGL.toFixed(1)}m</span>
              <span style={{ color: T.muted }}>SPEED</span><span>{selected.point.speedKmh.toFixed(1)} km/h</span>
              <span style={{ color: T.muted }}>HEADING</span><span>{selected.point.headingDeg.toFixed(0)}°</span>
              <span style={{ color: T.muted }}>BATTERY</span>
              <span style={{
                color: selected.point.batteryPct > 50 ? '#00FF88'
                  : selected.point.batteryPct > 20 ? T.amber : T.red,
                fontWeight: 700,
              }}>{selected.point.batteryPct.toFixed(0)}%</span>
              <span style={{ color: T.muted }}>SATS</span><span>{selected.point.satelliteCount}</span>
              <span style={{ color: T.muted }}>SOURCE</span><span>{selected.point.source}</span>
            </div>
          </div>
        )}

        <MapContainer
          center={center}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {firstCenter && <MapAutoCenter lat={firstCenter[0]} lon={firstCenter[1]} />}

          {/* Drone markers + track trails */}
          {Array.from(drones.entries()).map(([mId, state]) => (
            <React.Fragment key={mId}>
              <Marker
                position={[state.point.lat, state.point.lon]}
                icon={createDroneIcon(state.point.headingDeg)}
                eventHandlers={{ click: () => setSelectedMission(mId) }}
              />
              {state.track.length > 1 && (
                <Polyline
                  positions={state.track}
                  pathOptions={{ color: T.primary, weight: 2, opacity: 0.6 }}
                />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}

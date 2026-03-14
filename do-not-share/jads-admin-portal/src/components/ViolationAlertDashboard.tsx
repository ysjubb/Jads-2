// T10 — Admin Portal: Live Violation Alert Dashboard

import { useEffect, useRef, useState, useCallback } from 'react'
import { ZT } from '../theme'
import { AdminWsService, TelemetryPoint, ViolationEvent } from '../services/adminWsService'
import { useAdminAuth } from '../hooks/useAdminAuth'

interface AlertItem {
  id: number
  type: string       // ALTITUDE | BOUNDARY | TIME | BATTERY_CRITICAL
  uin: string
  missionId: string
  lat: number
  lon: number
  ts: number
  severity: string
  distanceToEdge?: number
}

interface DroneState {
  lat: number
  lon: number
  heading: number
  batteryPct: number
  uin: string
  ts: number
}

let alertIdCounter = 0

export function ViolationAlertDashboard() {
  const { token } = useAdminAuth()
  const serviceRef = useRef<AdminWsService | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [drones, setDrones] = useState<Map<string, DroneState>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [muted, setMuted] = useState(false)
  const [violationsToday, setViolationsToday] = useState(0)
  const [showIncidentModal, setShowIncidentModal] = useState<AlertItem | null>(null)
  const [incidentDescription, setIncidentDescription] = useState('')
  const [incidentSeverity, setIncidentSeverity] = useState('HIGH')

  const wsUrl = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080'
  const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080'

  // Audio alert
  const playBeep = useCallback(() => {
    if (muted) return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.value = 0.3
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch { /* audio not available */ }
  }, [muted])

  useEffect(() => {
    if (!token) return

    const svc = new AdminWsService()
    serviceRef.current = svc

    svc.setOnStatusChange(setConnectionStatus)

    svc.setOnTelemetry((point: TelemetryPoint) => {
      setDrones(prev => {
        const next = new Map(prev)
        next.set(point.missionId, {
          lat: point.lat, lon: point.lon, heading: point.headingDeg,
          batteryPct: point.batteryPct, uin: point.uin, ts: point.ts,
        })
        return next
      })
    })

    svc.setOnViolation((event: ViolationEvent) => {
      const severity = event.violationType === 'BOUNDARY' ? 'CRITICAL' : 'HIGH'
      const alert: AlertItem = {
        id: ++alertIdCounter,
        type: event.violationType,
        uin: event.point.uin,
        missionId: event.point.missionId,
        lat: event.point.lat,
        lon: event.point.lon,
        ts: event.ts,
        severity,
        distanceToEdge: event.distanceToEdge,
      }
      setAlerts(prev => [alert, ...prev].slice(0, 100))
      setViolationsToday(prev => prev + 1)
      if (severity === 'CRITICAL') playBeep()
    })

    svc.setOnBatteryCritical((point: TelemetryPoint) => {
      const alert: AlertItem = {
        id: ++alertIdCounter,
        type: 'BATTERY_CRITICAL',
        uin: point.uin,
        missionId: point.missionId,
        lat: point.lat,
        lon: point.lon,
        ts: point.ts,
        severity: 'MEDIUM',
      }
      setAlerts(prev => [alert, ...prev].slice(0, 100))
    })

    svc.connect(wsUrl, token)
    return () => svc.disconnect()
  }, [token, wsUrl, playBeep])

  const submitIncident = async () => {
    if (!showIncidentModal || !token) return
    try {
      await fetch(`${apiUrl}/api/audit/incidents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-JADS-Version': '4.0',
        },
        body: JSON.stringify({
          violationId: String(showIncidentModal.id),
          missionId: showIncidentModal.missionId,
          uin: showIncidentModal.uin,
          description: incidentDescription,
          severity: incidentSeverity,
        }),
      })
      setShowIncidentModal(null)
      setIncidentDescription('')
    } catch (e) {
      console.error('Failed to create incident', e)
    }
  }

  const statusColor = connectionStatus === 'LIVE' ? ZT.phosphor
    : connectionStatus === 'RECONNECTING' ? ZT.amber : ZT.red

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length

  return (
    <div style={{ height: '100vh', background: ZT.bg, color: ZT.text, fontFamily: "'JetBrains Mono', monospace", display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <div style={{
        padding: '0.6rem 1rem', borderBottom: `1px solid ${ZT.border}`,
        display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.7rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span style={{ color: statusColor, fontWeight: 600 }}>{connectionStatus}</span>
        </div>
        <span style={{ color: ZT.phosphor }}>Active: {drones.size}</span>
        <span style={{ color: ZT.amber }}>Violations Today: {violationsToday}</span>
        {criticalCount > 0 && (
          <span style={{
            background: ZT.red, color: '#000', padding: '0.15rem 0.5rem',
            borderRadius: '10px', fontWeight: 700, fontSize: '0.65rem',
          }}>
            {criticalCount} CRITICAL
          </span>
        )}
        <button
          onClick={() => setMuted(m => !m)}
          style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${ZT.border}`,
            color: muted ? ZT.red : ZT.phosphor, cursor: 'pointer', padding: '0.2rem 0.5rem',
            borderRadius: '3px', fontSize: '0.6rem',
          }}
        >
          {muted ? 'UNMUTE' : 'MUTE'}
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: Alert feed */}
        <div style={{ width: '400px', borderRight: `1px solid ${ZT.border}`, overflowY: 'auto', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.65rem', color: ZT.muted, padding: '0.3rem 0.5rem', fontWeight: 700 }}>
            LIVE ALERT FEED
          </div>
          {alerts.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', fontSize: '0.7rem', color: ZT.muted }}>
              No violations detected
            </div>
          )}
          {alerts.map(alert => {
            const badgeColor = alert.type === 'BATTERY_CRITICAL' ? ZT.amber
              : alert.severity === 'CRITICAL' ? ZT.red : ZT.phosphor
            return (
              <div key={alert.id} style={{
                padding: '0.5rem', margin: '0.3rem 0', borderRadius: '4px',
                background: ZT.surface, border: `1px solid ${ZT.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span style={{
                    background: badgeColor + '30', color: badgeColor,
                    padding: '0.1rem 0.4rem', borderRadius: '3px',
                    fontSize: '0.55rem', fontWeight: 700,
                  }}>
                    {alert.type}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: ZT.textBright }}>{alert.uin}</span>
                  <span style={{ fontSize: '0.55rem', color: ZT.muted, marginLeft: 'auto' }}>
                    {new Date(alert.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ fontSize: '0.55rem', color: ZT.muted }}>
                  Mission: {alert.missionId} | {alert.lat.toFixed(5)}, {alert.lon.toFixed(5)}
                </div>
                <button
                  onClick={() => { setShowIncidentModal(alert); setIncidentDescription('') }}
                  style={{
                    marginTop: '0.3rem', background: ZT.phosphor + '20', border: `1px solid ${ZT.phosphor}40`,
                    color: ZT.phosphor, cursor: 'pointer', padding: '0.2rem 0.5rem',
                    borderRadius: '3px', fontSize: '0.55rem', fontWeight: 600,
                  }}
                >
                  CREATE INCIDENT
                </button>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Map placeholder + active drones summary */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* Leaflet map loaded via CDN in admin portal */}
            <div id="violation-map" style={{ width: '100%', height: '100%', background: ZT.surface }}>
              <div style={{ padding: '2rem', textAlign: 'center', fontSize: '0.8rem', color: ZT.muted }}>
                Live violation map — {drones.size} active drones
                <div style={{ marginTop: '1rem', fontSize: '0.65rem' }}>
                  {Array.from(drones.entries()).map(([mId, d]) => (
                    <div key={mId} style={{ padding: '0.2rem 0' }}>
                      <span style={{ color: ZT.phosphor }}>{d.uin}</span>
                      <span style={{ color: ZT.muted }}> | {d.lat.toFixed(4)}, {d.lon.toFixed(4)} | {d.batteryPct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Incident Report Modal ── */}
      {showIncidentModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px',
            padding: '1.5rem', width: '400px',
          }}>
            <div style={{ fontSize: '0.8rem', color: ZT.phosphor, fontWeight: 700, marginBottom: '1rem' }}>
              CREATE INCIDENT REPORT
            </div>
            <div style={{ fontSize: '0.65rem', color: ZT.muted, marginBottom: '0.5rem' }}>
              UIN: {showIncidentModal.uin} | Mission: {showIncidentModal.missionId}
            </div>
            <div style={{ fontSize: '0.65rem', color: ZT.muted, marginBottom: '1rem' }}>
              Violation: {showIncidentModal.type} at {showIncidentModal.lat.toFixed(5)}, {showIncidentModal.lon.toFixed(5)}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.6rem', color: ZT.muted, display: 'block', marginBottom: '0.25rem' }}>Severity</label>
              <select
                value={incidentSeverity}
                onChange={e => setIncidentSeverity(e.target.value)}
                style={{
                  width: '100%', padding: '0.4rem', background: ZT.bg,
                  border: `1px solid ${ZT.border}`, color: ZT.text, borderRadius: '3px',
                  fontSize: '0.7rem',
                }}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.6rem', color: ZT.muted, display: 'block', marginBottom: '0.25rem' }}>Description</label>
              <textarea
                value={incidentDescription}
                onChange={e => setIncidentDescription(e.target.value)}
                rows={4}
                style={{
                  width: '100%', padding: '0.4rem', background: ZT.bg,
                  border: `1px solid ${ZT.border}`, color: ZT.text, borderRadius: '3px',
                  fontSize: '0.7rem', resize: 'vertical',
                }}
                placeholder="Describe the incident..."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowIncidentModal(null)}
                style={{
                  padding: '0.4rem 1rem', background: 'none', border: `1px solid ${ZT.border}`,
                  color: ZT.muted, cursor: 'pointer', borderRadius: '3px', fontSize: '0.65rem',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={submitIncident}
                style={{
                  padding: '0.4rem 1rem', background: ZT.phosphor, border: 'none',
                  color: '#000', cursor: 'pointer', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
                }}
              >
                SUBMIT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

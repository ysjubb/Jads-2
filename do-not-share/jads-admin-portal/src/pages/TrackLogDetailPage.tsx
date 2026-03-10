import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

declare const L: any

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#00FF88',
  amber:      '#FFB800',
  red:        '#FF3B3B',
  muted:      '#4A7A5A',
  text:       '#b0c8b8',
  textBright: '#d0e8d8',
}

interface TrackLogDetail {
  id: string
  operatorId: string
  droneSerialNumber: string
  format: string
  takeoffJson: string | null
  landingJson: string | null
  pathPointsJson: string | null
  violationsJson: string | null
  maxAltitude: number
  duration: number
  breachCount: number
  droneOperationPlanId: string | null
  createdAt: string
}

export function TrackLogDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAdminAuth()
  const [log, setLog]         = useState<TrackLogDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!token || !id) return
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const { data } = await adminAxios(token).get('/track-logs/' + id)
        setLog(data.trackLog ?? data)
      } catch (e: any) {
        setError(e.response?.data?.error ?? 'Failed to fetch track log')
      } finally {
        setLoading(false)
      }
    })()
  }, [token, id])

  // Render Leaflet map
  useEffect(() => {
    if (!log || !mapRef.current) return
    if (typeof L === 'undefined') return

    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }

    const map = L.map(mapRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    // Parse path points
    let pathPoints: { lat: number; lon: number; alt?: number }[] = []
    if (log.pathPointsJson) {
      try { pathPoints = JSON.parse(log.pathPointsJson) } catch { /* ignore */ }
    }

    // Draw polyline if path points exist
    if (pathPoints.length > 0) {
      const latlngs = pathPoints.map(p => [p.lat, p.lon])
      L.polyline(latlngs, { color: T.amber, weight: 2.5, opacity: 0.85 }).addTo(map)

      // Start marker
      L.circleMarker(latlngs[0], { radius: 8, fillColor: T.primary, color: T.bg, fillOpacity: 1, weight: 2 })
        .bindTooltip('Start').addTo(map)

      // End marker
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, fillColor: T.muted, color: T.bg, fillOpacity: 1, weight: 2 })
        .bindTooltip('End').addTo(map)

      map.fitBounds(latlngs as any, { padding: [30, 30] })
    } else {
      // If no path points, try takeoff/landing
      const markers: [number, number][] = []
      if (log.takeoffJson) {
        try {
          const tk = JSON.parse(log.takeoffJson)
          if (tk.lat && tk.lon) {
            L.circleMarker([tk.lat, tk.lon], { radius: 8, fillColor: T.primary, color: T.bg, fillOpacity: 1, weight: 2 })
              .bindTooltip('Takeoff').addTo(map)
            markers.push([tk.lat, tk.lon])
          }
        } catch { /* ignore */ }
      }
      if (log.landingJson) {
        try {
          const ld = JSON.parse(log.landingJson)
          if (ld.lat && ld.lon) {
            L.circleMarker([ld.lat, ld.lon], { radius: 8, fillColor: T.muted, color: T.bg, fillOpacity: 1, weight: 2 })
              .bindTooltip('Landing').addTo(map)
            markers.push([ld.lat, ld.lon])
          }
        } catch { /* ignore */ }
      }
      if (markers.length > 0) {
        map.fitBounds(markers, { padding: [50, 50], maxZoom: 15 })
      }
    }

    // Parse violations and add red markers
    let violations: { type: string; timestamp: string; lat?: number; lon?: number }[] = []
    if (log.violationsJson) {
      try { violations = JSON.parse(log.violationsJson) } catch { /* ignore */ }
    }
    violations.forEach(v => {
      if (v.lat != null && v.lon != null) {
        L.circleMarker([v.lat, v.lon], {
          radius: 7, fillColor: T.red, color: T.bg, fillOpacity: 0.9, weight: 2,
        })
          .bindPopup(`<div style="font-family:monospace;font-size:12px"><b style="color:${T.red}">${v.type}</b><br/>${v.timestamp ?? ''}</div>`)
          .addTo(map)
      }
    })

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [log])

  if (loading) return <div style={{ padding: '1.5rem', color: T.muted }}>Loading...</div>
  if (error) return <div style={{ padding: '1.5rem', color: T.red }}>{error}</div>
  if (!log) return <div style={{ padding: '1.5rem', color: T.red }}>Track log not found.</div>

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', fontFamily: 'monospace', color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link to="/track-logs" style={{ color: T.muted, textDecoration: 'none', fontSize: '0.75rem' }}>&lt; Back</Link>
        <h1 style={{ color: T.primary, fontSize: '1rem', margin: 0 }}>Track Log Detail</h1>
      </div>

      {/* Map */}
      <div ref={mapRef} style={{
        height: '400px', borderRadius: '6px', border: `1px solid ${T.border}`,
        marginBottom: '1rem', background: '#0a0a0a',
      }} />

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', fontSize: '0.75rem' }}>
        <Detail label="ID" value={log.id} />
        <Detail label="Format" value={log.format} />
        <Detail label="Drone S/N" value={log.droneSerialNumber} />
        <Detail label="Max Altitude" value={log.maxAltitude != null ? `${log.maxAltitude}m` : '\u2014'} />
        <Detail label="Duration" value={log.duration != null ? fmtDuration(log.duration) : '\u2014'} />
        <Detail label="Breach Count" value={String(log.breachCount)} color={log.breachCount > 0 ? T.red : T.primary} />
        <Detail label="Operator ID" value={log.operatorId ?? '\u2014'} />
        <Detail label="Uploaded" value={new Date(log.createdAt).toLocaleString()} />
        {log.droneOperationPlanId && (
          <Detail label="Drone Plan" value={log.droneOperationPlanId} />
        )}
      </div>
    </div>
  )
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: T.muted, fontSize: '0.6rem', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ color: color ?? T.textBright, fontWeight: 500, wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

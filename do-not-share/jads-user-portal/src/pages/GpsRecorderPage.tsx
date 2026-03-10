import React, { useState } from 'react'
import { T } from '../theme'
import { useGpsTracker } from '../hooks/useGpsTracker'
import { userApi } from '../api/client'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function GpsRecorderPage() {
  const gps = useGpsTracker(1000)
  const [droneSerial, setDroneSerial] = useState('')
  const [uploading, setUploading]   = useState(false)
  const [uploaded, setUploaded]     = useState(false)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [trackLogId, setTrackLogId] = useState<string | null>(null)

  const handleUpload = async () => {
    if (gps.points.length === 0) return
    setUploading(true)
    setUploadErr(null)
    try {
      const { data } = await userApi().post('/drone/track-logs/gps-track', {
        droneSerialNumber: droneSerial || 'GPS_RECORDER',
        points: gps.points.map(p => ({
          lat: p.lat, lon: p.lon, alt: p.alt, timestampMs: p.timestampMs,
        })),
      })
      setUploaded(true)
      setTrackLogId(data.trackLogId)
    } catch (e: any) {
      setUploadErr(e.response?.data?.error ?? e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px',
    padding: '1rem', marginBottom: '0.75rem',
  }

  const btnBase: React.CSSProperties = {
    border: 'none', borderRadius: '8px', padding: '1rem 2rem',
    fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
    width: '100%', marginBottom: '0.5rem',
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>GPS Track Recorder</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Record your flight path using device GPS. Works on mobile and desktop.
      </p>

      {/* Drone serial input */}
      <div style={cardStyle}>
        <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '0.3rem' }}>
          Drone Serial Number (optional)
        </label>
        <input
          type="text" value={droneSerial} onChange={e => setDroneSerial(e.target.value)}
          placeholder="e.g. 1ZNBJ9D00B00FK"
          disabled={gps.isTracking}
          style={{
            width: '100%', padding: '0.6rem', background: T.bg, color: T.textBright,
            border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '0.8rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Live stats */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="TIME" value={fmt(gps.elapsed)} />
          <Stat label="POINTS" value={String(gps.points.length)} />
          <Stat label="MAX ALT" value={`${gps.maxAltitude.toFixed(1)}m`} />
          <Stat label="DISTANCE" value={gps.distance >= 1000 ? `${(gps.distance / 1000).toFixed(2)}km` : `${gps.distance.toFixed(0)}m`} />
        </div>

        {gps.lastPoint && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: T.muted }}>
            <span>Lat: {gps.lastPoint.lat.toFixed(6)}</span>
            <span style={{ marginLeft: '0.5rem' }}>Lon: {gps.lastPoint.lon.toFixed(6)}</span>
            <span style={{ marginLeft: '0.5rem' }}>Acc: {gps.lastPoint.accuracy.toFixed(0)}m</span>
            {gps.lastPoint.speed != null && (
              <span style={{ marginLeft: '0.5rem' }}>Spd: {(gps.lastPoint.speed * 3.6).toFixed(1)}km/h</span>
            )}
          </div>
        )}
      </div>

      {gps.error && (
        <div style={{ ...cardStyle, borderColor: T.red }}>
          <p style={{ color: T.red, fontSize: '0.7rem', margin: 0 }}>{gps.error}</p>
        </div>
      )}

      {/* Controls */}
      {!gps.isTracking && gps.points.length === 0 && (
        <button onClick={gps.start}
          style={{ ...btnBase, background: '#00AA44', color: '#fff' }}>
          START RECORDING
        </button>
      )}

      {gps.isTracking && (
        <button onClick={gps.stop}
          style={{ ...btnBase, background: T.red, color: '#fff' }}>
          STOP RECORDING
        </button>
      )}

      {!gps.isTracking && gps.points.length > 0 && !uploaded && (
        <>
          <button onClick={handleUpload} disabled={uploading}
            style={{ ...btnBase, background: T.primary, color: '#fff', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'UPLOADING...' : `UPLOAD TRACK (${gps.points.length} points)`}
          </button>
          <button onClick={gps.reset}
            style={{ ...btnBase, background: 'transparent', color: T.muted, border: `1px solid ${T.border}` }}>
            DISCARD & RESET
          </button>
        </>
      )}

      {uploaded && (
        <div style={{ ...cardStyle, borderColor: '#00AA44' }}>
          <p style={{ color: '#00AA44', fontSize: '0.8rem', fontWeight: 700, margin: '0 0 0.3rem' }}>
            Track uploaded successfully
          </p>
          <p style={{ color: T.muted, fontSize: '0.6rem', margin: 0 }}>
            Track Log ID: {trackLogId}
          </p>
          <button onClick={() => { gps.reset(); setUploaded(false); setTrackLogId(null) }}
            style={{ ...btnBase, background: T.primary, color: '#fff', marginTop: '0.75rem' }}>
            RECORD ANOTHER
          </button>
        </div>
      )}

      {uploadErr && (
        <p style={{ color: T.red, fontSize: '0.7rem', marginTop: '0.5rem' }}>{uploadErr}</p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: T.muted, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: T.textBright, fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

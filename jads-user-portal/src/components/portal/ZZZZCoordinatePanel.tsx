import React, { useState, useEffect, useRef } from 'react'
import { userApi } from '../../api/client'
import { T } from '../../theme'

interface CoordDMS {
  deg: string
  min: string
  sec: string
  hemi: string
}

interface Props {
  field: 'DEP' | 'DEST'
  onCoordinateChange: (compactCoord: string | null) => void
}

export function ZZZZCoordinatePanel({ field, onCoordinateChange }: Props) {
  const [lat, setLat] = useState<CoordDMS>({ deg: '', min: '', sec: '', hemi: 'N' })
  const [lon, setLon] = useState<CoordDMS>({ deg: '', min: '', sec: '', hemi: 'E' })
  const [error, setError] = useState<string | null>(null)
  const [display, setDisplay] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const latDeg = parseInt(lat.deg)
    const latMin = parseInt(lat.min)
    const latSec = parseInt(lat.sec)
    const lonDeg = parseInt(lon.deg)
    const lonMin = parseInt(lon.min)
    const lonSec = parseInt(lon.sec)

    if ([latDeg, latMin, latSec, lonDeg, lonMin, lonSec].some(isNaN)) {
      onCoordinateChange(null)
      setDisplay(null)
      setError(null)
      return
    }

    // Debounce the API call
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await userApi().post('/lookup/coordinates/validate', {
          latDeg, latMin, latSec, latHemi: lat.hemi,
          lonDeg, lonMin, lonSec, lonHemi: lon.hemi,
        })
        if (data.success) {
          setError(null)
          setDisplay(data.displayDMS)
          onCoordinateChange(data.compact)
        } else {
          setError(data.error || 'Invalid coordinates')
          setDisplay(null)
          onCoordinateChange(null)
        }
      } catch {
        setError('Coordinate validation failed')
        setDisplay(null)
        onCoordinateChange(null)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [lat, lon])

  const smallInput: React.CSSProperties = {
    width: '3rem', padding: '0.3rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem', textAlign: 'center',
  }
  const selectStyle: React.CSSProperties = {
    padding: '0.3rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
  }
  const dimLabel: React.CSSProperties = { fontSize: '0.6rem', color: T.muted }

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.amber}40`, borderRadius: '4px',
      padding: '0.6rem', marginTop: '0.4rem',
    }}>
      <div style={{ fontSize: '0.65rem', color: T.amber, fontWeight: 700, marginBottom: '0.4rem' }}>
        {field === 'DEP' ? 'Departure' : 'Destination'} Coordinates (ZZZZ — unlisted aerodrome)
      </div>

      {/* Latitude */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem' }}>
        <span style={dimLabel}>Lat:</span>
        <input value={lat.deg} onChange={e => setLat(l => ({ ...l, deg: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="DD" style={smallInput} />
        <span style={dimLabel}>°</span>
        <input value={lat.min} onChange={e => setLat(l => ({ ...l, min: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="MM" style={smallInput} />
        <span style={dimLabel}>'</span>
        <input value={lat.sec} onChange={e => setLat(l => ({ ...l, sec: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="SS" style={smallInput} />
        <span style={dimLabel}>"</span>
        <select value={lat.hemi} onChange={e => setLat(l => ({ ...l, hemi: e.target.value }))} style={selectStyle}>
          <option value="N">N</option>
          <option value="S">S</option>
        </select>
      </div>

      {/* Longitude */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem' }}>
        <span style={dimLabel}>Lon:</span>
        <input value={lon.deg} onChange={e => setLon(l => ({ ...l, deg: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="DDD" style={{ ...smallInput, width: '3.5rem' }} />
        <span style={dimLabel}>°</span>
        <input value={lon.min} onChange={e => setLon(l => ({ ...l, min: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="MM" style={smallInput} />
        <span style={dimLabel}>'</span>
        <input value={lon.sec} onChange={e => setLon(l => ({ ...l, sec: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="SS" style={smallInput} />
        <span style={dimLabel}>"</span>
        <select value={lon.hemi} onChange={e => setLon(l => ({ ...l, hemi: e.target.value }))} style={selectStyle}>
          <option value="E">E</option>
          <option value="W">W</option>
        </select>
      </div>

      {/* Feedback */}
      {error && <div style={{ fontSize: '0.6rem', color: T.red }}>{error}</div>}
      {display && !error && (
        <div style={{ fontSize: '0.6rem', color: '#4CAF50' }}>
          Parsed: {display}
        </div>
      )}
    </div>
  )
}

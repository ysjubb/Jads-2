import React, { useState, useMemo } from 'react'
import { T } from '../../theme'
import { INDIAN_AIRWAYS, findAirway } from '../../data/airwayData'
import { getSIDsForAirport, getSTARsForAirport } from '../../data/sidStarData'

interface RouteSegment {
  type: 'SID' | 'AIRWAY' | 'DCT' | 'STAR' | 'WAYPOINT'
  designator: string
  entry?: string
  exit?: string
  speedLevel?: string
}

interface RouteBuilderProps {
  departure?: string
  destination?: string
  onRouteChange?: (routeString: string, segments: RouteSegment[]) => void
}

const inputStyle: React.CSSProperties = {
  padding: '0.4rem', background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: '4px', color: T.textBright, fontSize: '0.7rem', fontFamily: 'inherit',
}

export function RouteBuilder({ departure = '', destination = '', onRouteChange }: RouteBuilderProps) {
  const [segments, setSegments] = useState<RouteSegment[]>([])
  const [speedLevel, setSpeedLevel] = useState('N0440F350')

  const sids = useMemo(() => getSIDsForAirport(departure), [departure])
  const stars = useMemo(() => getSTARsForAirport(destination), [destination])

  const addSegment = (type: RouteSegment['type']) => {
    setSegments(s => [...s, { type, designator: '', entry: '', exit: '' }])
  }

  const updateSegment = (idx: number, patch: Partial<RouteSegment>) => {
    setSegments(s => s.map((seg, i) => i === idx ? { ...seg, ...patch } : seg))
  }

  const removeSegment = (idx: number) => {
    setSegments(s => s.filter((_, i) => i !== idx))
  }

  const routeString = useMemo(() => {
    const parts: string[] = [speedLevel]
    for (const seg of segments) {
      if (seg.type === 'SID') parts.push(seg.designator)
      else if (seg.type === 'AIRWAY') {
        if (seg.entry) parts.push(seg.entry)
        parts.push(seg.designator)
        if (seg.exit) parts.push(seg.exit)
      }
      else if (seg.type === 'DCT') {
        parts.push('DCT')
        if (seg.designator) parts.push(seg.designator)
      }
      else if (seg.type === 'STAR') parts.push(seg.designator)
      else if (seg.type === 'WAYPOINT') parts.push(seg.designator)
    }
    return parts.filter(Boolean).join(' ')
  }, [segments, speedLevel])

  const totalDistanceNM = segments.length * 120 // Simplified estimate
  const estTimeMin = totalDistanceNM / 7.5 // ~450kt avg

  return (
    <div style={{ padding: '1rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
      <h3 style={{ color: T.primary, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Route Builder — Field 15</h3>
      <p style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.75rem' }}>
        {departure || '????'} → {destination || '????'} | Filing authority controls route selection
      </p>

      {/* Speed/Level */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ fontSize: '0.6rem', color: T.muted, fontWeight: 600 }}>SPEED / LEVEL</label>
        <input style={{ ...inputStyle, width: '150px', marginLeft: '0.5rem' }} value={speedLevel}
          onChange={e => setSpeedLevel(e.target.value.toUpperCase())} placeholder="N0440F350" />
      </div>

      {/* Segment list */}
      {segments.map((seg, idx) => (
        <div key={idx} style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem',
          padding: '0.4rem', background: T.bg, borderRadius: '4px',
        }}>
          <span style={{ fontSize: '0.6rem', color: T.amber, fontWeight: 700, width: '50px' }}>{seg.type}</span>
          {seg.type === 'SID' && (
            <select style={{ ...inputStyle, flex: 1 }} value={seg.designator} onChange={e => updateSegment(idx, { designator: e.target.value })}>
              <option value="">Select SID...</option>
              {sids.map(s => <option key={s.name} value={s.name}>{s.name} ({s.runways.join('/')})</option>)}
            </select>
          )}
          {seg.type === 'STAR' && (
            <select style={{ ...inputStyle, flex: 1 }} value={seg.designator} onChange={e => updateSegment(idx, { designator: e.target.value })}>
              <option value="">Select STAR...</option>
              {stars.map(s => <option key={s.name} value={s.name}>{s.name} ({s.runways.join('/')})</option>)}
            </select>
          )}
          {seg.type === 'AIRWAY' && (
            <>
              <input style={{ ...inputStyle, width: '70px' }} placeholder="Entry" value={seg.entry ?? ''}
                onChange={e => updateSegment(idx, { entry: e.target.value.toUpperCase() })} />
              <select style={{ ...inputStyle, width: '80px' }} value={seg.designator} onChange={e => {
                updateSegment(idx, { designator: e.target.value })
              }}>
                <option value="">AWY...</option>
                {INDIAN_AIRWAYS.map(a => (
                  <option key={a.designator} value={a.designator}>
                    {a.designator}{a.cdr ? ' (CDR)' : ''}{a.oceanic ? ' (OCN)' : ''}
                  </option>
                ))}
              </select>
              <input style={{ ...inputStyle, width: '70px' }} placeholder="Exit" value={seg.exit ?? ''}
                onChange={e => updateSegment(idx, { exit: e.target.value.toUpperCase() })} />
              {findAirway(seg.designator)?.cdr && (
                <span style={{ fontSize: '0.55rem', color: T.amber, fontWeight: 700 }}>CDR</span>
              )}
            </>
          )}
          {(seg.type === 'DCT' || seg.type === 'WAYPOINT') && (
            <input style={{ ...inputStyle, flex: 1 }} value={seg.designator} placeholder="Waypoint/Fix"
              onChange={e => updateSegment(idx, { designator: e.target.value.toUpperCase() })} />
          )}
          <button onClick={() => removeSegment(idx)} style={{
            background: 'transparent', border: `1px solid ${T.red}40`, color: T.red,
            borderRadius: '3px', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '0.6rem', fontFamily: 'inherit',
          }}>×</button>
        </div>
      ))}

      {/* Add segment buttons */}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {departure && <button onClick={() => addSegment('SID')} style={addBtnStyle}>+ SID</button>}
        <button onClick={() => addSegment('AIRWAY')} style={addBtnStyle}>+ Airway</button>
        <button onClick={() => addSegment('DCT')} style={addBtnStyle}>+ DCT</button>
        <button onClick={() => addSegment('WAYPOINT')} style={addBtnStyle}>+ Waypoint</button>
        {destination && <button onClick={() => addSegment('STAR')} style={addBtnStyle}>+ STAR</button>}
      </div>

      {/* Route output */}
      <div style={{ marginTop: '1rem', padding: '0.5rem', background: T.bg, borderRadius: '4px', fontFamily: 'monospace' }}>
        <label style={{ fontSize: '0.6rem', color: T.muted, fontWeight: 600 }}>FIELD 15 OUTPUT</label>
        <p style={{ fontSize: '0.75rem', color: T.textBright, wordBreak: 'break-all', marginTop: '0.25rem' }}>
          {routeString || '(empty)'}
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.6rem', color: T.muted }}>
          <span>Est. distance: {totalDistanceNM} NM</span>
          <span>Est. time: {Math.floor(estTimeMin / 60)}h {Math.round(estTimeMin % 60)}m</span>
        </div>
      </div>

      <button onClick={() => {
        onRouteChange?.(routeString, segments)
        navigator.clipboard?.writeText(routeString)
      }} style={{
        marginTop: '0.5rem', padding: '0.4rem 1rem', background: T.primary + '20',
        border: `1px solid ${T.primary}40`, borderRadius: '4px', color: T.primary,
        cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit',
      }}>
        Copy to Clipboard & Apply to Field 15
      </button>
    </div>
  )
}

const addBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: T.primary + '10', border: `1px solid ${T.primary}30`,
  borderRadius: '3px', color: T.primary, cursor: 'pointer', fontSize: '0.6rem', fontFamily: 'inherit',
}

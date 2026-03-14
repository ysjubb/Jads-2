import React, { useState, useMemo } from 'react'
import { T } from '../../theme'

interface TrajectoryPoint {
  lat: number
  lng: number
  altFt: number
  speedKts: number
  timestampUtc: string
  phase: 'CLIMB' | 'CRUISE' | 'DESCENT' | 'APPROACH' | 'GROUND'
}

interface TrajectoryData {
  flightId: string
  callsign: string
  adep: string
  ades: string
  points: TrajectoryPoint[]
}

// Mock trajectory: VIDP → VABB (Delhi to Mumbai)
const MOCK_TRAJECTORY: TrajectoryData = {
  flightId: 'mock-traj-001',
  callsign: 'AKJ101',
  adep: 'VIDP',
  ades: 'VABB',
  points: [
    { lat: 28.5665, lng: 77.1031, altFt: 0, speedKts: 0, timestampUtc: '2026-03-10T06:00:00Z', phase: 'GROUND' },
    { lat: 28.55, lng: 77.05, altFt: 2000, speedKts: 180, timestampUtc: '2026-03-10T06:05:00Z', phase: 'CLIMB' },
    { lat: 28.20, lng: 76.50, altFt: 15000, speedKts: 300, timestampUtc: '2026-03-10T06:15:00Z', phase: 'CLIMB' },
    { lat: 27.50, lng: 75.80, altFt: 35000, speedKts: 450, timestampUtc: '2026-03-10T06:30:00Z', phase: 'CRUISE' },
    { lat: 26.50, lng: 75.00, altFt: 35000, speedKts: 453, timestampUtc: '2026-03-10T06:50:00Z', phase: 'CRUISE' },
    { lat: 24.80, lng: 74.00, altFt: 35000, speedKts: 453, timestampUtc: '2026-03-10T07:10:00Z', phase: 'CRUISE' },
    { lat: 23.00, lng: 73.50, altFt: 35000, speedKts: 450, timestampUtc: '2026-03-10T07:25:00Z', phase: 'CRUISE' },
    { lat: 21.50, lng: 73.20, altFt: 28000, speedKts: 380, timestampUtc: '2026-03-10T07:40:00Z', phase: 'DESCENT' },
    { lat: 20.20, lng: 73.00, altFt: 15000, speedKts: 280, timestampUtc: '2026-03-10T07:50:00Z', phase: 'DESCENT' },
    { lat: 19.50, lng: 72.90, altFt: 5000, speedKts: 200, timestampUtc: '2026-03-10T07:58:00Z', phase: 'APPROACH' },
    { lat: 19.09, lng: 72.87, altFt: 0, speedKts: 0, timestampUtc: '2026-03-10T08:05:00Z', phase: 'GROUND' },
  ],
}

const PHASE_COLOR = {
  GROUND: '#888',
  CLIMB: '#FFB800',
  CRUISE: '#00AAFF',
  DESCENT: '#C850C0',
  APPROACH: '#00C864',
}

export function TrajectoryViewer() {
  const [trajectory] = useState<TrajectoryData>(MOCK_TRAJECTORY)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const maxAlt = useMemo(() => Math.max(...trajectory.points.map(p => p.altFt)), [trajectory])
  const maxSpd = useMemo(() => Math.max(...trajectory.points.map(p => p.speedKts)), [trajectory])

  const chartHeight = 200
  const chartWidth = 600

  const altPoints = trajectory.points.map((p, i) => {
    const x = (i / (trajectory.points.length - 1)) * chartWidth
    const y = chartHeight - (p.altFt / (maxAlt || 1)) * (chartHeight - 20)
    return { x, y, point: p, idx: i }
  })

  const spdPoints = trajectory.points.map((p, i) => {
    const x = (i / (trajectory.points.length - 1)) * chartWidth
    const y = chartHeight - (p.speedKts / (maxSpd || 1)) * (chartHeight - 20)
    return { x, y, point: p, idx: i }
  })

  const altPath = altPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const spdPath = spdPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  const selected = selectedIdx !== null ? trajectory.points[selectedIdx] : null

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Trajectory Viewer</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '0.5rem' }}>
        {trajectory.callsign}: {trajectory.adep} → {trajectory.ades}
      </p>

      {/* Altitude Profile */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: '4px', padding: '0.75rem', marginBottom: '0.75rem',
      }}>
        <h3 style={{ color: T.textBright, fontSize: '0.75rem', margin: '0 0 0.5rem' }}>Altitude Profile (ft)</h3>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: '200px' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={0} y1={chartHeight - f * (chartHeight - 20)} x2={chartWidth} y2={chartHeight - f * (chartHeight - 20)} stroke={T.border} strokeWidth={0.5} />
              <text x={2} y={chartHeight - f * (chartHeight - 20) - 3} fill={T.muted} fontSize={8}>
                {Math.round(f * maxAlt).toLocaleString()}
              </text>
            </g>
          ))}
          {/* Fill area */}
          <path d={`${altPath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`} fill={T.primary + '15'} />
          {/* Alt line */}
          <path d={altPath} fill="none" stroke={T.primary} strokeWidth={2} />
          {/* Speed line */}
          <path d={spdPath} fill="none" stroke={T.amber} strokeWidth={1.5} strokeDasharray="4 2" />
          {/* Data points */}
          {altPoints.map(p => (
            <circle
              key={p.idx} cx={p.x} cy={p.y} r={selectedIdx === p.idx ? 5 : 3}
              fill={PHASE_COLOR[p.point.phase]} stroke="#fff" strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedIdx(p.idx)}
            />
          ))}
        </svg>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.55rem', color: T.muted, marginTop: '4px' }}>
          <span><span style={{ color: T.primary }}>---</span> Altitude</span>
          <span><span style={{ color: T.amber }}>- -</span> Speed</span>
          {Object.entries(PHASE_COLOR).map(([phase, color]) => (
            <span key={phase}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, verticalAlign: 'middle' }} /> {phase}</span>
          ))}
        </div>
      </div>

      {/* Point details */}
      {selected && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '4px', padding: '0.75rem', marginBottom: '0.75rem',
        }}>
          <h3 style={{ color: T.textBright, fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
            Point {selectedIdx! + 1} / {trajectory.points.length}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.7rem' }}>
            {[
              ['Phase', selected.phase, PHASE_COLOR[selected.phase]],
              ['Altitude', `${selected.altFt.toLocaleString()} ft`, T.primary],
              ['Speed', `${selected.speedKts} kts`, T.amber],
              ['Lat', selected.lat.toFixed(4), T.text],
              ['Lng', selected.lng.toFixed(4), T.text],
              ['Time (UTC)', selected.timestampUtc.slice(11, 19), T.text],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <span style={{ color: T.muted, fontSize: '0.6rem' }}>{label}</span>
                <div style={{ color: color as string, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waypoint table */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: '4px', padding: '0.75rem',
      }}>
        <h3 style={{ color: T.textBright, fontSize: '0.75rem', margin: '0 0 0.5rem' }}>Waypoint Log</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted }}>
              <th style={{ padding: '3px', textAlign: 'left' }}>#</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Time (UTC)</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Lat</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Lng</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Alt (ft)</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Spd (kts)</th>
              <th style={{ padding: '3px', textAlign: 'left' }}>Phase</th>
            </tr>
          </thead>
          <tbody>
            {trajectory.points.map((p, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: `1px solid ${T.border}08`,
                  background: selectedIdx === i ? T.primary + '10' : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedIdx(i)}
              >
                <td style={{ padding: '3px', color: T.muted }}>{i + 1}</td>
                <td style={{ padding: '3px' }}>{p.timestampUtc.slice(11, 19)}</td>
                <td style={{ padding: '3px' }}>{p.lat.toFixed(4)}</td>
                <td style={{ padding: '3px' }}>{p.lng.toFixed(4)}</td>
                <td style={{ padding: '3px', color: T.primary }}>{p.altFt.toLocaleString()}</td>
                <td style={{ padding: '3px', color: T.amber }}>{p.speedKts}</td>
                <td style={{ padding: '3px' }}>
                  <span style={{ color: PHASE_COLOR[p.phase], fontWeight: 600 }}>{p.phase}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

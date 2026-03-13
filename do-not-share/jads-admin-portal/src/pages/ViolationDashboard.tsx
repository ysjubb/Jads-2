// INT-09 — Admin Portal: Dual Violation Dashboard
// Tab 1: Aircraft FPL Conflicts — table of deconfliction advisories
// Tab 2: Drone Track Violations — table of drone violation records
// Status colors: UNREVIEWED=amber, UNDER_REVIEW=blue, ACTIONED=green, DISMISSED=grey

import React, { useEffect, useState } from 'react'
import { useAdminAuth } from '../hooks/useAdminAuth'
import { T } from '../theme'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface FPLConflict {
  id: string
  callsign: string
  departure: string
  destination: string
  eobt: string
  cruisingLevel: string
  conflictFlags: any[]
}

interface DroneViolation {
  id: string
  missionId: string
  violationType: string
  severity: string
  description: string
  detectedAt: string
  reviewStatus: string
}

const STATUS_COLORS: Record<string, string> = {
  UNREVIEWED:   '#FFB800',
  UNDER_REVIEW: '#3B82F6',
  ACTIONED:     '#22C55E',
  DISMISSED:    '#6B7280',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? T.muted
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
      background: color + '20', color, border: `1px solid ${color}40`,
    }}>
      {status}
    </span>
  )
}

export function ViolationDashboard() {
  const { token } = useAdminAuth()
  const [tab, setTab] = useState<'fpl' | 'drone'>('fpl')
  const [fplConflicts, setFplConflicts] = useState<FPLConflict[]>([])
  const [droneViolations, setDroneViolations] = useState<DroneViolation[]>([])
  const [loading, setLoading] = useState(true)
  const [modalFpl, setModalFpl] = useState<FPLConflict | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-JADS-Version': '4.0',
    }

    Promise.all([
      fetch(`${API}/api/fpl/list?status=FILED`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/audit/violations`, { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([fpls, violations]) => {
      // Filter FPLs that have conflict flags
      const conflicted = (fpls as any[]).filter(f =>
        f.conflictFlags && (Array.isArray(f.conflictFlags) ? f.conflictFlags.length > 0 : true)
      )
      setFplConflicts(conflicted)
      setDroneViolations(Array.isArray(violations) ? violations : violations?.data ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [token])

  const fplCount = fplConflicts.length
  const droneCount = droneViolations.length

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.6rem 1.2rem', border: 'none', cursor: 'pointer',
    background: active ? T.primary + '20' : 'transparent',
    color: active ? T.primary : T.muted,
    borderBottom: active ? `2px solid ${T.primary}` : '2px solid transparent',
    fontWeight: 600, fontSize: '0.8rem',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  })

  return (
    <div style={{ padding: '1.5rem', fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ color: T.text, fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 700 }}>
        VIOLATION DASHBOARD
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: '1rem' }}>
        <button style={tabStyle(tab === 'fpl')} onClick={() => setTab('fpl')}>
          Aircraft FPL Conflicts
          {fplCount > 0 && (
            <span style={{
              background: '#FFB800', color: '#000', borderRadius: '10px',
              padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700,
            }}>{fplCount}</span>
          )}
        </button>
        <button style={tabStyle(tab === 'drone')} onClick={() => setTab('drone')}>
          Drone Track Violations
          {droneCount > 0 && (
            <span style={{
              background: '#FF3B3B', color: '#fff', borderRadius: '10px',
              padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700,
            }}>{droneCount}</span>
          )}
        </button>
      </div>

      {loading && <div style={{ color: T.muted, padding: '2rem' }}>Loading...</div>}

      {/* Tab 1: FPL Conflicts */}
      {!loading && tab === 'fpl' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {['Callsign', 'Dep', 'Dest', 'EOBT', 'Level', 'Conflicts', 'Action'].map(h => (
                <th key={h} style={{
                  padding: '0.5rem', textAlign: 'left', color: T.muted,
                  fontWeight: 600, fontSize: '0.7rem',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fplConflicts.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', color: T.muted, textAlign: 'center' }}>
                No FPL conflicts detected
              </td></tr>
            )}
            {fplConflicts.map(f => (
              <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}10` }}>
                <td style={{ padding: '0.5rem', color: T.text, fontWeight: 600 }}>{f.callsign}</td>
                <td style={{ padding: '0.5rem', color: T.text }}>{f.departure}</td>
                <td style={{ padding: '0.5rem', color: T.text }}>{f.destination}</td>
                <td style={{ padding: '0.5rem', color: T.muted }}>
                  {new Date(f.eobt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td style={{ padding: '0.5rem', color: T.text }}>{f.cruisingLevel}</td>
                <td style={{ padding: '0.5rem' }}>
                  <StatusBadge status="UNREVIEWED" />
                  <span style={{ marginLeft: '0.3rem', color: T.muted, fontSize: '0.7rem' }}>
                    {Array.isArray(f.conflictFlags) ? f.conflictFlags.length : 0} advisory
                  </span>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <button
                    onClick={() => setModalFpl(f)}
                    style={{
                      padding: '3px 10px', border: `1px solid ${T.primary}40`,
                      background: T.primary + '10', color: T.primary,
                      borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                    }}>
                    Issue Advisory
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tab 2: Drone Violations */}
      {!loading && tab === 'drone' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {['Mission ID', 'Type', 'Severity', 'Description', 'Detected', 'Status', 'Action'].map(h => (
                <th key={h} style={{
                  padding: '0.5rem', textAlign: 'left', color: T.muted,
                  fontWeight: 600, fontSize: '0.7rem',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {droneViolations.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', color: T.muted, textAlign: 'center' }}>
                No drone violations recorded
              </td></tr>
            )}
            {droneViolations.map(v => (
              <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}10` }}>
                <td style={{ padding: '0.5rem', color: T.text, fontWeight: 600 }}>
                  {v.missionId?.slice(0, 12) ?? '—'}
                </td>
                <td style={{ padding: '0.5rem', color: T.text }}>{v.violationType}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{
                    color: v.severity === 'CRITICAL' ? '#FF3B3B' : '#FFB800',
                    fontWeight: 600,
                  }}>{v.severity}</span>
                </td>
                <td style={{ padding: '0.5rem', color: T.muted, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.description}
                </td>
                <td style={{ padding: '0.5rem', color: T.muted }}>
                  {v.detectedAt ? new Date(v.detectedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <StatusBadge status={v.reviewStatus ?? 'UNREVIEWED'} />
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <button style={{
                    padding: '3px 10px', border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.text,
                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem',
                  }}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Issue Advisory Modal */}
      {modalFpl && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setModalFpl(null)}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px',
            padding: '1.5rem', width: '480px', maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: T.text, fontSize: '1rem', marginBottom: '1rem' }}>
              Issue Advisory Notice — {modalFpl.callsign}
            </h3>
            <p style={{ color: T.muted, fontSize: '0.8rem', marginBottom: '1rem' }}>
              Route: {modalFpl.departure} → {modalFpl.destination} at {modalFpl.cruisingLevel}
              <br />
              EOBT: {new Date(modalFpl.eobt).toISOString()}
              <br />
              Conflicts: {Array.isArray(modalFpl.conflictFlags) ? modalFpl.conflictFlags.length : 0} drone operation(s)
            </p>
            <textarea
              placeholder="Advisory notice text (manual dispatch)..."
              style={{
                width: '100%', height: '80px', background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: '4px', color: T.text, padding: '0.5rem', fontSize: '0.8rem',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalFpl(null)} style={{
                padding: '6px 16px', border: `1px solid ${T.border}`, background: 'transparent',
                color: T.muted, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
              }}>Cancel</button>
              <button onClick={() => { setModalFpl(null) }} style={{
                padding: '6px 16px', border: 'none', background: T.primary,
                color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
              }}>Issue Advisory</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

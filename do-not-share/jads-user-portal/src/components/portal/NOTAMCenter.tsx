import React, { useState, useMemo } from 'react'
import { T } from '../../theme'
import { SAMPLE_NOTAMS } from '../../data/sampleNotams'
import { isNOTAMActiveNow, parseQCode } from '../../utils/notamParser'
import type { ParsedNOTAM } from '../../utils/notamParser'

const SEVERITY_COLOR = { INFO: T.muted, ADVISORY: T.amber, RESTRICTIVE: T.red }
const TYPE_COLOR: Record<string, string> = {
  'Aerodrome': '#40A0FF', 'Restricted Area': T.red, 'Navigation Aid': '#FF8833',
  'Communications': '#FFC800', 'Warning Area': '#9933CC', 'ILS': T.amber,
  'Taxiway': '#40A0FF', 'Lighting': T.muted,
}

export function NOTAMCenter() {
  const [filter, setFilter] = useState({ airport: '', severity: '' as '' | 'INFO' | 'ADVISORY' | 'RESTRICTIVE' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const notams = useMemo(() => {
    return SAMPLE_NOTAMS.filter(n => {
      if (filter.airport && n.airport !== filter.airport && n.fir !== filter.airport) return false
      if (filter.severity && n.severity !== filter.severity) return false
      return true
    })
  }, [filter])

  const activeCount = notams.filter(isNOTAMActiveNow).length

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.25rem' }}>NOTAM Center</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        {activeCount} active NOTAMs | Route Impact Analysis
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.6rem', color: T.muted }}>Airport/FIR</label>
          <input style={{
            marginLeft: '0.4rem', padding: '0.35rem', background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: '4px', color: T.textBright,
            fontSize: '0.7rem', fontFamily: 'inherit', width: '80px',
          }} value={filter.airport} onChange={e => setFilter(f => ({ ...f, airport: e.target.value.toUpperCase() }))} placeholder="VIDP" />
        </div>
        <div>
          <label style={{ fontSize: '0.6rem', color: T.muted }}>Severity</label>
          <select style={{
            marginLeft: '0.4rem', padding: '0.35rem', background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: '4px', color: T.textBright,
            fontSize: '0.7rem', fontFamily: 'inherit',
          }} value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value as any }))}>
            <option value="">All</option>
            <option value="RESTRICTIVE">Restrictive</option>
            <option value="ADVISORY">Advisory</option>
            <option value="INFO">Info</option>
          </select>
        </div>
      </div>

      {/* NOTAM Feed */}
      {notams.map(n => {
        const parsed = parseQCode(n.qCode)
        const isActive = isNOTAMActiveNow(n)
        const isExpanded = expandedId === n.id
        const isAcked = acknowledged.has(n.id)

        return (
          <div key={n.id} style={{
            marginBottom: '0.5rem', padding: '0.6rem', background: T.surface,
            border: `1px solid ${isActive ? SEVERITY_COLOR[n.severity] + '40' : T.border}`,
            borderLeft: `3px solid ${SEVERITY_COLOR[n.severity]}`,
            borderRadius: '4px', opacity: isActive ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setExpandedId(isExpanded ? null : n.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '1px 5px', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700,
                  background: SEVERITY_COLOR[n.severity] + '20', color: SEVERITY_COLOR[n.severity],
                }}>{n.severity}</span>
                <span style={{ fontSize: '0.7rem', color: T.primary, fontWeight: 600 }}>{n.id}</span>
                <span style={{
                  fontSize: '0.6rem', padding: '1px 4px', borderRadius: '2px',
                  background: (TYPE_COLOR[parsed.subject] ?? T.muted) + '20',
                  color: TYPE_COLOR[parsed.subject] ?? T.muted,
                }}>{parsed.subject}</span>
                {n.airport && <span style={{ fontSize: '0.6rem', color: T.muted }}>{n.airport}</span>}
                {!isActive && <span style={{ fontSize: '0.55rem', color: T.muted }}>(inactive)</span>}
              </div>
              <span style={{ fontSize: '0.6rem', color: T.muted }}>{isExpanded ? '▲' : '▼'}</span>
            </div>
            {isExpanded && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.65rem' }}>
                <p style={{ color: T.textBright, lineHeight: 1.4, marginBottom: '0.4rem' }}>{n.text}</p>
                <div style={{ display: 'flex', gap: '1rem', color: T.muted, fontSize: '0.6rem' }}>
                  <span>Q-code: {n.qCode} ({parsed.subject} — {parsed.condition})</span>
                  <span>Valid: {new Date(n.validFrom).toLocaleDateString()} – {new Date(n.validTo).toLocaleDateString()}</span>
                </div>
                <button onClick={(e) => {
                  e.stopPropagation()
                  setAcknowledged(s => new Set([...s, n.id]))
                }} disabled={isAcked} style={{
                  marginTop: '0.4rem', padding: '0.3rem 0.6rem',
                  background: isAcked ? '#00C86420' : T.primary + '15',
                  border: `1px solid ${isAcked ? '#00C864' : T.primary}40`,
                  borderRadius: '3px', color: isAcked ? '#00C864' : T.primary,
                  cursor: isAcked ? 'default' : 'pointer', fontSize: '0.6rem', fontFamily: 'inherit',
                }}>
                  {isAcked ? 'Noted ✓' : 'Mark Noted'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

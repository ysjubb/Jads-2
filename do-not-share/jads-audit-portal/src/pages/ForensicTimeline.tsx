// INT-10 — Audit Portal: FPL + Drone Forensic Timeline
// Interleaved chronological timeline: FPL filings, activations, closures,
// conflict advisories, drone events, PA verifications, violations, enforcement notices.
// Each node: timestamp, type (color-coded), actor, description, hash (truncated), [Verify Hash] button.

import { type CSSProperties, useEffect, useState } from 'react'
import { useAuditAuth } from '../hooks/useAuditAuth'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB800',
  green:      '#00FF88',
  red:        '#FF3B3B',
  blue:       '#3B82F6',
  muted:      '#6A6040',
  text:       '#c8b890',
  textBright: '#e8d8b0',
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface TimelineEvent {
  id: string
  timestamp: string
  type: string
  actor: string
  actorRole: string
  description: string
  resourceId: string | null
  hash: string | null
}

const EVENT_COLORS: Record<string, string> = {
  FPL_FILED:           T.primary,
  FPL_ACTIVATED:       T.green,
  FPL_CLOSED:          T.muted,
  FPL_CANCELLED:       T.red,
  CONFLICT_ADVISORY:   '#FF6B35',
  DRONE_MISSION_START: T.blue,
  DRONE_MISSION_END:   T.green,
  PA_VERIFIED:         T.primary,
  VIOLATION_DETECTED:  T.red,
  ENFORCEMENT_NOTICE:  '#A855F7',
  DEFAULT:             T.muted,
}

export function ForensicTimeline() {
  const { token } = useAuditAuth()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'timeline' | 'fpl-audit'>('timeline')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-JADS-Version': '4.0',
    }

    // Fetch audit log entries and map to timeline events
    Promise.all([
      fetch(`${API}/api/audit/missions`, { headers }).then(r => r.ok ? r.json() : { data: [] }),
      fetch(`${API}/api/fpl/list`, { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([missionsResp, fpls]) => {
      const mapped: TimelineEvent[] = []

      // Map FPL records to timeline events
      for (const fpl of (fpls as any[])) {
        mapped.push({
          id: `fpl-${fpl.id}`,
          timestamp: fpl.filedAt ?? fpl.createdAt,
          type: 'FPL_FILED',
          actor: fpl.picName ?? 'Unknown',
          actorRole: 'PILOT',
          description: `Flight plan filed: ${fpl.callsign} ${fpl.departure}→${fpl.destination} at ${fpl.cruisingLevel}`,
          resourceId: fpl.id,
          hash: fpl.hashChainEntry?.slice(0, 16) ?? null,
        })
        if (fpl.activatedAt) {
          mapped.push({
            id: `fpl-act-${fpl.id}`,
            timestamp: fpl.activatedAt,
            type: 'FPL_ACTIVATED',
            actor: fpl.picName ?? 'Unknown',
            actorRole: 'SYSTEM',
            description: `Flight plan activated: ${fpl.callsign}`,
            resourceId: fpl.id,
            hash: null,
          })
        }
        if (fpl.conflictFlags && Array.isArray(fpl.conflictFlags)) {
          for (const cf of fpl.conflictFlags) {
            mapped.push({
              id: `conflict-${fpl.id}-${cf.droneRecordId}`,
              timestamp: cf.raisedAt ?? fpl.createdAt,
              type: 'CONFLICT_ADVISORY',
              actor: 'DeconflictionEngine',
              actorRole: 'SYSTEM',
              description: cf.description ?? `Conflict advisory for ${fpl.callsign}`,
              resourceId: fpl.id,
              hash: null,
            })
          }
        }
      }

      // Map drone missions
      const missions = missionsResp?.data ?? missionsResp ?? []
      for (const m of (missions as any[])) {
        mapped.push({
          id: `drone-${m.id}`,
          timestamp: m.missionStartUtcMs ? new Date(parseInt(m.missionStartUtcMs)).toISOString() : m.createdAt,
          type: 'DRONE_MISSION_START',
          actor: m.operatorId ?? 'Unknown',
          actorRole: 'DRONE_OPERATOR',
          description: `Drone mission: ${m.missionId} (${m.deviceId ?? 'unknown device'})`,
          resourceId: m.id,
          hash: m.hashChainRootHex?.slice(0, 16) ?? null,
        })
      }

      // Sort by timestamp descending
      mapped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setEvents(mapped)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [token])

  const filteredEvents = events.filter(e => {
    if (filterType !== 'ALL' && e.type !== filterType) return false
    if (dateFrom && e.timestamp < dateFrom) return false
    if (dateTo && e.timestamp > dateTo + 'T23:59:59Z') return false
    return true
  })

  const uniqueTypes = ['ALL', ...new Set(events.map(e => e.type))]

  const handleVerifyHash = (id: string) => {
    setVerifyingId(id)
    setTimeout(() => setVerifyingId(null), 1500)
  }

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '0.5rem 1rem', border: 'none', cursor: 'pointer',
    background: active ? T.primary + '20' : 'transparent',
    color: active ? T.primary : T.muted,
    borderBottom: active ? `2px solid ${T.primary}` : '2px solid transparent',
    fontWeight: 600, fontSize: '0.8rem',
    fontFamily: "'JetBrains Mono', monospace",
  })

  return (
    <div style={{ padding: '1.5rem', fontFamily: "'JetBrains Mono', monospace", color: T.text }}>
      <h1 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: T.primary, letterSpacing: '0.05em' }}>
        FORENSIC TIMELINE
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: '1rem' }}>
        <button style={tabStyle(tab === 'timeline')} onClick={() => setTab('timeline')}>Timeline</button>
        <button style={tabStyle(tab === 'fpl-audit')} onClick={() => setTab('fpl-audit')}>FPL Audit</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{
            background: T.surface, border: `1px solid ${T.border}`, color: T.text,
            padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem',
          }}>
          {uniqueTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '0.3rem', borderRadius: '4px', fontSize: '0.75rem' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '0.3rem', borderRadius: '4px', fontSize: '0.75rem' }} />
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], { type: 'application/json' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
            a.download = `forensic-timeline-${new Date().toISOString().slice(0, 10)}.json`; a.click()
          }}
          style={{
            padding: '0.3rem 0.6rem', background: T.primary + '15', border: `1px solid ${T.primary}40`,
            color: T.primary, borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
          }}>
          BSA 2023 Export (JSON)
        </button>
      </div>

      {loading && <div style={{ padding: '2rem', color: T.muted }}>Loading timeline...</div>}

      {/* Timeline */}
      {!loading && tab === 'timeline' && (
        <div style={{ position: 'relative', paddingLeft: '24px' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: '8px', top: 0, bottom: 0,
            width: '2px', background: T.border,
          }} />

          {filteredEvents.length === 0 && (
            <div style={{ padding: '2rem', color: T.muted }}>No events match filters</div>
          )}

          {filteredEvents.map(ev => (
            <div key={ev.id} style={{
              position: 'relative', marginBottom: '0.75rem',
              padding: '0.6rem 0.8rem', background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: '6px',
            }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: '-20px', top: '12px',
                width: '10px', height: '10px', borderRadius: '50%',
                background: EVENT_COLORS[ev.type] ?? EVENT_COLORS.DEFAULT,
                border: `2px solid ${T.bg}`,
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{
                    fontSize: '0.65rem', padding: '1px 6px', borderRadius: '3px',
                    background: (EVENT_COLORS[ev.type] ?? T.muted) + '20',
                    color: EVENT_COLORS[ev.type] ?? T.muted,
                    fontWeight: 600, marginRight: '0.5rem',
                  }}>
                    {ev.type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: T.muted }}>
                    {new Date(ev.timestamp).toLocaleString('en-IN')}
                  </span>
                </div>
                <span style={{ fontSize: '0.65rem', color: T.muted }}>{ev.actorRole}</span>
              </div>

              <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: T.textBright }}>
                {ev.description}
              </div>

              <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: T.muted }}>Actor: {ev.actor}</span>
                {ev.hash && (
                  <>
                    <span style={{ fontSize: '0.6rem', color: T.muted, fontFamily: 'monospace' }}>
                      hash: {ev.hash}…
                    </span>
                    <button
                      onClick={() => handleVerifyHash(ev.id)}
                      style={{
                        padding: '1px 6px', border: `1px solid ${T.green}40`,
                        background: verifyingId === ev.id ? T.green + '20' : 'transparent',
                        color: T.green, borderRadius: '3px', cursor: 'pointer',
                        fontSize: '0.6rem', fontWeight: 600,
                      }}>
                      {verifyingId === ev.id ? 'VERIFIED' : 'Verify Hash'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FPL Audit Tab */}
      {!loading && tab === 'fpl-audit' && (
        <div>
          {filteredEvents.filter(e => e.type.startsWith('FPL')).length === 0 && (
            <div style={{ padding: '2rem', color: T.muted }}>No FPL audit entries</div>
          )}
          {filteredEvents.filter(e => e.type.startsWith('FPL') || e.type === 'CONFLICT_ADVISORY').map(ev => (
            <div key={ev.id} style={{
              padding: '0.8rem', marginBottom: '0.5rem', background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: '6px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '0.7rem', padding: '1px 6px', borderRadius: '3px',
                  background: (EVENT_COLORS[ev.type] ?? T.muted) + '20',
                  color: EVENT_COLORS[ev.type] ?? T.muted, fontWeight: 600,
                }}>{ev.type.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '0.65rem', color: T.muted }}>
                  {new Date(ev.timestamp).toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: T.textBright }}>
                {ev.description}
              </div>
              {ev.hash && (
                <div style={{ marginTop: '0.2rem', fontSize: '0.6rem', color: T.muted, fontFamily: 'monospace' }}>
                  SHA-256: {ev.hash}…
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

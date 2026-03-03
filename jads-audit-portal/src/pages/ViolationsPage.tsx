import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate }              from 'react-router-dom'
import { useAuditAuth, auditAxios } from '../hooks/useAuditAuth'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB800',
  green:      '#00FF88',
  red:        '#FF3B3B',
  muted:      '#6A6040',
  text:       '#c8b890',
  textBright: '#e8d8b0',
}

interface Violation {
  id: string
  missionDbId: string
  sequence: string
  violationType: string
  severity: string
  timestampUtcMs: string
  detailJson: string
}

const SEVERITY_COLOUR: Record<string, string> = {
  CRITICAL: '#FF3B3B', HIGH: '#FFB800', MEDIUM: '#FFB800', LOW: '#6A6040', WARNING: '#FFB800'
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: '#FF3B3B' + '15', HIGH: '#FFB800' + '15', MEDIUM: '#FFB800' + '10',
  LOW: '#6A6040' + '15', WARNING: '#FFB800' + '10'
}

export function ViolationsPage() {
  const { token, logout }             = useAuditAuth()
  const navigate                      = useNavigate()
  const [violations, setViolations]   = useState<Violation[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [scopeApplied, setScope]      = useState('')
  const [retrievedAt, setRetrievedAt] = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const fetchViolations = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: any = { page, limit: 25 }
      if (filterType)     params.violationType = filterType
      if (filterSeverity) params.severity      = filterSeverity

      const { data } = await auditAxios(token).get('/violations', { params })
      setViolations(data.violations ?? [])
      setTotal(data.total ?? 0)
      setScope(data.scope_applied ?? '')
      setRetrievedAt(data.retrieved_at_utc ?? '')
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      if (e.response?.status === 403) {
        setError(e.response.data?.message ?? 'ACCESS_DENIED'); return
      }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, filterType, filterSeverity, logout])

  useEffect(() => { fetchViolations() }, [fetchViolations])

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>Violations</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {scopeApplied && (
            <span style={{ fontSize: '0.8rem', background: T.primary + '15',
              border: `1px solid ${T.primary}40`, color: T.primary,
              padding: '0.2rem 0.6rem', borderRadius: '4px',
              fontFamily: "'JetBrains Mono', monospace" }}>
              Scope: {scopeApplied}
            </span>
          )}
          {retrievedAt && (
            <span style={{ fontSize: '0.75rem', color: T.muted,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Retrieved: {retrievedAt}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.85rem', outline: 'none' }}>
          <option value="">All types</option>
          <option value="AGL_EXCEEDED">AGL Exceeded</option>
          <option value="GEOFENCE_BREACH">Geofence Breach</option>
          <option value="ZONE_INCURSION">Zone Incursion</option>
          <option value="GNSS_REJECTED">GNSS Rejected</option>
        </select>
        <select value={filterSeverity}
          onChange={e => { setFilterSeverity(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.85rem', outline: 'none' }}>
          <option value="">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="WARNING">Warning</option>
          <option value="LOW">Low</option>
        </select>
        <button onClick={fetchViolations}
          style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface,
            color: T.text, fontSize: '0.85rem',
            fontFamily: "'JetBrains Mono', monospace" }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, padding: '1rem',
        fontFamily: "'JetBrains Mono', monospace" }}>Loading violations...</div>}
      {!loading && !error && violations.length === 0 && (
        <div style={{ color: T.muted, padding: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>No violations found.</div>
      )}

      {!loading && violations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {violations.map(v => (
            <div key={v.id}
              onClick={() => navigate(`/missions/${v.missionDbId}`)}
              style={{ background: SEVERITY_BG[v.severity] ?? T.surface,
                border: `1px solid ${SEVERITY_COLOUR[v.severity] ?? T.border}40`,
                borderLeft: `4px solid ${SEVERITY_COLOUR[v.severity] ?? T.border}`,
                borderRadius: '6px', padding: '0.75rem 1rem', cursor: 'pointer',
                display: 'flex', gap: '1.5rem', alignItems: 'flex-start',
                boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
              <div style={{ minWidth: '120px' }}>
                <div style={{ fontWeight: 700, color: SEVERITY_COLOUR[v.severity],
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  {v.severity}
                </div>
                <div style={{ fontSize: '0.8rem', color: T.text,
                  fontFamily: "'JetBrains Mono', monospace" }}>{v.violationType}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace", color: T.text }}>
                  Mission: {v.missionDbId}
                </div>
                <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: '0.2rem',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  Seq {v.sequence} ·{' '}
                  {new Date(parseInt(v.timestampUtcMs)).toISOString().replace('T', ' ').slice(0, 19)} UTC
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace",
                color: T.muted, maxWidth: '300px', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.detailJson}
              </div>
              <div style={{ fontSize: '0.75rem', color: T.primary, whiteSpace: 'nowrap',
                fontFamily: "'JetBrains Mono', monospace" }}>
                View mission
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
          Prev
        </button>
        <span style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
          Page {page} · {total} total violations
        </span>
        <button disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page * 25 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 25 >= total ? 0.5 : 1,
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
          Next
        </button>
      </div>
    </div>
  )
}

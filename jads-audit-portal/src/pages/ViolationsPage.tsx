import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate }              from 'react-router-dom'
import { useAuditAuth, auditAxios } from '../hooks/useAuditAuth'

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
  CRITICAL: '#cf1322', HIGH: '#d46b08', MEDIUM: '#d4b106', LOW: '#389e0d', WARNING: '#d48806'
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: '#fff2f0', HIGH: '#fff7e6', MEDIUM: '#feffe6', LOW: '#f6ffed', WARNING: '#fffbe6'
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
        <h2 style={{ margin: 0 }}>Violations</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {scopeApplied && (
            <span style={{ fontSize: '0.8rem', background: '#e6f7ff',
              border: '1px solid #91d5ff', color: '#0050b3',
              padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              Scope: {scopeApplied}
            </span>
          )}
          {retrievedAt && (
            <span style={{ fontSize: '0.75rem', color: '#8c8c8c' }}>
              Retrieved: {retrievedAt}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
          <option value="">All types</option>
          <option value="AGL_EXCEEDED">AGL Exceeded</option>
          <option value="GEOFENCE_BREACH">Geofence Breach</option>
          <option value="ZONE_INCURSION">Zone Incursion</option>
          <option value="GNSS_REJECTED">GNSS Rejected</option>
        </select>
        <select value={filterSeverity}
          onChange={e => { setFilterSeverity(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
          <option value="">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="WARNING">Warning</option>
          <option value="LOW">Low</option>
        </select>
        <button onClick={fetchViolations}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid #d9d9d9',
            borderRadius: '4px', cursor: 'pointer', background: 'white', fontSize: '0.85rem' }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: '#cf1322', padding: '0.75rem', background: '#fff2f0',
          border: '1px solid #ffccc7', borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#8c8c8c', padding: '1rem' }}>Loading violations…</div>}
      {!loading && !error && violations.length === 0 && (
        <div style={{ color: '#8c8c8c', padding: '1rem' }}>No violations found.</div>
      )}

      {!loading && violations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {violations.map(v => (
            <div key={v.id}
              onClick={() => navigate(`/missions/${v.missionDbId}`)}
              style={{ background: SEVERITY_BG[v.severity] ?? 'white',
                border: `1px solid ${SEVERITY_COLOUR[v.severity] ?? '#d9d9d9'}`,
                borderLeft: `4px solid ${SEVERITY_COLOUR[v.severity] ?? '#d9d9d9'}`,
                borderRadius: '6px', padding: '0.75rem 1rem', cursor: 'pointer',
                display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              <div style={{ minWidth: '120px' }}>
                <div style={{ fontWeight: 700, color: SEVERITY_COLOUR[v.severity] }}>
                  {v.severity}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#595959' }}>{v.violationType}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#595959' }}>
                  Mission: {v.missionDbId}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#8c8c8c', marginTop: '0.2rem' }}>
                  Seq {v.sequence} ·{' '}
                  {new Date(parseInt(v.timestampUtcMs)).toISOString().replace('T', ' ').slice(0, 19)} UTC
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace',
                color: '#8c8c8c', maxWidth: '300px', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.detailJson}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1890ff', whiteSpace: 'nowrap' }}>
                View mission →
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <span style={{ color: '#595959' }}>Page {page} · {total} total violations</span>
        <button disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page * 25 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 25 >= total ? 0.5 : 1 }}>
          Next
        </button>
      </div>
    </div>
  )
}

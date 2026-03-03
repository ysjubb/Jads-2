import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

const T = {
  bg:       '#050A08',
  surface:  '#0A120E',
  border:   '#1A3020',
  primary:  '#00FF88',
  amber:    '#FFB800',
  red:      '#FF3B3B',
  muted:    '#4A7A5A',
  text:     '#b0c8b8',
  textBright: '#d0e8d8',
}

interface AirspaceVersion {
  id: string
  dataType: string
  approvalStatus: string
  effectiveFrom: string
  changeReason: string
  airacCycle: string | null
  createdBy: string
  createdAt: string
}

const STATUS_COLOUR: Record<string, string> = {
  ACTIVE:   T.primary,
  PENDING:  T.amber,
  DRAFT:    T.primary,
  EXPIRED:  T.muted,
  REJECTED: T.red,
}

export function AirspacePage() {
  const { token, logout } = useAdminAuth()
  const [versions, setVersions] = useState<AirspaceVersion[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [dataType, setDataType] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const fetchVersions = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, any> = { page, limit: 30 }
      if (dataType) params.dataType = dataType
      const { data } = await adminAxios(token).get('/airspace/versions', { params })
      setVersions(data.versions)
      setTotal(data.total)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, dataType, logout])

  useEffect(() => { fetchVersions() }, [fetchVersions])

  const approve = async (versionId: string) => {
    if (!token) return
    if (!window.confirm('Approve this airspace version? This will make it ACTIVE.')) return
    try {
      await adminAxios(token).patch(`/airspace/versions/${versionId}/approve`)
      fetchVersions()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'APPROVE_FAILED')
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, color: T.textBright }}>Airspace Versions</h2>
        <span style={{ fontSize: '0.8rem', color: T.muted }}>{total} total</span>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={dataType}
          onChange={e => { setDataType(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text }}
        >
          <option value="">All types</option>
          <option value="WAYPOINTS">Waypoints</option>
          <option value="AIRWAYS">Airways</option>
          <option value="DRONE_ZONES">Drone Zones</option>
          <option value="NOTAMS">NOTAMs</option>
          <option value="FIR_BOUNDARIES">FIR Boundaries</option>
        </select>
      </div>

      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, marginBottom: '1rem' }}>Loading...</div>}
      {!loading && !error && versions.length === 0 && (
        <div style={{ color: T.muted, padding: '2rem', textAlign: 'center' }}>No airspace versions found.</div>
      )}

      {!loading && versions.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: T.surface, borderBottom: `2px solid ${T.border}` }}>
              {['Type', 'Status', 'Effective From', 'AIRAC', 'Reason', 'Created By', 'Created At', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: T.textBright }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map(v => (
              <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '0.5rem 0.75rem', color: T.text }}>{v.dataType}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{ color: STATUS_COLOUR[v.approvalStatus] ?? T.muted, fontWeight: 500 }}>
                    {v.approvalStatus}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: T.text }}>
                  {new Date(v.effectiveFrom).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: T.text }}>{v.airacCycle ?? '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem', maxWidth: '200px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>
                  {v.changeReason}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: T.text }}>
                  {v.createdBy.slice(0, 8)}...
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: T.text }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  {v.approvalStatus === 'PENDING' && (
                    <button
                      onClick={() => approve(v.id)}
                      style={{ padding: '0.2rem 0.5rem', background: T.primary + '15',
                        border: `1px solid ${T.primary}40`, color: T.primary,
                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Prev
        </button>
        <span style={{ color: T.text }}>Page {page} · {total} total</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page * 30 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 30 >= total ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Next
        </button>
      </div>
    </div>
  )
}

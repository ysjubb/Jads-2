import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate }              from 'react-router-dom'
import { useAuditAuth, auditAxios } from '../hooks/useAuditAuth'

interface Mission {
  id: string
  missionId: string
  npntClassification: string
  missionStartUtcMs: string
  missionEndUtcMs: string | null
  ntpSyncStatus: string
  certValidAtStart: boolean
  chainVerifiedByServer: boolean
  uploadedAt: string
  _count: { telemetryRecords: number; violations: number }
}

function fmtMs(ms: string) {
  return new Date(parseInt(ms)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

const NPNT_COLOUR: Record<string, string> = {
  GREEN: '#389e0d', YELLOW: '#d48806', RED: '#cf1322'
}
const NTP_COLOUR = (s: string) => s === 'SYNCED' ? '#389e0d' : '#d48806'

export function MissionsPage() {
  const { token, logout }          = useAuditAuth()
  const navigate                   = useNavigate()
  const [missions, setMissions]    = useState<Mission[]>([])
  const [total, setTotal]          = useState(0)
  const [page, setPage]            = useState(1)
  const [scopeApplied, setScope]   = useState('')
  const [retrievedAt, setRetrievedAt] = useState('')
  const [loading, setLoading]      = useState(false)
  const [error, setError]          = useState<string | null>(null)

  const fetchMissions = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const { data } = await auditAxios(token).get('/missions', {
        params: { page, limit: 20 }
      })
      setMissions(data.missions ?? [])
      setTotal(data.total ?? 0)
      setScope(data.scope_applied ?? '')
      setRetrievedAt(data.retrieved_at_utc ?? '')
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      if (e.response?.status === 403) {
        setError(e.response.data?.message ?? e.response.data?.error ?? 'ACCESS_DENIED')
        return
      }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, logout])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Drone Missions</h2>
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
          <button onClick={fetchMissions}
            style={{ padding: '0.25rem 0.75rem', border: '1px solid #d9d9d9',
              borderRadius: '4px', cursor: 'pointer', background: 'white',
              fontSize: '0.85rem' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* States */}
      {error && (
        <div style={{ color: '#cf1322', padding: '0.75rem', background: '#fff2f0',
          border: '1px solid #ffccc7', borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#8c8c8c', padding: '1rem' }}>Loading missions…</div>}
      {!loading && !error && missions.length === 0 && (
        <div style={{ color: '#8c8c8c', padding: '1rem' }}>No missions found.</div>
      )}

      {/* Table */}
      {!loading && missions.length > 0 && (
        <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #f0f0f0',
          overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                {['Mission ID', 'Class', 'Start (UTC)', 'End (UTC)',
                  'Records', 'Violations', 'Chain', 'Cert', 'NTP', 'Uploaded'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr key={m.id}
                  onClick={() => navigate(`/missions/${m.id}`)}
                  style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}>

                  <td style={{ padding: '0.5rem 0.75rem',
                    fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {m.missionId}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: NPNT_COLOUR[m.npntClassification] ?? '#595959',
                      fontWeight: 600 }}>
                      {m.npntClassification}
                    </span>
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {fmtMs(m.missionStartUtcMs)}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {m.missionEndUtcMs ? fmtMs(m.missionEndUtcMs) : '—'}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                    {m._count.telemetryRecords}
                  </td>

                  {/* violations count highlighted red when > 0 */}
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right',
                    color: m._count.violations > 0 ? '#cf1322' : 'inherit',
                    fontWeight: m._count.violations > 0 ? 700 : 400 }}>
                    {m._count.violations}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    {m.chainVerifiedByServer
                      ? <span style={{ color: '#389e0d' }}>✓</span>
                      : <span style={{ color: '#cf1322' }}>✗</span>}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    {m.certValidAtStart
                      ? <span style={{ color: '#389e0d' }}>✓</span>
                      : <span style={{ color: '#cf1322' }}>✗</span>}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: NTP_COLOUR(m.ntpSyncStatus) }}>
                      {m.ntpSyncStatus}
                    </span>
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                    {new Date(m.uploadedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <span style={{ color: '#595959' }}>Page {page} · {total} total missions</span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page * 20 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 20 >= total ? 0.5 : 1 }}>
          Next
        </button>
      </div>
    </div>
  )
}

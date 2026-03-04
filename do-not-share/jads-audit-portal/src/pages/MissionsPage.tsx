import { useEffect, useState, useCallback } from 'react'
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
  GREEN: '#00FF88', YELLOW: '#FFB800', RED: '#FF3B3B', DJI_IMPORT: '#4A9EFF'
}
const NTP_COLOUR = (s: string) => s === 'SYNCED' ? '#00FF88' : '#FFB800'

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
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>Drone Missions</h2>
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
          <button onClick={fetchMissions}
            style={{ padding: '0.25rem 0.75rem', border: `1px solid ${T.border}`,
              borderRadius: '4px', cursor: 'pointer', background: T.surface,
              color: T.text, fontSize: '0.85rem',
              fontFamily: "'JetBrains Mono', monospace" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* States */}
      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, padding: '1rem',
        fontFamily: "'JetBrains Mono', monospace" }}>Loading missions...</div>}
      {!loading && !error && missions.length === 0 && (
        <div style={{ color: T.muted, padding: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>No missions found.</div>
      )}

      {/* Table */}
      {!loading && missions.length > 0 && (
        <div style={{ background: T.surface, borderRadius: '6px', border: `1px solid ${T.border}`,
          overflow: 'hidden', boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: T.bg, borderBottom: `2px solid ${T.border}` }}>
                {['Mission ID', 'Class', 'Start (UTC)', 'End (UTC)',
                  'Records', 'Violations', 'Chain', 'Cert', 'NTP', 'Uploaded'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600,
                    color: T.primary, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem',
                    letterSpacing: '0.03em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr key={m.id}
                  onClick={() => navigate(`/missions/${m.id}`)}
                  style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.primary + '08')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  <td style={{ padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: T.textBright }}>
                    {m.missionId}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: NPNT_COLOUR[m.npntClassification] ?? T.text,
                      fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                      {m.npntClassification}
                    </span>
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
                    color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtMs(m.missionStartUtcMs)}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
                    color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {m.missionEndUtcMs ? fmtMs(m.missionEndUtcMs) : '—'}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: T.text,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {m._count.telemetryRecords}
                  </td>

                  {/* violations count highlighted red when > 0 */}
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right',
                    color: m._count.violations > 0 ? T.red : T.text,
                    fontWeight: m._count.violations > 0 ? 700 : 400,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {m._count.violations}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {m.chainVerifiedByServer
                      ? <span style={{ color: T.green }}>PASS</span>
                      : <span style={{ color: T.red }}>FAIL</span>}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {m.certValidAtStart
                      ? <span style={{ color: T.green }}>PASS</span>
                      : <span style={{ color: T.red }}>FAIL</span>}
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: NTP_COLOUR(m.ntpSyncStatus) }}>
                      {m.ntpSyncStatus}
                    </span>
                  </td>

                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: T.muted,
                    fontFamily: "'JetBrains Mono', monospace" }}>
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
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
          Prev
        </button>
        <span style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
          Page {page} · {total} total missions
        </span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page * 20 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 20 >= total ? 0.5 : 1,
            background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
          Next
        </button>
      </div>
    </div>
  )
}

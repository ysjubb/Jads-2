import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

interface FlightPlan {
  id: string
  aircraftId: string
  aircraftType: string
  status: string
  adep: string
  ades: string
  eobt: string
  eet: string
  wakeTurbulence: string
  equipment: string
  cruisingLevel: string
  filedBy: string
  filedAt: string
}

const STATE_COLOUR: Record<string, string> = {
  FILED: '#FFB800', FULLY_CLEARED: '#00FF88', ADC_ISSUED: '#00FF88',
  FIC_ISSUED: '#00FF88', PENDING_CLEARANCE: '#FFB800', STUB_TRANSMITTED: '#6A6040',
  CANCELLED: '#FF3B3B', VOID: '#FF3B3B', DELAYED: '#FFB800',
  DEPARTED: '#00FF88', ARRIVED: '#00FF88', CLEARANCE_REJECTED: '#FF3B3B'
}

export function FlightPlansPage() {
  const navigate                      = useNavigate()
  const { token, logout }            = useAuditAuth()
  const [plans, setPlans]            = useState<FlightPlan[]>([])
  const [total, setTotal]            = useState(0)
  const [page, setPage]              = useState(1)
  const [scopeApplied, setScope]     = useState('')
  const [retrievedAt, setRetrievedAt] = useState('')
  const [loading, setLoading]        = useState(false)
  const [error, setError]            = useState<string | null>(null)

  const fetchPlans = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const { data } = await auditAxios(token).get('/flight-plans', {
        params: { page, limit: 25 }
      })
      setPlans(data.plans ?? data.flightPlans ?? [])
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
  }, [token, page, logout])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>Flight Plans</h2>
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
          <button onClick={fetchPlans}
            style={{ padding: '0.25rem 0.75rem', border: `1px solid ${T.border}`,
              borderRadius: '4px', cursor: 'pointer', background: T.surface,
              color: T.text, fontSize: '0.85rem',
              fontFamily: "'JetBrains Mono', monospace" }}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, padding: '1rem',
        fontFamily: "'JetBrains Mono', monospace" }}>Loading flight plans...</div>}
      {!loading && !error && plans.length === 0 && (
        <div style={{ color: T.muted, padding: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>No flight plans found.</div>
      )}

      {!loading && plans.length > 0 && (
        <div style={{ background: T.surface, borderRadius: '6px',
          border: `1px solid ${T.border}`, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: T.bg, borderBottom: `2px solid ${T.border}` }}>
                {['Callsign', 'Type', 'Status', 'ADEP', 'ADES', 'EOBT', 'EET', 'Level', 'Filed'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600,
                    color: T.primary, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem',
                    letterSpacing: '0.03em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                  onClick={() => navigate(`/flight-plans/${p.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = T.primary + '08')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600, color: T.textBright }}>
                    {p.aircraftId}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: "'JetBrains Mono', monospace",
                    color: T.text }}>{p.aircraftType}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: STATE_COLOUR[p.status] ?? T.text, fontWeight: 500,
                      fontFamily: "'JetBrains Mono', monospace" }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: "'JetBrains Mono', monospace",
                    color: T.text }}>{p.adep}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: "'JetBrains Mono', monospace",
                    color: T.text }}>{p.ades}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
                    color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(p.eobt).toISOString().replace('T', ' ').slice(0, 16)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: T.text,
                    fontFamily: "'JetBrains Mono', monospace" }}>{p.eet}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: T.text,
                    fontFamily: "'JetBrains Mono', monospace" }}>{p.cruisingLevel}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: T.muted,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.filedAt ? new Date(p.filedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          Page {page} · {total} total
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

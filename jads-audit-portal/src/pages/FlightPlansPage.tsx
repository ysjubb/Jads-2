import React, { useEffect, useState, useCallback } from 'react'
import { useAuditAuth, auditAxios } from '../hooks/useAuditAuth'

interface FlightPlan {
  id: string
  arcid: string
  fplState: string
  adep: string
  ades: string
  eobt: string
  ttlHhMm: string
  wtc: string
  equipment: string
  rvsm: boolean
  filedByUserId: string
  createdAt: string
}

const STATE_COLOUR: Record<string, string> = {
  FILED: '#1890ff', ACTIVE: '#52c41a', CLOSED: '#8c8c8c',
  CANCELLED: '#ff4d4f', DELAYED: '#faad14'
}

export function FlightPlansPage() {
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
      setPlans(data.flightPlans ?? data.flight_plans ?? [])
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
        <h2 style={{ margin: 0 }}>Flight Plans</h2>
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
          <button onClick={fetchPlans}
            style={{ padding: '0.25rem 0.75rem', border: '1px solid #d9d9d9',
              borderRadius: '4px', cursor: 'pointer', background: 'white', fontSize: '0.85rem' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: '#cf1322', padding: '0.75rem', background: '#fff2f0',
          border: '1px solid #ffccc7', borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#8c8c8c', padding: '1rem' }}>Loading flight plans…</div>}
      {!loading && !error && plans.length === 0 && (
        <div style={{ color: '#8c8c8c', padding: '1rem' }}>No flight plans found.</div>
      )}

      {!loading && plans.length > 0 && (
        <div style={{ background: 'white', borderRadius: '6px',
          border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                {['ARCID', 'State', 'ADEP', 'ADES', 'EOBT', 'ETT', 'WTC', 'RVSM', 'Filed'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {p.arcid}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: STATE_COLOUR[p.fplState] ?? '#595959', fontWeight: 500 }}>
                      {p.fplState}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>{p.adep}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>{p.ades}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {new Date(p.eobt).toISOString().replace('T', ' ').slice(0, 16)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{p.ttlHhMm}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{p.wtc}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    {p.rvsm ? <span style={{ color: '#389e0d' }}>✓</span> : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <span style={{ color: '#595959' }}>Page {page} · {total} total</span>
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

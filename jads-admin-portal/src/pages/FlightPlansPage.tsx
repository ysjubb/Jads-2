import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlightPlan {
  id:            string
  filedBy:       string
  filedByType:   string     // 'CIVILIAN' | 'SPECIAL'
  status:        string
  flightRules:   string
  flightType:    string
  aircraftId:    string
  aircraftType:  string
  adep:          string
  ades:          string
  eobt:          string
  eet:           string
  route:         string
  cruisingLevel: string
  cruisingSpeed: string
  ficNumber:     string | null
  adcNumber:     string | null
  aftnMessage:   string | null
  aftnAddressees:string | null
  filedAt:       string | null
  clearedAt:     string | null
  createdAt:     string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:           '#8c8c8c',
  VALIDATED:       '#1890ff',
  FILED:           '#faad14',
  ACKNOWLEDGED:    '#722ed1',
  ACTIVATED:       '#52c41a',
  COMPLETED:       '#389e0d',
  CANCELLED:       '#ff4d4f',
  OVERDUE:         '#ff4d4f',
  REJECTED_BY_ATC: '#cf1322',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT:           'Draft',
  VALIDATED:       'Validated',
  FILED:           'Filed',
  ACKNOWLEDGED:    'Acknowledged',
  ACTIVATED:       'Activated',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
  OVERDUE:         'Overdue',
  REJECTED_BY_ATC: 'Rejected by ATC',
}

const FTYPE_LABELS: Record<string, string> = {
  S: 'Scheduled', N: 'Non-Scheduled', G: 'General Aviation',
  M: 'Military',  X: 'Other',
}

// ── AFTN Preview Panel ────────────────────────────────────────────────────────

function AftnPanel({ plan, onClose }: { plan: FlightPlan; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(plan.aftnMessage ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'white', borderRadius: '8px', width: '680px', maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>AFTN Message</span>
            <span style={{ marginLeft: '0.75rem', fontFamily: 'monospace',
              fontSize: '0.85rem', color: '#8c8c8c' }}>
              {plan.aircraftId} · {plan.adep} → {plan.ades}
            </span>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: '1.25rem',
              cursor: 'pointer', color: '#8c8c8c', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Addressees */}
        {plan.aftnAddressees && (
          <div style={{ padding: '0.75rem 1.25rem', background: '#fafafa',
            borderBottom: '1px solid #f0f0f0', fontSize: '0.8rem' }}>
            <span style={{ color: '#8c8c8c', marginRight: '0.5rem' }}>Addressees:</span>
            {plan.aftnAddressees.split(' ').map(addr => (
              <span key={addr} style={{
                display: 'inline-block', marginRight: '0.4rem', marginBottom: '0.2rem',
                padding: '0.1rem 0.4rem', background: '#e6f7ff',
                border: '1px solid #91d5ff', borderRadius: '3px',
                fontFamily: 'monospace', fontSize: '0.75rem', color: '#0050b3',
              }}>
                {addr}
              </span>
            ))}
          </div>
        )}

        {/* AFTN message body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
          {plan.aftnMessage ? (
            <pre style={{
              fontFamily: "'Courier New', monospace", fontSize: '0.85rem',
              background: '#1a1a2e', color: '#00ff88', padding: '1rem',
              borderRadius: '6px', lineHeight: 1.6, margin: 0,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {plan.aftnMessage}
            </pre>
          ) : (
            <div style={{ color: '#8c8c8c', padding: '2rem', textAlign: 'center' }}>
              No AFTN message generated yet. File the flight plan to generate.
            </div>
          )}
        </div>

        {/* Clearance details */}
        {(plan.ficNumber || plan.adcNumber) && (
          <div style={{
            padding: '0.75rem 1.25rem', borderTop: '1px solid #f0f0f0',
            background: '#f6ffed', display: 'flex', gap: '2rem', fontSize: '0.85rem',
          }}>
            {plan.ficNumber && (
              <div>
                <span style={{ color: '#8c8c8c' }}>FIC: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#389e0d' }}>
                  {plan.ficNumber}
                </span>
              </div>
            )}
            {plan.adcNumber && (
              <div>
                <span style={{ color: '#8c8c8c' }}>ADC: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#389e0d' }}>
                  {plan.adcNumber}
                </span>
              </div>
            )}
            {plan.clearedAt && (
              <div>
                <span style={{ color: '#8c8c8c' }}>Cleared: </span>
                <span style={{ color: '#389e0d' }}>
                  {new Date(plan.clearedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem', borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
        }}>
          {plan.aftnMessage && (
            <button onClick={copy}
              style={{
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
                border: '1px solid #91d5ff', background: copied ? '#f6ffed' : '#e6f7ff',
                color: copied ? '#389e0d' : '#0050b3', fontSize: '0.875rem',
              }}>
              {copied ? '✓ Copied' : 'Copy Message'}
            </button>
          )}
          <button onClick={onClose}
            style={{ padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
              border: '1px solid #d9d9d9', background: 'white', fontSize: '0.875rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function FlightPlansPage() {
  const { token, logout } = useAdminAuth()
  const [plans, setPlans]         = useState<FlightPlan[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState('')
  const [typeFilter, setType]     = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [selectedPlan, setSelected] = useState<FlightPlan | null>(null)

  const fetchPlans = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, any> = { page, limit: 30 }
      if (statusFilter) params.status   = statusFilter
      if (typeFilter)   params.type     = typeFilter
      if (search)       params.search   = search
      // Admin can see all flight plans via /admin/flight-plans
      const { data } = await adminAxios(token).get('/flight-plans', { params })
      setPlans(data.flightPlans ?? data.plans ?? [])
      setTotal(data.total ?? 0)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, statusFilter, typeFilter, search, logout])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchPlans() }, 400)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'1rem' }}>
        <h2 style={{ margin: 0 }}>Manned Flight Plans</h2>
        <span style={{ fontSize:'0.8rem', color:'#8c8c8c' }}>{total} total</span>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        <input
          placeholder="Search aircraft ID or callsign…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding:'0.4rem 0.75rem', border:'1px solid #d9d9d9',
            borderRadius:'4px', flex: 1, minWidth: '200px' }}
        />
        <select value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          style={{ padding:'0.4rem', border:'1px solid #d9d9d9', borderRadius:'4px' }}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="VALIDATED">Validated</option>
          <option value="FILED">Filed</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="ACTIVATED">Activated</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="OVERDUE">Overdue</option>
        </select>
        <select value={typeFilter}
          onChange={e => { setType(e.target.value); setPage(1) }}
          style={{ padding:'0.4rem', border:'1px solid #d9d9d9', borderRadius:'4px' }}>
          <option value="">All types</option>
          <option value="G">General Aviation</option>
          <option value="M">Military</option>
          <option value="S">Scheduled</option>
          <option value="N">Non-Scheduled</option>
        </select>
      </div>

      {/* Error / loading states */}
      {error && (
        <div style={{ color:'#cf1322', padding:'0.75rem', background:'#fff2f0',
          border:'1px solid #ffccc7', borderRadius:'4px', marginBottom:'1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color:'#8c8c8c', marginBottom:'1rem' }}>Loading…</div>}
      {!loading && !error && plans.length === 0 && (
        <div style={{ color:'#8c8c8c', padding:'3rem', textAlign:'center' }}>
          No flight plans found.
        </div>
      )}

      {/* Table */}
      {!loading && plans.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
            <thead>
              <tr style={{ background:'#fafafa', borderBottom:'2px solid #f0f0f0' }}>
                {['Aircraft', 'Type', 'Rules', 'ADEP', 'ADES', 'EOBT', 'Status',
                  'Filed By', 'FIC', 'ADC', 'AFTN', 'Filed At'].map(h => (
                  <th key={h} style={{ padding:'0.5rem 0.75rem',
                    textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem' }}>
                    {p.aircraftId}
                    <div style={{ fontFamily:'sans-serif', fontWeight:400,
                      fontSize:'0.7rem', color:'#8c8c8c' }}>{p.aircraftType}</div>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem', color:'#595959' }}>
                    {FTYPE_LABELS[p.flightType] ?? p.flightType}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.8rem' }}>{p.flightRules}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem', color:'#1890ff' }}>{p.adep}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem', color:'#722ed1' }}>{p.ades}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.8rem', whiteSpace:'nowrap' }}>
                    {new Date(p.eobt).toLocaleString(undefined, {
                      day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
                    })}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem' }}>
                    <span style={{
                      color: STATUS_COLOUR[p.status] ?? '#8c8c8c',
                      fontWeight:500, fontSize:'0.8rem',
                      background: (STATUS_COLOUR[p.status] ?? '#8c8c8c') + '18',
                      padding:'0.15rem 0.45rem', borderRadius:'3px',
                    }}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem', color:'#595959' }}>
                    {p.filedByType}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.72rem', color: p.ficNumber ? '#389e0d' : '#bfbfbf' }}>
                    {p.ficNumber ?? '—'}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.72rem', color: p.adcNumber ? '#389e0d' : '#bfbfbf' }}>
                    {p.adcNumber ?? '—'}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem' }}>
                    <button
                      onClick={() => setSelected(p)}
                      style={{
                        padding:'0.2rem 0.5rem', background: p.aftnMessage ? '#e6f7ff' : '#fafafa',
                        border:`1px solid ${p.aftnMessage ? '#91d5ff' : '#d9d9d9'}`,
                        color: p.aftnMessage ? '#0050b3' : '#8c8c8c',
                        borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem',
                      }}
                    >
                      {p.aftnMessage ? 'View' : 'None'}
                    </button>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem',
                    color:'#8c8c8c', whiteSpace:'nowrap' }}>
                    {p.filedAt
                      ? new Date(p.filedAt).toLocaleString(undefined, {
                          day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ marginTop:'1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding:'0.3rem 0.75rem', border:'1px solid #d9d9d9', borderRadius:'4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <span style={{ fontSize:'0.85rem' }}>Page {page} · {total} total</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding:'0.3rem 0.75rem', border:'1px solid #d9d9d9', borderRadius:'4px',
            cursor: page * 30 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 30 >= total ? 0.5 : 1 }}>
          Next
        </button>
      </div>

      {/* AFTN Preview Modal */}
      {selectedPlan && (
        <AftnPanel plan={selectedPlan} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

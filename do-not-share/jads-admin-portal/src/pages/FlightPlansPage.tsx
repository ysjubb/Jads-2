import { useEffect, useState, useCallback } from 'react'
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
  DRAFT:           T.muted,
  VALIDATED:       T.primary,
  FILED:           T.amber,
  ACKNOWLEDGED:    '#B060FF',
  ACTIVATED:       T.primary,
  COMPLETED:       T.primary,
  CANCELLED:       T.red,
  OVERDUE:         T.red,
  REJECTED_BY_ATC: T.red,
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: T.surface, borderRadius: '8px', width: '680px', maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: `0 8px 32px rgba(0,255,136,0.1)`,
        border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: T.textBright }}>AFTN Message</span>
            <span style={{ marginLeft: '0.75rem', fontFamily: 'monospace',
              fontSize: '0.85rem', color: T.muted }}>
              {plan.aircraftId} · {plan.adep} → {plan.ades}
            </span>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: '1.25rem',
              cursor: 'pointer', color: T.muted, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Addressees */}
        {plan.aftnAddressees && (
          <div style={{ padding: '0.75rem 1.25rem', background: T.bg,
            borderBottom: `1px solid ${T.border}`, fontSize: '0.8rem' }}>
            <span style={{ color: T.muted, marginRight: '0.5rem' }}>Addressees:</span>
            {plan.aftnAddressees.split(' ').map(addr => (
              <span key={addr} style={{
                display: 'inline-block', marginRight: '0.4rem', marginBottom: '0.2rem',
                padding: '0.1rem 0.4rem', background: T.primary + '15',
                border: `1px solid ${T.primary}30`, borderRadius: '3px',
                fontFamily: 'monospace', fontSize: '0.75rem', color: T.primary,
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
            <div style={{ color: T.muted, padding: '2rem', textAlign: 'center' }}>
              No AFTN message generated yet. File the flight plan to generate.
            </div>
          )}
        </div>

        {/* Clearance details */}
        {(plan.ficNumber || plan.adcNumber) && (
          <div style={{
            padding: '0.75rem 1.25rem', borderTop: `1px solid ${T.border}`,
            background: T.primary + '15', display: 'flex', gap: '2rem', fontSize: '0.85rem',
          }}>
            {plan.ficNumber && (
              <div>
                <span style={{ color: T.muted }}>FIC: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: T.primary }}>
                  {plan.ficNumber}
                </span>
              </div>
            )}
            {plan.adcNumber && (
              <div>
                <span style={{ color: T.muted }}>ADC: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: T.primary }}>
                  {plan.adcNumber}
                </span>
              </div>
            )}
            {plan.clearedAt && (
              <div>
                <span style={{ color: T.muted }}>Cleared: </span>
                <span style={{ color: T.primary }}>
                  {new Date(plan.clearedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
        }}>
          {plan.aftnMessage && (
            <button onClick={copy}
              style={{
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
                border: `1px solid ${T.primary}40`,
                background: copied ? T.primary + '15' : T.primary + '15',
                color: copied ? T.primary : T.primary, fontSize: '0.875rem',
              }}>
              {copied ? '✓ Copied' : 'Copy Message'}
            </button>
          )}
          <button onClick={onClose}
            style={{ padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.text, fontSize: '0.875rem' }}>
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
        <h2 style={{ margin: 0, color: T.textBright }}>Manned Flight Plans</h2>
        <span style={{ fontSize:'0.8rem', color: T.muted }}>{total} total</span>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        <input
          placeholder="Search aircraft ID or callsign…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding:'0.4rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius:'4px', flex: 1, minWidth: '200px',
            background: T.surface, color: T.text }}
        />
        <select value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          style={{ padding:'0.4rem', border: `1px solid ${T.border}`, borderRadius:'4px',
            background: T.surface, color: T.text }}>
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
          style={{ padding:'0.4rem', border: `1px solid ${T.border}`, borderRadius:'4px',
            background: T.surface, color: T.text }}>
          <option value="">All types</option>
          <option value="G">General Aviation</option>
          <option value="M">Military</option>
          <option value="S">Scheduled</option>
          <option value="N">Non-Scheduled</option>
        </select>
      </div>

      {/* Error / loading states */}
      {error && (
        <div style={{ color: T.red, padding:'0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius:'4px', marginBottom:'1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, marginBottom:'1rem' }}>Loading…</div>}
      {!loading && !error && plans.length === 0 && (
        <div style={{ color: T.muted, padding:'3rem', textAlign:'center' }}>
          No flight plans found.
        </div>
      )}

      {/* Table */}
      {!loading && plans.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
            <thead>
              <tr style={{ background: T.surface, borderBottom: `2px solid ${T.border}` }}>
                {['Aircraft', 'Type', 'Rules', 'ADEP', 'ADES', 'EOBT', 'Status',
                  'Filed By', 'FIC', 'ADC', 'AFTN', 'Filed At'].map(h => (
                  <th key={h} style={{ padding:'0.5rem 0.75rem',
                    textAlign:'left', fontWeight:600, whiteSpace:'nowrap', color: T.textBright }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem', color: T.textBright }}>
                    {p.aircraftId}
                    <div style={{ fontFamily:'sans-serif', fontWeight:400,
                      fontSize:'0.7rem', color: T.muted }}>{p.aircraftType}</div>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem', color: T.text }}>
                    {FTYPE_LABELS[p.flightType] ?? p.flightType}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.8rem', color: T.text }}>{p.flightRules}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem', color: T.primary }}>{p.adep}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontWeight:600, fontSize:'0.8rem', color:'#B060FF' }}>{p.ades}</td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.8rem', whiteSpace:'nowrap', color: T.text }}>
                    {new Date(p.eobt).toLocaleString(undefined, {
                      day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
                    })}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem' }}>
                    <span style={{
                      color: STATUS_COLOUR[p.status] ?? T.muted,
                      fontWeight:500, fontSize:'0.8rem',
                      background: (STATUS_COLOUR[p.status] ?? T.muted) + '18',
                      padding:'0.15rem 0.45rem', borderRadius:'3px',
                    }}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem', color: T.text }}>
                    {p.filedByType}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.72rem', color: p.ficNumber ? T.primary : T.muted }}>
                    {p.ficNumber ?? '—'}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                    fontSize:'0.72rem', color: p.adcNumber ? T.primary : T.muted }}>
                    {p.adcNumber ?? '—'}
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem' }}>
                    <button
                      onClick={() => setSelected(p)}
                      style={{
                        padding:'0.2rem 0.5rem',
                        background: p.aftnMessage ? T.primary + '15' : 'transparent',
                        border: `1px solid ${p.aftnMessage ? T.primary + '40' : T.border}`,
                        color: p.aftnMessage ? T.primary : T.muted,
                        borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem',
                      }}
                    >
                      {p.aftnMessage ? 'View' : 'None'}
                    </button>
                  </td>
                  <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem',
                    color: T.muted, whiteSpace:'nowrap' }}>
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
          style={{ padding:'0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius:'4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Prev
        </button>
        <span style={{ fontSize:'0.85rem', color: T.text }}>Page {page} · {total} total</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding:'0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius:'4px',
            cursor: page * 30 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 30 >= total ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
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

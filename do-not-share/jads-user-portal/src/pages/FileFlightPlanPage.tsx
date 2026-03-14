import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'

// ── Route Advisory types (mirror backend RouteAdvisory) ─────────────────────

interface RouteAdvisory {
  hasRecommendation: boolean
  recommended: {
    routeString: string
    airwayName: string
    waypoints: Array<{ identifier: string; name: string; type: string; lat: number; lon: number }>
    segments: Array<{ from: string; to: string; airway: string; distanceNm: number; magneticTrackDeg: number; eetMinutes: number }>
    totalDistanceNm: number
    totalEetMinutes: number
  } | null
  flightLevelAdvisory: {
    requestedLevel: string
    magneticTrackDeg: number
    isCompliant: boolean
    recommendedLevel: string
    direction: 'EASTBOUND' | 'WESTBOUND'
    rule: string
  }
  reportingPoints: Array<{ identifier: string; name: string; distanceFromDepNm: number }>
  firCrossings: Array<{ firCode: string; firName: string; entryPoint: string; exitPoint: string; distanceNm: number; eetMinutes: number }>
  directRoute: { routeString: string; totalDistanceNm: number; totalEetMinutes: number }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEet(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────────

export function FileFlightPlanPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    aircraftId: '', aircraftType: '', wakeTurbulence: 'L',
    flightRules: 'VFR', flightType: 'G',
    adep: '', ades: '', altn1: '', altn2: '',
    eobt: '', route: '', cruisingLevel: 'VFR', cruisingSpeed: 'N0120',
    eet: '0030', endurance: '0200', personsOnBoard: '1',
    equipment: 'S', surveillance: '',
    notifyEmail: '', notifyMobile: '', additionalEmails: '',
    remarks: '', item18: '',
  })

  // Advisory modal state
  const [advisory, setAdvisory]       = useState<RouteAdvisory | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [advisoryLoading, setAdvisoryLoading] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  // ── File the flight plan (POST /flight-plans) ─────────────────────────────

  const filePlan = async (overrides?: { route?: string; cruisingLevel?: string }) => {
    setLoading(true); setError(null); setShowModal(false)
    try {
      const merged = { ...form, ...overrides }
      const payload = {
        ...merged,
        personsOnBoard: parseInt(merged.personsOnBoard) || 1,
        additionalEmails: merged.additionalEmails
          ? merged.additionalEmails.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      }
      const { data } = await userApi().post('/flight-plans', payload)
      if (data.success) {
        navigate(`/flight-plan/${data.flightPlanId ?? data.planId ?? data.id}`)
      } else {
        setError(data.error ?? 'Filing failed')
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'FLIGHT_PLAN_FILE_FAILED')
    } finally {
      setLoading(false)
    }
  }

  // ── Submit handler — fetch advisory first, then show modal ────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdvisoryLoading(true); setError(null)
    try {
      const { data } = await userApi().post('/flight-plans/route-advisory', {
        adep: form.adep.toUpperCase(),
        ades: form.ades.toUpperCase(),
        cruisingLevel: form.cruisingLevel,
        cruisingSpeed: form.cruisingSpeed,
      })
      if (data.success && data.advisory) {
        setAdvisory(data.advisory)
        setShowModal(true)
      } else {
        // Advisory failed — file directly
        await filePlan()
      }
    } catch {
      // Advisory call failed — silently proceed to file (advisory failure never blocks)
      await filePlan()
    } finally {
      setAdvisoryLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.75rem',
  }
  const labelStyle: React.CSSProperties = { fontSize: '0.65rem', color: T.muted, marginBottom: '2px', display: 'block' }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <h1 style={{ color: T.primary, fontSize: '1rem', marginBottom: '1rem' }}>File Flight Plan</h1>

      {error && (
        <div style={{ background: T.red + '15', border: `1px solid ${T.red}30`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', color: T.red, fontSize: '0.7rem' }}>
          {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Aircraft Info */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Aircraft</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Aircraft ID</label><input value={form.aircraftId} onChange={set('aircraftId')} placeholder="VT-ABC" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Type</label><input value={form.aircraftType} onChange={set('aircraftType')} placeholder="C172" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Wake Turbulence</label>
              <select value={form.wakeTurbulence} onChange={set('wakeTurbulence')} style={inputStyle}>
                <option value="L">L (Light)</option>
                <option value="M">M (Medium)</option>
                <option value="H">H (Heavy)</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* Flight Info */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Flight</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Flight Rules</label>
              <select value={form.flightRules} onChange={set('flightRules')} style={inputStyle}>
                <option value="VFR">VFR</option><option value="IFR">IFR</option>
                <option value="Y">Y</option><option value="Z">Z</option>
              </select>
            </div>
            <div><label style={labelStyle}>Flight Type</label>
              <select value={form.flightType} onChange={set('flightType')} style={inputStyle}>
                <option value="G">G (General)</option><option value="S">S (Scheduled)</option>
                <option value="N">N (Non-scheduled)</option><option value="M">M (Military)</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* Route */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Route</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Departure (ADEP)</label><input value={form.adep} onChange={set('adep')} placeholder="VIDP" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Destination (ADES)</label><input value={form.ades} onChange={set('ades')} placeholder="VABB" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Alternate 1</label><input value={form.altn1} onChange={set('altn1')} placeholder="VOBL" style={inputStyle} /></div>
            <div><label style={labelStyle}>Alternate 2</label><input value={form.altn2} onChange={set('altn2')} placeholder="" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Route</label><input value={form.route} onChange={set('route')} placeholder="DCT VNS DCT" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Cruising Level</label><input value={form.cruisingLevel} onChange={set('cruisingLevel')} placeholder="F350 or VFR" style={inputStyle} /></div>
            <div><label style={labelStyle}>Cruising Speed</label><input value={form.cruisingSpeed} onChange={set('cruisingSpeed')} placeholder="N0480" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>EOBT (UTC)</label><input type="datetime-local" value={form.eobt} onChange={set('eobt')} style={inputStyle} required /></div>
            <div><label style={labelStyle}>EET</label><input value={form.eet} onChange={set('eet')} placeholder="0130" style={inputStyle} /></div>
            <div><label style={labelStyle}>Endurance</label><input value={form.endurance} onChange={set('endurance')} placeholder="0400" style={inputStyle} /></div>
            <div><label style={labelStyle}>POB</label><input value={form.personsOnBoard} onChange={set('personsOnBoard')} type="number" min="1" style={inputStyle} /></div>
          </div>
        </fieldset>

        {/* Notifications */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Notifications</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Email</label><input value={form.notifyEmail} onChange={set('notifyEmail')} placeholder="pilot@email.com" style={inputStyle} /></div>
            <div><label style={labelStyle}>Mobile</label><input value={form.notifyMobile} onChange={set('notifyMobile')} placeholder="+919800000001" style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Additional Emails (comma-separated)</label><input value={form.additionalEmails} onChange={set('additionalEmails')} placeholder="ops@airline.com, dispatch@airline.com" style={inputStyle} /></div>
        </fieldset>

        {/* Remarks */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Other</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Item 18</label><textarea value={form.item18} onChange={set('item18')} rows={2} placeholder="RMK/..." style={{ ...inputStyle, resize: 'vertical' }} /></div>
            <div><label style={labelStyle}>Remarks</label><textarea value={form.remarks} onChange={set('remarks')} rows={2} placeholder="Additional remarks" style={{ ...inputStyle, resize: 'vertical' }} /></div>
          </div>
        </fieldset>

        <button type="submit" disabled={loading || advisoryLoading} style={{
          padding: '0.7rem 2rem', background: T.primary, color: T.bg, border: 'none',
          borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
        }}>
          {advisoryLoading ? 'Checking route...' : loading ? 'Filing...' : 'FILE FLIGHT PLAN'}
        </button>
      </form>

      {/* ── Route Advisory Modal ──────────────────────────────────────────── */}
      {showModal && advisory && (
        <RouteAdvisoryModal
          advisory={advisory}
          adep={form.adep.toUpperCase()}
          ades={form.ades.toUpperCase()}
          onUseRecommended={() => {
            if (advisory.recommended) {
              const recLevel = advisory.flightLevelAdvisory.isCompliant
                ? form.cruisingLevel
                : advisory.flightLevelAdvisory.recommendedLevel
              filePlan({
                route: advisory.recommended.routeString,
                cruisingLevel: recLevel,
              })
            }
          }}
          onContinueDirect={() => filePlan()}
          onClose={() => setShowModal(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

// ── Route Advisory Modal Component ──────────────────────────────────────────

function RouteAdvisoryModal({ advisory, adep, ades, onUseRecommended, onContinueDirect, onClose, loading }: {
  advisory: RouteAdvisory
  adep: string
  ades: string
  onUseRecommended: () => void
  onContinueDirect: () => void
  onClose: () => void
  loading: boolean
}) {
  const s = styles

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={{ color: T.primary, fontSize: '0.9rem', fontWeight: 700 }}>
            Route Advisory — {adep} → {ades}
          </span>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={s.body}>
          {/* ── Recommended Route ─────────────────────────────────────── */}
          {advisory.hasRecommendation && advisory.recommended ? (
            <Section title={`Recommended: Airway ${advisory.recommended.airwayName}`}>
              <div style={{ fontSize: '0.7rem', color: T.textBright, marginBottom: '0.5rem' }}>
                <strong>Route:</strong> {advisory.recommended.routeString}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.7rem', color: T.text, marginBottom: '0.6rem' }}>
                <span>Distance: <strong style={{ color: T.textBright }}>{advisory.recommended.totalDistanceNm} NM</strong></span>
                <span>EET: <strong style={{ color: T.textBright }}>{fmtEet(advisory.recommended.totalEetMinutes)}</strong></span>
              </div>

              {/* Segment table */}
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>From</th><th style={s.th}>To</th><th style={s.th}>Airway</th>
                    <th style={s.th}>Dist (NM)</th><th style={s.th}>Track (°M)</th><th style={s.th}>EET</th>
                  </tr>
                </thead>
                <tbody>
                  {advisory.recommended.segments.map((seg, i) => (
                    <tr key={i}>
                      <td style={s.td}>{seg.from}</td><td style={s.td}>{seg.to}</td>
                      <td style={s.td}>{seg.airway}</td><td style={s.td}>{seg.distanceNm}</td>
                      <td style={s.td}>{seg.magneticTrackDeg}°</td><td style={s.td}>{fmtEet(seg.eetMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : (
            <Section title="No Published Airway Found">
              <div style={{ fontSize: '0.7rem', color: T.muted }}>
                No published ATS airway connects {adep} to {ades}. You may file a direct (DCT) route.
              </div>
            </Section>
          )}

          {/* ── Flight Level Advisory ────────────────────────────────── */}
          <Section title="Flight Level Advisory">
            <div style={{ fontSize: '0.7rem', color: T.text }}>
              <div style={{ marginBottom: '0.3rem' }}>
                <strong>Direction:</strong>{' '}
                <span style={{ color: advisory.flightLevelAdvisory.direction === 'EASTBOUND' ? T.primary : T.amber }}>
                  {advisory.flightLevelAdvisory.direction}
                </span>
                {' '}({advisory.flightLevelAdvisory.magneticTrackDeg}° magnetic)
              </div>
              <div style={{ marginBottom: '0.3rem' }}>
                <strong>Requested:</strong> {advisory.flightLevelAdvisory.requestedLevel}
                {' — '}
                {advisory.flightLevelAdvisory.isCompliant ? (
                  <span style={{ color: '#4CAF50' }}>✓ Compliant</span>
                ) : (
                  <span style={{ color: T.red }}>✗ Non-compliant — recommended: {advisory.flightLevelAdvisory.recommendedLevel}</span>
                )}
              </div>
              <div style={{ color: T.muted, fontSize: '0.65rem' }}>
                {advisory.flightLevelAdvisory.rule}
              </div>
            </div>
          </Section>

          {/* ── Reporting Points ──────────────────────────────────────── */}
          {advisory.reportingPoints.length > 0 && (
            <Section title="Mandatory Reporting Points">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {advisory.reportingPoints.map((rp, i) => (
                  <span key={i} style={{
                    background: T.border, borderRadius: '3px', padding: '0.2rem 0.5rem',
                    fontSize: '0.65rem', color: T.textBright,
                  }}>
                    {rp.identifier} ({rp.distanceFromDepNm} NM)
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* ── FIR Crossings ────────────────────────────────────────── */}
          {advisory.firCrossings.length > 0 && (
            <Section title="FIR Crossings">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>FIR</th><th style={s.th}>Entry</th><th style={s.th}>Exit</th>
                    <th style={s.th}>Dist (NM)</th><th style={s.th}>EET</th>
                  </tr>
                </thead>
                <tbody>
                  {advisory.firCrossings.map((fir, i) => (
                    <tr key={i}>
                      <td style={s.td}>{fir.firName}</td>
                      <td style={s.td}>{fir.entryPoint}</td><td style={s.td}>{fir.exitPoint}</td>
                      <td style={s.td}>{fir.distanceNm}</td><td style={s.td}>{fmtEet(fir.eetMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Direct Route Comparison ──────────────────────────────── */}
          <Section title="Direct Route (DCT)">
            <div style={{ fontSize: '0.7rem', color: T.text, display: 'flex', gap: '1.5rem' }}>
              <span>Distance: <strong style={{ color: T.textBright }}>{advisory.directRoute.totalDistanceNm} NM</strong></span>
              <span>EET: <strong style={{ color: T.textBright }}>{fmtEet(advisory.directRoute.totalEetMinutes)}</strong></span>
            </div>
            {advisory.hasRecommendation && advisory.recommended && (
              <div style={{ fontSize: '0.65rem', color: T.muted, marginTop: '0.3rem' }}>
                Airway route is {advisory.recommended.totalDistanceNm - advisory.directRoute.totalDistanceNm > 0
                  ? `${advisory.recommended.totalDistanceNm - advisory.directRoute.totalDistanceNm} NM longer`
                  : `${advisory.directRoute.totalDistanceNm - advisory.recommended.totalDistanceNm} NM shorter`
                } than direct
              </div>
            )}
          </Section>
        </div>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <div style={s.footer}>
          {advisory.hasRecommendation && (
            <button onClick={onUseRecommended} disabled={loading} style={{
              ...s.btn, background: T.primary, color: T.bg, fontWeight: 700,
            }}>
              {loading ? 'Filing...' : 'Use Recommended Route'}
            </button>
          )}
          <button onClick={onContinueDirect} disabled={loading} style={{
            ...s.btn, background: T.amber, color: T.bg, fontWeight: 700,
          }}>
            {loading ? 'Filing...' : 'Continue with Direct'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section sub-component ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.8rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.primary, marginBottom: '0.4rem', borderBottom: `1px solid ${T.border}`, paddingBottom: '0.2rem' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px',
    width: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.8rem 1rem', borderBottom: `1px solid ${T.border}`,
  },
  closeBtn: {
    background: 'none', border: 'none', color: T.muted, fontSize: '1rem', cursor: 'pointer',
  },
  body: {
    padding: '1rem', overflowY: 'auto', flex: 1,
  },
  footer: {
    display: 'flex', gap: '0.6rem', justifyContent: 'flex-end',
    padding: '0.8rem 1rem', borderTop: `1px solid ${T.border}`,
  },
  btn: {
    padding: '0.5rem 1.2rem', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer',
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem',
  },
  th: {
    textAlign: 'left' as const, padding: '0.3rem 0.4rem', color: T.muted, borderBottom: `1px solid ${T.border}`,
    fontSize: '0.65rem', fontWeight: 600,
  },
  td: {
    padding: '0.3rem 0.4rem', color: T.textBright, borderBottom: `1px solid ${T.border}15`,
  },
}

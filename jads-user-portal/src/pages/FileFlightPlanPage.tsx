import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'
import { AerodromeAutocomplete } from '../components/portal/AerodromeAutocomplete'
import { AircraftTypeDropdown } from '../components/portal/AircraftTypeDropdown'
import { ZZZZCoordinatePanel } from '../components/portal/ZZZZCoordinatePanel'
import { AddresseeFlowPanel } from '../components/portal/AddresseeFlowPanel'

// ── Route Advisory types (mirror backend RouteAdvisory) ─────────────────────

interface RouteAdvisory {
  hasRecommendation: boolean
  routeType?: 'IFR' | 'VFR'
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
  vfrAdvisory?: {
    corridorNote: string
    maxAltitude: string
    requiresSpecialVfr: boolean
  } | null
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

  // ZZZZ coordinate state
  const [depCoord, setDepCoord] = useState<string | null>(null)
  const [destCoord, setDestCoord] = useState<string | null>(null)

  // ── Inline field validation state (O2–O10) ─────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // Pre-submit validation results (O12)
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    errors: Array<{ field: string; code: string; message: string }>
    warnings: Array<{ field: string; code: string; message: string }>
  } | null>(null)

  // ── Inline validation (runs on field change — frontend-only for instant UX) ──
  const validateInline = useCallback(() => {
    const errs: Record<string, string> = {}

    // O2: EOBT cannot be in the past
    if (form.eobt) {
      const eobtDate = new Date(form.eobt)
      if (!isNaN(eobtDate.getTime()) && eobtDate.getTime() < Date.now() - 15 * 60 * 1000) {
        errs.eobt = 'EOBT is in the past. You cannot file a flight plan for a past date/time.'
      }
    }

    // O6: Speed caps
    if (form.cruisingSpeed) {
      const ind = form.cruisingSpeed.charAt(0).toUpperCase()
      const val = parseInt(form.cruisingSpeed.substring(1))
      if (!isNaN(val)) {
        if (ind === 'N' && val > 600) errs.cruisingSpeed = `Speed ${val} knots exceeds max 600 knots.`
        if (ind === 'K' && val > 900) errs.cruisingSpeed = `Speed ${val} km/h exceeds max 900 km/h.`
        if (ind === 'M' && val > 35)  errs.cruisingSpeed = `Mach ${(val/10).toFixed(1)} exceeds max Mach 3.5.`
      }
    }

    // O7: EET and endurance
    const parseHHMM = (s: string): number | null => {
      if (!/^\d{4}$/.test(s)) return null
      return parseInt(s.substring(0, 2)) * 60 + parseInt(s.substring(2, 4))
    }
    if (form.eet) {
      const eetMin = parseHHMM(form.eet)
      if (eetMin !== null && eetMin > 1080) errs.eet = `EET ${form.eet} exceeds maximum 1800 (18 hours).`
      if (form.endurance) {
        const endMin = parseHHMM(form.endurance)
        if (eetMin !== null && endMin !== null && eetMin > endMin) {
          errs.eet = `EET (${form.eet}) exceeds fuel endurance (${form.endurance}).`
        }
      }
    }
    if (form.endurance && !/^\d{4}$/.test(form.endurance)) {
      errs.endurance = 'Endurance must be in HHMM format (e.g. 0500).'
    }

    // O8: POB
    const pob = parseInt(form.personsOnBoard)
    if (form.personsOnBoard && (isNaN(pob) || pob <= 0)) {
      errs.personsOnBoard = 'Persons on board must be at least 1.'
    } else if (pob > 600) {
      errs.personsOnBoard = 'Persons on board exceeds maximum 600.'
    }

    // O9: Email
    if (form.notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.notifyEmail.trim())) {
      errs.notifyEmail = 'Invalid email address.'
    }

    // O10: Mobile
    if (form.notifyMobile) {
      const m = form.notifyMobile.trim().replace(/\s/g, '')
      if (m && !m.startsWith('+91')) errs.notifyMobile = 'Must be Indian number (+91).'
      else if (m && !/^\+91[6-9]\d{9}$/.test(m)) errs.notifyMobile = 'Invalid Indian mobile (+91XXXXXXXXXX).'
    }

    setFieldErrors(errs)
  }, [form])

  useEffect(() => { validateInline() }, [validateInline])

  // Flight level advisory from backend API
  const [flAdvisory, setFlAdvisory] = useState<any>(null)
  const flDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!form.cruisingLevel) { setFlAdvisory(null); return }
    if (flDebounceRef.current) clearTimeout(flDebounceRef.current)
    flDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          level: form.cruisingLevel,
          rules: form.flightRules,
          adep: form.adep,
          ades: form.ades,
          equipment: form.equipment,
        })
        const { data } = await userApi().get(`/lookup/flight-level/check?${params}`)
        if (data.success) setFlAdvisory(data.advisory)
        else setFlAdvisory(null)
      } catch { setFlAdvisory(null) }
    }, 400)
    return () => { if (flDebounceRef.current) clearTimeout(flDebounceRef.current) }
  }, [form.cruisingLevel, form.flightRules, form.adep, form.ades, form.equipment])

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
    setValidationResult(null)

    // Auto-build Item 18 ZZZZ entries
    let item18Extra = ''
    if (form.adep.toUpperCase() === 'ZZZZ' && depCoord) {
      item18Extra += `DEP/${depCoord} `
    }
    if (form.ades.toUpperCase() === 'ZZZZ' && destCoord) {
      item18Extra += `DEST/${destCoord} `
    }
    if (item18Extra) {
      setForm(f => ({ ...f, item18: (item18Extra + f.item18).trim() }))
    }

    // ── O12: Pre-submit validation gate — call backend validator ──────────
    setAdvisoryLoading(true); setError(null)
    try {
      const payload = {
        ...form,
        personsOnBoard: parseInt(form.personsOnBoard) || 0,
        additionalEmails: form.additionalEmails
          ? form.additionalEmails.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      }
      const { data: valData } = await userApi().post('/flight-plans/validate', payload)

      if (!valData.valid) {
        // Show validation errors — block filing
        setValidationResult({
          valid: false,
          errors: valData.errors || [],
          warnings: valData.warnings || [],
        })
        setAdvisoryLoading(false)
        return
      }

      // Validation passed — show warnings if any, then proceed
      if (valData.warnings?.length > 0) {
        setValidationResult({
          valid: true,
          errors: [],
          warnings: valData.warnings,
        })
      }
    } catch {
      // Validation endpoint failed — proceed anyway (don't block on validator outage)
    }

    // ── Fetch route advisory ─────────────────────────────────────────────
    try {
      const { data } = await userApi().post('/flight-plans/route-advisory', {
        adep: form.adep.toUpperCase(),
        ades: form.ades.toUpperCase(),
        cruisingLevel: form.cruisingLevel,
        cruisingSpeed: form.cruisingSpeed,
        flightRules: form.flightRules,
      })
      if (data.success && data.advisory) {
        setAdvisory(data.advisory)
        setShowModal(true)
      } else {
        await filePlan()
      }
    } catch {
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
  const errHintStyle: React.CSSProperties = { fontSize: '0.6rem', color: T.red, marginTop: '2px' }
  const FieldErr = ({ name }: { name: string }) => fieldErrors[name] ? <div style={errHintStyle}>{fieldErrors[name]}</div> : null

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <h1 style={{ color: T.primary, fontSize: '1rem', marginBottom: '1rem' }}>File Flight Plan</h1>

      {error && (
        <div style={{ background: T.red + '15', border: `1px solid ${T.red}30`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', color: T.red, fontSize: '0.7rem' }}>
          {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      {/* ── O12: Validation Results Panel (pre-submit errors/warnings) ──── */}
      {validationResult && !validationResult.valid && (
        <div style={{ background: T.red + '10', border: `1px solid ${T.red}40`, borderRadius: '6px', padding: '0.8rem', marginBottom: '1rem' }}>
          <div style={{ color: T.red, fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            ✗ Flight plan validation failed — {validationResult.errors.length} error{validationResult.errors.length !== 1 ? 's' : ''} must be corrected
          </div>
          {validationResult.errors.map((err, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.7rem', borderBottom: `1px solid ${T.red}15` }}>
              <span style={{ color: T.red, fontWeight: 700, minWidth: '6rem' }}>{err.code}</span>
              <span style={{ color: T.textBright }}>{err.message}</span>
            </div>
          ))}
          {validationResult.warnings.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ color: T.amber, fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.3rem' }}>Warnings:</div>
              {validationResult.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '0.65rem', color: T.amber, padding: '0.15rem 0' }}>
                  {w.code}: {w.message}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setValidationResult(null)} style={{
            marginTop: '0.5rem', padding: '0.3rem 1rem', background: T.red, color: '#fff',
            border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer',
          }}>Fix and Retry</button>
        </div>
      )}
      {validationResult && validationResult.valid && validationResult.warnings.length > 0 && (
        <div style={{ background: T.amber + '10', border: `1px solid ${T.amber}40`, borderRadius: '6px', padding: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ color: T.amber, fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.3rem' }}>Warnings (non-blocking):</div>
          {validationResult.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.65rem', color: T.amber, padding: '0.15rem 0' }}>
              {w.code}: {w.message}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Aircraft Info */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Aircraft</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Aircraft ID</label><input value={form.aircraftId} onChange={set('aircraftId')} placeholder="VT-ABC" style={inputStyle} required /></div>
            <AircraftTypeDropdown
              value={form.aircraftType}
              onChange={(icao, wake) => setForm(f => ({ ...f, aircraftType: icao, wakeTurbulence: wake }))}
            />
            <div><label style={labelStyle}>Wake Turbulence</label>
              <select value={form.wakeTurbulence} onChange={set('wakeTurbulence')} style={inputStyle}>
                <option value="L">L (Light)</option>
                <option value="M">M (Medium)</option>
                <option value="H">H (Heavy)</option>
                <option value="J">J (Super)</option>
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
            <div>
              <AerodromeAutocomplete value={form.adep} onChange={v => setForm(f => ({ ...f, adep: v }))} placeholder="VIDP" required label="Departure (ADEP)" />
              {form.adep.toUpperCase() === 'ZZZZ' && <ZZZZCoordinatePanel field="DEP" onCoordinateChange={setDepCoord} />}
            </div>
            <div>
              <AerodromeAutocomplete value={form.ades} onChange={v => setForm(f => ({ ...f, ades: v }))} placeholder="VABB" required label="Destination (ADES)" />
              {form.ades.toUpperCase() === 'ZZZZ' && <ZZZZCoordinatePanel field="DEST" onCoordinateChange={setDestCoord} />}
            </div>
            <AerodromeAutocomplete value={form.altn1} onChange={v => setForm(f => ({ ...f, altn1: v }))} placeholder="VOBL" label="Alternate 1" />
            <AerodromeAutocomplete value={form.altn2} onChange={v => setForm(f => ({ ...f, altn2: v }))} placeholder="" label="Alternate 2" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Route</label><input value={form.route} onChange={set('route')} placeholder="DCT VNS DCT" style={inputStyle} required /></div>
            <div>
              <label style={labelStyle}>Cruising Level</label>
              <input value={form.cruisingLevel} onChange={set('cruisingLevel')} placeholder="F350 or VFR" style={inputStyle} />
              {/* Inline Flight Level Advisory (from backend) */}
              {flAdvisory && (
                <div style={{
                  marginTop: '0.3rem', padding: '0.4rem', borderRadius: '4px', fontSize: '0.6rem',
                  background: flAdvisory.semicircular?.isCompliant === false ? T.red + '12' :
                    (flAdvisory.rvsm && !flAdvisory.rvsm.equipmentOk) ? T.amber + '12' : '#4CAF5012',
                  border: `1px solid ${
                    flAdvisory.semicircular?.isCompliant === false ? T.red + '40' :
                    (flAdvisory.rvsm && !flAdvisory.rvsm.equipmentOk) ? T.amber + '40' : '#4CAF5040'
                  }`,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.2rem', color: T.textBright }}>
                    {flAdvisory.levelDisplay} — {flAdvisory.altitudeFt?.toLocaleString() ?? '?'} ft
                  </div>
                  {flAdvisory.semicircular?.applicable && (
                    <div style={{
                      color: flAdvisory.semicircular.isCompliant ? '#4CAF50' : T.red,
                    }}>
                      {flAdvisory.semicircular.isCompliant ? '\u2713' : '\u2717'} {flAdvisory.semicircular.rule}
                    </div>
                  )}
                  {flAdvisory.rvsm && (
                    <div style={{ color: flAdvisory.rvsm.equipmentOk ? '#4CAF50' : T.amber }}>
                      {flAdvisory.rvsm.message}
                    </div>
                  )}
                  {flAdvisory.transitionInfo && (
                    <div style={{ color: T.muted }}>{flAdvisory.transitionInfo}</div>
                  )}
                </div>
              )}
            </div>
            <div><label style={labelStyle}>Cruising Speed</label><input value={form.cruisingSpeed} onChange={set('cruisingSpeed')} placeholder="N0480" style={inputStyle} /><FieldErr name="cruisingSpeed" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>EOBT (UTC)</label><input type="datetime-local" value={form.eobt} onChange={set('eobt')} style={inputStyle} required /><FieldErr name="eobt" /></div>
            <div><label style={labelStyle}>EET</label><input value={form.eet} onChange={set('eet')} placeholder="0130" style={inputStyle} /><FieldErr name="eet" /></div>
            <div><label style={labelStyle}>Endurance</label><input value={form.endurance} onChange={set('endurance')} placeholder="0400" style={inputStyle} /><FieldErr name="endurance" /></div>
            <div><label style={labelStyle}>POB</label><input value={form.personsOnBoard} onChange={set('personsOnBoard')} type="number" min="1" style={inputStyle} /><FieldErr name="personsOnBoard" /></div>
          </div>
        </fieldset>

        {/* ── O11: AFTN Addressee Flow ─────────────────────────────────── */}
        {form.adep && form.ades && form.adep.length === 4 && form.ades.length === 4 && (
          <AddresseeFlowPanel adep={form.adep} ades={form.ades} altn1={form.altn1} altn2={form.altn2} />
        )}

        {/* Notifications */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Notifications</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Email</label><input value={form.notifyEmail} onChange={set('notifyEmail')} placeholder="pilot@email.com" style={inputStyle} /><FieldErr name="notifyEmail" /></div>
            <div><label style={labelStyle}>Mobile</label><input value={form.notifyMobile} onChange={set('notifyMobile')} placeholder="+919800000001" style={inputStyle} /><FieldErr name="notifyMobile" /></div>
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
          {/* ── Route Type Badge ──────────────────────────────────────── */}
          {advisory.routeType && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{
                display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '3px',
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
                background: advisory.routeType === 'VFR' ? T.amber : T.primary,
                color: T.bg,
              }}>
                {advisory.routeType} ROUTE
              </span>
            </div>
          )}

          {/* ── VFR Advisory ──────────────────────────────────────────── */}
          {advisory.vfrAdvisory && (
            <Section title="VFR Flight Advisory">
              <div style={{ fontSize: '0.7rem', color: T.text, lineHeight: '1.5' }}>
                {advisory.vfrAdvisory.corridorNote}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.65rem', color: T.muted, marginTop: '0.3rem' }}>
                <span>Max Altitude: <strong style={{ color: T.textBright }}>{advisory.vfrAdvisory.maxAltitude}</strong></span>
                {advisory.vfrAdvisory.requiresSpecialVfr && (
                  <span style={{ color: T.red, fontWeight: 700 }}>Special VFR may be required</span>
                )}
              </div>
            </Section>
          )}

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
          ) : !advisory.vfrAdvisory ? (
            <Section title="No Published Airway Found">
              <div style={{ fontSize: '0.7rem', color: T.muted }}>
                No published ATS airway connects {adep} to {ades}. You may file a direct (DCT) route.
              </div>
            </Section>
          ) : null}

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

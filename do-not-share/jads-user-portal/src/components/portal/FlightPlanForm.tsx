import React, { useState, useMemo } from 'react'
import { T } from '../../theme'
import { INDIAN_AERODROMES, AIRCRAFT_TYPES, resolveCallsign } from '../../data/icaoData'
import { validateFlightPlan, formatFPLString } from '../../services/flightPlanService'
import type { ICAOFlightPlan, FlightRules, FlightType, WakeTurbulence, EquipmentCode, SSRCode, ADSBCode, Field18Key } from '../../types/flightPlan'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: '4px', color: T.textBright, fontSize: '0.75rem', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.6rem', color: T.muted, marginBottom: '0.2rem', fontWeight: 600,
}
const sectionStyle: React.CSSProperties = {
  marginBottom: '1.25rem', padding: '1rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.55rem', color: T.muted, marginTop: '0.15rem' }}>{hint}</p>}
    </div>
  )
}

function Autocomplete({ items, value, onChange, placeholder }: {
  items: { value: string; label: string }[]
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const filtered = items.filter(i => i.value.includes(value.toUpperCase()) || i.label.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
  return (
    <div style={{ position: 'relative' }}>
      <input style={inputStyle} value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && filtered.length > 0 && value.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: '0 0 4px 4px',
          maxHeight: '150px', overflow: 'auto',
        }}>
          {filtered.map(i => (
            <div key={i.value} style={{ padding: '0.35rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem', color: T.textBright }}
              onMouseDown={() => { onChange(i.value); setOpen(false) }}>
              <span style={{ color: T.primary }}>{i.value}</span> — {i.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FlightPlanForm({ onPreviewUpdate }: { onPreviewUpdate?: (fpl: string) => void }) {
  const [fpl, setFpl] = useState<Partial<ICAOFlightPlan>>({
    aircraftId: '', flightRules: 'I', flightType: 'S', aircraftType: '', wakeTurbulence: 'M',
    equipment: ['S'], ssr: 'C', adsb: [],
    departureAerodrome: '', eobt: '',
    route: '', cruisingSpeed: 'N0440', cruisingLevel: 'F350',
    destinationAerodrome: '', eet: '', alternate1: '', alternate2: '',
    field18: {} as Record<Field18Key, string>,
    endurance: '', personsOnBoard: 0, eltType: '', pilotName: '', pilotContact: '', organization: '',
  })

  const update = <K extends keyof ICAOFlightPlan>(key: K, val: ICAOFlightPlan[K]) =>
    setFpl(f => ({ ...f, [key]: val }))

  // Callsign intelligence
  const callsignRes = useMemo(() => {
    if (!fpl.aircraftId) return null
    return resolveCallsign(fpl.aircraftId)
  }, [fpl.aircraftId])

  // Auto-detect military
  const isIFC = fpl.aircraftId?.toUpperCase().startsWith('IFC')
  if (isIFC && fpl.flightType !== 'M') update('flightType', 'M')

  // Auto-wake from aircraft type
  const acTypeInfo = useMemo(() => {
    return AIRCRAFT_TYPES.find(a => a.icao === fpl.aircraftType?.toUpperCase())
  }, [fpl.aircraftType])

  const validation = useMemo(() => validateFlightPlan(fpl), [fpl])

  const aerodromeItems = INDIAN_AERODROMES.map(a => ({ value: a.icao, label: `${a.name}, ${a.city}` }))
  const acTypeItems = AIRCRAFT_TYPES.map(a => ({ value: a.icao, label: `${a.name} (${a.wake})` }))

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.25rem' }}>ICAO Flight Plan Form</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>Doc 4444 Compliant — Filing authority controls all fields</p>

      {/* FIELD 7 — Aircraft Identification */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 7 — Aircraft Identification</h3>
        <Field label="CALL SIGN / REGISTRATION" hint="Max 7 alphanumeric. VT- registration or 3LD + flight number.">
          <input style={inputStyle} value={fpl.aircraftId ?? ''} maxLength={7}
            onChange={e => update('aircraftId', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="e.g. AIC101 or VT-ABC" />
        </Field>
        {callsignRes && (
          <div style={{ fontSize: '0.65rem', padding: '0.4rem', background: T.bg, borderRadius: '4px' }}>
            <span style={{ color: T.muted }}>Type: </span><span style={{ color: T.primary }}>{callsignRes.type}</span>
            <span style={{ color: T.muted }}> | Transmitted: </span><span style={{ color: T.textBright }}>{callsignRes.transmitted}</span>
            {callsignRes.telephony && <><br /><span style={{ color: T.muted }}>Telephony: </span><span style={{ color: '#00C864' }}>{callsignRes.telephony}</span></>}
            {callsignRes.airline && <><span style={{ color: T.muted }}> ({callsignRes.airline})</span></>}
            {callsignRes.isDefunct && <span style={{ color: T.red, fontWeight: 700 }}> DEFUNCT — {callsignRes.defunctNote}</span>}
            {callsignRes.warning && <><br /><span style={{ color: T.amber }}>{callsignRes.warning}</span></>}
          </div>
        )}
      </div>

      {/* FIELD 8 — Flight Rules & Type */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 8 — Flight Rules & Type</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="FLIGHT RULES">
            <select style={inputStyle} value={fpl.flightRules} onChange={e => update('flightRules', e.target.value as FlightRules)}>
              <option value="I">I — IFR</option><option value="V">V — VFR</option>
              <option value="Y">Y — IFR then VFR</option><option value="Z">Z — VFR then IFR</option>
            </select>
          </Field>
          <Field label="TYPE OF FLIGHT">
            <select style={inputStyle} value={fpl.flightType} onChange={e => update('flightType', e.target.value as FlightType)}>
              <option value="S">S — Scheduled</option><option value="N">N — Non-scheduled</option>
              <option value="G">G — General aviation</option><option value="M">M — Military</option>
              <option value="X">X — Other</option>
            </select>
          </Field>
        </div>
        {isIFC && <p style={{ fontSize: '0.6rem', color: T.amber }}>IFC callsign detected — type auto-set to Military (M)</p>}
      </div>

      {/* FIELD 9 — Aircraft Type & Wake */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 9 — Aircraft Type & Wake Turbulence</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
          <Field label="AIRCRAFT TYPE (ICAO Doc 8643)">
            <Autocomplete items={acTypeItems} value={fpl.aircraftType ?? ''} onChange={v => {
              update('aircraftType', v)
              const t = AIRCRAFT_TYPES.find(a => a.icao === v.toUpperCase())
              if (t) update('wakeTurbulence', t.wake)
            }} placeholder="e.g. B738, A320" />
          </Field>
          <Field label="WAKE TURBULENCE">
            <select style={inputStyle} value={fpl.wakeTurbulence} onChange={e => update('wakeTurbulence', e.target.value as WakeTurbulence)}>
              <option value="J">J — Super</option><option value="H">H — Heavy</option>
              <option value="M">M — Medium</option><option value="L">L — Light</option>
            </select>
          </Field>
        </div>
        {acTypeInfo && <p style={{ fontSize: '0.6rem', color: T.muted }}>Detected: {acTypeInfo.name} — Wake: {acTypeInfo.wake}</p>}
      </div>

      {/* FIELD 10 — Equipment */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 10 — Equipment (COM/NAV + SSR)</h3>
        <Field label="COM/NAV EQUIPMENT">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {([
              ['S', 'Standard (VHF/VOR/ILS)'], ['G', 'GNSS'], ['R', 'PBN (→ PBN/ in F18)'],
              ['D', 'DME'], ['O', 'VOR only'], ['W', 'RVSM'], ['Z', 'Other'],
            ] as [EquipmentCode, string][]).map(([code, desc]) => (
              <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: T.textBright }}>
                <input type="checkbox" checked={fpl.equipment?.includes(code)} onChange={e => {
                  const eq = fpl.equipment ?? []
                  update('equipment', e.target.checked ? [...eq, code] : eq.filter(c => c !== code))
                }} />
                {code} — {desc}
              </label>
            ))}
          </div>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="SSR">
            <select style={inputStyle} value={fpl.ssr} onChange={e => update('ssr', e.target.value as SSRCode)}>
              <option value="N">N — None</option><option value="A">A — Mode A</option>
              <option value="C">C — Mode A+C</option><option value="S">S — Mode S</option>
            </select>
          </Field>
          <Field label="ADS-B">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {(['B1', 'B2', 'U1', 'U2', 'V1', 'V2'] as ADSBCode[]).map(code => (
                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.65rem', color: T.textBright }}>
                  <input type="checkbox" checked={fpl.adsb?.includes(code)} onChange={e => {
                    const a = fpl.adsb ?? []
                    update('adsb', e.target.checked ? [...a, code] : a.filter(c => c !== code))
                  }} />
                  {code}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <p style={{ fontSize: '0.6rem', color: T.muted }}>
          Generated: {(fpl.equipment ?? []).join('')}/{fpl.ssr}{(fpl.adsb ?? []).join('')}
        </p>
      </div>

      {/* FIELD 13 — Departure */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 13 — Departure</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
          <Field label="DEPARTURE AERODROME">
            <Autocomplete items={aerodromeItems} value={fpl.departureAerodrome ?? ''} onChange={v => update('departureAerodrome', v)} placeholder="e.g. VIDP" />
          </Field>
          <Field label="EOBT (UTC)" hint="IST = UTC + 5:30">
            <input style={inputStyle} type="time" value={fpl.eobt ?? ''} onChange={e => update('eobt', e.target.value.replace(':', ''))} />
          </Field>
        </div>
      </div>

      {/* FIELD 15 — Route */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 15 — Route</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="CRUISING SPEED">
            <input style={inputStyle} value={fpl.cruisingSpeed ?? ''} onChange={e => update('cruisingSpeed', e.target.value.toUpperCase())} placeholder="N0440 or M082" />
          </Field>
          <Field label="CRUISING LEVEL">
            <input style={inputStyle} value={fpl.cruisingLevel ?? ''} onChange={e => update('cruisingLevel', e.target.value.toUpperCase())} placeholder="F350 or S1050" />
          </Field>
        </div>
        <Field label="ROUTE" hint="RouteBuilder (UP04) will provide assisted entry">
          <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={fpl.route ?? ''}
            onChange={e => update('route', e.target.value.toUpperCase())} placeholder="e.g. DOVAN1D DOVAN A464 TULNA B463 NATKA PEPUK2A" />
        </Field>
      </div>

      {/* FIELD 16 — Destination */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 16 — Destination, EET & Alternates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
          <Field label="DESTINATION AERODROME">
            <Autocomplete items={aerodromeItems} value={fpl.destinationAerodrome ?? ''} onChange={v => update('destinationAerodrome', v)} placeholder="e.g. VABB" />
          </Field>
          <Field label="EET (HHMM)">
            <input style={inputStyle} value={fpl.eet ?? ''} onChange={e => update('eet', e.target.value)} placeholder="0120" maxLength={4} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="ALTERNATE 1">
            <Autocomplete items={aerodromeItems} value={fpl.alternate1 ?? ''} onChange={v => update('alternate1', v)} />
          </Field>
          <Field label="ALTERNATE 2">
            <Autocomplete items={aerodromeItems} value={fpl.alternate2 ?? ''} onChange={v => update('alternate2', v)} />
          </Field>
        </div>
      </div>

      {/* FIELD 18 — Other Information */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 18 — Other Information</h3>
        {(['PBN', 'STS', 'REG', 'EET', 'RMK', 'OPR', 'PER'] as Field18Key[]).map(key => (
          <Field key={key} label={`${key}/`}>
            <input style={inputStyle} value={(fpl.field18 as any)?.[key] ?? ''}
              onChange={e => update('field18', { ...fpl.field18, [key]: e.target.value } as any)} />
          </Field>
        ))}
      </div>

      {/* FIELD 19 — Supplementary */}
      <div style={sectionStyle}>
        <h3 style={{ color: T.amber, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Field 19 — Supplementary Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <Field label="ENDURANCE (HHMM)">
            <input style={inputStyle} value={fpl.endurance ?? ''} onChange={e => update('endurance', e.target.value)} maxLength={4} />
          </Field>
          <Field label="PERSONS ON BOARD">
            <input style={inputStyle} type="number" min={0} value={fpl.personsOnBoard ?? ''} onChange={e => update('personsOnBoard', Number(e.target.value))} />
          </Field>
          <Field label="ELT">
            <input style={inputStyle} value={fpl.eltType ?? ''} onChange={e => update('eltType', e.target.value.toUpperCase())} placeholder="U, V, E etc." />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="PILOT NAME">
            <input style={inputStyle} value={fpl.pilotName ?? ''} onChange={e => update('pilotName', e.target.value)} />
          </Field>
          <Field label="CONTACT">
            <input style={inputStyle} value={fpl.pilotContact ?? ''} onChange={e => update('pilotContact', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Validation summary */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div style={{ marginBottom: '1rem', fontSize: '0.65rem' }}>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ color: T.red, padding: '0.2rem 0' }}>Field {e.field}: {e.message}</div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={i} style={{ color: T.amber, padding: '0.2rem 0' }}>Field {w.field}: {w.message}</div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.6rem', color: T.muted, fontStyle: 'italic', marginTop: '1rem' }}>
        Filing authority controls all fields. Approving authority (AAI/DGCA) makes the final accept/reject decision.
      </p>
    </div>
  )
}

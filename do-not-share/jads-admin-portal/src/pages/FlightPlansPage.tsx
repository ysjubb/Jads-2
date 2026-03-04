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
  DRAFT:              T.muted,
  VALIDATED:          T.primary,
  FILED:              T.amber,
  ACKNOWLEDGED:       '#B060FF',
  ADC_ISSUED:         T.amber,
  FIC_ISSUED:         T.amber,
  FULLY_CLEARED:      T.primary,
  ACTIVATED:          T.primary,
  COMPLETED:          T.primary,
  CANCELLED:          T.red,
  DELAYED:            T.amber,
  OVERDUE:            T.red,
  REJECTED_BY_ATC:    T.red,
  CLEARANCE_REJECTED: T.red,
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT:              'Draft',
  VALIDATED:          'Validated',
  FILED:              'Filed',
  ACKNOWLEDGED:       'Acknowledged',
  ADC_ISSUED:         'ADC Issued',
  FIC_ISSUED:         'FIC Issued',
  FULLY_CLEARED:      'Fully Cleared',
  ACTIVATED:          'Activated',
  COMPLETED:          'Completed',
  CANCELLED:          'Cancelled',
  DELAYED:            'Delayed',
  OVERDUE:            'Overdue',
  REJECTED_BY_ATC:    'Rejected by ATC',
  CLEARANCE_REJECTED: 'Clearance Rejected',
}

const FTYPE_LABELS: Record<string, string> = {
  S: 'Scheduled', N: 'Non-Scheduled', G: 'General Aviation',
  M: 'Military',  X: 'Other',
}

// ── OFPL Parser — breaks an ICAO FPL message into numbered items ────────────
// ICAO Doc 4444 FPL format:
//   (FPL-Item7-Item8-Item9-Item10-Item13-Item15-Item16-Item18[-Item19])
//
// Each dash-separated section maps to an ICAO item number.
// This parser handles newlines within the message (JADS format) and single-line
// format (copied from AFTN terminal).

interface ParsedOfplItems {
  raw:    string
  item7:  string    // Aircraft ID + SSR
  item8:  string    // Flight rules + type
  item9:  string    // Aircraft type / wake
  item10: string    // Equipment / surveillance
  item13: string    // Departure + EOBT
  item15: string    // Speed / level / route
  item16: string    // Destination / EET / alternates
  item18: string    // Other information
  item19: string    // Supplementary (endurance, POB, SAR)
}

function parseOfplMessage(raw: string): ParsedOfplItems | null {
  // Strip surrounding whitespace, normalise line breaks
  const cleaned = raw.trim().replace(/\r\n/g, '\n')

  // Must start with (FPL- and end with )
  if (!cleaned.startsWith('(FPL-') || !cleaned.endsWith(')')) return null

  // Remove the outer (FPL- and )
  const inner = cleaned.slice(5, -1)

  // Split on \n- (JADS multi-line) or just - at field boundaries.
  // ICAO FPL fields are separated by \n- (multi-line) or - (single-line).
  // The tricky part: route field (Item 15) can contain spaces but not leading dashes.
  // Strategy: join all lines, then split on the dash-field pattern.
  const singleLine = inner.replace(/\n-/g, '-')

  // Split into dash-separated fields. Each dash starts a new ICAO item.
  // We need to split carefully because the route in Item 15 can contain spaces.
  const fields: string[] = []
  let current = ''
  let depth   = 0

  for (let i = 0; i < singleLine.length; i++) {
    const ch = singleLine[i]
    if (ch === '-' && depth === 0 && i > 0) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
    // Track parentheses depth (shouldn't appear in standard FPL, but safety)
    if (ch === '(') depth++
    if (ch === ')') depth--
  }
  if (current) fields.push(current)

  // Map to items — minimum 7 fields for a valid FPL
  if (fields.length < 7) return null

  return {
    raw:    cleaned,
    item7:  fields[0] ?? '',   // Callsign
    item8:  fields[1] ?? '',   // Rules + type
    item9:  fields[2] ?? '',   // Acft type / wake
    item10: fields[3] ?? '',   // Equipment
    item13: fields[4] ?? '',   // Departure + EOBT
    item15: fields[5] ?? '',   // Speed / level / route
    item16: fields[6] ?? '',   // Destination / EET / altn
    item18: fields[7] ?? '',   // Other info
    item19: fields[8] ?? '',   // Supplementary
  }
}

// ICAO item labels for display
const ITEM_LABELS: Record<string, string> = {
  item7:  'Item 7 — Aircraft ID',
  item8:  'Item 8 — Flight Rules / Type',
  item9:  'Item 9 — Aircraft Type / Wake',
  item10: 'Item 10 — Equipment / Surveillance',
  item13: 'Item 13 — Departure / EOBT',
  item15: 'Item 15 — Route',
  item16: 'Item 16 — Destination / EET / Alternates',
  item18: 'Item 18 — Other Information',
  item19: 'Item 19 — Supplementary',
}

// ── AFTN Preview + OFPL Comparison Panel ─────────────────────────────────────

function AftnPanel({ plan, onClose }: { plan: FlightPlan; onClose: () => void }) {
  const [copied, setCopied]       = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [externalOfpl, setExternalOfpl] = useState('')
  const [compareResult, setCompareResult] = useState<{
    jads: ParsedOfplItems; external: ParsedOfplItems; diffs: string[]
  } | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)

  const copy = () => {
    navigator.clipboard.writeText(plan.aftnMessage ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const runComparison = () => {
    setCompareError(null); setCompareResult(null)
    if (!plan.aftnMessage) { setCompareError('No JADS AFTN message to compare.'); return }
    if (!externalOfpl.trim()) { setCompareError('Paste the external OFPL message first.'); return }

    const jads     = parseOfplMessage(plan.aftnMessage)
    const external = parseOfplMessage(externalOfpl)

    if (!jads)     { setCompareError('Could not parse JADS AFTN message. Unexpected format.'); return }
    if (!external) { setCompareError('Could not parse external OFPL. Must start with (FPL- and end with ).'); return }

    const diffs: string[] = []
    const keys: (keyof ParsedOfplItems)[] = ['item7','item8','item9','item10','item13','item15','item16','item18','item19']
    for (const key of keys) {
      const jVal = (jads[key] ?? '').trim()
      const eVal = (external[key] ?? '').trim()
      if (jVal !== eVal) diffs.push(key)
    }

    setCompareResult({ jads, external, diffs })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: T.surface, borderRadius: '8px',
        width: showCompare ? '960px' : '680px', maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: `0 8px 32px rgba(0,255,136,0.1)`,
        border: `1px solid ${T.border}`, transition: 'width 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: T.textBright }}>
              {showCompare ? 'OFPL Comparison' : 'AFTN Message'}
            </span>
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
        {!showCompare && plan.aftnAddressees && (
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

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
          {!showCompare ? (
            /* ── Normal AFTN view ──────────────────────────────────── */
            plan.aftnMessage ? (
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
            )
          ) : (
            /* ── Comparison view ───────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Paste area */}
              <div>
                <label style={{ fontSize: '0.8rem', color: T.muted, display: 'block', marginBottom: '0.3rem' }}>
                  Paste the OFPL from the external system (AAI AFTN terminal, Jeppesen, etc.):
                </label>
                <textarea
                  value={externalOfpl}
                  onChange={e => { setExternalOfpl(e.target.value); setCompareResult(null); setCompareError(null) }}
                  placeholder={'(FPL-VT-ABC-IG\n-B738/M\n-SDFG/LB1\n-VIDP041200\n-N0450F350 DCT\n-VABB/0200 VAAH\n-DOF/260304 REG/VTABC)'}
                  style={{
                    width: '100%', minHeight: '100px', padding: '0.75rem',
                    fontFamily: "'Courier New', monospace", fontSize: '0.8rem',
                    background: T.bg, color: T.text, border: `1px solid ${T.border}`,
                    borderRadius: '6px', resize: 'vertical',
                  }}
                />
                <button onClick={runComparison}
                  style={{
                    marginTop: '0.5rem', padding: '0.4rem 1rem', borderRadius: '4px',
                    cursor: 'pointer', border: `1px solid ${T.amber}60`,
                    background: T.amber + '20', color: T.amber,
                    fontWeight: 600, fontSize: '0.85rem',
                  }}>
                  Compare Field-by-Field
                </button>
              </div>

              {compareError && (
                <div style={{ color: T.red, padding: '0.5rem 0.75rem', background: T.red + '15',
                  border: `1px solid ${T.red}40`, borderRadius: '4px', fontSize: '0.85rem' }}>
                  {compareError}
                </div>
              )}

              {/* Comparison results */}
              {compareResult && (
                <div>
                  {/* Summary */}
                  <div style={{
                    padding: '0.6rem 0.8rem', borderRadius: '4px', marginBottom: '0.75rem',
                    background: compareResult.diffs.length === 0 ? T.primary + '15' : T.amber + '15',
                    border: `1px solid ${compareResult.diffs.length === 0 ? T.primary : T.amber}40`,
                    color: compareResult.diffs.length === 0 ? T.primary : T.amber,
                    fontWeight: 600, fontSize: '0.9rem',
                  }}>
                    {compareResult.diffs.length === 0
                      ? 'MATCH — All ICAO items are identical.'
                      : `${compareResult.diffs.length} field${compareResult.diffs.length > 1 ? 's' : ''} differ`}
                  </div>

                  {/* Field-by-field table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                        <th style={{ padding: '0.4rem', textAlign: 'left', color: T.muted, width: '28%' }}>ICAO Item</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left', color: T.primary, width: '36%' }}>JADS</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left', color: T.amber, width: '36%' }}>External OFPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['item7','item8','item9','item10','item13','item15','item16','item18','item19'] as const).map(key => {
                        const jVal     = (compareResult.jads[key] ?? '').trim()
                        const eVal     = (compareResult.external[key] ?? '').trim()
                        const isDiff   = compareResult.diffs.includes(key)
                        const isEmpty  = !jVal && !eVal

                        if (isEmpty) return null

                        return (
                          <tr key={key} style={{
                            borderBottom: `1px solid ${T.border}`,
                            background: isDiff ? T.red + '08' : 'transparent',
                          }}>
                            <td style={{ padding: '0.4rem', color: isDiff ? T.red : T.muted,
                              fontWeight: isDiff ? 600 : 400, fontSize: '0.75rem', verticalAlign: 'top' }}>
                              {ITEM_LABELS[key]}
                              {isDiff && <span style={{ display: 'block', fontSize: '0.65rem',
                                color: T.red, marginTop: '0.15rem' }}>DIFFERS</span>}
                            </td>
                            <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.78rem',
                              color: isDiff ? T.primary : T.text, wordBreak: 'break-all', verticalAlign: 'top' }}>
                              {jVal || <span style={{ color: T.muted }}>—</span>}
                            </td>
                            <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.78rem',
                              color: isDiff ? T.amber : T.text, wordBreak: 'break-all', verticalAlign: 'top' }}>
                              {eVal || <span style={{ color: T.muted }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clearance details */}
        {!showCompare && (plan.ficNumber || plan.adcNumber) && (
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
          display: 'flex', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {plan.aftnMessage && (
              <button onClick={() => { setShowCompare(!showCompare); setCompareResult(null); setCompareError(null) }}
                style={{
                  padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
                  border: `1px solid ${T.amber}40`,
                  background: showCompare ? T.amber + '25' : 'transparent',
                  color: T.amber, fontSize: '0.875rem', fontWeight: showCompare ? 600 : 400,
                }}>
                {showCompare ? 'Back to Message' : 'Compare with OFPL'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!showCompare && plan.aftnMessage && (
              <button onClick={copy}
                style={{
                  padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
                  border: `1px solid ${T.primary}40`,
                  background: T.primary + '15',
                  color: T.primary, fontSize: '0.875rem',
                }}>
                {copied ? 'Copied' : 'Copy Message'}
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
    </div>
  )
}

// ── Clearance Issuance Panel ────────────────────────────────────────────────
// Admin simulates AFMLU (ADC) and FIR (FIC) clearance issuance.
// Pilot's app receives the numbers via SSE in real time.

function ClearancePanel({ plan, token, onDone }: {
  plan: FlightPlan; token: string; onDone: () => void
}) {
  const [adcNumber, setAdcNumber] = useState(
    `ADC-${String(Math.floor(Math.random() * 900) + 100)}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`
  )
  const [adcType, setAdcType]     = useState('RESTRICTED')
  const [afmluId, setAfmluId]     = useState(1)
  const [ficNumber, setFicNumber] = useState(
    `FIC/VIDF/${String(Math.floor(Math.random() * 900) + 100)}/${new Date().getFullYear()}`
  )
  const [firCode, setFirCode]     = useState('VIDF')
  const [ficSubject, setFicSubject] = useState('Corridor clearance approved')
  const [busy, setBusy]           = useState(false)
  const [result, setResult]       = useState<string | null>(null)
  const [err, setErr]             = useState<string | null>(null)

  const issueAdc = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const { data } = await adminAxios(token).post(`/flight-plans/${plan.id}/issue-adc`, {
        adcNumber, adcType, afmluId
      })
      setResult(`ADC issued: ${adcNumber} — Status: ${data.clearanceStatus}`)
    } catch (e: any) {
      setErr(e.response?.data?.detail ?? e.response?.data?.error ?? 'ADC_ISSUE_FAILED')
    } finally { setBusy(false) }
  }

  const issueFic = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const { data } = await adminAxios(token).post(`/flight-plans/${plan.id}/issue-fic`, {
        ficNumber, firCode, subject: ficSubject
      })
      setResult(`FIC issued: ${ficNumber} — Status: ${data.clearanceStatus}`)
    } catch (e: any) {
      setErr(e.response?.data?.detail ?? e.response?.data?.error ?? 'FIC_ISSUE_FAILED')
    } finally { setBusy(false) }
  }

  const inputStyle = {
    padding: '0.4rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px',
    background: T.bg, color: T.text, fontSize: '0.85rem', width: '100%',
    fontFamily: 'monospace',
  }

  const btnStyle = (color: string) => ({
    padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer',
    border: `1px solid ${color}60`, background: color + '20', color,
    fontWeight: 600 as const, fontSize: '0.85rem', opacity: busy ? 0.6 : 1,
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: T.surface, borderRadius: '8px', width: '600px', maxWidth: '95vw',
        boxShadow: `0 8px 32px rgba(0,255,136,0.1)`, border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontWeight: 700, color: T.textBright }}>Issue Clearance</span>
            <span style={{ marginLeft: '0.75rem', fontFamily: 'monospace',
              fontSize: '0.85rem', color: T.muted }}>
              {plan.aircraftId} {plan.adep} → {plan.ades}
            </span>
          </div>
          <button onClick={onDone}
            style={{ border: 'none', background: 'none', fontSize: '1.25rem',
              cursor: 'pointer', color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* ADC Section */}
          <div style={{ background: T.bg, borderRadius: '6px', padding: '1rem',
            border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 600, color: T.amber, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              AFMLU — Issue ADC Number
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  ADC Number
                </label>
                <input value={adcNumber} onChange={e => setAdcNumber(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  ADC Type
                </label>
                <select value={adcType} onChange={e => setAdcType(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'inherit' }}>
                  <option value="RESTRICTED">Restricted</option>
                  <option value="PROHIBITED">Prohibited</option>
                  <option value="DANGER">Danger</option>
                  <option value="CONTROLLED">Controlled</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  AFMLU ID (1-10)
                </label>
                <input type="number" min={1} max={10} value={afmluId}
                  onChange={e => setAfmluId(parseInt(e.target.value) || 1)} style={inputStyle} />
              </div>
            </div>
            <button onClick={issueAdc} disabled={busy} style={btnStyle(T.amber)}>
              {busy ? 'Issuing…' : 'Issue ADC'}
            </button>
          </div>

          {/* FIC Section */}
          <div style={{ background: T.bg, borderRadius: '6px', padding: '1rem',
            border: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 600, color: '#B060FF', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              FIR — Issue FIC Number
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  FIC Number
                </label>
                <input value={ficNumber} onChange={e => setFicNumber(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  FIR Code
                </label>
                <select value={firCode} onChange={e => setFirCode(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'inherit' }}>
                  <option value="VIDF">VIDF — Delhi</option>
                  <option value="VABB">VABB — Mumbai</option>
                  <option value="VECC">VECC — Kolkata</option>
                  <option value="VOMF">VOMF — Chennai</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.7rem', color: T.muted, display: 'block', marginBottom: '0.2rem' }}>
                  Subject
                </label>
                <input value={ficSubject} onChange={e => setFicSubject(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <button onClick={issueFic} disabled={busy} style={btnStyle('#B060FF')}>
              {busy ? 'Issuing…' : 'Issue FIC'}
            </button>
          </div>

          {/* Result / Error */}
          {result && (
            <div style={{ color: T.primary, padding: '0.6rem 0.8rem', background: T.primary + '15',
              border: `1px solid ${T.primary}40`, borderRadius: '4px', fontSize: '0.85rem',
              fontFamily: 'monospace' }}>
              {result}
            </div>
          )}
          {err && (
            <div style={{ color: T.red, padding: '0.6rem 0.8rem', background: T.red + '15',
              border: `1px solid ${T.red}40`, borderRadius: '4px', fontSize: '0.85rem' }}>
              {err}
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
            Issuing ADC or FIC pushes the number to the pilot's app in real time via SSE.
            Both can be issued independently. Once both ADC and FIC are issued, the plan
            becomes FULLY_CLEARED.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onDone}
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
  const [clearancePlan, setClearancePlan] = useState<FlightPlan | null>(null)

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

  const canIssueClearance = (status: string) =>
    ['FILED', 'ACKNOWLEDGED', 'ADC_ISSUED', 'FIC_ISSUED'].includes(status)

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
                  'Filed By', 'FIC', 'ADC', 'AFTN', 'Clearance', 'Filed At'].map(h => (
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
                  <td style={{ padding:'0.5rem 0.75rem' }}>
                    {canIssueClearance(p.status) ? (
                      <button
                        onClick={() => setClearancePlan(p)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          background: T.amber + '20',
                          border: `1px solid ${T.amber}60`,
                          color: T.amber,
                          borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        Issue ADC/FIC
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: T.muted }}>
                        {p.status === 'FULLY_CLEARED' ? 'Cleared' : '—'}
                      </span>
                    )}
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

      {/* Clearance Issuance Modal */}
      {clearancePlan && token && (
        <ClearancePanel
          plan={clearancePlan}
          token={token}
          onDone={() => { setClearancePlan(null); fetchPlans() }}
        />
      )}
    </div>
  )
}

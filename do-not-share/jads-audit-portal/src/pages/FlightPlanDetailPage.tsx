import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuditAuth, auditAxios } from '../hooks/useAuditAuth'

declare const L: any

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

const STATE_COLOUR: Record<string, string> = {
  DRAFT: '#6A6040', FILED: '#FFB800', FULLY_CLEARED: '#00FF88', ADC_ISSUED: '#00FF88',
  FIC_ISSUED: '#00FF88', PENDING_CLEARANCE: '#FFB800', STUB_TRANSMITTED: '#6A6040',
  CANCELLED: '#FF3B3B', VOID: '#FF3B3B', DELAYED: '#FFB800',
  DEPARTED: '#00FF88', ARRIVED: '#00FF88', CLEARANCE_REJECTED: '#FF3B3B',
  FILING_FAILED: '#FF3B3B',
}

interface FlightPlanDetail {
  id: string
  flightPlanId: string | null
  aircraftId: string
  aircraftType: string
  status: string
  flightRules: string
  flightType: string
  adep: string
  ades: string
  altn1: string | null
  altn2: string | null
  eobt: string
  originalEobt: string | null
  eet: string
  totalEet: string | null
  endurance: string | null
  route: string
  cruisingLevel: string
  cruisingSpeed: string
  wakeTurbulence: string
  equipment: string
  surveillance: string | null
  survivalEquipment: string | null
  personsOnBoard: number | null
  filedBy: string
  filedByType: string
  filedAt: string | null
  clearedAt: string | null
  adcNumber: string | null
  ficNumber: string | null
  atsRef: string | null
  notifyEmail: string | null
  notifyMobile: string | null
  item18: string | null
  item19: string | null
  aftnMessage: string | null
  aftnAddressees: string | null
  aftnTransmissionId: string | null
  aftnTransmissionStatus: string | null
  aftnTransmittedAt: string | null
  cnlAftnMessage: string | null
  arrAftnMessage: string | null
  dlaAftnMessage: string | null
  createdAt: string
  updatedAt: string
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' }
  catch { return d }
}

function FieldRow({ label, value, colour }: { label: string; value: string | null | undefined; colour?: string }) {
  return (
    <div style={{ display: 'flex', padding: '0.4rem 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ width: '180px', flexShrink: 0, color: T.muted, fontSize: '0.8rem',
        fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      <span style={{ color: colour ?? T.textBright, fontSize: '0.85rem',
        fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
        {value || '—'}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
      padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
      <h3 style={{ margin: '0 0 0.75rem 0', color: T.primary, fontSize: '0.85rem',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
        borderBottom: `1px solid ${T.border}`, paddingBottom: '0.5rem' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function AftnBlock({ label, message }: { label: string; message: string | null | undefined }) {
  if (!message) return null
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ color: T.muted, fontSize: '0.75rem', marginBottom: '0.25rem',
        fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <pre style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
        padding: '0.6rem', fontSize: '0.78rem', color: T.text, whiteSpace: 'pre-wrap',
        wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace", margin: 0,
        overflowX: 'auto' }}>
        {message}
      </pre>
    </div>
  )
}

export function FlightPlanDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { token, logout } = useAuditAuth()
  const [plan, setPlan]   = useState<FlightPlanDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [routePoints, setRoutePoints] = useState<{ identifier: string; type: string; latDeg: number; lonDeg: number }[]>([])
  const [routeAdep, setRouteAdep] = useState('')
  const [routeAdes, setRouteAdes] = useState('')
  const routeMapRef = useRef<HTMLDivElement | null>(null)
  const routeLeafletRef = useRef<any>(null)

  const fetchPlan = useCallback(async () => {
    if (!token || !id) return
    setLoading(true); setError(null)
    try {
      const ax = auditAxios(token)
      const [pRes, rRes] = await Promise.all([
        ax.get(`/flight-plans/${id}`),
        ax.get(`/flight-plans/${id}/route-geometry`).catch(() => ({ data: { points: [] } })),
      ])
      setPlan(pRes.data.plan ?? pRes.data)
      setRoutePoints(rRes.data.points ?? [])
      setRouteAdep(rRes.data.adep ?? '')
      setRouteAdes(rRes.data.ades ?? '')
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      if (e.response?.status === 404) { setError('Flight plan not found'); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, id, logout])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  // ── Build route map ──────────────────────────────────────────────────
  useEffect(() => {
    if (!routeMapRef.current || routePoints.length === 0) return
    if (typeof L === 'undefined') return

    if (routeLeafletRef.current) { routeLeafletRef.current.remove(); routeLeafletRef.current = null }

    const map = L.map(routeMapRef.current)
    routeLeafletRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)

    const latlngs = routePoints.map(p => [p.latDeg, p.lonDeg])

    // Route polyline — blue
    L.polyline(latlngs, { color: '#4488FF', weight: 3, opacity: 0.85 }).addTo(map)

    // ADEP marker — green
    const depPt = routePoints[0]
    L.circleMarker([depPt.latDeg, depPt.lonDeg], {
      radius: 10, fillColor: T.green, color: T.bg, fillOpacity: 1, weight: 2,
    }).bindTooltip(`ADEP: ${routeAdep}`, { permanent: true, direction: 'top', offset: [0, -10] }).addTo(map)

    // ADES marker — red/primary
    const arrPt = routePoints[routePoints.length - 1]
    L.circleMarker([arrPt.latDeg, arrPt.lonDeg], {
      radius: 10, fillColor: T.red, color: T.bg, fillOpacity: 1, weight: 2,
    }).bindTooltip(`ADES: ${routeAdes}`, { permanent: true, direction: 'top', offset: [0, -10] }).addTo(map)

    // Intermediate waypoints — amber dots
    routePoints.slice(1, -1).forEach(pt => {
      L.circleMarker([pt.latDeg, pt.lonDeg], {
        radius: 6, fillColor: T.primary, color: T.bg, fillOpacity: 0.9, weight: 1,
      }).bindTooltip(pt.identifier, { direction: 'top', offset: [0, -6] }).addTo(map)
    })

    map.fitBounds(latlngs as any, { padding: [30, 30] })

    return () => { if (routeLeafletRef.current) { routeLeafletRef.current.remove(); routeLeafletRef.current = null } }
  }, [routePoints, routeAdep, routeAdes])

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
        Loading flight plan...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <button onClick={() => navigate('/flight-plans')}
          style={{ marginBottom: '1rem', padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface, color: T.text,
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
          Back to Flight Plans
        </button>
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      </div>
    )
  }

  if (!plan) return null

  const statusColour = STATE_COLOUR[plan.status] ?? T.text

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button onClick={() => navigate('/flight-plans')}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface, color: T.text,
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
          Back
        </button>
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
          {plan.aircraftId}
        </h2>
        <span style={{ color: statusColour, fontWeight: 700, fontSize: '0.85rem',
          padding: '0.2rem 0.6rem', background: statusColour + '15',
          border: `1px solid ${statusColour}40`, borderRadius: '4px',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {plan.status}
        </span>
        <span style={{ color: T.muted, fontSize: '0.8rem',
          fontFamily: "'JetBrains Mono', monospace", marginLeft: 'auto' }}>
          {plan.id}
        </span>
      </div>

      {/* Route Map */}
      {routePoints.length > 0 && (
        <Section title={`ROUTE MAP — ${routeAdep} → ${routeAdes}`}>
          <div ref={routeMapRef} style={{
            height: '300px', borderRadius: '4px', border: `1px solid ${T.border}`,
            background: T.bg,
          }} />
        </Section>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Main content */}
        <div style={{ flex: 2 }}>
          <Section title="FLIGHT IDENTIFICATION">
            <FieldRow label="Callsign (Item 7)" value={plan.aircraftId} />
            <FieldRow label="Aircraft Type (Item 9)" value={plan.aircraftType} />
            <FieldRow label="Wake Turbulence" value={plan.wakeTurbulence} />
            <FieldRow label="Flight Rules (Item 8)" value={plan.flightRules} />
            <FieldRow label="Flight Type" value={plan.flightType} />
            <FieldRow label="Equipment (Item 10)" value={plan.equipment} />
            <FieldRow label="Surveillance" value={plan.surveillance} />
            <FieldRow label="Survival Equipment" value={plan.survivalEquipment} />
            <FieldRow label="Persons on Board" value={plan.personsOnBoard?.toString()} />
          </Section>

          <Section title="ROUTE (Item 15)">
            <FieldRow label="ADEP (Item 13)" value={plan.adep} />
            <FieldRow label="ADES (Item 16)" value={plan.ades} />
            <FieldRow label="Alternate 1" value={plan.altn1} />
            <FieldRow label="Alternate 2" value={plan.altn2} />
            <FieldRow label="EOBT (Item 13)" value={fmtDate(plan.eobt)} />
            {plan.originalEobt && (
              <FieldRow label="Original EOBT" value={fmtDate(plan.originalEobt)} colour={T.muted} />
            )}
            <FieldRow label="EET (Item 16)" value={plan.eet} />
            <FieldRow label="Total EET" value={plan.totalEet} />
            <FieldRow label="Endurance (Item 19)" value={plan.endurance} />
            <FieldRow label="Cruising Level" value={plan.cruisingLevel} />
            <FieldRow label="Cruising Speed" value={plan.cruisingSpeed} />
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ color: T.muted, fontSize: '0.75rem', marginBottom: '0.25rem',
                fontFamily: "'JetBrains Mono', monospace" }}>Route String</div>
              <pre style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
                padding: '0.6rem', fontSize: '0.8rem', color: T.textBright, whiteSpace: 'pre-wrap',
                wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                {plan.route || '—'}
              </pre>
            </div>
          </Section>

          {(plan.item18 || plan.item19) && (
            <Section title="OTHER INFORMATION">
              {plan.item18 && <FieldRow label="Item 18" value={plan.item18} />}
              {plan.item19 && <FieldRow label="Item 19" value={plan.item19} />}
            </Section>
          )}

          {/* AFTN Messages */}
          {(plan.aftnMessage || plan.cnlAftnMessage || plan.arrAftnMessage || plan.dlaAftnMessage) && (
            <Section title="AFTN MESSAGES">
              <AftnBlock label="FPL (Filed)" message={plan.aftnMessage} />
              <AftnBlock label="CNL (Cancel)" message={plan.cnlAftnMessage} />
              <AftnBlock label="DLA (Delay)" message={plan.dlaAftnMessage} />
              <AftnBlock label="ARR (Arrival)" message={plan.arrAftnMessage} />
              {plan.aftnAddressees && (
                <FieldRow label="AFTN Addressees" value={plan.aftnAddressees} />
              )}
              {plan.aftnTransmissionId && (
                <FieldRow label="Transmission ID" value={plan.aftnTransmissionId} />
              )}
              <FieldRow label="Transmission Status" value={plan.aftnTransmissionStatus} />
              {plan.aftnTransmittedAt && (
                <FieldRow label="Transmitted At" value={fmtDate(plan.aftnTransmittedAt)} />
              )}
            </Section>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: '320px', flexShrink: 0 }}>
          <Section title="CLEARANCE STATUS">
            <FieldRow label="Status" value={plan.status} colour={statusColour} />
            <FieldRow label="ADC Number" value={plan.adcNumber} colour={plan.adcNumber ? T.green : undefined} />
            <FieldRow label="FIC Number" value={plan.ficNumber} colour={plan.ficNumber ? T.green : undefined} />
            <FieldRow label="ATS Reference" value={plan.atsRef} />
            <FieldRow label="Cleared At" value={fmtDate(plan.clearedAt)} />
          </Section>

          <Section title="FILING DETAILS">
            <FieldRow label="Filed By" value={plan.filedBy} />
            <FieldRow label="Filed By Type" value={plan.filedByType} />
            <FieldRow label="Filed At" value={fmtDate(plan.filedAt)} />
            <FieldRow label="Created At" value={fmtDate(plan.createdAt)} />
            <FieldRow label="Updated At" value={fmtDate(plan.updatedAt)} />
          </Section>

          <Section title="NOTIFICATIONS">
            <FieldRow label="Email" value={plan.notifyEmail} />
            <FieldRow label="Mobile" value={plan.notifyMobile} />
          </Section>
        </div>
      </div>
    </div>
  )
}

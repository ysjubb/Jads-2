import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth, adminAxios }           from '../hooks/useAdminAuth'
import { T }                                   from '../theme'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AirspaceConflict {
  severity:           'CRITICAL' | 'WARNING' | 'INFO'
  code:               string
  message:            string
  overlapStartUtc:    string
  overlapEndUtc:      string
  conflictingPlanType: string
  conflictingPlanId:  string
  conflictingPlanDbId: string
  droneAltitudeAglM:     { min: number; max: number }
  droneAltitudeAmslFt:   { min: number; max: number }
  flightAltitudeAmslFt:  number
  flightAltitudeRef:     string
  groundElevationFt:     number
  elevationSource:       string
  geographicOverlap:     string
  separationKm:          number | null
}

interface ConflictCheckResult {
  hasConflicts: boolean
  conflicts:    AirspaceConflict[]
  checkedAt:    string
  summary: {
    critical: number
    warning:  number
    info:     number
    dronePlansChecked:  number
    flightPlansChecked: number
  }
}

interface DroneOperationPlan {
  id:                string
  planId:            string
  operatorId:        string
  droneSerialNumber: string
  uinNumber:         string | null
  areaType:          'POLYGON' | 'CIRCLE'
  areaGeoJson:       string | null
  centerLatDeg:      number | null
  centerLonDeg:      number | null
  radiusM:           number | null
  maxAltitudeAglM:   number
  minAltitudeAglM:   number
  plannedStartUtc:   string
  plannedEndUtc:     string
  purpose:           string
  remarks:           string | null
  status:            string
  rejectionReason:   string | null
  notifyEmail:       string | null
  notifyMobile:      string | null
  additionalEmails:  string[]
  createdAt:         string
  submittedAt:       string | null
  approvedAt:        string | null
  approvedBy:        string | null
  flightFeedback:    string | null
  trackLogId:        string | null
}

// ── Status badge colours ───────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  DRAFT:     T.muted,
  SUBMITTED: T.amber,
  APPROVED:  T.primary,
  REJECTED:  T.red,
  CANCELLED: '#888',
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DroneOperationPlansPage() {
  const { token }       = useAdminAuth()
  const [plans, setPlans] = useState<DroneOperationPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DroneOperationPlan | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null)
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  // Fetch all plans
  const fetchPlans = async () => {
    if (!token) return
    setLoading(true)
    try {
      const { data } = await adminAxios(token).get('/drone-plans')
      setPlans(data.plans ?? [])
    } catch {
      setPlans([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [token])

  // Fetch conflicts when a SUBMITTED or APPROVED plan is selected
  useEffect(() => {
    if (!selected || !token) { setConflicts(null); return }
    if (!['SUBMITTED', 'APPROVED'].includes(selected.status)) { setConflicts(null); return }
    let cancelled = false
    setConflictsLoading(true)
    adminAxios(token).get(`/drone-plans/${selected.id}/conflicts`)
      .then(({ data }) => { if (!cancelled) setConflicts(data) })
      .catch(() => { if (!cancelled) setConflicts(null) })
      .finally(() => { if (!cancelled) setConflictsLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, token])

  // Render Leaflet map when a plan is selected
  useEffect(() => {
    if (!selected || !mapRef.current) return
    if (typeof (window as any).L === 'undefined') return

    const L = (window as any).L

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(mapRef.current, { zoomControl: true })
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    if (selected.areaType === 'POLYGON' && selected.areaGeoJson) {
      try {
        const geo = JSON.parse(selected.areaGeoJson)
        const polygon = L.geoJSON(geo, {
          style: {
            color: selected.status === 'APPROVED' ? T.primary : T.amber,
            fillColor: selected.status === 'APPROVED' ? T.primary : T.amber,
            fillOpacity: 0.2,
            weight: 2,
          }
        }).addTo(map)
        map.fitBounds(polygon.getBounds(), { padding: [30, 30] })
      } catch {
        map.setView([20.5937, 78.9629], 5)
      }
    } else if (selected.areaType === 'CIRCLE' && selected.centerLatDeg != null && selected.centerLonDeg != null) {
      const center: [number, number] = [selected.centerLatDeg, selected.centerLonDeg]
      L.circle(center, {
        radius: selected.radiusM ?? 500,
        color: selected.status === 'APPROVED' ? T.primary : T.amber,
        fillColor: selected.status === 'APPROVED' ? T.primary : T.amber,
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(map)
      L.marker(center).addTo(map).bindPopup('Operation Center')
      const mDeg = (selected.radiusM ?? 500) / 111000
      map.fitBounds([
        [center[0] - mDeg * 1.5, center[1] - mDeg * 1.5],
        [center[0] + mDeg * 1.5, center[1] + mDeg * 1.5],
      ])
    } else {
      map.setView([20.5937, 78.9629], 5)
    }

    // Altitude label
    const altLabel = `${selected.minAltitudeAglM}–${selected.maxAltitudeAglM}m AGL`
    const altIcon = L.divIcon({
      className: '',
      html: `<div style="background:${T.surface};border:1px solid ${T.border};border-radius:4px;padding:2px 6px;color:${T.primary};font-family:monospace;font-size:11px;font-weight:700;white-space:nowrap">${altLabel}</div>`,
      iconSize: [120, 20],
      iconAnchor: [60, -5],
    })
    if (selected.areaType === 'CIRCLE' && selected.centerLatDeg != null && selected.centerLonDeg != null) {
      L.marker([selected.centerLatDeg, selected.centerLonDeg], { icon: altIcon }).addTo(map)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [selected])

  // Approve handler
  const handleApprove = async () => {
    if (!token || !selected) return
    setActionLoading(true)
    try {
      await adminAxios(token).post(`/drone-plans/${selected.id}/approve`)
      setSelected(null)
      fetchPlans()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Approve failed')
    } finally {
      setActionLoading(false)
    }
  }

  // Reject handler
  const handleReject = async () => {
    if (!token || !selected || !rejectReason.trim()) return
    setActionLoading(true)
    try {
      await adminAxios(token).post(`/drone-plans/${selected.id}/reject`, { reason: rejectReason.trim() })
      setSelected(null)
      setRejectReason('')
      fetchPlans()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Reject failed')
    } finally {
      setActionLoading(false)
    }
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString() : '—'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'monospace', color: T.text }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem' }}>🛩</span> DRONE OPERATION PLANS
        <span style={{ fontSize: '0.65rem', color: T.muted, marginLeft: 'auto' }}>
          {plans.length} plan(s) · {plans.filter(p => p.status === 'SUBMITTED').length} pending review
        </span>
      </h1>

      {loading ? (
        <p style={{ color: T.muted }}>Loading...</p>
      ) : plans.length === 0 ? (
        <p style={{ color: T.muted }}>No drone operation plans filed yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Plan ID</th>
                <th style={{ padding: '0.5rem' }}>Drone S/N</th>
                <th style={{ padding: '0.5rem' }}>Area</th>
                <th style={{ padding: '0.5rem' }}>Altitude</th>
                <th style={{ padding: '0.5rem' }}>Purpose</th>
                <th style={{ padding: '0.5rem' }}>Window</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
                <th style={{ padding: '0.5rem' }}>Submitted</th>
                <th style={{ padding: '0.5rem' }}>Feedback</th>
                <th style={{ padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(plan => (
                <tr key={plan.id} style={{
                  borderBottom: `1px solid ${T.border}10`,
                  cursor: 'pointer',
                  background: selected?.id === plan.id ? T.primary + '08' : 'transparent',
                }} onClick={() => { setSelected(plan); setRejectReason('') }}>
                  <td style={{ padding: '0.4rem 0.5rem', color: T.primary, fontWeight: 600 }}>{plan.planId}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{plan.droneSerialNumber}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    {plan.areaType === 'CIRCLE'
                      ? `⊙ ${plan.radiusM}m R`
                      : '▢ Polygon'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{plan.minAltitudeAglM}–{plan.maxAltitudeAglM}m</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{plan.purpose}</td>
                  <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.65rem' }}>
                    {fmtDate(plan.plannedStartUtc)}<br/>
                    → {fmtDate(plan.plannedEndUtc)}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: T.bg, background: STATUS_COLOURS[plan.status] ?? T.muted,
                    }}>{plan.status}</span>
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.65rem' }}>{fmtDate(plan.submittedAt)}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    {plan.flightFeedback === 'FLEW' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                          fontSize: '0.65rem', fontWeight: 700,
                          color: T.bg, background: T.primary,
                        }}>FLEW</span>
                        {plan.trackLogId && (
                          <Link to={`/track-logs/${plan.trackLogId}`}
                            onClick={e => e.stopPropagation()}
                            style={{ color: T.primary, fontSize: '0.6rem', textDecoration: 'underline' }}>
                            View Track
                          </Link>
                        )}
                      </span>
                    ) : plan.flightFeedback === 'DID_NOT_FLY' ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                        fontSize: '0.65rem', fontWeight: 700,
                        color: T.bg, background: T.amber,
                      }}>DID NOT FLY</span>
                    ) : (
                      <span style={{ color: T.muted, fontSize: '0.65rem' }}>{'\u2014'}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    <button onClick={(e) => { e.stopPropagation(); setSelected(plan) }}
                      style={{
                        background: 'transparent', border: `1px solid ${T.border}`, borderRadius: '3px',
                        color: T.primary, padding: '2px 8px', cursor: 'pointer', fontSize: '0.65rem',
                      }}>VIEW</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail / Map Modal ──────────────────────────────────────────────── */}
      {selected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px',
            padding: '1.5rem', width: '90vw', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: T.primary, fontSize: '1rem', margin: 0 }}>
                {selected.planId} — {selected.purpose}
              </h2>
              <button onClick={() => setSelected(null)} style={{
                background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: '1.2rem',
              }}>✕</button>
            </div>

            {/* Map */}
            <div ref={mapRef} style={{
              height: '350px', borderRadius: '6px', border: `1px solid ${T.border}`,
              marginBottom: '1rem', background: '#0a0a0a',
            }} />

            {/* Plan Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.75rem', marginBottom: '1rem' }}>
              <Detail label="Plan ID" value={selected.planId} />
              <Detail label="Status" value={selected.status} color={STATUS_COLOURS[selected.status]} />
              <Detail label="Drone Serial" value={selected.droneSerialNumber} />
              <Detail label="UIN" value={selected.uinNumber ?? '—'} />
              <Detail label="Area Type" value={selected.areaType} />
              <Detail label="Altitude" value={`${selected.minAltitudeAglM}–${selected.maxAltitudeAglM}m AGL`} />
              {selected.areaType === 'CIRCLE' && (
                <>
                  <Detail label="Center" value={`${selected.centerLatDeg?.toFixed(5)}, ${selected.centerLonDeg?.toFixed(5)}`} />
                  <Detail label="Radius" value={`${selected.radiusM}m`} />
                </>
              )}
              <Detail label="Start" value={fmtDate(selected.plannedStartUtc)} />
              <Detail label="End" value={fmtDate(selected.plannedEndUtc)} />
              <Detail label="Operator ID" value={selected.operatorId} />
              <Detail label="Created" value={fmtDate(selected.createdAt)} />
              {selected.remarks && <Detail label="Remarks" value={selected.remarks} />}
              {selected.rejectionReason && <Detail label="Rejection Reason" value={selected.rejectionReason} color={T.red} />}
            </div>

            {/* Conflict Panel */}
            {conflictsLoading ? (
              <div style={{ padding: '0.6rem', color: T.muted, fontSize: '0.75rem', borderTop: `1px solid ${T.border}`, marginBottom: '0.5rem' }}>
                Checking airspace conflicts...
              </div>
            ) : conflicts && conflicts.hasConflicts ? (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '0.8rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: T.red, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  AIRSPACE CONFLICTS DETECTED
                  <span style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 400 }}>
                    ({conflicts.summary.critical} critical, {conflicts.summary.warning} warning, {conflicts.summary.info} info)
                    · checked {new Date(conflicts.checkedAt).toLocaleTimeString()}
                    · {conflicts.summary.flightPlansChecked} flight plan(s) scanned
                  </span>
                </div>
                {conflicts.conflicts.map((c, i) => {
                  const severityColor = c.severity === 'CRITICAL' ? T.red : c.severity === 'WARNING' ? T.amber : T.muted
                  return (
                    <div key={i} style={{
                      background: severityColor + '10', border: `1px solid ${severityColor}40`,
                      borderRadius: '6px', padding: '0.6rem', marginBottom: '0.4rem', fontSize: '0.7rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '1px 6px', borderRadius: '3px',
                          fontSize: '0.6rem', fontWeight: 700, color: '#fff', background: severityColor,
                        }}>{c.severity}</span>
                        <span style={{ fontWeight: 600, color: T.textBright }}>Flight {c.conflictingPlanId}</span>
                      </div>
                      <div style={{ color: T.text, marginBottom: '0.3rem' }}>{c.message}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.65rem', color: T.muted }}>
                        <div>
                          <span style={{ color: T.amber }}>Drone: </span>
                          {c.droneAltitudeAglM.min}–{c.droneAltitudeAglM.max}m AGL
                          ({c.droneAltitudeAmslFt.min}–{c.droneAltitudeAmslFt.max}ft AMSL)
                        </div>
                        <div>
                          <span style={{ color: T.primary }}>Flight: </span>
                          {c.flightAltitudeRef} ({c.flightAltitudeAmslFt}ft AMSL)
                        </div>
                        <div>
                          <span style={{ color: T.muted }}>Ground: </span>
                          {c.groundElevationFt}ft — {c.elevationSource}
                        </div>
                        <div>
                          <span style={{ color: T.muted }}>Time: </span>
                          {new Date(c.overlapStartUtc).toLocaleString()} → {new Date(c.overlapEndUtc).toLocaleString()}
                        </div>
                      </div>
                      {c.geographicOverlap && (
                        <div style={{ fontSize: '0.65rem', color: T.muted, marginTop: '0.2rem' }}>{c.geographicOverlap}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : conflicts && !conflicts.hasConflicts ? (
              <div style={{ padding: '0.5rem', fontSize: '0.7rem', color: T.primary, borderTop: `1px solid ${T.border}`, marginBottom: '0.5rem' }}>
                No airspace conflicts detected · {conflicts.summary.flightPlansChecked} flight plan(s) scanned · checked {new Date(conflicts.checkedAt).toLocaleTimeString()}
              </div>
            ) : null}

            {/* Approve / Reject Actions */}
            {selected.status === 'SUBMITTED' && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                <button onClick={handleApprove} disabled={actionLoading}
                  style={{
                    background: T.primary, color: T.bg, border: 'none', borderRadius: '4px',
                    padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
                  }}>
                  {actionLoading ? '...' : '✓ APPROVE'}
                </button>
                <div style={{ flex: 1 }}>
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    style={{
                      width: '100%', padding: '0.4rem 0.6rem', background: T.bg, color: T.text,
                      border: `1px solid ${T.border}`, borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem',
                    }} />
                </div>
                <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
                  style={{
                    background: T.red, color: '#fff', border: 'none', borderRadius: '4px',
                    padding: '0.5rem 1.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
                    opacity: !rejectReason.trim() ? 0.4 : 1,
                  }}>
                  {actionLoading ? '...' : '✕ REJECT'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detail row helper ─────────────────────────────────────────────────────────

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: T.muted, fontSize: '0.65rem', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ color: color ?? T.textBright, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

// @ts-expect-error reserved utility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

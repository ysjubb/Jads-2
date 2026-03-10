import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'
import { LogUploadWidget } from '../components/portal/LogUploadWidget'

const STATUS_COLOR: Record<string, string> = {
  DRAFT: T.muted, SUBMITTED: T.amber, APPROVED: T.primary, REJECTED: T.red, CANCELLED: '#888',
}

export function DronePlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [plan, setPlan]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showLogUpload, setShowLogUpload] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const { data } = await userApi().get(`/drone-plans/${id}`)
        setPlan(data.plan)
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [id])

  // Render map
  useEffect(() => {
    if (!plan || !mapRef.current) return
    if (typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }

    const map = L.map(mapRef.current).setView([20.5937, 78.9629], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    const areaColor = plan.status === 'APPROVED' ? T.primary : plan.status === 'REJECTED' ? T.red : T.amber

    if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
      try {
        const geo = JSON.parse(plan.areaGeoJson)
        const polygon = L.geoJSON(geo, {
          style: { color: areaColor, fillColor: areaColor, fillOpacity: 0.2, weight: 2 }
        }).addTo(map)
        map.fitBounds(polygon.getBounds(), { padding: [30, 30] })
      } catch { map.setView([20.5937, 78.9629], 5) }
    } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null) {
      L.circle([plan.centerLatDeg, plan.centerLonDeg], {
        radius: plan.radiusM ?? 500, color: areaColor, fillColor: areaColor, fillOpacity: 0.2,
      }).addTo(map)
      L.marker([plan.centerLatDeg, plan.centerLonDeg]).addTo(map)
      const mDeg = (plan.radiusM ?? 500) / 111000
      map.fitBounds([
        [plan.centerLatDeg - mDeg * 1.5, plan.centerLonDeg - mDeg * 1.5],
        [plan.centerLatDeg + mDeg * 1.5, plan.centerLonDeg + mDeg * 1.5],
      ])
    }

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [plan])

  const handleSubmit = async () => {
    setActionLoading(true)
    try {
      await userApi().post(`/drone-plans/${id}/submit`)
      const { data } = await userApi().get(`/drone-plans/${id}`)
      setPlan(data.plan)
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Submit failed')
    }
    setActionLoading(false)
  }

  const refreshPlan = async () => {
    try {
      const { data } = await userApi().get(`/drone-plans/${id}`)
      setPlan(data.plan)
    } catch { /* ignore */ }
  }

  const handleDidNotFly = async () => {
    setFeedbackLoading(true)
    try {
      await userApi().post(`/drone-plans/${id}/flight-feedback`, { feedback: 'DID_NOT_FLY' })
      await refreshPlan()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Feedback failed')
    }
    setFeedbackLoading(false)
  }

  const handleLogUploaded = async (trackLogId: string) => {
    setFeedbackLoading(true)
    try {
      await userApi().post(`/drone-plans/${id}/flight-feedback`, { feedback: 'FLEW', trackLogId })
      await refreshPlan()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Feedback failed')
    }
    setFeedbackLoading(false)
  }

  const handleCancel = async () => {
    setActionLoading(true)
    try {
      await userApi().post(`/drone-plans/${id}/cancel`, { reason: 'User cancelled' })
      const { data } = await userApi().get(`/drone-plans/${id}`)
      setPlan(data.plan)
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Cancel failed')
    }
    setActionLoading(false)
  }

  if (loading) return <div style={{ padding: '1.5rem', color: T.muted }}>Loading...</div>
  if (!plan)   return <div style={{ padding: '1.5rem', color: T.red }}>Drone plan not found.</div>

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link to="/" style={{ color: T.muted, textDecoration: 'none', fontSize: '0.75rem' }}>&lt; Back</Link>
        <h1 style={{ color: T.amber, fontSize: '1rem', margin: 0 }}>Drone Plan — {plan.planId}</h1>
        <span style={{
          padding: '3px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
          background: STATUS_COLOR[plan.status] ?? T.muted, color: '#fff',
        }}>{plan.status}</span>
      </div>

      {/* Map */}
      <div ref={mapRef} style={{
        height: '350px', borderRadius: '6px', border: `1px solid ${T.border}`,
        marginBottom: '1rem', background: '#0a0a0a',
      }} />

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', fontSize: '0.75rem', marginBottom: '1rem' }}>
        <Detail label="Plan ID" value={plan.planId} />
        <Detail label="Drone S/N" value={plan.droneSerialNumber} />
        <Detail label="UIN" value={plan.uinNumber ?? '--'} />
        <Detail label="Area Type" value={plan.areaType} />
        <Detail label="Altitude" value={`${plan.minAltitudeAglM}–${plan.maxAltitudeAglM}m AGL`} />
        <Detail label="Purpose" value={plan.purpose} />
        <Detail label="Start" value={new Date(plan.plannedStartUtc).toLocaleString()} />
        <Detail label="End" value={new Date(plan.plannedEndUtc).toLocaleString()} />
        <Detail label="Created" value={new Date(plan.createdAt).toLocaleString()} />
        {plan.remarks && <Detail label="Remarks" value={plan.remarks} />}
        {plan.rejectionReason && <Detail label="Rejection Reason" value={plan.rejectionReason} color={T.red} />}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.8rem' }}>
        {plan.status === 'DRAFT' && (
          <button onClick={handleSubmit} disabled={actionLoading} style={{
            padding: '0.6rem 1.5rem', background: T.primary, color: T.bg, border: 'none',
            borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
          }}>{actionLoading ? '...' : 'SUBMIT FOR APPROVAL'}</button>
        )}
        {!['CANCELLED', 'REJECTED'].includes(plan.status) && (
          <button onClick={handleCancel} disabled={actionLoading} style={{
            padding: '0.6rem 1.5rem', background: 'transparent', border: `1px solid ${T.red}40`,
            borderRadius: '4px', color: T.red, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}>{actionLoading ? '...' : 'CANCEL PLAN'}</button>
        )}
      </div>

      {/* Flight Feedback */}
      {plan.status === 'APPROVED' && !plan.flightFeedback && !showLogUpload && (
        <div style={{
          marginTop: '1.5rem', padding: '1rem', border: `1px solid ${T.border}`,
          borderRadius: '6px', background: T.surface,
        }}>
          <p style={{ color: T.textBright, fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.6rem' }}>
            Did the drone fly?
          </p>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button onClick={() => setShowLogUpload(true)} disabled={feedbackLoading} style={{
              padding: '0.5rem 1.5rem', background: T.primary, color: T.bg, border: 'none',
              borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem',
            }}>YES</button>
            <button onClick={handleDidNotFly} disabled={feedbackLoading} style={{
              padding: '0.5rem 1.5rem', background: T.amber, color: T.bg, border: 'none',
              borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem',
            }}>{feedbackLoading ? '...' : 'NO'}</button>
          </div>
        </div>
      )}

      {plan.status === 'APPROVED' && !plan.flightFeedback && showLogUpload && (
        <div style={{
          marginTop: '1.5rem', padding: '1rem', border: `1px solid ${T.border}`,
          borderRadius: '6px', background: T.surface,
        }}>
          <p style={{ color: T.textBright, fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.6rem' }}>
            Upload Flight Log
          </p>
          <LogUploadWidget
            droneSerialNumber={plan.droneSerialNumber}
            droneOperationPlanId={plan.id}
            onUploaded={handleLogUploaded}
          />
        </div>
      )}

      {plan.flightFeedback && (
        <div style={{ marginTop: '1.5rem' }}>
          <span style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: '4px',
            fontSize: '0.75rem', fontWeight: 700,
            background: plan.flightFeedback === 'FLEW' ? T.primary + '20' : T.amber + '20',
            color: plan.flightFeedback === 'FLEW' ? T.primary : T.amber,
            border: `1px solid ${plan.flightFeedback === 'FLEW' ? T.primary : T.amber}40`,
          }}>
            {plan.flightFeedback === 'FLEW' ? 'FLEW' : 'DID NOT FLY'}
          </span>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: T.muted, fontSize: '0.6rem', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ color: color ?? T.textBright, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

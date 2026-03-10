import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'

export function FlightPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [plan, setPlan]       = useState<any>(null)
  const [clearance, setClearance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const [planRes, clearRes, geoRes] = await Promise.allSettled([
          userApi().get(`/flight-plans/${id}`),
          userApi().get(`/flight-plans/${id}/clearance`),
          userApi().get(`/flight-plans/${id}/route-geometry`),
        ])
        if (planRes.status === 'fulfilled') {
          const p = planRes.value.data.plan
          if (geoRes.status === 'fulfilled') p._routeGeo = geoRes.value.data
          setPlan(p)
        }
        if (clearRes.status === 'fulfilled') setClearance(clearRes.value.data)
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [id])

  // Render route map
  useEffect(() => {
    if (!plan?._routeGeo?.points?.length || !mapRef.current) return
    if (typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }

    const map = L.map(mapRef.current).setView([22, 78], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    const pts = plan._routeGeo.points
    const latlngs = pts.map((p: any) => [p.latDeg, p.lonDeg])

    // Route polyline
    L.polyline(latlngs, { color: '#40A0FF', weight: 3, opacity: 0.8 }).addTo(map)

    // Waypoint markers
    pts.forEach((p: any, i: number) => {
      const isFirst = i === 0
      const isLast  = i === pts.length - 1
      const col = isFirst ? T.primary : isLast ? T.red : T.amber
      L.circleMarker([p.latDeg, p.lonDeg], {
        radius: isFirst || isLast ? 8 : 5,
        fillColor: col, color: col, fillOpacity: 0.8, weight: 2,
      }).addTo(map).bindTooltip(p.identifier, { permanent: true, direction: 'top', offset: [0, -8] })
    })

    map.fitBounds(latlngs, { padding: [30, 30] })

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [plan])

  if (loading) return <div style={{ padding: '1.5rem', color: T.muted }}>Loading...</div>
  if (!plan)   return <div style={{ padding: '1.5rem', color: T.red }}>Flight plan not found.</div>

  const statusColor = (s: string) =>
    s === 'FULLY_CLEARED' ? T.primary :
    s === 'CLEARANCE_REJECTED' ? T.red :
    s.includes('ISSUED') ? '#40A0FF' : T.amber

  const editable = ['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE'].includes(plan.status)

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link to="/" style={{ color: T.muted, textDecoration: 'none', fontSize: '0.75rem' }}>&lt; Back</Link>
        <h1 style={{ color: T.primary, fontSize: '1rem', margin: 0 }}>
          Flight Plan — {plan.adep} → {plan.ades}
        </h1>
        <span style={{
          padding: '3px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
          background: statusColor(plan.status), color: '#fff',
        }}>{plan.status}</span>
        {editable && (
          <Link to={`/edit-flight-plan/${plan.id}`} style={{
            padding: '4px 12px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
            background: T.amber + '20', border: `1px solid ${T.amber}40`, color: T.amber, textDecoration: 'none',
          }}>Edit Plan</Link>
        )}
      </div>

      {/* Route Map */}
      <div ref={mapRef} style={{
        height: '300px', borderRadius: '6px', border: `1px solid ${T.border}`,
        marginBottom: '1rem', background: '#0a0a0a',
      }} />

      {/* Plan Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
        <Detail label="Aircraft" value={plan.aircraftId} />
        <Detail label="Type" value={plan.aircraftType} />
        <Detail label="Rules" value={plan.flightRules} />
        <Detail label="ADEP" value={plan.adep} />
        <Detail label="ADES" value={plan.ades} />
        <Detail label="Route" value={plan.route} />
        <Detail label="EOBT" value={new Date(plan.eobt).toLocaleString()} />
        <Detail label="Cruising Level" value={plan.cruisingLevel} />
        <Detail label="Speed" value={plan.cruisingSpeed} />
        {plan.amendmentCount > 0 && <Detail label="Amendments" value={String(plan.amendmentCount)} color={T.amber} />}
      </div>

      {/* Clearance Status */}
      {clearance && (
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem' }}>Clearance Status</legend>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{
              padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
              background: statusColor(clearance.status), color: '#fff',
            }}>{clearance.status}</span>
          </div>

          {clearance.adcRefs?.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <h3 style={{ color: T.textBright, fontSize: '0.75rem', marginBottom: '0.3rem' }}>ADC Numbers</h3>
              {clearance.adcRefs.map((r: any, i: number) => (
                <div key={i} style={{ fontSize: '0.7rem', color: T.text, marginBottom: '0.2rem' }}>
                  ADC #{r.adcNumber} ({r.adcType}) — issued {r.issuedAt} by {r.officerName}
                </div>
              ))}
            </div>
          )}

          {clearance.ficRefs?.length > 0 && (
            <div>
              <h3 style={{ color: T.textBright, fontSize: '0.75rem', marginBottom: '0.3rem' }}>FIC Numbers</h3>
              {clearance.ficRefs.map((r: any, i: number) => (
                <div key={i} style={{ fontSize: '0.7rem', color: T.text, marginBottom: '0.2rem' }}>
                  FIC #{r.ficNumber} ({r.firCode}) — {r.subject} — issued {r.issuedAt} by {r.officerName}
                </div>
              ))}
            </div>
          )}

          {clearance.status === 'PENDING_CLEARANCE' && (
            <p style={{ color: T.amber, fontSize: '0.7rem', marginTop: '0.5rem' }}>
              Awaiting ADC and FIC clearances. You will be notified when issued.
            </p>
          )}
        </fieldset>
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

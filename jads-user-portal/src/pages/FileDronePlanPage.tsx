import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'

export function FileDronePlanPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [areaType, setAreaType] = useState<'CIRCLE' | 'POLYGON'>('CIRCLE')

  // Circle state
  const [centerLat, setCenterLat] = useState('')
  const [centerLon, setCenterLon] = useState('')
  const [radiusM, setRadiusM]     = useState('500')

  // Polygon state (GeoJSON)
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])

  // Common fields
  const [form, setForm] = useState({
    droneSerialNumber: '', uinNumber: '',
    maxAltitudeAglM: '120', minAltitudeAglM: '0',
    plannedStartUtc: '', plannedEndUtc: '',
    purpose: 'SURVEY', remarks: '',
    notifyEmail: '', notifyMobile: '', additionalEmails: '',
  })

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const polygonRef = useRef<any>(null)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) mapInstanceRef.current.remove()

    const map = L.map(mapRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    // Click to set center (CIRCLE mode) or add polygon vertex
    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng
      if (areaType === 'CIRCLE') {
        setCenterLat(lat.toFixed(6))
        setCenterLon(lng.toFixed(6))
      } else {
        setPolygonPoints(pts => [...pts, [lat, lng]])
      }
    })

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [areaType])

  // Update circle on map
  useEffect(() => {
    if (!mapInstanceRef.current || areaType !== 'CIRCLE') return
    const L = (window as any).L
    const map = mapInstanceRef.current

    if (circleRef.current) { map.removeLayer(circleRef.current); circleRef.current = null }

    const lat = parseFloat(centerLat)
    const lon = parseFloat(centerLon)
    const r   = parseFloat(radiusM)
    if (isNaN(lat) || isNaN(lon) || isNaN(r)) return

    const circle = L.circle([lat, lon], {
      radius: r, color: T.amber, fillColor: T.amber, fillOpacity: 0.2, weight: 2,
    }).addTo(map)
    circleRef.current = circle
    L.marker([lat, lon]).addTo(map).bindPopup('Operation Center')

    const mDeg = r / 111000
    map.fitBounds([[lat - mDeg * 1.5, lon - mDeg * 1.5], [lat + mDeg * 1.5, lon + mDeg * 1.5]])
  }, [centerLat, centerLon, radiusM, areaType])

  // Update polygon on map
  useEffect(() => {
    if (!mapInstanceRef.current || areaType !== 'POLYGON') return
    const L = (window as any).L
    const map = mapInstanceRef.current

    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null }
    if (polygonPoints.length < 3) return

    const poly = L.polygon(polygonPoints, {
      color: T.amber, fillColor: T.amber, fillOpacity: 0.2, weight: 2,
    }).addTo(map)
    polygonRef.current = poly
    map.fitBounds(poly.getBounds(), { padding: [30, 30] })
  }, [polygonPoints, areaType])

  const buildGeoJson = () => {
    if (polygonPoints.length < 3) return null
    const coords = [...polygonPoints, polygonPoints[0]].map(([lat, lon]) => [lon, lat])
    return JSON.stringify({ type: 'Polygon', coordinates: [coords] })
  }

  const [submitAfterCreate, setSubmitAfterCreate] = useState(false)

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      droneSerialNumber: form.droneSerialNumber,
      uinNumber:         form.uinNumber || undefined,
      areaType,
      maxAltitudeAglM:   parseFloat(form.maxAltitudeAglM),
      minAltitudeAglM:   parseFloat(form.minAltitudeAglM),
      plannedStartUtc:   form.plannedStartUtc,
      plannedEndUtc:     form.plannedEndUtc,
      purpose:           form.purpose,
      remarks:           form.remarks || undefined,
      notifyEmail:       form.notifyEmail || undefined,
      notifyMobile:      form.notifyMobile || undefined,
      additionalEmails:  form.additionalEmails ? form.additionalEmails.split(',').map(s => s.trim()).filter(Boolean) : [],
    }

    if (areaType === 'CIRCLE') {
      payload.centerLatDeg = parseFloat(centerLat)
      payload.centerLonDeg = parseFloat(centerLon)
      payload.radiusM      = parseFloat(radiusM)
    } else {
      payload.areaGeoJson = buildGeoJson()
    }

    return payload
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const payload = buildPayload()
      const { data } = await userApi().post('/drone-plans', payload)
      if (data.success) {
        navigate(`/drone-plan/${data.plan.id}`)
      } else {
        setError(data.error ?? 'Filing failed')
      }
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.response?.data?.error ?? 'DRONE_PLAN_FILE_FAILED')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAndSubmit = async (e: React.MouseEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setSubmitAfterCreate(true)
    try {
      const payload = buildPayload()
      const { data } = await userApi().post('/drone-plans', payload)
      if (!data.success) {
        setError(data.error ?? 'Filing failed')
        return
      }
      const planId = data.plan.id
      try {
        await userApi().post(`/drone-plans/${planId}/submit`)
      } catch {
        // Draft was created but submit failed — still navigate to detail page
      }
      navigate(`/drone-plan/${planId}`)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.response?.data?.error ?? 'DRONE_PLAN_FILE_FAILED')
    } finally {
      setLoading(false); setSubmitAfterCreate(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.75rem',
  }
  const labelStyle: React.CSSProperties = { fontSize: '0.65rem', color: T.muted, marginBottom: '2px', display: 'block' }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <h1 style={{ color: T.amber, fontSize: '1rem', marginBottom: '1rem' }}>File Drone Operation Plan</h1>

      {error && (
        <div style={{ background: T.red + '15', border: `1px solid ${T.red}30`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', color: T.red, fontSize: '0.7rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Drone Info */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Drone</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Serial Number</label><input value={form.droneSerialNumber} onChange={set('droneSerialNumber')} placeholder="DJI-M3E-001" style={inputStyle} required /></div>
            <div><label style={labelStyle}>UIN (if applicable)</label><input value={form.uinNumber} onChange={set('uinNumber')} placeholder="UA-2025-00123" style={inputStyle} /></div>
          </div>
        </fieldset>

        {/* Area Selection */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Operation Area</legend>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {(['CIRCLE', 'POLYGON'] as const).map(t => (
              <button key={t} type="button" onClick={() => { setAreaType(t); setPolygonPoints([]) }}
                style={{
                  padding: '0.4rem 1rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                  background: areaType === t ? T.amber + '20' : 'transparent',
                  color: areaType === t ? T.amber : T.muted, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                }}>
                {t === 'CIRCLE' ? '⊙ Circle (Center+Radius)' : '▢ Polygon (Click Vertices)'}
              </button>
            ))}
          </div>

          {/* Map */}
          <div ref={mapRef} style={{
            height: '350px', borderRadius: '6px', border: `1px solid ${T.border}`,
            marginBottom: '0.8rem', background: '#0a0a0a',
          }} />
          <p style={{ fontSize: '0.6rem', color: T.muted, marginBottom: '0.6rem' }}>
            {areaType === 'CIRCLE'
              ? 'Click on map to set center point, then adjust radius below.'
              : `Click on map to add polygon vertices. ${polygonPoints.length} point(s) set. Need at least 3.`}
          </p>

          {areaType === 'CIRCLE' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
              <div><label style={labelStyle}>Center Lat</label><input value={centerLat} onChange={e => setCenterLat(e.target.value)} placeholder="28.5562" style={inputStyle} required /></div>
              <div><label style={labelStyle}>Center Lon</label><input value={centerLon} onChange={e => setCenterLon(e.target.value)} placeholder="77.1000" style={inputStyle} required /></div>
              <div><label style={labelStyle}>Radius (m)</label><input value={radiusM} onChange={e => setRadiusM(e.target.value)} placeholder="500" type="number" min="50" style={inputStyle} required /></div>
            </div>
          ) : (
            <div>
              {polygonPoints.length > 0 && (
                <div style={{ fontSize: '0.6rem', color: T.muted, marginBottom: '0.4rem' }}>
                  Vertices: {polygonPoints.map(([lat, lon], i) => `(${lat.toFixed(4)}, ${lon.toFixed(4)})`).join(' → ')}
                </div>
              )}
              <button type="button" onClick={() => setPolygonPoints([])}
                style={{ padding: '0.3rem 0.8rem', background: T.red + '20', border: `1px solid ${T.red}40`, borderRadius: '3px', color: T.red, cursor: 'pointer', fontSize: '0.65rem' }}>
                Clear Vertices
              </button>
            </div>
          )}
        </fieldset>

        {/* Altitude */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Altitude & Time</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Min Altitude (m AGL)</label><input value={form.minAltitudeAglM} onChange={set('minAltitudeAglM')} type="number" min="0" style={inputStyle} /></div>
            <div><label style={labelStyle}>Max Altitude (m AGL)</label><input value={form.maxAltitudeAglM} onChange={set('maxAltitudeAglM')} type="number" min="1" style={inputStyle} required /></div>
            <div><label style={labelStyle}>Start (UTC)</label><input type="datetime-local" value={form.plannedStartUtc} onChange={set('plannedStartUtc')} style={inputStyle} required /></div>
            <div><label style={labelStyle}>End (UTC)</label><input type="datetime-local" value={form.plannedEndUtc} onChange={set('plannedEndUtc')} style={inputStyle} required /></div>
          </div>
        </fieldset>

        {/* Purpose & Notifications */}
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Details</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Purpose</label>
              <select value={form.purpose} onChange={set('purpose')} style={inputStyle}>
                <option value="SURVEY">Survey</option>
                <option value="PHOTOGRAPHY">Photography</option>
                <option value="INSPECTION">Inspection</option>
                <option value="DELIVERY">Delivery</option>
                <option value="MAPPING">Mapping</option>
                <option value="AGRICULTURE">Agriculture</option>
                <option value="TRAINING">Training</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div><label style={labelStyle}>Remarks</label><input value={form.remarks} onChange={set('remarks')} placeholder="Additional info" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Email</label><input value={form.notifyEmail} onChange={set('notifyEmail')} placeholder="op@company.com" style={inputStyle} /></div>
            <div><label style={labelStyle}>Mobile</label><input value={form.notifyMobile} onChange={set('notifyMobile')} placeholder="+919800000001" style={inputStyle} /></div>
            <div><label style={labelStyle}>Additional Emails</label><input value={form.additionalEmails} onChange={set('additionalEmails')} placeholder="a@b.com, c@d.com" style={inputStyle} /></div>
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" disabled={loading} style={{
            padding: '0.7rem 2rem', background: T.amber, color: T.bg, border: 'none',
            borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
          }}>
            {loading && !submitAfterCreate ? 'Saving...' : 'CREATE DRONE PLAN (DRAFT)'}
          </button>
          <button type="button" disabled={loading} onClick={handleCreateAndSubmit} style={{
            padding: '0.7rem 2rem', background: T.primary, color: T.bg, border: 'none',
            borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
          }}>
            {loading && submitAfterCreate ? 'Submitting...' : 'CREATE & SUBMIT'}
          </button>
        </div>
      </form>
    </div>
  )
}

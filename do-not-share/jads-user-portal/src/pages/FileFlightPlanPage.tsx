import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../App'

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

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const payload = {
        ...form,
        personsOnBoard: parseInt(form.personsOnBoard) || 1,
        additionalEmails: form.additionalEmails
          ? form.additionalEmails.split(',').map(s => s.trim()).filter(Boolean)
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

        <button type="submit" disabled={loading} style={{
          padding: '0.7rem 2rem', background: T.primary, color: T.bg, border: 'none',
          borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
        }}>
          {loading ? 'Filing...' : 'FILE FLIGHT PLAN'}
        </button>
      </form>
    </div>
  )
}

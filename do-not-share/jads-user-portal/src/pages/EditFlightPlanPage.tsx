import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../App'

export function EditFlightPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [plan, setPlan]       = useState<any>(null)
  const [form, setForm]       = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const { data } = await userApi().get(`/flight-plans/${id}`)
        const p = data.plan
        setPlan(p)
        setForm({
          route:          p.route ?? '',
          cruisingLevel:  p.cruisingLevel ?? '',
          cruisingSpeed:  p.cruisingSpeed ?? '',
          altn1:          p.altn1 ?? '',
          altn2:          p.altn2 ?? '',
          eet:            p.eet ?? '',
          endurance:      p.endurance ?? '',
          personsOnBoard: String(p.personsOnBoard ?? ''),
          notifyEmail:    p.notifyEmail ?? '',
          notifyMobile:   p.notifyMobile ?? '',
          additionalEmails: (p.additionalEmails ?? []).join(', '),
          item18:         p.item18 ?? '',
          remarks:        p.remarks ?? '',
        })
      } catch {
        setError('Failed to load flight plan')
      }
      setLoading(false)
    })()
  }, [id])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (k === 'additionalEmails') {
          payload.additionalEmails = v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
        } else if (k === 'personsOnBoard') {
          payload.personsOnBoard = parseInt(v) || null
        } else if (v !== '' && v !== (plan[k] ?? '')) {
          payload[k] = v
        }
      }

      await userApi().put(`/flight-plans/${id}`, payload)
      navigate(`/flight-plan/${id}`)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'EDIT_FAILED')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: '1.5rem', color: T.muted }}>Loading...</div>
  if (!plan)   return <div style={{ padding: '1.5rem', color: T.red }}>Flight plan not found.</div>

  const editable = ['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE'].includes(plan.status)
  if (!editable) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <p style={{ color: T.red }}>Cannot edit — plan status is {plan.status}. Edits are only allowed before clearance.</p>
        <Link to={`/flight-plan/${id}`} style={{ color: T.primary }}>Back to plan</Link>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.75rem',
  }
  const labelStyle: React.CSSProperties = { fontSize: '0.65rem', color: T.muted, marginBottom: '2px', display: 'block' }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
        <Link to={`/flight-plan/${id}`} style={{ color: T.muted, textDecoration: 'none', fontSize: '0.75rem' }}>&lt; Back</Link>
        <h1 style={{ color: T.amber, fontSize: '1rem', margin: 0 }}>
          Edit Flight Plan — {plan.adep} → {plan.ades}
        </h1>
        <span style={{ fontSize: '0.65rem', color: T.muted }}>
          Amendment #{(plan.amendmentCount ?? 0) + 1}
        </span>
      </div>

      {error && (
        <div style={{ background: T.red + '15', border: `1px solid ${T.red}30`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', color: T.red, fontSize: '0.7rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Route (Editable)</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Route</label><input value={form.route} onChange={set('route')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Cruising Level</label><input value={form.cruisingLevel} onChange={set('cruisingLevel')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Cruising Speed</label><input value={form.cruisingSpeed} onChange={set('cruisingSpeed')} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Alternate 1</label><input value={form.altn1} onChange={set('altn1')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Alternate 2</label><input value={form.altn2} onChange={set('altn2')} style={inputStyle} /></div>
            <div><label style={labelStyle}>EET</label><input value={form.eet} onChange={set('eet')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Endurance</label><input value={form.endurance} onChange={set('endurance')} style={inputStyle} /></div>
          </div>
        </fieldset>

        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Notifications</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div><label style={labelStyle}>Email</label><input value={form.notifyEmail} onChange={set('notifyEmail')} style={inputStyle} /></div>
            <div><label style={labelStyle}>Mobile</label><input value={form.notifyMobile} onChange={set('notifyMobile')} style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Additional Emails</label><input value={form.additionalEmails} onChange={set('additionalEmails')} style={inputStyle} /></div>
        </fieldset>

        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem', marginBottom: '1rem' }}>
          <legend style={{ color: T.amber, fontSize: '0.75rem', padding: '0 0.4rem' }}>Other</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div><label style={labelStyle}>Persons On Board</label><input value={form.personsOnBoard} onChange={set('personsOnBoard')} type="number" style={inputStyle} /></div>
            <div><label style={labelStyle}>Remarks</label><input value={form.remarks} onChange={set('remarks')} style={inputStyle} /></div>
          </div>
        </fieldset>

        <button type="submit" disabled={saving} style={{
          padding: '0.7rem 2rem', background: T.amber, color: T.bg, border: 'none',
          borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
        }}>
          {saving ? 'Saving...' : 'SAVE AMENDMENT'}
        </button>
      </form>
    </div>
  )
}

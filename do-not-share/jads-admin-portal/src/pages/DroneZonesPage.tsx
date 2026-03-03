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

interface DroneZone {
  id:             string
  name:           string
  classification: 'GREEN' | 'YELLOW' | 'RED'
  maxAglFt:       number
  description:    string
  coordinates:    string   // JSON polygon string
}

interface AirspaceVersion {
  id:            string
  versionNumber: number
  approvalStatus:string
  effectiveFrom: string
  changeReason:  string
  createdBy:     string
  createdAt:     string
  approvedBy:    string | null
  zonesCount:    number
  payloadPreview:DroneZone[]
}

// ── Zone classification colours ───────────────────────────────────────────────

const CLASS_CONFIG = {
  GREEN:  { bg: T.primary + '15', border: T.primary + '40', text: T.primary, label:'GREEN — Open, permitted with conditions' },
  YELLOW: { bg: T.amber + '15',   border: T.amber + '40',   text: T.amber,   label:'YELLOW — Restricted, NPNT required'      },
  RED:    { bg: T.red + '15',     border: T.red + '40',     text: T.red,     label:'RED — Prohibited, no flight permitted'   },
}

const STATUS_COLOUR: Record<string, string> = {
  ACTIVE:   T.primary,
  PENDING:  T.amber,
  DRAFT:    T.primary,
  EXPIRED:  T.muted,
  REJECTED: T.red,
}

// ── Zone Form Modal ───────────────────────────────────────────────────────────

interface ZoneFormProps {
  initialZones: DroneZone[]
  onSave: (zones: DroneZone[], reason: string, effectiveFrom: string) => Promise<void>
  onClose: () => void
}

function ZoneFormModal({ initialZones, onSave, onClose }: ZoneFormProps) {
  const [zones, setZones]   = useState<DroneZone[]>(initialZones)
  const [reason, setReason] = useState('')
  const [effectiveFrom, setEffective] = useState(
    new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const addZone = () => setZones(z => [...z, {
    id:             `zone-${Date.now()}`,
    name:           '',
    classification: 'GREEN',
    maxAglFt:       200,
    description:    '',
    coordinates:    '',
  }])

  const removeZone = (idx: number) =>
    setZones(z => z.filter((_, i) => i !== idx))

  const updateZone = (idx: number, field: keyof DroneZone, value: string | number) =>
    setZones(z => z.map((zone, i) => i === idx ? { ...zone, [field]: value } : zone))

  const handleSave = async () => {
    if (!reason.trim()) { setError('Change reason is required.'); return }
    if (zones.some(z => !z.name.trim())) { setError('All zones must have a name.'); return }
    setSaving(true); setError(null)
    try {
      await onSave(zones, reason, new Date(effectiveFrom).toISOString())
    } catch (e: any) {
      setError(e.message ?? 'SAVE_FAILED')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      zIndex:1000, padding:'2rem', overflowY:'auto' }}>
      <div style={{ background: T.surface, borderRadius:'8px', width:'800px',
        maxWidth:'95vw', boxShadow:`0 8px 32px rgba(0,255,136,0.1)`,
        border: `1px solid ${T.border}` }}>

        {/* Header */}
        <div style={{ padding:'1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontSize:'1rem', color: T.textBright }}>New Drone Zone Version</span>
          <button onClick={onClose} style={{ border:'none', background:'none',
            fontSize:'1.25rem', cursor:'pointer', color: T.muted }}>×</button>
        </div>

        <div style={{ padding:'1.25rem' }}>

          {/* Change metadata */}
          <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
            <div style={{ flex:2, minWidth:'240px' }}>
              <label style={{ display:'block', marginBottom:'0.25rem',
                fontSize:'0.85rem', fontWeight:500, color: T.text }}>
                Change Reason <span style={{ color: T.red }}>*</span>
              </label>
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Adding Dwarka restricted zone per DGCA DCA/2024/123"
                style={{ width:'100%', padding:'0.45rem 0.75rem',
                  border: `1px solid ${T.border}`, borderRadius:'4px', fontSize:'0.875rem',
                  background: T.surface, color: T.text }}
              />
            </div>
            <div style={{ flex:1, minWidth:'180px' }}>
              <label style={{ display:'block', marginBottom:'0.25rem',
                fontSize:'0.85rem', fontWeight:500, color: T.text }}>
                Effective From <span style={{ color: T.red }}>*</span>
              </label>
              <input type="datetime-local" value={effectiveFrom}
                onChange={e => setEffective(e.target.value)}
                style={{ width:'100%', padding:'0.45rem 0.75rem',
                  border: `1px solid ${T.border}`, borderRadius:'4px', fontSize:'0.875rem',
                  background: T.surface, color: T.text }}
              />
            </div>
          </div>

          {/* Two-person rule notice */}
          <div style={{ padding:'0.75rem', background: T.amber + '15',
            border: `1px solid ${T.amber}40`, borderRadius:'6px', marginBottom:'1.5rem',
            fontSize:'0.82rem', color: T.amber }}>
            <strong>Two-Person Rule:</strong> This version will be submitted as PENDING.
            A second admin (not you) must approve it before it becomes ACTIVE.
            You cannot approve your own submission.
          </div>

          {/* Zone list */}
          <div style={{ marginBottom:'1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:'0.75rem' }}>
              <span style={{ fontWeight:600, fontSize:'0.9rem', color: T.textBright }}>
                Zones ({zones.length})
              </span>
              <button onClick={addZone}
                style={{ padding:'0.3rem 0.75rem', background: T.primary + '15',
                  border: `1px solid ${T.primary}40`, color: T.primary, borderRadius:'4px',
                  cursor:'pointer', fontSize:'0.8rem' }}>
                + Add Zone
              </button>
            </div>

            {zones.length === 0 && (
              <div style={{ textAlign:'center', padding:'2rem', color: T.muted,
                border: `1px dashed ${T.border}`, borderRadius:'6px', fontSize:'0.85rem' }}>
                No zones defined. Click "+ Add Zone" to start.
              </div>
            )}

            {zones.map((zone, idx) => {
              const cfg = CLASS_CONFIG[zone.classification]
              return (
                <div key={zone.id} style={{ border: `1px solid ${cfg.border}`,
                  background: cfg.bg, borderRadius:'6px', padding:'1rem',
                  marginBottom:'0.75rem' }}>
                  <div style={{ display:'flex', gap:'0.75rem',
                    alignItems:'flex-start', flexWrap:'wrap' }}>

                    {/* Zone number */}
                    <div style={{ minWidth:'28px', height:'28px', background: cfg.border,
                      borderRadius:'50%', display:'flex', alignItems:'center',
                      justifyContent:'center', fontWeight:700, fontSize:'0.8rem',
                      color: T.bg, flexShrink:0, marginTop:'0.15rem' }}>
                      {idx + 1}
                    </div>

                    {/* Fields */}
                    <div style={{ flex:1, display:'grid',
                      gridTemplateColumns:'1fr 1fr 100px', gap:'0.75rem' }}>

                      <div>
                        <label style={{ display:'block', marginBottom:'0.2rem',
                          fontSize:'0.78rem', fontWeight:500, color: T.text }}>Zone Name *</label>
                        <input value={zone.name}
                          onChange={e => updateZone(idx, 'name', e.target.value)}
                          placeholder="e.g. IGI Airport Periphery"
                          style={{ width:'100%', padding:'0.35rem 0.5rem',
                            border: `1px solid ${T.border}`, borderRadius:'4px',
                            fontSize:'0.83rem', background: T.surface, color: T.text }}
                        />
                      </div>

                      <div>
                        <label style={{ display:'block', marginBottom:'0.2rem',
                          fontSize:'0.78rem', fontWeight:500, color: T.text }}>Classification *</label>
                        <select value={zone.classification}
                          onChange={e => updateZone(idx, 'classification',
                            e.target.value as 'GREEN'|'YELLOW'|'RED')}
                          style={{ width:'100%', padding:'0.35rem 0.5rem',
                            border: `1px solid ${cfg.border}`, borderRadius:'4px',
                            fontSize:'0.83rem', background: T.surface, color: cfg.text,
                            fontWeight:600 }}>
                          <option value="GREEN">GREEN</option>
                          <option value="YELLOW">YELLOW</option>
                          <option value="RED">RED</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display:'block', marginBottom:'0.2rem',
                          fontSize:'0.78rem', fontWeight:500, color: T.text }}>Max AGL (ft)</label>
                        <input type="number" value={zone.maxAglFt}
                          onChange={e => updateZone(idx, 'maxAglFt', parseInt(e.target.value) || 0)}
                          min={0} max={1000}
                          style={{ width:'100%', padding:'0.35rem 0.5rem',
                            border: `1px solid ${T.border}`, borderRadius:'4px',
                            fontSize:'0.83rem', background: T.surface, color: T.text }}
                        />
                      </div>

                      <div style={{ gridColumn:'1 / -1' }}>
                        <label style={{ display:'block', marginBottom:'0.2rem',
                          fontSize:'0.78rem', fontWeight:500, color: T.text }}>Description</label>
                        <input value={zone.description}
                          onChange={e => updateZone(idx, 'description', e.target.value)}
                          placeholder="Brief description for pilots"
                          style={{ width:'100%', padding:'0.35rem 0.5rem',
                            border: `1px solid ${T.border}`, borderRadius:'4px',
                            fontSize:'0.83rem', background: T.surface, color: T.text }}
                        />
                      </div>

                    </div>

                    {/* Remove */}
                    <button onClick={() => removeZone(idx)}
                      style={{ border:'none', background:'none', cursor:'pointer',
                        color: T.red, fontSize:'1rem', padding:'0.25rem',
                        flexShrink:0 }} title="Remove zone">
                      ✕
                    </button>
                  </div>

                  {/* Classification info banner */}
                  <div style={{ marginTop:'0.5rem', marginLeft:'2.25rem',
                    fontSize:'0.75rem', color: cfg.text }}>
                    {cfg.label}
                    {zone.classification === 'GREEN' && zone.maxAglFt > 0
                      ? ` · Max ${zone.maxAglFt}ft AGL`
                      : zone.classification !== 'GREEN' ? ' · No drone flight permitted' : ''}
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div style={{ color: T.red, padding:'0.6rem 0.75rem', background: T.red + '15',
              border: `1px solid ${T.red}40`, borderRadius:'4px', marginBottom:'1rem',
              fontSize:'0.85rem' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'0.75rem 1.25rem', borderTop: `1px solid ${T.border}`,
          display:'flex', justifyContent:'flex-end', gap:'0.5rem' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding:'0.4rem 1rem', borderRadius:'4px', cursor:'pointer',
              border: `1px solid ${T.border}`, background:'transparent',
              color: T.text, fontSize:'0.875rem' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || zones.length === 0}
            style={{ padding:'0.4rem 1.25rem', borderRadius:'4px',
              cursor: saving || zones.length === 0 ? 'not-allowed' : 'pointer',
              border:'none',
              background: saving || zones.length === 0 ? T.muted : T.primary,
              color: T.bg, fontSize:'0.875rem', fontWeight:500 }}>
            {saving ? 'Submitting…' : 'Submit for Approval →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DroneZonesPage() {
  const { token, logout } = useAdminAuth()
  const [versions, setVersions]   = useState<AirspaceVersion[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)

  // ── Fetch versions ──────────────────────────────────────────────────────────
  const fetchVersions = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const { data } = await adminAxios(token).get('/airspace/versions', {
        params: { page, limit: 20, dataType: 'DRONE_ZONE' }
      })
      // Parse payloadJson to extract zones for preview
      const enriched: AirspaceVersion[] = (data.versions ?? []).map((v: any) => {
        let zones: DroneZone[] = []
        try { zones = JSON.parse(v.payloadJson)?.zones ?? [] } catch {}
        return { ...v, zonesCount: zones.length, payloadPreview: zones.slice(0, 3) }
      })
      setVersions(enriched)
      setTotal(data.total ?? 0)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, logout])

  useEffect(() => { fetchVersions() }, [fetchVersions])

  // ── Approve a version ───────────────────────────────────────────────────────
  const approve = async (versionId: string) => {
    if (!token) return
    if (!window.confirm(
      'Approve this drone zone version?\n\nThis will make it ACTIVE and may affect all drone operations in the defined areas.'
    )) return
    try {
      await adminAxios(token).patch(`/airspace/versions/${versionId}/approve`)
      fetchVersions()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'APPROVE_FAILED')
    }
  }

  // ── Submit new version ──────────────────────────────────────────────────────
  const handleSubmitVersion = async (
    zones: DroneZone[], reason: string, effectiveFrom: string
  ) => {
    if (!token) return
    await adminAxios(token).post('/airspace/drone-zone/draft', {
      dataType:     'DRONE_ZONE',
      payloadJson:  JSON.stringify({ zones }),
      changeReason: reason,
      effectiveFrom,
    })
    setShowForm(false)
    fetchVersions()
  }

  // ── Get current active version's zones ─────────────────────────────────────
  const activeVersion = versions.find(v => v.approvalStatus === 'ACTIVE')
  const activeZones: DroneZone[] = activeVersion?.payloadPreview ?? []

  return (
    <div style={{ padding:'1.5rem' }}>

      {/* Page header */}
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'1.25rem' }}>
        <div>
          <h2 style={{ margin:0, color: T.textBright }}>Drone Zone Management</h2>
          <p style={{ margin:'0.25rem 0 0', fontSize:'0.8rem', color: T.muted }}>
            DGCA UAS Rules 2021 · GREEN / YELLOW / RED classifications · Two-person approval required
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding:'0.5rem 1.25rem', background: T.primary, color: T.bg,
            border:'none', borderRadius:'4px', cursor:'pointer',
            fontSize:'0.875rem', fontWeight:500 }}>
          + New Version
        </button>
      </div>

      {/* Active version zone summary */}
      {activeZones.length > 0 && (
        <div style={{ marginBottom:'1.5rem', padding:'1rem',
          background: T.surface, border: `1px solid ${T.border}`, borderRadius:'8px',
          boxShadow: `0 1px 4px rgba(0,255,136,0.05)` }}>
          <div style={{ fontWeight:600, marginBottom:'0.75rem', fontSize:'0.9rem', color: T.textBright }}>
            Currently Active Zones
            <span style={{ marginLeft:'0.5rem', fontSize:'0.8rem', fontWeight:400,
              color: T.muted }}>Version {activeVersion?.versionNumber}</span>
          </div>
          <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
            {activeZones.map(z => {
              const cfg = CLASS_CONFIG[z.classification]
              return (
                <div key={z.id} style={{ padding:'0.5rem 0.75rem',
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  borderRadius:'6px', minWidth:'180px' }}>
                  <div style={{ fontWeight:600, color: cfg.text, fontSize:'0.8rem' }}>
                    {z.classification}
                  </div>
                  <div style={{ fontSize:'0.85rem', marginTop:'0.15rem', color: T.text }}>{z.name}</div>
                  {z.maxAglFt > 0 && (
                    <div style={{ fontSize:'0.75rem', color: T.muted, marginTop:'0.1rem' }}>
                      Max {z.maxAglFt}ft AGL
                    </div>
                  )}
                </div>
              )
            })}
            {(activeVersion?.zonesCount ?? 0) > 3 && (
              <div style={{ padding:'0.5rem 0.75rem', color: T.muted,
                fontSize:'0.82rem', alignSelf:'center' }}>
                +{(activeVersion?.zonesCount ?? 0) - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error / loading */}
      {error && (
        <div style={{ color: T.red, padding:'0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius:'4px', marginBottom:'1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, marginBottom:'1rem' }}>Loading…</div>}

      {/* Version history table */}
      {!loading && versions.length === 0 && !error && (
        <div style={{ textAlign:'center', padding:'3rem', color: T.muted }}>
          No drone zone versions yet. Create one to get started.
        </div>
      )}

      {!loading && versions.length > 0 && (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
          <thead>
            <tr style={{ background: T.surface, borderBottom: `2px solid ${T.border}` }}>
              {['Version', 'Status', 'Zones', 'Effective From', 'Change Reason',
                'Created By', 'Approved By', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ padding:'0.5rem 0.75rem',
                  textAlign:'left', fontWeight:600, whiteSpace:'nowrap', color: T.textBright }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map(v => (
              <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                  fontWeight:600, color: T.textBright }}>v{v.versionNumber}</td>
                <td style={{ padding:'0.5rem 0.75rem' }}>
                  <span style={{
                    color: STATUS_COLOUR[v.approvalStatus] ?? T.muted,
                    fontWeight:500,
                    background: (STATUS_COLOUR[v.approvalStatus] ?? T.muted) + '18',
                    padding:'0.15rem 0.5rem', borderRadius:'3px', fontSize:'0.8rem',
                  }}>
                    {v.approvalStatus}
                  </span>
                </td>
                <td style={{ padding:'0.5rem 0.75rem' }}>
                  <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                    {v.payloadPreview.map(z => {
                      const cfg = CLASS_CONFIG[z.classification]
                      return (
                        <span key={z.id} style={{
                          padding:'0.1rem 0.35rem', fontSize:'0.7rem',
                          background: cfg.bg, border: `1px solid ${cfg.border}`,
                          color: cfg.text, borderRadius:'3px', fontWeight:600,
                        }}>
                          {z.classification}
                        </span>
                      )
                    })}
                    {v.zonesCount > 3 && (
                      <span style={{ fontSize:'0.7rem', color: T.muted,
                        alignSelf:'center' }}>+{v.zonesCount - 3}</span>
                    )}
                  </div>
                  <div style={{ fontSize:'0.72rem', color: T.muted, marginTop:'0.15rem' }}>
                    {v.zonesCount} zone{v.zonesCount !== 1 ? 's' : ''}
                  </div>
                </td>
                <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.8rem', whiteSpace:'nowrap', color: T.text }}>
                  {new Date(v.effectiveFrom).toLocaleDateString(undefined, {
                    day:'2-digit', month:'short', year:'numeric',
                  })}
                </td>
                <td style={{ padding:'0.5rem 0.75rem', maxWidth:'220px',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: T.text }}>
                  {v.changeReason}
                </td>
                <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                  fontSize:'0.75rem', color: T.text }}>
                  {v.createdBy.slice(0, 8)}…
                </td>
                <td style={{ padding:'0.5rem 0.75rem', fontFamily:'monospace',
                  fontSize:'0.75rem', color: v.approvedBy ? T.primary : T.muted }}>
                  {v.approvedBy ? v.approvedBy.slice(0, 8) + '…' : '—'}
                </td>
                <td style={{ padding:'0.5rem 0.75rem', fontSize:'0.75rem',
                  color: T.muted, whiteSpace:'nowrap' }}>
                  {new Date(v.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding:'0.5rem 0.75rem' }}>
                  {v.approvalStatus === 'PENDING' && (
                    <button onClick={() => approve(v.id)}
                      style={{ padding:'0.2rem 0.6rem', background: T.primary + '15',
                        border: `1px solid ${T.primary}40`, color: T.primary,
                        borderRadius:'4px', cursor:'pointer', fontSize:'0.78rem',
                        fontWeight:500 }}>
                      Approve ✓
                    </button>
                  )}
                  {v.approvalStatus === 'ACTIVE' && (
                    <span style={{ fontSize:'0.75rem', color: T.primary }}>● Live</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding:'0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius:'4px',
            cursor: page * 20 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 20 >= total ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Next
        </button>
      </div>

      {/* New version form modal */}
      {showForm && (
        <ZoneFormModal
          initialZones={activeZones}
          onSave={handleSubmitVersion}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

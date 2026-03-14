import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

type PAStatus =
  | 'PENDING' | 'APPROVED' | 'REJECTED' | 'DOWNLOADED'
  | 'LOADED' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED'
  | 'CANCELLED' | 'AUDITED'

type ZoneType = 'GREEN' | 'YELLOW' | 'RED'

interface PermissionArtefact {
  id: string
  applicationId: string
  status: PAStatus
  zoneType: ZoneType
  zoneName: string
  droneUin: string
  flightWindowStart: string
  flightWindowEnd: string
  submittedAt: string
  expectedBy?: string
  approvedAt?: string
  geometry?: { type: string; coordinates: number[][][] }
  altitudeAglM?: number
  operationType?: string
  pilotName?: string
  pilotLicense?: string
  purpose?: string
  maxAltitudeM?: number
  violations?: Array<{
    id: string
    type: string
    description: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    timestamp: string
  }>
  timeline?: Array<{
    stage: string
    timestamp: string
    actor?: string
    details?: string
  }>
}

interface PermissionsResponse {
  permissions: PermissionArtefact[]
  total: number
  page: number
  pageSize: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<ZoneType, string> = {
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
  RED: '#EF4444',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:    T.amber,
  APPROVED:   '#22C55E',
  REJECTED:   T.red,
  DOWNLOADED: '#40C4AA',
  LOADED:     '#6366F1',
  ACTIVE:     T.primary,
  COMPLETED:  '#8B5CF6',
  EXPIRED:    '#6B7280',
  CANCELLED:  '#6B7280',
  AUDITED:    '#A855F7',
}

const ACTIVE_STATUSES: PAStatus[] = ['APPROVED', 'DOWNLOADED', 'LOADED', 'ACTIVE']
const PAGE_SIZE = 20
const POLL_INTERVAL_MS = 30_000

const LIFECYCLE_STAGES = [
  'Submitted', 'Approved', 'Downloaded', 'Loaded', 'Active', 'Completed', 'Audited',
]

const STATUS_FILTER_OPTIONS: PAStatus[] = [
  'PENDING', 'APPROVED', 'REJECTED', 'DOWNLOADED',
  'LOADED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'AUDITED',
]

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '6px',
  padding: '0.8rem',
  marginBottom: '0.6rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  color: T.muted,
  marginBottom: '2px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.5rem',
  background: T.bg,
  color: T.textBright,
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  fontSize: '0.72rem',
}

const btnBase: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.68rem',
  fontWeight: 600,
  transition: 'all 0.15s',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtDateShort(ts: string): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function getCountdown(endTs: string): string {
  const now = Date.now()
  const end = new Date(endTs).getTime()
  const diff = end - now
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }
  return `${hours}h ${mins}m`
}

function canCancel(submittedAt: string): boolean {
  const submitted = new Date(submittedAt).getTime()
  return Date.now() - submitted < 3_600_000 // 1 hour
}

// ── Zone Colour Chip ─────────────────────────────────────────────────────────

function ZoneChip({ zone }: { zone: ZoneType }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '0.6rem',
      fontWeight: 700,
      color: '#fff',
      background: ZONE_COLORS[zone],
    }}>
      {zone}
    </span>
  )
}

function StatusBadge({ status }: { status: PAStatus }) {
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '0.6rem',
      fontWeight: 700,
      color: '#fff',
      background: STATUS_COLORS[status] ?? T.muted,
    }}>
      {status}
    </span>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid ${T.border}`,
      borderTopColor: T.amber,
      borderRadius: '50%',
      animation: 'pa-spin 0.8s linear infinite',
    }} />
  )
}

// ── PA Detail Modal ──────────────────────────────────────────────────────────

function PADetailModal({ pa, onClose }: { pa: PermissionArtefact; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!pa.geometry || !mapRef.current) return
    if (typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([20.5937, 78.9629], 5)

    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    try {
      const coords = pa.geometry.coordinates[0].map(
        (c: number[]) => [c[1], c[0]] as [number, number]
      )
      const polygon = L.polygon(coords, {
        color: ZONE_COLORS[pa.zoneType],
        fillColor: ZONE_COLORS[pa.zoneType],
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(map)

      map.fitBounds(polygon.getBounds(), { padding: [30, 30] })
    } catch {
      // geometry parsing failed, leave map at default view
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [pa])

  // Determine which lifecycle stages have been reached
  const stageStatus = (stage: string): 'done' | 'current' | 'future' => {
    const stageToStatus: Record<string, PAStatus[]> = {
      Submitted:  ['PENDING', 'APPROVED', 'REJECTED', 'DOWNLOADED', 'LOADED', 'ACTIVE', 'COMPLETED', 'AUDITED'],
      Approved:   ['APPROVED', 'DOWNLOADED', 'LOADED', 'ACTIVE', 'COMPLETED', 'AUDITED'],
      Downloaded: ['DOWNLOADED', 'LOADED', 'ACTIVE', 'COMPLETED', 'AUDITED'],
      Loaded:     ['LOADED', 'ACTIVE', 'COMPLETED', 'AUDITED'],
      Active:     ['ACTIVE', 'COMPLETED', 'AUDITED'],
      Completed:  ['COMPLETED', 'AUDITED'],
      Audited:    ['AUDITED'],
    }
    const statusesAtStage = stageToStatus[stage] ?? []
    if (!statusesAtStage.includes(pa.status)) return 'future'

    // Current if this is the latest reached stage
    const stageIdx = LIFECYCLE_STAGES.indexOf(stage)
    const nextStage = LIFECYCLE_STAGES[stageIdx + 1]
    if (!nextStage) return 'done'
    const nextStatuses = stageToStatus[nextStage] ?? []
    if (!nextStatuses.includes(pa.status)) return 'current'
    return 'done'
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '6px', width: '720px', maxWidth: '95vw',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.2rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ color: T.textBright, fontSize: '0.9rem', margin: 0 }}>
              Permission Artefact Details
            </h2>
            <span style={{
              color: T.muted, fontSize: '0.65rem',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {pa.applicationId}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ZoneChip zone={pa.zoneType} />
            <StatusBadge status={pa.status} />
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: `1px solid ${T.border}`,
                color: T.muted, cursor: 'pointer', padding: '4px 10px',
                borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600,
              }}
            >
              CLOSE
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.2rem' }}>
          {/* Map */}
          {pa.geometry && (
            <div
              ref={mapRef}
              style={{
                height: '220px', borderRadius: '6px',
                border: `1px solid ${T.border}`,
                marginBottom: '1rem', background: '#0a0a0a',
              }}
            />
          )}

          {/* PA Fields Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: '0.6rem', fontSize: '0.75rem', marginBottom: '1.2rem',
          }}>
            <DetailField label="Zone" value={pa.zoneName} />
            <DetailField label="Zone Type" value={pa.zoneType} color={ZONE_COLORS[pa.zoneType]} />
            <DetailField label="Drone UIN" value={pa.droneUin} />
            <DetailField label="Flight Start" value={fmtDateTime(pa.flightWindowStart)} />
            <DetailField label="Flight End" value={fmtDateTime(pa.flightWindowEnd)} />
            <DetailField label="Status" value={pa.status} color={STATUS_COLORS[pa.status]} />
            {pa.operationType && <DetailField label="Operation" value={pa.operationType} />}
            {pa.pilotName && <DetailField label="Pilot" value={pa.pilotName} />}
            {pa.pilotLicense && <DetailField label="License" value={pa.pilotLicense} />}
            {pa.purpose && <DetailField label="Purpose" value={pa.purpose} />}
            {pa.maxAltitudeM != null && <DetailField label="Max Altitude" value={`${pa.maxAltitudeM}m AGL`} />}
            <DetailField label="Submitted" value={fmtDateTime(pa.submittedAt)} />
            {pa.approvedAt && <DetailField label="Approved" value={fmtDateTime(pa.approvedAt)} />}
          </div>

          {/* Lifecycle Timeline */}
          <div style={{ marginBottom: '1.2rem' }}>
            <h3 style={{ color: T.textBright, fontSize: '0.75rem', marginBottom: '0.6rem' }}>
              Lifecycle Timeline
            </h3>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              overflow: 'auto', paddingBottom: '0.3rem',
            }}>
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const s = stageStatus(stage)
                const dotColor = s === 'done' ? '#22C55E'
                               : s === 'current' ? T.primary
                               : T.border
                const lineColor = s === 'done' ? '#22C55E40' : T.border
                return (
                  <React.Fragment key={stage}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      minWidth: '72px',
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: dotColor,
                        border: s === 'current' ? `2px solid ${T.primary}` : 'none',
                        boxShadow: s === 'current' ? `0 0 6px ${T.primary}40` : 'none',
                      }} />
                      <span style={{
                        fontSize: '0.55rem', marginTop: '4px',
                        color: s === 'future' ? T.muted : T.textBright,
                        fontWeight: s === 'current' ? 700 : 400,
                      }}>
                        {stage}
                      </span>
                    </div>
                    {idx < LIFECYCLE_STAGES.length - 1 && (
                      <div style={{
                        flex: 1, height: '2px', minWidth: '16px',
                        background: lineColor, marginTop: '-10px',
                      }} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {/* PA-specific timeline events */}
          {pa.timeline && pa.timeline.length > 0 && (
            <div style={{ marginBottom: '1.2rem' }}>
              <h3 style={{ color: T.textBright, fontSize: '0.75rem', marginBottom: '0.6rem' }}>
                Event History
              </h3>
              <div style={{ position: 'relative', paddingLeft: '28px' }}>
                <div style={{
                  position: 'absolute', left: '8px', top: '8px',
                  bottom: '8px', width: '2px',
                  background: `linear-gradient(to bottom, ${T.primary}40, ${T.border})`,
                }} />
                {pa.timeline.map((evt, idx) => (
                  <div key={idx} style={{
                    position: 'relative',
                    marginBottom: idx === pa.timeline!.length - 1 ? 0 : '0.8rem',
                  }}>
                    <div style={{
                      position: 'absolute', left: '-24px', top: '4px',
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: T.primary, border: `2px solid ${T.surface}`,
                      boxShadow: `0 0 0 2px ${T.primary}40`,
                    }} />
                    <div style={{
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: '4px', padding: '0.5rem 0.7rem',
                      borderLeft: `3px solid ${T.primary}`,
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginBottom: '0.2rem',
                      }}>
                        <span style={{ color: T.primary, fontSize: '0.7rem', fontWeight: 700 }}>
                          {evt.stage}
                        </span>
                        <span style={{
                          color: T.muted, fontSize: '0.6rem',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}>
                          {fmtDateTime(evt.timestamp)}
                        </span>
                      </div>
                      {evt.details && (
                        <div style={{ color: T.text, fontSize: '0.65rem' }}>
                          {evt.details}
                        </div>
                      )}
                      {evt.actor && (
                        <div style={{ color: T.muted, fontSize: '0.6rem', fontStyle: 'italic' }}>
                          by {evt.actor}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Violations */}
          {pa.violations && pa.violations.length > 0 && (
            <div>
              <h3 style={{ color: T.red, fontSize: '0.75rem', marginBottom: '0.6rem' }}>
                Violations ({pa.violations.length})
              </h3>
              {pa.violations.map(v => (
                <div key={v.id} style={{
                  background: T.bg, border: `1px solid ${T.red}30`,
                  borderRadius: '4px', padding: '0.5rem 0.7rem',
                  borderLeft: `3px solid ${T.red}`,
                  marginBottom: '0.4rem',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginBottom: '0.2rem',
                  }}>
                    <span style={{ color: T.red, fontSize: '0.7rem', fontWeight: 700 }}>
                      {v.type}
                    </span>
                    <span style={{
                      padding: '1px 6px', borderRadius: '3px', fontSize: '0.55rem',
                      fontWeight: 700, color: '#fff',
                      background: v.severity === 'CRITICAL' ? T.red
                                : v.severity === 'HIGH' ? '#F97316'
                                : v.severity === 'MEDIUM' ? T.amber
                                : T.muted,
                    }}>
                      {v.severity}
                    </span>
                  </div>
                  <div style={{ color: T.text, fontSize: '0.65rem' }}>
                    {v.description}
                  </div>
                  <div style={{
                    color: T.muted, fontSize: '0.55rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    marginTop: '0.2rem',
                  }}>
                    {fmtDateTime(v.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: T.muted, fontSize: '0.6rem', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ color: color ?? T.textBright, fontWeight: 500, fontSize: '0.72rem' }}>{value}</div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MyPermissionsPage() {
  // ── State ────────────────────────────────────────────────────────────────
  const [permissions, setPermissions] = useState<PermissionArtefact[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Filters
  const [filterStatus, setFilterStatus]     = useState<string>('')
  const [filterDroneUin, setFilterDroneUin] = useState('')
  const [filterZoneType, setFilterZoneType] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')

  // Modal
  const [selectedPA, setSelectedPA] = useState<PermissionArtefact | null>(null)

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)

  // Countdown tick
  const [, setTick] = useState(0)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchPermissions = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE,
      }
      if (filterStatus) params.status = filterStatus
      if (filterDroneUin) params.droneUin = filterDroneUin
      if (filterZoneType) params.zoneType = filterZoneType
      if (filterDateFrom) params.dateFrom = filterDateFrom
      if (filterDateTo) params.dateTo = filterDateTo

      const { data } = await userApi().get<PermissionsResponse>('/drone/permissions', { params })
      setPermissions(data.permissions ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterDroneUin, filterZoneType, filterDateFrom, filterDateTo])

  useEffect(() => {
    setLoading(true)
    fetchPermissions()
  }, [fetchPermissions])

  // Poll pending permissions every 30 seconds
  useEffect(() => {
    const hasPending = permissions.some(p => p.status === 'PENDING')
    if (!hasPending) return

    const interval = setInterval(() => {
      fetchPermissions()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [permissions, fetchPermissions])

  // Countdown timer tick every 30 seconds
  useEffect(() => {
    const hasActive = permissions.some(p => ACTIVE_STATUSES.includes(p.status))
    if (!hasActive) return

    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 30_000)

    return () => clearInterval(interval)
  }, [permissions])

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDownloadPA = async (paId: string) => {
    setActionLoading(paId)
    try {
      const { data } = await userApi().post(`/drone/permissions/${paId}/download`, {}, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `PA-${paId}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      await fetchPermissions()
    } catch {
      // download failed silently
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkLoaded = async (paId: string) => {
    setActionLoading(paId)
    try {
      await userApi().post(`/drone/permissions/${paId}/mark-loaded`)
      await fetchPermissions()
    } catch {
      // failed silently
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelApplication = async (paId: string) => {
    if (!confirm('Cancel this permission application? This cannot be undone.')) return
    setActionLoading(paId)
    try {
      await userApi().post(`/drone/permissions/${paId}/cancel`)
      await fetchPermissions()
    } catch {
      // failed silently
    } finally {
      setActionLoading(null)
    }
  }

  const handleUploadFlightLog = (paId: string) => {
    setUploadTargetId(paId)
    fileInputRef.current?.click()
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetId) return

    setActionLoading(uploadTargetId)
    try {
      const formData = new FormData()
      formData.append('flightLog', file)
      await userApi().post(
        `/drone/permissions/${uploadTargetId}/upload-log`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      await fetchPermissions()
    } catch {
      // upload failed silently
    } finally {
      setActionLoading(null)
      setUploadTargetId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const activePermissions = permissions.filter(p => ACTIVE_STATUSES.includes(p.status))
  const pendingPermissions = permissions.filter(p => p.status === 'PENDING')
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Spinner keyframes */}
      <style>{`@keyframes pa-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Hidden file input for flight log upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json"
        style={{ display: 'none' }}
        onChange={onFileSelected}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.2rem' }}>
            My Flight Permissions
          </h1>
          <p style={{ color: T.muted, fontSize: '0.7rem' }}>
            Manage your drone permission artefacts
          </p>
        </div>
        <Link
          to="/flight-planner"
          style={{
            ...btnBase,
            background: T.primary + '15',
            borderColor: T.primary + '40',
            color: T.primary,
            textDecoration: 'none',
            fontSize: '0.75rem',
          }}
        >
          + New Flight Plan
        </Link>
      </div>

      {loading && permissions.length === 0 ? (
        <p style={{ color: T.muted, fontSize: '0.75rem' }}>Loading permissions...</p>
      ) : (
        <>
          {/* ── Active Permissions Panel ─────────────────────────────────── */}
          {activePermissions.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                Active Permissions ({activePermissions.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.6rem' }}>
                {activePermissions.map(pa => (
                  <div
                    key={pa.id}
                    style={{
                      ...cardStyle,
                      borderLeft: `3px solid ${ZONE_COLORS[pa.zoneType]}`,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedPA(pa)}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ZoneChip zone={pa.zoneType} />
                        <StatusBadge status={pa.status} />
                      </div>
                      <span style={{
                        color: T.primary, fontSize: '0.65rem', fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>
                        {getCountdown(pa.flightWindowEnd)}
                      </span>
                    </div>

                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '0.4rem', fontSize: '0.68rem', marginBottom: '0.5rem',
                    }}>
                      <div>
                        <span style={labelStyle}>Drone UIN</span>
                        <span style={{ color: T.textBright }}>{pa.droneUin}</span>
                      </div>
                      <div>
                        <span style={labelStyle}>Zone</span>
                        <span style={{ color: T.textBright }}>{pa.zoneName}</span>
                      </div>
                      <div>
                        <span style={labelStyle}>Start</span>
                        <span style={{ color: T.text }}>{fmtDateTime(pa.flightWindowStart)}</span>
                      </div>
                      <div>
                        <span style={labelStyle}>End</span>
                        <span style={{ color: T.text }}>{fmtDateTime(pa.flightWindowEnd)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}
                         onClick={e => e.stopPropagation()}>
                      {pa.status === 'APPROVED' && (
                        <button
                          onClick={() => handleDownloadPA(pa.id)}
                          disabled={actionLoading === pa.id}
                          style={{
                            ...btnBase,
                            background: '#22C55E15',
                            borderColor: '#22C55E40',
                            color: '#22C55E',
                            opacity: actionLoading === pa.id ? 0.6 : 1,
                          }}
                        >
                          {actionLoading === pa.id ? 'Downloading...' : 'Download PA'}
                        </button>
                      )}
                      {pa.status === 'DOWNLOADED' && (
                        <button
                          onClick={() => handleMarkLoaded(pa.id)}
                          disabled={actionLoading === pa.id}
                          style={{
                            ...btnBase,
                            background: '#6366F115',
                            borderColor: '#6366F140',
                            color: '#6366F1',
                            opacity: actionLoading === pa.id ? 0.6 : 1,
                          }}
                        >
                          {actionLoading === pa.id ? 'Updating...' : 'Mark as Loaded'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Pending Permissions Section ──────────────────────────────── */}
          {pendingPermissions.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ color: T.amber, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                Pending Permissions ({pendingPermissions.length})
              </h2>
              {pendingPermissions.map(pa => (
                <div
                  key={pa.id}
                  style={{
                    ...cardStyle,
                    borderLeft: `3px solid ${T.amber}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedPA(pa)}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '0.4rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Spinner />
                      <span style={{ color: T.amber, fontSize: '0.75rem', fontWeight: 600 }}>
                        PENDING REVIEW
                      </span>
                    </div>
                    <ZoneChip zone={pa.zoneType} />
                  </div>

                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '0.4rem', fontSize: '0.68rem', marginBottom: '0.5rem',
                  }}>
                    <div>
                      <span style={labelStyle}>Drone UIN</span>
                      <span style={{ color: T.textBright }}>{pa.droneUin}</span>
                    </div>
                    <div>
                      <span style={labelStyle}>Submitted At</span>
                      <span style={{ color: T.text }}>{fmtDateTime(pa.submittedAt)}</span>
                    </div>
                    <div>
                      <span style={labelStyle}>Expected By</span>
                      <span style={{ color: T.text }}>
                        {pa.expectedBy ? fmtDateShort(pa.expectedBy) : '--'}
                      </span>
                    </div>
                  </div>

                  <div onClick={e => e.stopPropagation()}>
                    {canCancel(pa.submittedAt) && (
                      <button
                        onClick={() => handleCancelApplication(pa.id)}
                        disabled={actionLoading === pa.id}
                        style={{
                          ...btnBase,
                          background: T.red + '15',
                          borderColor: T.red + '40',
                          color: T.red,
                          opacity: actionLoading === pa.id ? 0.6 : 1,
                        }}
                      >
                        {actionLoading === pa.id ? 'Cancelling...' : 'Cancel Application'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Filters ─────────────────────────────────────────────────── */}
          <div style={{
            ...cardStyle,
            display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
            alignItems: 'flex-end', marginBottom: '0.8rem',
          }}>
            <div style={{ minWidth: '130px' }}>
              <label style={labelStyle}>Status</label>
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                style={inputStyle}
              >
                <option value="">All</option>
                {STATUS_FILTER_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: '130px' }}>
              <label style={labelStyle}>Drone UIN</label>
              <input
                value={filterDroneUin}
                onChange={e => { setFilterDroneUin(e.target.value); setPage(1) }}
                placeholder="e.g. UA-12345"
                style={inputStyle}
              />
            </div>
            <div style={{ minWidth: '100px' }}>
              <label style={labelStyle}>Zone Type</label>
              <select
                value={filterZoneType}
                onChange={e => { setFilterZoneType(e.target.value); setPage(1) }}
                style={inputStyle}
              >
                <option value="">All</option>
                <option value="GREEN">GREEN</option>
                <option value="YELLOW">YELLOW</option>
                <option value="RED">RED</option>
              </select>
            </div>
            <div style={{ minWidth: '130px' }}>
              <label style={labelStyle}>From Date</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }}
                style={inputStyle}
              />
            </div>
            <div style={{ minWidth: '130px' }}>
              <label style={labelStyle}>To Date</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setPage(1) }}
                style={inputStyle}
              />
            </div>
            <button
              onClick={() => {
                setFilterStatus(''); setFilterDroneUin(''); setFilterZoneType('')
                setFilterDateFrom(''); setFilterDateTo(''); setPage(1)
              }}
              style={{
                ...btnBase,
                background: T.bg,
                color: T.muted,
              }}
            >
              Clear
            </button>
          </div>

          {/* ── History Table ────────────────────────────────────────────── */}
          <h2 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Permission History ({total})
          </h2>

          <div style={{ overflowX: 'auto', marginBottom: '0.8rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{
                  borderBottom: `1px solid ${T.border}`,
                  color: T.muted, textAlign: 'left',
                }}>
                  <th style={{ padding: '0.5rem 0.4rem' }}>App ID</th>
                  <th style={{ padding: '0.5rem 0.4rem' }}>Zone</th>
                  <th style={{ padding: '0.5rem 0.4rem' }}>Start</th>
                  <th style={{ padding: '0.5rem 0.4rem' }}>End</th>
                  <th style={{ padding: '0.5rem 0.4rem' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.4rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {permissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{
                      padding: '1.5rem', textAlign: 'center',
                      color: T.muted, fontSize: '0.75rem',
                    }}>
                      No permissions found.
                    </td>
                  </tr>
                ) : (
                  permissions.map(pa => (
                    <tr
                      key={pa.id}
                      style={{
                        borderBottom: `1px solid ${T.border}08`,
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onClick={() => setSelectedPA(pa)}
                      onMouseEnter={e => (e.currentTarget.style.background = T.primary + '08')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '0.5rem 0.4rem', color: T.primary }}>
                        {pa.applicationId.length > 12
                          ? pa.applicationId.slice(0, 12) + '...'
                          : pa.applicationId
                        }
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <ZoneChip zone={pa.zoneType} />
                          <span style={{ color: T.text, fontSize: '0.65rem' }}>
                            {pa.zoneName.length > 16
                              ? pa.zoneName.slice(0, 16) + '...'
                              : pa.zoneName
                            }
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem', color: T.text, fontSize: '0.65rem' }}>
                        {fmtDateTime(pa.flightWindowStart)}
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem', color: T.text, fontSize: '0.65rem' }}>
                        {fmtDateTime(pa.flightWindowEnd)}
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem' }}>
                        <StatusBadge status={pa.status} />
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem' }}
                          onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {pa.status === 'APPROVED' && (
                            <button
                              onClick={() => handleDownloadPA(pa.id)}
                              disabled={actionLoading === pa.id}
                              style={{
                                ...btnBase,
                                padding: '2px 6px', fontSize: '0.6rem',
                                background: '#22C55E15',
                                borderColor: '#22C55E40',
                                color: '#22C55E',
                                opacity: actionLoading === pa.id ? 0.6 : 1,
                              }}
                            >
                              Download
                            </button>
                          )}
                          {pa.status === 'DOWNLOADED' && (
                            <button
                              onClick={() => handleMarkLoaded(pa.id)}
                              disabled={actionLoading === pa.id}
                              style={{
                                ...btnBase,
                                padding: '2px 6px', fontSize: '0.6rem',
                                background: '#6366F115',
                                borderColor: '#6366F140',
                                color: '#6366F1',
                                opacity: actionLoading === pa.id ? 0.6 : 1,
                              }}
                            >
                              Mark Loaded
                            </button>
                          )}
                          {pa.status === 'COMPLETED' && (
                            <button
                              onClick={() => handleUploadFlightLog(pa.id)}
                              disabled={actionLoading === pa.id}
                              style={{
                                ...btnBase,
                                padding: '2px 6px', fontSize: '0.6rem',
                                background: '#8B5CF615',
                                borderColor: '#8B5CF640',
                                color: '#8B5CF6',
                                opacity: actionLoading === pa.id ? 0.6 : 1,
                              }}
                            >
                              Upload Log
                            </button>
                          )}
                          {pa.status === 'PENDING' && canCancel(pa.submittedAt) && (
                            <button
                              onClick={() => handleCancelApplication(pa.id)}
                              disabled={actionLoading === pa.id}
                              style={{
                                ...btnBase,
                                padding: '2px 6px', fontSize: '0.6rem',
                                background: T.red + '15',
                                borderColor: T.red + '40',
                                color: T.red,
                                opacity: actionLoading === pa.id ? 0.6 : 1,
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedPA(pa)}
                            style={{
                              ...btnBase,
                              padding: '2px 6px', fontSize: '0.6rem',
                              background: T.primary + '15',
                              borderColor: T.primary + '40',
                              color: T.primary,
                            }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ───────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', marginTop: '0.5rem',
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  ...btnBase,
                  background: T.bg,
                  color: page === 1 ? T.muted : T.textBright,
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                Prev
              </button>
              <span style={{ color: T.text, fontSize: '0.7rem' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  ...btnBase,
                  background: T.bg,
                  color: page === totalPages ? T.muted : T.textBright,
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* ── PA Detail Modal ───────────────────────────────────────────── */}
      {selectedPA && (
        <PADetailModal
          pa={selectedPA}
          onClose={() => setSelectedPA(null)}
        />
      )}
    </div>
  )
}

// ── ATC Queue Page ───────────────────────────────────────────────────────────
// PLATFORM_SUPER_ADMIN view: monitors all yellow-zone drone operation plan
// applications awaiting ATC approval. Includes SLA tracking, bulk reminders,
// authority performance chart, and a detail drawer with timeline.
//
// Uses the dark green HUD theme (ZT) from theme.ts.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { ZT } from '../../theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface ZoneClassification {
  zone:          string
  reasons:       string[]
  atcAuthority?: string
}

interface ATCQueueItem {
  id:                string
  planId:            string
  operatorId:        string
  pilotName:         string
  droneSerialNumber: string
  uinNumber:         string | null
  areaType:          string
  areaGeoJson:       string | null
  centerLatDeg:      number | null
  centerLonDeg:      number | null
  radiusM:           number | null
  maxAltitudeAglM:   number
  minAltitudeAglM:   number
  status:            string
  purpose:           string
  remarks:           string | null
  rejectionReason:   string | null
  plannedStartUtc:   string
  plannedEndUtc:     string
  createdAt:         string
  submittedAt:       string | null
  approvedAt:        string | null
  approvedBy:        string | null
  notifyEmail:       string | null
  notifyMobile:      string | null
  zoneClassification: ZoneClassification
  dueDate:           string
  daysRemaining:     number
  slaStatus:         'ON_TIME' | 'DUE_SOON' | 'OVERDUE'
  expedited:         boolean
}

interface AuthorityPerf {
  authority: string
  avgDays:   number
  count:     number
}

interface DetailPlan extends ATCQueueItem {
  pilotInfo: {
    id?: string
    email?: string
    mobileNumber?: string
    role?: string
    accountStatus?: string
  }
}

interface TimelineEvent {
  event:      string
  timestamp:  string
  actor:      string
  detail?:    string
}

// ── Utility ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function decodeAdminRole(token: string | null): string | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload.adminRole ?? null
  } catch {
    return null
  }
}

// ── SLA colour helpers ───────────────────────────────────────────────────────

const SLA_COLOURS: Record<string, string> = {
  ON_TIME:  'transparent',
  DUE_SOON: ZT.amber + '18',
  OVERDUE:  ZT.red + '18',
}

const SLA_BORDER_COLOURS: Record<string, string> = {
  ON_TIME:  ZT.border,
  DUE_SOON: ZT.amber + '50',
  OVERDUE:  ZT.red + '50',
}

// ── Authority Performance Chart ──────────────────────────────────────────────

function AuthorityChart({ data }: { data: AuthorityPerf[] }) {
  if (data.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center', color: ZT.muted,
        fontSize: '0.8rem', fontFamily: 'monospace',
        background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      }}>
        NO PERFORMANCE DATA AVAILABLE (LAST 90 DAYS)
      </div>
    )
  }

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: ZT.bg, border: `1px solid ${ZT.border}`, borderRadius: '4px',
        padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem',
      }}>
        <div style={{ color: ZT.phosphor, fontWeight: 700, marginBottom: '0.25rem' }}>{label}</div>
        <div style={{ color: ZT.textBright }}>Avg: {payload[0].value} days</div>
        <div style={{ color: ZT.muted }}>Processed: {payload[0].payload.count} plans</div>
      </div>
    )
  }

  return (
    <div style={{
      background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      padding: '1rem',
    }}>
      <div style={{
        color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        AUTHORITY PERFORMANCE (AVG APPROVAL DAYS - LAST 90 DAYS)
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ZT.border} />
          <XAxis
            dataKey="authority"
            tick={{ fill: ZT.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
          />
          <YAxis
            tick={{ fill: ZT.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
            label={{
              value: 'Days',
              angle: -90,
              position: 'insideLeft',
              style: { fill: ZT.muted, fontSize: 11, fontFamily: 'monospace' },
            }}
          />
          <Tooltip content={<CustomTooltipContent />} />
          <Bar dataKey="avgDays" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.avgDays > 7 ? ZT.red : entry.avgDays > 5 ? ZT.amber : ZT.phosphor}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  planId, token, onClose,
}: {
  planId: string; token: string; onClose: () => void
}) {
  const [plan, setPlan]           = useState<DetailPlan | null>(null)
  const [timeline, setTimeline]   = useState<TimelineEvent[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    adminAxios(token).get(`/atc-queue/${planId}`)
      .then(({ data }) => {
        setPlan(data.plan ?? null)
        setTimeline(data.timeline ?? [])
      })
      .catch(e => setError(e.response?.data?.error ?? 'FETCH_FAILED'))
      .finally(() => setLoading(false))
  }, [planId, token])

  const p = plan

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9998,
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, width: '520px', height: '100vh',
        background: ZT.bg, borderLeft: `2px solid ${ZT.border}`,
        zIndex: 9999, overflow: 'auto',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: `1px solid ${ZT.border}`,
          position: 'sticky', top: 0, background: ZT.bg, zIndex: 1,
        }}>
          <span style={{ color: ZT.phosphor, fontWeight: 700, fontSize: '0.95rem', fontFamily: 'monospace' }}>
            ATC APPLICATION DETAIL
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            color: ZT.text, cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem',
          }}>
            CLOSE
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: ZT.muted, fontFamily: 'monospace' }}>
              LOADING...
            </div>
          )}
          {error && (
            <div style={{
              padding: '1rem', background: ZT.red + '15', border: `1px solid ${ZT.red}40`,
              borderRadius: '6px', color: ZT.red, fontSize: '0.85rem', marginBottom: '1rem',
            }}>
              ERROR: {error}
            </div>
          )}

          {p && (
            <>
              {/* Plan ID & Status */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '1rem',
              }}>
                <span style={{ color: ZT.phosphor, fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem' }}>
                  {p.planId}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {p.expedited && (
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                      background: ZT.amber + '25', color: ZT.amber, border: `1px solid ${ZT.amber}50`,
                    }}>
                      EXPEDITED
                    </span>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                    background: ZT.amber + '25', color: ZT.amber, border: `1px solid ${ZT.amber}50`,
                  }}>
                    {p.status}
                  </span>
                </div>
              </div>

              {/* SLA Banner */}
              <div style={{
                background: p.slaStatus === 'OVERDUE' ? ZT.red + '15' : p.slaStatus === 'DUE_SOON' ? ZT.amber + '15' : ZT.phosphor + '10',
                border: `1px solid ${p.slaStatus === 'OVERDUE' ? ZT.red : p.slaStatus === 'DUE_SOON' ? ZT.amber : ZT.phosphor}40`,
                borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {p.slaStatus === 'OVERDUE' && (
                      <span style={{ color: ZT.red, fontSize: '1rem' }}>!!</span>
                    )}
                    <span style={{
                      color: p.slaStatus === 'OVERDUE' ? ZT.red : p.slaStatus === 'DUE_SOON' ? ZT.amber : ZT.phosphor,
                      fontWeight: 700, fontSize: '0.85rem', fontFamily: 'monospace',
                    }}>
                      {p.slaStatus === 'OVERDUE' ? 'OVERDUE' : p.slaStatus === 'DUE_SOON' ? 'DUE SOON' : 'ON TIME'}
                    </span>
                  </div>
                  <span style={{ color: ZT.text, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {p.daysRemaining >= 0 ? `${p.daysRemaining} days remaining` : `${Math.abs(p.daysRemaining)} days overdue`}
                  </span>
                </div>
                <div style={{ color: ZT.muted, fontSize: '0.72rem', fontFamily: 'monospace', marginTop: '0.3rem' }}>
                  Due: {fmtDate(p.dueDate)}
                </div>
              </div>

              {/* Zone Classification Banner */}
              <div style={{
                background: ZT.amber + '12', border: `1px solid ${ZT.amber}40`,
                borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{
                    display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                    background: ZT.amber, boxShadow: `0 0 6px ${ZT.amber}`,
                  }} />
                  <span style={{ color: ZT.amber, fontWeight: 700, fontSize: '0.85rem' }}>
                    YELLOW ZONE
                  </span>
                  {p.zoneClassification.atcAuthority && (
                    <span style={{ color: ZT.text, fontSize: '0.75rem', marginLeft: 'auto' }}>
                      ATC: {p.zoneClassification.atcAuthority}
                    </span>
                  )}
                </div>
                {p.zoneClassification.reasons.map((r, i) => (
                  <div key={i} style={{ color: ZT.text, fontSize: '0.75rem', marginTop: '0.2rem' }}>
                    {r}
                  </div>
                ))}
              </div>

              {/* Zone Map Thumbnail */}
              {(p.centerLatDeg != null || p.areaGeoJson) && (
                <div style={{
                  marginBottom: '1rem', borderRadius: '6px', overflow: 'hidden',
                  border: `1px solid ${ZT.border}`, height: '180px',
                  background: ZT.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.centerLatDeg != null && p.centerLonDeg != null ? (
                    <img
                      src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+FFB800(${p.centerLonDeg},${p.centerLatDeg})/${p.centerLonDeg},${p.centerLatDeg},12,0/498x178@2x?access_token=pk.placeholder&attribution=false`}
                      alt="Zone map"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : null}
                  <div style={{
                    position: 'absolute', color: ZT.phosphor, fontSize: '0.7rem',
                    fontFamily: 'monospace', padding: '0.3rem',
                  }}>
                    {p.areaType === 'CIRCLE'
                      ? `CIRCLE: ${p.centerLatDeg?.toFixed(4)}, ${p.centerLonDeg?.toFixed(4)} R=${p.radiusM}m`
                      : 'POLYGON AREA'}
                  </div>
                </div>
              )}

              {/* Field Grid */}
              <FieldGrid plan={p} />

              {/* Pilot Info */}
              {p.pilotInfo && Object.keys(p.pilotInfo).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{
                    color: ZT.phosphor, fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace',
                    marginBottom: '0.5rem', letterSpacing: '0.04em',
                  }}>
                    PILOT INFORMATION
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
                    border: `1px solid ${ZT.border}`, borderRadius: '6px', overflow: 'hidden',
                  }}>
                    {[
                      ['Email', p.pilotInfo.email ?? '--'],
                      ['Mobile', p.pilotInfo.mobileNumber ?? '--'],
                      ['Role', p.pilotInfo.role ?? '--'],
                      ['Status', p.pilotInfo.accountStatus ?? '--'],
                    ].map(([label, value], i) => (
                      <div key={i} style={{
                        padding: '0.5rem 0.75rem',
                        borderBottom: `1px solid ${ZT.border}`,
                        borderRight: i % 2 === 0 ? `1px solid ${ZT.border}` : 'none',
                      }}>
                        <div style={{ fontSize: '0.6rem', color: ZT.muted, fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: ZT.textBright, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{
                  color: ZT.phosphor, fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace',
                  marginBottom: '0.75rem', letterSpacing: '0.04em',
                }}>
                  STATUS TIMELINE
                </div>
                <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                  {/* Vertical line */}
                  <div style={{
                    position: 'absolute', left: '7px', top: '4px', bottom: '4px',
                    width: '2px', background: ZT.border,
                  }} />
                  {timeline.map((evt, i) => {
                    const isLast = i === timeline.length - 1
                    const evtColour = evt.event.includes('APPROVED') ? ZT.phosphor
                      : evt.event.includes('REJECTED') ? ZT.red
                      : evt.event.includes('REMINDER') ? ZT.amber
                      : ZT.text
                    return (
                      <div key={i} style={{
                        position: 'relative', marginBottom: isLast ? 0 : '1rem',
                      }}>
                        {/* Dot */}
                        <div style={{
                          position: 'absolute', left: '-1.5rem', top: '3px',
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: isLast ? ZT.phosphor : ZT.surface,
                          border: `2px solid ${isLast ? ZT.phosphor : ZT.muted}`,
                          zIndex: 1,
                        }} />
                        <div style={{ fontSize: '0.78rem', color: evtColour, fontWeight: 600, fontFamily: 'monospace' }}>
                          {evt.event}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: ZT.muted, fontFamily: 'monospace', marginTop: '0.1rem' }}>
                          {fmtDate(evt.timestamp)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: ZT.text, fontFamily: 'monospace', marginTop: '0.1rem' }}>
                          Actor: {evt.actor.slice(0, 20)}{evt.actor.length > 20 ? '...' : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Field Grid (reused from ZoneConflictMonitor pattern) ─────────────────────

function FieldGrid({ plan }: { plan: ATCQueueItem }) {
  const fields: [string, string][] = [
    ['Application ID',     plan.planId],
    ['Operator ID',        plan.operatorId.slice(0, 20)],
    ['Drone Serial',       plan.droneSerialNumber],
    ['UIN Number',         plan.uinNumber ?? '--'],
    ['Area Type',          plan.areaType],
    ['Purpose',            plan.purpose],
    ['Max Alt (AGL)',      `${plan.maxAltitudeAglM}m`],
    ['Planned Start',      fmtDateShort(plan.plannedStartUtc)],
    ['Planned End',        fmtDateShort(plan.plannedEndUtc)],
    ['Submitted At',       fmtDateShort(plan.submittedAt)],
    ['Due By',             fmtDateShort(plan.dueDate)],
    ['ATC Authority',      plan.zoneClassification.atcAuthority ?? '--'],
  ]

  if (plan.remarks) fields.push(['Remarks', plan.remarks])
  if (plan.notifyEmail) fields.push(['Notify Email', plan.notifyEmail])

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
      border: `1px solid ${ZT.border}`, borderRadius: '6px', overflow: 'hidden',
    }}>
      {fields.map(([label, value], i) => (
        <div key={i} style={{
          padding: '0.5rem 0.75rem',
          borderBottom: `1px solid ${ZT.border}`,
          borderRight: i % 2 === 0 ? `1px solid ${ZT.border}` : 'none',
          gridColumn: i === fields.length - 1 && fields.length % 2 === 1 ? 'span 2' : undefined,
        }}>
          <div style={{ fontSize: '0.6rem', color: ZT.muted, fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
            {label}
          </div>
          <div style={{ fontSize: '0.78rem', color: ZT.textBright, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ATCQueuePage() {
  const { token, logout } = useAdminAuth()
  const adminRole = useMemo(() => decodeAdminRole(token), [token])

  const [plans, setPlans]                     = useState<ATCQueueItem[]>([])
  const [total, setTotal]                     = useState(0)
  const [overdueCount, setOverdueCount]       = useState(0)
  const [dueSoonCount, setDueSoonCount]       = useState(0)
  const [authorities, setAuthorities]         = useState<string[]>([])
  const [perfData, setPerfData]               = useState<AuthorityPerf[]>([])
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [selectedId, setSelectedId]           = useState<string | null>(null)
  const [selectedOverdue, setSelectedOverdue] = useState<Set<string>>(new Set())
  const [reminderLoading, setReminderLoading] = useState(false)
  const [reminderResult, setReminderResult]   = useState<string | null>(null)

  // Filters
  const [authorityFilter, setAuthorityFilter] = useState('')
  const [expeditedFilter, setExpeditedFilter] = useState('')
  const [overdueFilter, setOverdueFilter]     = useState(false)
  const [dateFrom, setDateFrom]               = useState('')
  const [dateTo, setDateTo]                   = useState('')

  const isSuperAdmin = adminRole === 'PLATFORM_SUPER_ADMIN'

  // ── Fetch data ─────────────────────────────────────────────────────────

  const fetchQueue = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' }
      if (authorityFilter) params.authority = authorityFilter
      if (expeditedFilter) params.expedited = expeditedFilter
      if (overdueFilter)   params.overdue = 'true'
      if (dateFrom)        params.dateFrom = dateFrom
      if (dateTo)          params.dateTo = dateTo

      const { data } = await adminAxios(token).get('/atc-queue', { params })
      setPlans(data.plans ?? [])
      setTotal(data.total ?? 0)
      setOverdueCount(data.overdueCount ?? 0)
      setDueSoonCount(data.dueSoonCount ?? 0)
      setAuthorities(data.authorities ?? [])
      setPerfData(data.authorityPerformance ?? [])
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, authorityFilter, expeditedFilter, overdueFilter, dateFrom, dateTo, logout])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  // ── Bulk reminder ──────────────────────────────────────────────────────

  const overdueItems = useMemo(() => plans.filter(p => p.slaStatus === 'OVERDUE'), [plans])

  const handleSelectAllOverdue = () => {
    if (selectedOverdue.size === overdueItems.length) {
      setSelectedOverdue(new Set())
    } else {
      setSelectedOverdue(new Set(overdueItems.map(p => p.id)))
    }
  }

  const toggleOverdueItem = (id: string) => {
    setSelectedOverdue(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sendReminders = useCallback(async () => {
    if (!token || selectedOverdue.size === 0) return
    setReminderLoading(true); setReminderResult(null)
    try {
      const { data } = await adminAxios(token).post('/atc-queue/send-reminder', {
        planIds: Array.from(selectedOverdue),
      })
      setReminderResult(`Reminders queued for ${data.remindersQueued} plan(s): ${data.planIds.join(', ')}`)
      setSelectedOverdue(new Set())
    } catch (e: any) {
      setReminderResult(`Failed: ${e.response?.data?.error ?? 'UNKNOWN_ERROR'}`)
    } finally {
      setReminderLoading(false)
    }
  }, [token, selectedOverdue])

  // ── Access check ───────────────────────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: '2rem', color: ZT.red, fontFamily: 'monospace' }}>
        ACCESS DENIED: PLATFORM_SUPER_ADMIN role required.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem', background: ZT.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}>
            ATC APPROVAL QUEUE
          </span>
          <span style={{
            color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace',
          }}>
            YELLOW ZONE APPLICATIONS
          </span>
        </div>
        <button onClick={fetchQueue}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${ZT.border}`,
            borderRadius: '4px', cursor: 'pointer', background: ZT.surface,
            color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace',
          }}>
          REFRESH
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL IN QUEUE', value: total, colour: ZT.phosphor },
          { label: 'DUE SOON (0-2 DAYS)', value: dueSoonCount, colour: ZT.amber },
          { label: 'OVERDUE', value: overdueCount, colour: ZT.red },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: 1, minWidth: '140px', background: ZT.surface,
            border: `1px solid ${ZT.border}`, borderRadius: '6px',
            padding: '0.75rem 1rem',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colour, fontFamily: 'monospace' }}>
              {value}
            </div>
            <div style={{ fontSize: '0.65rem', color: ZT.muted, fontWeight: 600, marginTop: '0.15rem' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <select
          value={authorityFilter}
          onChange={e => { setAuthorityFilter(e.target.value); setPage(1) }}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            background: ZT.surface, color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace',
          }}
        >
          <option value="">All Authorities</option>
          {authorities.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={expeditedFilter}
          onChange={e => { setExpeditedFilter(e.target.value); setPage(1) }}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            background: ZT.surface, color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace',
          }}
        >
          <option value="">All Priority</option>
          <option value="true">Expedited Only</option>
          <option value="false">Normal Only</option>
        </select>

        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace', cursor: 'pointer',
          padding: '0.4rem 0.5rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
          background: overdueFilter ? ZT.red + '20' : ZT.surface,
        }}>
          <input
            type="checkbox"
            checked={overdueFilter}
            onChange={e => { setOverdueFilter(e.target.checked); setPage(1) }}
            style={{ accentColor: ZT.red }}
          />
          Overdue Only
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace' }}>FROM:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            style={{
              padding: '0.35rem 0.4rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              background: ZT.surface, color: ZT.text, fontSize: '0.75rem', fontFamily: 'monospace',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace' }}>TO:</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            style={{
              padding: '0.35rem 0.4rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              background: ZT.surface, color: ZT.text, fontSize: '0.75rem', fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: ZT.red, padding: '0.75rem', background: ZT.red + '15',
          border: `1px solid ${ZT.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>
          ERROR: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ color: ZT.muted, padding: '2rem', textAlign: 'center', fontFamily: 'monospace' }}>
          LOADING ATC QUEUE DATA...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && plans.length === 0 && (
        <div style={{
          color: ZT.muted, padding: '3rem', textAlign: 'center',
          fontFamily: 'monospace', fontSize: '0.85rem',
          background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
        }}>
          NO YELLOW-ZONE APPLICATIONS AWAITING ATC APPROVAL.
        </div>
      )}

      {/* Bulk Actions */}
      {overdueItems.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '1rem', padding: '0.75rem 1rem',
          background: ZT.red + '08', border: `1px solid ${ZT.red}30`,
          borderRadius: '6px',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={selectedOverdue.size === overdueItems.length && overdueItems.length > 0}
              onChange={handleSelectAllOverdue}
              style={{ accentColor: ZT.red }}
            />
            Select All Overdue ({overdueItems.length})
          </label>
          <button
            onClick={sendReminders}
            disabled={selectedOverdue.size === 0 || reminderLoading}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${ZT.amber}`,
              background: selectedOverdue.size > 0 ? ZT.amber + '30' : 'transparent',
              color: selectedOverdue.size > 0 ? ZT.amber : ZT.muted,
              fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 700,
              opacity: selectedOverdue.size === 0 || reminderLoading ? 0.5 : 1,
            }}
          >
            {reminderLoading ? 'SENDING...' : `SEND REMINDER TO ATC (${selectedOverdue.size})`}
          </button>
          {reminderResult && (
            <span style={{
              fontSize: '0.72rem', fontFamily: 'monospace',
              color: reminderResult.startsWith('Failed') ? ZT.red : ZT.phosphor,
            }}>
              {reminderResult}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && plans.length > 0 && (
        <div style={{
          overflowX: 'auto', borderRadius: '6px', border: `1px solid ${ZT.border}`,
          marginBottom: '1.25rem',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
            fontFamily: 'monospace',
          }}>
            <thead>
              <tr>
                <th style={thStyle}></th>
                {['App ID', 'Pilot', 'UIN', 'Authority', 'Filed', 'Due By', 'Expedited', 'Status'].map(col => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(plan => {
                const rowBg = SLA_COLOURS[plan.slaStatus] ?? 'transparent'
                const rowBorder = SLA_BORDER_COLOURS[plan.slaStatus] ?? ZT.border
                return (
                  <tr
                    key={plan.id}
                    onClick={() => setSelectedId(plan.id)}
                    style={{
                      cursor: 'pointer',
                      background: rowBg,
                      borderBottom: `1px solid ${rowBorder}`,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = ZT.phosphor + '08'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = rowBg
                    }}
                  >
                    {/* Checkbox for overdue items */}
                    <td style={{ ...tdStyle, width: '30px', textAlign: 'center' }}
                      onClick={e => e.stopPropagation()}>
                      {plan.slaStatus === 'OVERDUE' && (
                        <input
                          type="checkbox"
                          checked={selectedOverdue.has(plan.id)}
                          onChange={() => toggleOverdueItem(plan.id)}
                          style={{ accentColor: ZT.red }}
                        />
                      )}
                    </td>
                    {/* App ID */}
                    <td style={{ ...tdStyle, color: ZT.phosphor, fontWeight: 700 }}>
                      {plan.planId}
                    </td>
                    {/* Pilot */}
                    <td style={{ ...tdStyle, color: ZT.text, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plan.pilotName}
                    </td>
                    {/* UIN */}
                    <td style={{ ...tdStyle, color: ZT.text }}>
                      {plan.uinNumber ?? plan.droneSerialNumber}
                    </td>
                    {/* Authority */}
                    <td style={{ ...tdStyle, color: ZT.amber }}>
                      {plan.zoneClassification.atcAuthority ?? '--'}
                    </td>
                    {/* Filed */}
                    <td style={{ ...tdStyle, color: ZT.text, whiteSpace: 'nowrap' }}>
                      {fmtDateShort(plan.submittedAt)}
                    </td>
                    {/* Due By */}
                    <td style={{
                      ...tdStyle, whiteSpace: 'nowrap',
                      color: plan.slaStatus === 'OVERDUE' ? ZT.red
                        : plan.slaStatus === 'DUE_SOON' ? ZT.amber
                        : ZT.text,
                      fontWeight: plan.slaStatus !== 'ON_TIME' ? 700 : 400,
                    }}>
                      {plan.slaStatus === 'OVERDUE' && (
                        <span style={{ marginRight: '4px' }}>!!</span>
                      )}
                      {fmtDateShort(plan.dueDate)}
                      <span style={{ fontSize: '0.65rem', marginLeft: '4px', opacity: 0.7 }}>
                        ({plan.daysRemaining >= 0 ? `${plan.daysRemaining}d` : `${Math.abs(plan.daysRemaining)}d late`})
                      </span>
                    </td>
                    {/* Expedited */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {plan.expedited ? (
                        <span style={{
                          padding: '2px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700,
                          background: ZT.amber + '25', color: ZT.amber,
                        }}>
                          YES
                        </span>
                      ) : (
                        <span style={{ color: ZT.muted }}>--</span>
                      )}
                    </td>
                    {/* Status (SLA indicator) */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                        background: plan.slaStatus === 'OVERDUE' ? ZT.red + '25'
                          : plan.slaStatus === 'DUE_SOON' ? ZT.amber + '25'
                          : ZT.phosphor + '15',
                        color: plan.slaStatus === 'OVERDUE' ? ZT.red
                          : plan.slaStatus === 'DUE_SOON' ? ZT.amber
                          : ZT.phosphor,
                      }}>
                        {plan.slaStatus.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '0.3rem 0.75rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
              background: 'transparent', color: ZT.text, fontFamily: 'monospace', fontSize: '0.78rem',
            }}
          >
            PREV
          </button>
          <span style={{ fontSize: '0.78rem', color: ZT.text, fontFamily: 'monospace' }}>
            Page {page} / {Math.ceil(total / 50)} ({total} total)
          </span>
          <button
            disabled={page * 50 >= total}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '0.3rem 0.75rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              cursor: page * 50 >= total ? 'not-allowed' : 'pointer',
              opacity: page * 50 >= total ? 0.5 : 1,
              background: 'transparent', color: ZT.text, fontFamily: 'monospace', fontSize: '0.78rem',
            }}
          >
            NEXT
          </button>
        </div>
      )}

      {/* Authority Performance Chart */}
      <AuthorityChart data={perfData} />

      {/* Detail Drawer */}
      {selectedId && token && (
        <DetailDrawer planId={selectedId} token={token} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

// ── Shared table styles ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  background: ZT.surface,
  color: ZT.phosphor,
  fontWeight: 700,
  borderBottom: `2px solid ${ZT.border}`,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${ZT.border}`,
}

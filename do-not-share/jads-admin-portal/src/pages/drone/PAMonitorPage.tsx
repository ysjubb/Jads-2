// ── PA Lifecycle Monitor ─────────────────────────────────────────────────────
// PLATFORM_SUPER_ADMIN view: system-wide Permission Artefact lifecycle overview
// with monitoring, charts, detail drawer, and admin actions.
//
// Uses the dark green HUD theme (ZT) from theme.ts.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { ZT } from '../../theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

type PAStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ARCHIVED'

type ZoneType = 'GREEN' | 'YELLOW'

type SignatureStatus = 'VALID' | 'INVALID' | 'NOT_CHECKED'

interface PAOverviewStats {
  totalPAs30d:              number
  approved:                 number
  rejected:                 number
  pendingReview:            number
  avgProcessingTimeHours:   number
  signatureVerificationRate: number
}

interface PAListItem {
  id:                string
  applicationId:     string
  pilotName:         string
  pilotEmail:        string
  droneUin:          string
  zone:              ZoneType
  zoneName:          string
  status:            PAStatus
  submittedAt:       string
  processedAt:       string | null
  processingTimeHrs: number | null
  signatureStatus:   SignatureStatus
  expiresAt:         string | null
}

interface PADetailItem extends PAListItem {
  operatorId:           string
  droneSerialNumber:    string
  droneModel:           string
  maxAltitudeAglM:      number
  flightPurpose:        string
  areaDescription:      string
  centerLat:            number | null
  centerLon:            number | null
  remarks:              string | null
  npntPermissionId:     string | null
  artefactHash:         string | null
  zoneClassificationAt: string
}

interface PATimelineEvent {
  event:     string
  timestamp: string
  actor:     string
  detail?:   string
}

interface PAProcessingTrend {
  date:     string
  avgHours: number
  count:    number
}

interface PAStatusDistribution {
  status: string
  count:  number
}

interface PAZoneBreakdown {
  zone:  string
  count: number
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

function statusColour(status: PAStatus): string {
  switch (status) {
    case 'APPROVED':     return ZT.phosphor
    case 'REJECTED':     return ZT.red
    case 'EXPIRED':      return ZT.muted
    case 'REVOKED':      return ZT.red
    case 'ARCHIVED':     return ZT.muted
    case 'UNDER_REVIEW': return ZT.amber
    case 'SUBMITTED':    return ZT.amber
    case 'DRAFT':        return ZT.text
    default:             return ZT.text
  }
}

function zoneColour(zone: ZoneType): string {
  return zone === 'GREEN' ? ZT.phosphor : ZT.amber
}

function sigColour(sig: SignatureStatus): string {
  switch (sig) {
    case 'VALID':       return ZT.phosphor
    case 'INVALID':     return ZT.red
    case 'NOT_CHECKED': return ZT.muted
    default:            return ZT.text
  }
}

const CHART_COLOURS = [ZT.phosphor, ZT.amber, ZT.red, '#B060FF', ZT.text, ZT.muted]

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
  fontFamily: '"JetBrains Mono", monospace',
}

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${ZT.border}`,
  fontFamily: '"JetBrains Mono", monospace',
}

// ── Processing Time Trend Chart ──────────────────────────────────────────────

function ProcessingTrendChart({ data }: { data: PAProcessingTrend[] }) {
  if (data.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center', color: ZT.muted,
        fontSize: '0.8rem', fontFamily: '"JetBrains Mono", monospace',
        background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      }}>
        NO PROCESSING TREND DATA AVAILABLE
      </div>
    )
  }

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: ZT.bg, border: `1px solid ${ZT.border}`, borderRadius: '4px',
        padding: '0.5rem 0.75rem', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
      }}>
        <div style={{ color: ZT.phosphor, fontWeight: 700, marginBottom: '0.25rem' }}>{label}</div>
        <div style={{ color: ZT.textBright }}>Avg: {payload[0].value.toFixed(1)}h</div>
        <div style={{ color: ZT.muted }}>PAs: {payload[0].payload.count}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      padding: '1rem', flex: 1, minWidth: '300px',
    }}>
      <div style={{
        color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem',
        fontFamily: '"JetBrains Mono", monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        PA PROCESSING TIME TREND (30 DAYS)
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ZT.border} />
          <XAxis
            dataKey="date"
            tick={{ fill: ZT.text, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
          />
          <YAxis
            tick={{ fill: ZT.text, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
            label={{
              value: 'Hours',
              angle: -90,
              position: 'insideLeft',
              style: { fill: ZT.muted, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' },
            }}
          />
          <Tooltip content={<CustomTooltipContent />} />
          <Line
            type="monotone"
            dataKey="avgHours"
            stroke={ZT.phosphor}
            strokeWidth={2}
            dot={{ fill: ZT.phosphor, r: 3 }}
            activeDot={{ fill: ZT.phosphor, r: 5, stroke: ZT.bg, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Status Distribution Chart ────────────────────────────────────────────────

function StatusDistributionChart({ data }: { data: PAStatusDistribution[] }) {
  if (data.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center', color: ZT.muted,
        fontSize: '0.8rem', fontFamily: '"JetBrains Mono", monospace',
        background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      }}>
        NO STATUS DATA AVAILABLE
      </div>
    )
  }

  const barColourMap: Record<string, string> = {
    APPROVED:     ZT.phosphor,
    REJECTED:     ZT.red,
    UNDER_REVIEW: ZT.amber,
    SUBMITTED:    ZT.amber,
    EXPIRED:      ZT.muted,
    REVOKED:      ZT.red,
    ARCHIVED:     ZT.muted,
    DRAFT:        ZT.text,
  }

  const CustomTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: ZT.bg, border: `1px solid ${ZT.border}`, borderRadius: '4px',
        padding: '0.5rem 0.75rem', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
      }}>
        <div style={{ color: ZT.phosphor, fontWeight: 700, marginBottom: '0.25rem' }}>
          {payload[0].payload.status}
        </div>
        <div style={{ color: ZT.textBright }}>{payload[0].value} PAs</div>
      </div>
    )
  }

  return (
    <div style={{
      background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      padding: '1rem', flex: 1, minWidth: '300px',
    }}>
      <div style={{
        color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem',
        fontFamily: '"JetBrains Mono", monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        STATUS DISTRIBUTION
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ZT.border} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: ZT.text, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
          />
          <YAxis
            type="category"
            dataKey="status"
            tick={{ fill: ZT.text, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
            axisLine={{ stroke: ZT.border }}
            tickLine={{ stroke: ZT.border }}
            width={75}
          />
          <Tooltip content={<CustomTooltipContent />} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={barColourMap[entry.status] ?? ZT.text}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Zone Breakdown Chart ─────────────────────────────────────────────────────

function ZoneBreakdownChart({ data }: { data: PAZoneBreakdown[] }) {
  if (data.length === 0) {
    return (
      <div style={{
        padding: '2rem', textAlign: 'center', color: ZT.muted,
        fontSize: '0.8rem', fontFamily: '"JetBrains Mono", monospace',
        background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      }}>
        NO ZONE DATA AVAILABLE
      </div>
    )
  }

  const zoneColourMap: Record<string, string> = {
    GREEN:  ZT.phosphor,
    YELLOW: ZT.amber,
  }

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    if (percent < 0.05) return null
    return (
      <text
        x={x} y={y}
        fill={ZT.bg}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        fontFamily='"JetBrains Mono", monospace'
      >
        {name}
      </text>
    )
  }

  return (
    <div style={{
      background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      padding: '1rem', flex: 1, minWidth: '250px',
    }}>
      <div style={{
        color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem',
        fontFamily: '"JetBrains Mono", monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        ZONE BREAKDOWN
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="zone"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={3}
            label={renderLabel}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={zoneColourMap[entry.zone] ?? CHART_COLOURS[index % CHART_COLOURS.length]}
                stroke={ZT.bg}
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Legend
            formatter={(value: string) => (
              <span style={{
                color: ZT.textBright, fontSize: '0.75rem',
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                {value}
              </span>
            )}
          />
          <Tooltip
            formatter={((value: number, name: string) => [
              `${value} PAs`, name,
            ]) as any}
            contentStyle={{
              background: ZT.bg, border: `1px solid ${ZT.border}`, borderRadius: '4px',
              fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem',
            }}
            itemStyle={{ color: ZT.textBright }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function PADetailDrawer({
  paId, token, onClose, onReVerify,
}: {
  paId: string; token: string; onClose: () => void
  onReVerify: (id: string) => void
}) {
  const [detail, setDetail]     = useState<PADetailItem | null>(null)
  const [timeline, setTimeline] = useState<PATimelineEvent[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    adminAxios(token).get(`/pa/${paId}`)
      .then(({ data }) => {
        setDetail(data.pa ?? null)
        setTimeline(data.timeline ?? [])
      })
      .catch(e => setError(e.response?.data?.error ?? 'FETCH_FAILED'))
      .finally(() => setLoading(false))
  }, [paId, token])

  const p = detail

  // Processing duration breakdown
  const processingBreakdown = useMemo(() => {
    if (!p) return []
    const items: [string, string][] = []
    if (p.submittedAt) {
      const submittedMs = new Date(p.submittedAt).getTime()
      if (p.processedAt) {
        const processedMs = new Date(p.processedAt).getTime()
        const totalHrs = ((processedMs - submittedMs) / (1000 * 60 * 60)).toFixed(1)
        items.push(['Total Processing', `${totalHrs}h`])
      } else {
        const elapsedMs = Date.now() - submittedMs
        const elapsedHrs = (elapsedMs / (1000 * 60 * 60)).toFixed(1)
        items.push(['Elapsed (In Progress)', `${elapsedHrs}h`])
      }
    }
    return items
  }, [p])

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
        position: 'fixed', top: 0, right: 0, width: '560px', height: '100vh',
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
          <span style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '0.95rem',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            PA LIFECYCLE DETAIL
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            color: ZT.text, cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            CLOSE
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>
          {loading && (
            <div style={{
              padding: '2rem', textAlign: 'center', color: ZT.muted,
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              LOADING PA DETAIL...
            </div>
          )}
          {error && (
            <div style={{
              padding: '1rem', background: ZT.red + '15', border: `1px solid ${ZT.red}40`,
              borderRadius: '6px', color: ZT.red, fontSize: '0.85rem', marginBottom: '1rem',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              ERROR: {error}
            </div>
          )}

          {p && (
            <>
              {/* Application ID & Status */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '1rem',
              }}>
                <span style={{
                  color: ZT.phosphor, fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700, fontSize: '1.1rem',
                }}>
                  {p.applicationId}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                    background: statusColour(p.status) + '25',
                    color: statusColour(p.status),
                    border: `1px solid ${statusColour(p.status)}50`,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {p.status}
                  </span>
                </div>
              </div>

              {/* Zone Classification Banner */}
              <div style={{
                background: zoneColour(p.zone) + '12',
                border: `1px solid ${zoneColour(p.zone)}40`,
                borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                    background: zoneColour(p.zone),
                    boxShadow: `0 0 6px ${zoneColour(p.zone)}`,
                  }} />
                  <span style={{
                    color: zoneColour(p.zone), fontWeight: 700, fontSize: '0.85rem',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {p.zone} ZONE
                  </span>
                  <span style={{
                    color: ZT.text, fontSize: '0.75rem', marginLeft: 'auto',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {p.zoneName}
                  </span>
                </div>
                <div style={{
                  color: ZT.muted, fontSize: '0.7rem', marginTop: '0.3rem',
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  Classification at submission: {fmtDate(p.zoneClassificationAt)}
                </div>
              </div>

              {/* Signature Verification Banner */}
              <div style={{
                background: sigColour(p.signatureStatus) + '12',
                border: `1px solid ${sigColour(p.signatureStatus)}40`,
                borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                    background: sigColour(p.signatureStatus),
                    boxShadow: `0 0 6px ${sigColour(p.signatureStatus)}`,
                  }} />
                  <span style={{
                    color: sigColour(p.signatureStatus), fontWeight: 700, fontSize: '0.85rem',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    SIGNATURE: {p.signatureStatus.replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={() => onReVerify(p.id)}
                  style={{
                    padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
                    border: `1px solid ${ZT.amber}`,
                    background: ZT.amber + '20',
                    color: ZT.amber,
                    fontSize: '0.72rem', fontWeight: 700,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  RE-VERIFY
                </button>
              </div>

              {/* PA Metadata Grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
                border: `1px solid ${ZT.border}`, borderRadius: '6px', overflow: 'hidden',
                marginBottom: '1rem',
              }}>
                {([
                  ['Application ID',    p.applicationId],
                  ['Status',            p.status],
                  ['Pilot',             p.pilotName],
                  ['Pilot Email',       p.pilotEmail],
                  ['Operator ID',       p.operatorId.slice(0, 20)],
                  ['Drone UIN',         p.droneUin],
                  ['Drone Serial',      p.droneSerialNumber],
                  ['Drone Model',       p.droneModel],
                  ['Zone',              `${p.zone} - ${p.zoneName}`],
                  ['Max Alt (AGL)',     `${p.maxAltitudeAglM}m`],
                  ['Purpose',           p.flightPurpose],
                  ['Area',              p.areaDescription],
                  ['NPNT Permission',   p.npntPermissionId ?? '--'],
                  ['Artefact Hash',     p.artefactHash ? p.artefactHash.slice(0, 16) + '...' : '--'],
                  ['Submitted',         fmtDate(p.submittedAt)],
                  ['Processed',         fmtDate(p.processedAt)],
                  ['Expires',           fmtDate(p.expiresAt)],
                  ['Signature',         p.signatureStatus.replace('_', ' ')],
                ] as [string, string][]).map(([label, value], i, arr) => (
                  <div key={i} style={{
                    padding: '0.5rem 0.75rem',
                    borderBottom: `1px solid ${ZT.border}`,
                    borderRight: i % 2 === 0 ? `1px solid ${ZT.border}` : 'none',
                    gridColumn: i === arr.length - 1 && arr.length % 2 === 1 ? 'span 2' : undefined,
                  }}>
                    <div style={{
                      fontSize: '0.6rem', color: ZT.muted, fontWeight: 600,
                      textTransform: 'uppercase', marginBottom: '2px',
                      fontFamily: '"JetBrains Mono", monospace',
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: '0.78rem', color: ZT.textBright,
                      fontFamily: '"JetBrains Mono", monospace', wordBreak: 'break-all',
                    }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Remarks */}
              {p.remarks && (
                <div style={{
                  background: ZT.surface, border: `1px solid ${ZT.border}`,
                  borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
                }}>
                  <div style={{
                    fontSize: '0.6rem', color: ZT.muted, fontWeight: 600,
                    textTransform: 'uppercase', marginBottom: '4px',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    REMARKS
                  </div>
                  <div style={{
                    fontSize: '0.78rem', color: ZT.text,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>
                    {p.remarks}
                  </div>
                </div>
              )}

              {/* Processing Duration Breakdown */}
              {processingBreakdown.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{
                    color: ZT.phosphor, fontWeight: 700, fontSize: '0.75rem',
                    fontFamily: '"JetBrains Mono", monospace',
                    marginBottom: '0.5rem', letterSpacing: '0.04em',
                  }}>
                    PROCESSING DURATION
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
                    border: `1px solid ${ZT.border}`, borderRadius: '6px', overflow: 'hidden',
                  }}>
                    {processingBreakdown.map(([label, value], i) => (
                      <div key={i} style={{
                        padding: '0.5rem 0.75rem',
                        borderBottom: `1px solid ${ZT.border}`,
                        borderRight: i % 2 === 0 ? `1px solid ${ZT.border}` : 'none',
                      }}>
                        <div style={{
                          fontSize: '0.6rem', color: ZT.muted, fontWeight: 600,
                          textTransform: 'uppercase', marginBottom: '2px',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: '0.78rem', color: ZT.textBright,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lifecycle Timeline */}
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{
                  color: ZT.phosphor, fontWeight: 700, fontSize: '0.75rem',
                  fontFamily: '"JetBrains Mono", monospace',
                  marginBottom: '0.75rem', letterSpacing: '0.04em',
                }}>
                  LIFECYCLE TIMELINE
                </div>
                {timeline.length === 0 && (
                  <div style={{
                    color: ZT.muted, fontSize: '0.8rem', padding: '1rem',
                    fontFamily: '"JetBrains Mono", monospace',
                    background: ZT.surface, borderRadius: '6px',
                    border: `1px solid ${ZT.border}`,
                  }}>
                    NO TIMELINE EVENTS
                  </div>
                )}
                {timeline.length > 0 && (
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
                        : evt.event.includes('EXPIRED') ? ZT.muted
                        : evt.event.includes('REVOKED') ? ZT.red
                        : evt.event.includes('VERIFIED') ? ZT.phosphor
                        : evt.event.includes('SUBMITTED') ? ZT.amber
                        : ZT.text
                      return (
                        <div key={i} style={{
                          position: 'relative', marginBottom: isLast ? 0 : '1rem',
                        }}>
                          {/* Dot */}
                          <div style={{
                            position: 'absolute', left: '-1.5rem', top: '3px',
                            width: '12px', height: '12px', borderRadius: '50%',
                            background: isLast ? evtColour : ZT.surface,
                            border: `2px solid ${isLast ? evtColour : ZT.muted}`,
                            zIndex: 1,
                          }} />
                          <div style={{
                            fontSize: '0.78rem', color: evtColour, fontWeight: 600,
                            fontFamily: '"JetBrains Mono", monospace',
                          }}>
                            {evt.event}
                          </div>
                          <div style={{
                            fontSize: '0.7rem', color: ZT.muted,
                            fontFamily: '"JetBrains Mono", monospace', marginTop: '0.1rem',
                          }}>
                            {fmtDate(evt.timestamp)}
                          </div>
                          <div style={{
                            fontSize: '0.68rem', color: ZT.text,
                            fontFamily: '"JetBrains Mono", monospace', marginTop: '0.1rem',
                          }}>
                            Actor: {evt.actor.slice(0, 24)}{evt.actor.length > 24 ? '...' : ''}
                          </div>
                          {evt.detail && (
                            <div style={{
                              fontSize: '0.68rem', color: ZT.text,
                              fontFamily: '"JetBrains Mono", monospace', marginTop: '0.1rem',
                              opacity: 0.7,
                            }}>
                              {evt.detail}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function PAMonitorPage() {
  const { token, logout } = useAdminAuth()
  const adminRole = useMemo(() => decodeAdminRole(token), [token])

  // Stats
  const [stats, setStats] = useState<PAOverviewStats | null>(null)

  // List
  const [paList, setPaList]   = useState<PAListItem[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Charts
  const [processingTrend, setProcessingTrend]     = useState<PAProcessingTrend[]>([])
  const [statusDistribution, setStatusDistribution] = useState<PAStatusDistribution[]>([])
  const [zoneBreakdown, setZoneBreakdown]         = useState<PAZoneBreakdown[]>([])

  // Filters
  const [statusFilter, setStatusFilter]     = useState('')
  const [zoneFilter, setZoneFilter]         = useState('')
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Action states
  const [archiveLoading, setArchiveLoading]   = useState(false)
  const [archiveResult, setArchiveResult]     = useState<string | null>(null)
  const [reVerifyLoading, setReVerifyLoading] = useState(false)
  const [reVerifyResult, setReVerifyResult]   = useState<string | null>(null)
  const [exportLoading, setExportLoading]     = useState(false)

  const isSuperAdmin = adminRole === 'PLATFORM_SUPER_ADMIN'
  const LIMIT = 50

  // ── Fetch data ─────────────────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) }
      if (statusFilter) params.status = statusFilter
      if (zoneFilter)   params.zone = zoneFilter
      if (dateFrom)     params.dateFrom = dateFrom
      if (dateTo)       params.dateTo = dateTo

      const { data } = await adminAxios(token).get('/pa/overview', { params })

      setStats(data.stats ?? null)
      setPaList(data.list ?? [])
      setTotal(data.total ?? 0)
      setProcessingTrend(data.processingTrend ?? [])
      setStatusDistribution(data.statusDistribution ?? [])
      setZoneBreakdown(data.zoneBreakdown ?? [])
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, statusFilter, zoneFilter, dateFrom, dateTo, logout])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  // ── Admin actions ──────────────────────────────────────────────────────

  const handleArchiveExpired = useCallback(async () => {
    if (!token) return
    setArchiveLoading(true); setArchiveResult(null)
    try {
      const { data } = await adminAxios(token).post('/pa/archive-expired')
      setArchiveResult(`Archived ${data.archivedCount ?? 0} expired PA(s)`)
      fetchOverview()
    } catch (e: any) {
      setArchiveResult(`Failed: ${e.response?.data?.error ?? 'UNKNOWN_ERROR'}`)
    } finally {
      setArchiveLoading(false)
    }
  }, [token, fetchOverview])

  const handleReVerify = useCallback(async (paId: string) => {
    if (!token) return
    setReVerifyLoading(true); setReVerifyResult(null)
    try {
      const { data } = await adminAxios(token).post(`/pa/${paId}/re-verify`)
      setReVerifyResult(
        `Signature re-verification: ${data.signatureStatus ?? 'COMPLETE'}`
      )
      fetchOverview()
    } catch (e: any) {
      setReVerifyResult(`Failed: ${e.response?.data?.error ?? 'UNKNOWN_ERROR'}`)
    } finally {
      setReVerifyLoading(false)
    }
  }, [token, fetchOverview])

  const handleExportCSV = useCallback(async () => {
    if (!token) return
    setExportLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      if (zoneFilter)   params.zone = zoneFilter
      if (dateFrom)     params.dateFrom = dateFrom
      if (dateTo)       params.dateTo = dateTo

      const { data } = await adminAxios(token).get('/pa/overview', {
        params: { ...params, page: '1', limit: '10000' },
      })

      const list: PAListItem[] = data.list ?? []
      if (list.length === 0) return

      const headers = [
        'Application ID', 'Pilot', 'Pilot Email', 'Drone UIN', 'Zone',
        'Zone Name', 'Status', 'Submitted', 'Processed', 'Processing Time (hrs)',
        'Signature Status', 'Expires',
      ]
      const rows = list.map(pa => [
        pa.applicationId, pa.pilotName, pa.pilotEmail, pa.droneUin,
        pa.zone, pa.zoneName, pa.status, pa.submittedAt,
        pa.processedAt ?? '', pa.processingTimeHrs?.toFixed(1) ?? '',
        pa.signatureStatus, pa.expiresAt ?? '',
      ])

      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `pa-lifecycle-export-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(`CSV export failed: ${e.message ?? 'UNKNOWN'}`)
    } finally {
      setExportLoading(false)
    }
  }, [token, statusFilter, zoneFilter, dateFrom, dateTo])

  // ── Access check ───────────────────────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div style={{
        padding: '2rem', color: ZT.red,
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        ACCESS DENIED: PLATFORM_SUPER_ADMIN role required.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      padding: '1.5rem', background: ZT.bg, minHeight: '100vh',
      fontFamily: '"JetBrains Mono", monospace',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '1.1rem',
            letterSpacing: '0.05em',
          }}>
            PA LIFECYCLE MONITOR
          </span>
          <span style={{ color: ZT.muted, fontSize: '0.7rem' }}>
            PERMISSION ARTEFACT OVERVIEW
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleExportCSV}
            disabled={exportLoading}
            style={{
              padding: '0.4rem 0.75rem', border: `1px solid ${ZT.border}`,
              borderRadius: '4px', cursor: 'pointer', background: ZT.surface,
              color: ZT.text, fontSize: '0.78rem',
              opacity: exportLoading ? 0.5 : 1,
            }}
          >
            {exportLoading ? 'EXPORTING...' : 'EXPORT CSV'}
          </button>
          <button onClick={fetchOverview}
            style={{
              padding: '0.4rem 0.75rem', border: `1px solid ${ZT.border}`,
              borderRadius: '4px', cursor: 'pointer', background: ZT.surface,
              color: ZT.text, fontSize: '0.78rem',
            }}>
            REFRESH
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: '0.75rem', marginBottom: '1.25rem',
        }}>
          {[
            { label: 'TOTAL PAs (30d)',     value: String(stats.totalPAs30d),                                       colour: ZT.phosphor },
            { label: 'APPROVED',            value: String(stats.approved),                                          colour: ZT.phosphor },
            { label: 'REJECTED',            value: String(stats.rejected),                                          colour: ZT.red },
            { label: 'PENDING REVIEW',      value: String(stats.pendingReview),                                     colour: ZT.amber },
            { label: 'AVG PROCESS TIME',    value: `${stats.avgProcessingTimeHours.toFixed(1)}h`,                   colour: ZT.textBright },
            { label: 'SIG VERIFY RATE',     value: `${(stats.signatureVerificationRate * 100).toFixed(0)}%`,        colour: ZT.phosphor },
          ].map(({ label, value, colour }) => (
            <div key={label} style={{
              background: ZT.surface,
              border: `1px solid ${ZT.border}`, borderRadius: '6px',
              padding: '0.75rem 1rem',
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colour }}>
                {value}
              </div>
              <div style={{ fontSize: '0.6rem', color: ZT.muted, fontWeight: 600, marginTop: '0.15rem' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            background: ZT.surface, color: ZT.text, fontSize: '0.78rem',
          }}
        >
          <option value="">All Statuses</option>
          {(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED', 'ARCHIVED'] as PAStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={zoneFilter}
          onChange={e => { setZoneFilter(e.target.value); setPage(1) }}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            background: ZT.surface, color: ZT.text, fontSize: '0.78rem',
          }}
        >
          <option value="">All Zones</option>
          <option value="GREEN">GREEN</option>
          <option value="YELLOW">YELLOW</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ color: ZT.muted, fontSize: '0.7rem' }}>FROM:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            style={{
              padding: '0.35rem 0.4rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              background: ZT.surface, color: ZT.text, fontSize: '0.75rem',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ color: ZT.muted, fontSize: '0.7rem' }}>TO:</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            style={{
              padding: '0.35rem 0.4rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              background: ZT.surface, color: ZT.text, fontSize: '0.75rem',
            }}
          />
        </div>
      </div>

      {/* Admin Actions Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        marginBottom: '1rem', padding: '0.75rem 1rem',
        background: ZT.surface, border: `1px solid ${ZT.border}`,
        borderRadius: '6px', flexWrap: 'wrap',
      }}>
        <span style={{ color: ZT.phosphor, fontSize: '0.75rem', fontWeight: 700 }}>
          ADMIN ACTIONS:
        </span>
        <button
          onClick={handleArchiveExpired}
          disabled={archiveLoading}
          style={{
            padding: '0.4rem 0.75rem', borderRadius: '4px', cursor: 'pointer',
            border: `1px solid ${ZT.amber}`,
            background: ZT.amber + '20',
            color: ZT.amber,
            fontSize: '0.75rem', fontWeight: 700,
            opacity: archiveLoading ? 0.5 : 1,
          }}
        >
          {archiveLoading ? 'ARCHIVING...' : 'FORCE ARCHIVE EXPIRED'}
        </button>
        {archiveResult && (
          <span style={{
            fontSize: '0.72rem',
            color: archiveResult.startsWith('Failed') ? ZT.red : ZT.phosphor,
          }}>
            {archiveResult}
          </span>
        )}
        {reVerifyResult && (
          <span style={{
            fontSize: '0.72rem',
            color: reVerifyResult.startsWith('Failed') ? ZT.red : ZT.phosphor,
          }}>
            {reVerifyResult}
          </span>
        )}
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
        <div style={{ color: ZT.muted, padding: '2rem', textAlign: 'center' }}>
          LOADING PA LIFECYCLE DATA...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && paList.length === 0 && (
        <div style={{
          color: ZT.muted, padding: '3rem', textAlign: 'center',
          fontSize: '0.85rem',
          background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
        }}>
          NO PERMISSION ARTEFACTS FOUND MATCHING CURRENT FILTERS.
        </div>
      )}

      {/* Table */}
      {!loading && paList.length > 0 && (
        <div style={{
          overflowX: 'auto', borderRadius: '6px', border: `1px solid ${ZT.border}`,
          marginBottom: '1.25rem',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
          }}>
            <thead>
              <tr>
                {['App ID', 'Pilot', 'Drone UIN', 'Zone', 'Status', 'Submitted', 'Processing Time', 'Signature', 'Actions'].map(col => (
                  <th key={col} style={thStyle}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paList.map(pa => {
                const rowZoneColour = zoneColour(pa.zone)
                return (
                  <tr
                    key={pa.id}
                    onClick={() => setSelectedId(pa.id)}
                    style={{
                      cursor: 'pointer',
                      background: 'transparent',
                      borderLeft: `3px solid ${rowZoneColour}30`,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = ZT.phosphor + '08'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* App ID */}
                    <td style={{ ...tdStyle, color: ZT.phosphor, fontWeight: 700 }}>
                      {pa.applicationId}
                    </td>
                    {/* Pilot */}
                    <td style={{
                      ...tdStyle, color: ZT.text, maxWidth: '140px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {pa.pilotName}
                    </td>
                    {/* Drone UIN */}
                    <td style={{ ...tdStyle, color: ZT.text }}>
                      {pa.droneUin}
                    </td>
                    {/* Zone */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                        background: rowZoneColour + '20',
                        color: rowZoneColour,
                        border: `1px solid ${rowZoneColour}40`,
                      }}>
                        {pa.zone}
                      </span>
                    </td>
                    {/* Status */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                        background: statusColour(pa.status) + '20',
                        color: statusColour(pa.status),
                      }}>
                        {pa.status}
                      </span>
                    </td>
                    {/* Submitted */}
                    <td style={{ ...tdStyle, color: ZT.text, whiteSpace: 'nowrap' }}>
                      {fmtDateShort(pa.submittedAt)}
                    </td>
                    {/* Processing Time */}
                    <td style={{ ...tdStyle, color: ZT.textBright }}>
                      {pa.processingTimeHrs != null
                        ? `${pa.processingTimeHrs.toFixed(1)}h`
                        : <span style={{ color: ZT.amber }}>IN PROGRESS</span>}
                    </td>
                    {/* Signature */}
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700,
                        background: sigColour(pa.signatureStatus) + '20',
                        color: sigColour(pa.signatureStatus),
                      }}>
                        {pa.signatureStatus === 'NOT_CHECKED' ? 'N/C' : pa.signatureStatus}
                      </span>
                    </td>
                    {/* Actions */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}
                      onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleReVerify(pa.id)}
                        disabled={reVerifyLoading}
                        title="Re-verify signature"
                        style={{
                          padding: '2px 8px', borderRadius: '3px', cursor: 'pointer',
                          border: `1px solid ${ZT.border}`,
                          background: 'transparent',
                          color: ZT.text,
                          fontSize: '0.68rem',
                          opacity: reVerifyLoading ? 0.5 : 1,
                        }}
                      >
                        VERIFY
                      </button>
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem',
        }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '0.3rem 0.75rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
              background: 'transparent', color: ZT.text, fontSize: '0.78rem',
            }}
          >
            PREV
          </button>
          <span style={{ fontSize: '0.78rem', color: ZT.text }}>
            Page {page} / {Math.ceil(total / LIMIT)} ({total} total)
          </span>
          <button
            disabled={page * LIMIT >= total}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '0.3rem 0.75rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
              cursor: page * LIMIT >= total ? 'not-allowed' : 'pointer',
              opacity: page * LIMIT >= total ? 0.5 : 1,
              background: 'transparent', color: ZT.text, fontSize: '0.78rem',
            }}
          >
            NEXT
          </button>
        </div>
      )}

      {/* Charts Section */}
      <div style={{
        display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap',
      }}>
        <ProcessingTrendChart data={processingTrend} />
        <StatusDistributionChart data={statusDistribution} />
        <ZoneBreakdownChart data={zoneBreakdown} />
      </div>

      {/* Detail Drawer */}
      {selectedId && token && (
        <PADetailDrawer
          paId={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
          onReVerify={handleReVerify}
        />
      )}
    </div>
  )
}

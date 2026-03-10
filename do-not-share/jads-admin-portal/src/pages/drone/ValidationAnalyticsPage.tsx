// ── Validation Failure Analytics Page ─────────────────────────────────────────
// PLATFORM_SUPER_ADMIN view: analytics dashboard for flight plan validation
// engine results. Displays:
//   - Top 5 most common validation failures (bar chart)
//   - "Prevented eGCA submissions" counter
//   - User error hotspot table
//   - Validation pass rate trend (line chart, 6 months)
//
// Uses the dark green HUD theme (T) from theme.ts and recharts.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { T } from '../../theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface FailureCount {
  code:    string
  label:   string
  count:   number
  percent: number
}

interface UserHotspot {
  operatorId:   string
  operatorName: string
  failureCount: number
  topFailure:   string
  lastSeen:     string
}

interface PassRateTrend {
  month:    string
  total:    number
  passed:   number
  failed:   number
  passRate: number
}

interface AnalyticsData {
  topFailures:           FailureCount[]
  preventedSubmissions:  number
  totalValidations:      number
  overallPassRate:       number
  userHotspots:          UserHotspot[]
  passRateTrend:         PassRateTrend[]
}

// ── Mock data generator (used until backend analytics endpoint exists) ────────
// Produces realistic-looking data for the 15 validation checks.

const VALIDATION_CODES: Record<string, string> = {
  V01: 'UIN Registration Active',
  V02: 'Remote Pilot Certificate Valid',
  V03: 'UAOP Valid',
  V04: 'Insurance Valid',
  V05: 'Type Certificate Valid',
  V06: 'No Conflicting PA',
  V07: 'Area Geometry Valid',
  V08: 'Altitude Within Limits',
  V09: 'Start Time Not in Past',
  V10: 'Sunrise/Sunset Overlap',
  V11: 'Area Size Advisory',
  V12: 'Elevated Altitude Advisory',
  V13: 'Active NOTAM Check',
  V14: 'Payload Weight Advisory',
  V15: 'Auto-Expiry Notice',
}

function generateMockAnalytics(): AnalyticsData {
  // Seeded pseudo-random for consistent demo data
  const seed = (n: number) => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1

  const totalValidations = 2847
  const preventedSubmissions = 412

  // Top failures — realistic distribution
  const failureCounts: FailureCount[] = [
    { code: 'V04', label: VALIDATION_CODES['V04'], count: 187, percent: 45.4 },
    { code: 'V02', label: VALIDATION_CODES['V02'], count: 134, percent: 32.5 },
    { code: 'V09', label: VALIDATION_CODES['V09'], count: 89, percent: 21.6 },
    { code: 'V01', label: VALIDATION_CODES['V01'], count: 67, percent: 16.3 },
    { code: 'V07', label: VALIDATION_CODES['V07'], count: 42, percent: 10.2 },
  ]

  // User hotspots
  const userHotspots: UserHotspot[] = [
    { operatorId: 'usr_abc123', operatorName: 'Rajesh K.', failureCount: 23, topFailure: 'V04 Insurance', lastSeen: '2026-03-08T14:22:00Z' },
    { operatorId: 'usr_def456', operatorName: 'Priya M.', failureCount: 18, topFailure: 'V02 RPC', lastSeen: '2026-03-07T09:15:00Z' },
    { operatorId: 'usr_ghi789', operatorName: 'Amit S.', failureCount: 14, topFailure: 'V09 Past Start', lastSeen: '2026-03-08T16:45:00Z' },
    { operatorId: 'usr_jkl012', operatorName: 'Deepa L.', failureCount: 11, topFailure: 'V01 UIN', lastSeen: '2026-03-06T11:30:00Z' },
    { operatorId: 'usr_mno345', operatorName: 'Vikram P.', failureCount: 9, topFailure: 'V07 Polygon', lastSeen: '2026-03-05T08:10:00Z' },
    { operatorId: 'usr_pqr678', operatorName: 'Sunita R.', failureCount: 8, topFailure: 'V04 Insurance', lastSeen: '2026-03-08T17:55:00Z' },
    { operatorId: 'usr_stu901', operatorName: 'Karthik N.', failureCount: 7, topFailure: 'V09 Past Start', lastSeen: '2026-03-04T13:20:00Z' },
    { operatorId: 'usr_vwx234', operatorName: 'Neha G.', failureCount: 5, topFailure: 'V02 RPC', lastSeen: '2026-03-03T10:45:00Z' },
  ]

  // Pass rate trend (6 months)
  const months = ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026']
  const passRateTrend: PassRateTrend[] = months.map((month, i) => {
    const total = 350 + Math.round(seed(i) * 200)
    const passRate = 72 + Math.round(seed(i + 10) * 18)
    const passed = Math.round(total * passRate / 100)
    return {
      month,
      total,
      passed,
      failed: total - passed,
      passRate,
    }
  })

  return {
    topFailures: failureCounts,
    preventedSubmissions,
    totalValidations,
    overallPassRate: 85.5,
    userHotspots,
    passRateTrend,
  }
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

// ── Top Failures Bar Chart ──────────────────────────────────────────────────

function TopFailuresChart({ data }: { data: FailureCount[] }) {
  const CustomTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const item = payload[0].payload as FailureCount
    return (
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
        padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem',
      }}>
        <div style={{ color: T.primary, fontWeight: 700, marginBottom: '0.25rem' }}>
          {item.code}: {item.label}
        </div>
        <div style={{ color: T.textBright }}>{item.count} occurrences</div>
        <div style={{ color: T.muted }}>{item.percent}% of all failures</div>
      </div>
    )
  }

  return (
    <div style={{
      background: T.surface, borderRadius: '6px', border: `1px solid ${T.border}`,
      padding: '1rem',
    }}>
      <div style={{
        color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        TOP 5 MOST COMMON VALIDATION FAILURES
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: T.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: T.border }}
            tickLine={{ stroke: T.border }}
          />
          <YAxis
            dataKey="code"
            type="category"
            tick={{ fill: T.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: T.border }}
            tickLine={{ stroke: T.border }}
            width={50}
          />
          <Tooltip content={<CustomTooltipContent />} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? T.red : index < 3 ? T.amber : T.primary}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Pass Rate Trend Line Chart ───────────────────────────────────────────────

function PassRateTrendChart({ data }: { data: PassRateTrend[] }) {
  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const item = payload[0].payload as PassRateTrend
    return (
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
        padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem',
      }}>
        <div style={{ color: T.primary, fontWeight: 700, marginBottom: '0.25rem' }}>{label}</div>
        <div style={{ color: T.textBright }}>Pass Rate: {item.passRate}%</div>
        <div style={{ color: T.text }}>Total: {item.total} validations</div>
        <div style={{ color: T.primary }}>Passed: {item.passed}</div>
        <div style={{ color: T.red }}>Failed: {item.failed}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: T.surface, borderRadius: '6px', border: `1px solid ${T.border}`,
      padding: '1rem',
    }}>
      <div style={{
        color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        VALIDATION PASS RATE TREND (6 MONTHS)
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis
            dataKey="month"
            tick={{ fill: T.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: T.border }}
            tickLine={{ stroke: T.border }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: T.text, fontSize: 11, fontFamily: 'monospace' }}
            axisLine={{ stroke: T.border }}
            tickLine={{ stroke: T.border }}
            label={{
              value: 'Pass %',
              angle: -90,
              position: 'insideLeft',
              style: { fill: T.muted, fontSize: 11, fontFamily: 'monospace' },
            }}
          />
          <Tooltip content={<CustomTooltipContent />} />
          <Line
            type="monotone"
            dataKey="passRate"
            stroke={T.primary}
            strokeWidth={2}
            dot={{ fill: T.primary, stroke: T.primary, r: 4 }}
            activeDot={{ fill: T.primary, stroke: T.textBright, r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── User Error Hotspot Table ─────────────────────────────────────────────────

function HotspotTable({ data }: { data: UserHotspot[] }) {
  return (
    <div style={{
      background: T.surface, borderRadius: '6px', border: `1px solid ${T.border}`,
      padding: '1rem',
    }}>
      <div style={{
        color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
        marginBottom: '1rem', letterSpacing: '0.04em',
      }}>
        USER ERROR HOTSPOTS
      </div>
      <div style={{
        overflowX: 'auto', borderRadius: '4px', border: `1px solid ${T.border}`,
      }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
          fontFamily: 'monospace',
        }}>
          <thead>
            <tr>
              {['Operator', 'Failures', 'Top Failure', 'Last Seen'].map(col => (
                <th key={col} style={thStyle}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.operatorId}>
                <td style={{ ...tdStyle, color: T.textBright }}>
                  <div>{row.operatorName}</div>
                  <div style={{ fontSize: '0.65rem', color: T.muted }}>
                    {row.operatorId.slice(0, 16)}...
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.75rem',
                    fontWeight: 700,
                    background: row.failureCount > 15 ? T.red + '25'
                      : row.failureCount > 10 ? T.amber + '25'
                      : T.primary + '15',
                    color: row.failureCount > 15 ? T.red
                      : row.failureCount > 10 ? T.amber
                      : T.primary,
                  }}>
                    {row.failureCount}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: T.amber }}>
                  {row.topFailure}
                </td>
                <td style={{ ...tdStyle, color: T.text, whiteSpace: 'nowrap' }}>
                  {fmtDate(row.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ValidationAnalyticsPage() {
  const { token, logout } = useAdminAuth()
  const adminRole = useMemo(() => decodeAdminRole(token), [token])

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const isSuperAdmin = adminRole === 'PLATFORM_SUPER_ADMIN'

  // ── Fetch data ───────────────────────────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      // Try to fetch from backend API first
      try {
        const { data } = await adminAxios(token).get('/validation-analytics')
        if (data.success && data.analytics) {
          setAnalytics(data.analytics)
          return
        }
      } catch {
        // Backend endpoint may not exist yet — use mock data
      }

      // Fall back to mock data for development
      await new Promise(resolve => setTimeout(resolve, 500))
      setAnalytics(generateMockAnalytics())
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, logout])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  // ── Access check ───────────────────────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: '2rem', color: T.red, fontFamily: 'monospace' }}>
        ACCESS DENIED: PLATFORM_SUPER_ADMIN role required.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem', background: T.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            color: T.primary, fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}>
            VALIDATION ANALYTICS
          </span>
          <span style={{
            color: T.muted, fontSize: '0.7rem', fontFamily: 'monospace',
          }}>
            PRE-SUBMISSION ENGINE METRICS
          </span>
        </div>
        <button onClick={fetchAnalytics}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface,
            color: T.text, fontSize: '0.78rem', fontFamily: 'monospace',
          }}>
          REFRESH
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>
          ERROR: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ color: T.muted, padding: '2rem', textAlign: 'center', fontFamily: 'monospace' }}>
          LOADING VALIDATION ANALYTICS...
        </div>
      )}

      {analytics && (
        <>
          {/* Stats Row */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { label: 'TOTAL VALIDATIONS', value: analytics.totalValidations.toLocaleString(), colour: T.primary },
              { label: 'PREVENTED eGCA SUBMISSIONS', value: analytics.preventedSubmissions.toLocaleString(), colour: T.red },
              { label: 'OVERALL PASS RATE', value: `${analytics.overallPassRate}%`, colour: analytics.overallPassRate >= 80 ? T.primary : T.amber },
              { label: 'UNIQUE FAILURE CODES', value: String(analytics.topFailures.length), colour: T.amber },
            ].map(({ label, value, colour }) => (
              <div key={label} style={{
                flex: 1, minWidth: '160px', background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: '6px',
                padding: '0.75rem 1rem',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colour, fontFamily: 'monospace' }}>
                  {value}
                </div>
                <div style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 600, marginTop: '0.15rem' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
            marginBottom: '1.25rem',
          }}>
            <TopFailuresChart data={analytics.topFailures} />
            <PassRateTrendChart data={analytics.passRateTrend} />
          </div>

          {/* User Hotspots */}
          <HotspotTable data={analytics.userHotspots} />

          {/* Failure Code Reference */}
          <div style={{
            marginTop: '1.25rem', background: T.surface,
            borderRadius: '6px', border: `1px solid ${T.border}`,
            padding: '1rem',
          }}>
            <div style={{
              color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
              marginBottom: '0.75rem', letterSpacing: '0.04em',
            }}>
              VALIDATION CODE REFERENCE
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0',
              border: `1px solid ${T.border}`, borderRadius: '4px', overflow: 'hidden',
            }}>
              {Object.entries(VALIDATION_CODES).map(([code, label], i) => {
                const isFailure = parseInt(code.slice(1)) <= 9
                const isWarning = parseInt(code.slice(1)) >= 10 && parseInt(code.slice(1)) <= 14
                const colour = isFailure ? T.red : isWarning ? T.amber : T.primary
                const tag = isFailure ? 'FAILURE' : isWarning ? 'WARNING' : 'INFO'

                return (
                  <div key={code} style={{
                    padding: '0.5rem 0.75rem',
                    borderBottom: `1px solid ${T.border}`,
                    borderRight: (i % 3 !== 2) ? `1px solid ${T.border}` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, color: colour,
                        fontFamily: 'monospace',
                      }}>
                        {code}
                      </span>
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 700, color: colour,
                        background: colour + '15', padding: '1px 4px', borderRadius: '2px',
                      }}>
                        {tag}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.7rem', color: T.text, marginTop: '0.15rem',
                    }}>
                      {label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Shared table styles ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  background: T.bg,
  color: T.primary,
  fontWeight: 700,
  borderBottom: `2px solid ${T.border}`,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${T.border}`,
}

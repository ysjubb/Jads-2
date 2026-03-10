import { useEffect, useState, useCallback } from 'react'
import { useAuditAuth, auditAxios } from '../../hooks/useAuditAuth'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB800',
  green:      '#00FF88',
  red:        '#FF3B3B',
  muted:      '#6A6040',
  text:       '#c8b890',
  textBright: '#e8d8b0',
}

interface ZoneComplianceStats {
  totalFlightPlans30d: number
  greenAutoApprovalPct: number
  yellowPending: number
  yellowApproved: number
  yellowRejected: number
  zoneViolationsDetected: number
}

interface ZoneViolation {
  missionId: string
  pilotRpc: string
  droneUin: string
  permittedZone: string
  actualZone: string
  deviationMeters: number
  date: string
}

interface AuthorityLatency {
  authority: string
  avgDays: number
}

const ZONE_COLOUR: Record<string, string> = {
  GREEN: T.green, YELLOW: T.primary, RED: T.red,
}

function StatCard({ label, value, colour }: { label: string; value: string | number; colour?: string }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '6px',
      padding: '1rem',
      flex: 1,
      minWidth: '180px',
    }}>
      <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colour ?? T.textBright,
        fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  )
}

export function ZoneCompliancePage() {
  const { token, role, logout } = useAuditAuth()
  const [stats, setStats] = useState<ZoneComplianceStats | null>(null)
  const [violations, setViolations] = useState<ZoneViolation[]>([])
  const [latencyData, setLatencyData] = useState<AuthorityLatency[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalViolations, setTotalViolations] = useState(0)
  const limit = 20

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const ax = auditAxios(token)
      const [statsRes, violationsRes, latencyRes] = await Promise.all([
        ax.get('/zone-compliance/stats'),
        ax.get('/zone-compliance/violations', { params: { page, limit } }),
        ax.get('/zone-compliance/authority-latency'),
      ])
      setStats(statsRes.data)
      setViolations(violationsRes.data.violations ?? [])
      setTotalViolations(violationsRes.data.total ?? 0)
      setLatencyData(latencyRes.data.authorities ?? [])
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      if (e.response?.status === 403) { setError('ACCESS_DENIED: Insufficient role permissions'); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, logout])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCSV = useCallback(() => {
    if (!violations.length) return
    const headers = ['Mission ID', 'Pilot RPC', 'Drone UIN', 'Permitted Zone', 'Actual Zone', 'Deviation (m)', 'Date']
    const rows = violations.map(v => [v.missionId, v.pilotRpc, v.droneUin, v.permittedZone, v.actualZone, v.deviationMeters, v.date])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zone_compliance_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [violations])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
          Zone Compliance Report
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} disabled={!violations.length}
            style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.primary}40`, borderRadius: '4px',
              cursor: violations.length ? 'pointer' : 'not-allowed', background: T.primary + '15',
              color: T.primary, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
              opacity: violations.length ? 1 : 0.5 }}>
            Export CSV
          </button>
          <button onClick={fetchData}
            style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
              cursor: 'pointer', background: T.surface, color: T.text, fontSize: '0.8rem',
              fontFamily: "'JetBrains Mono', monospace" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Role scope badge */}
      {role && (
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.75rem', background: T.primary + '15',
            border: `1px solid ${T.primary}40`, color: T.primary,
            padding: '0.2rem 0.6rem', borderRadius: '4px',
            fontFamily: "'JetBrains Mono', monospace" }}>
            Role: {role}
          </span>
        </div>
      )}

      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: T.muted, padding: '1rem', fontFamily: "'JetBrains Mono', monospace" }}>Loading zone compliance data...</div>}

      {!loading && stats && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <StatCard label="Flight Plans (30d)" value={stats.totalFlightPlans30d} />
            <StatCard label="Green Auto-Approvals" value={`${stats.greenAutoApprovalPct}%`} colour={T.green} />
            <StatCard label="Yellow Zone" value={`${stats.yellowPending}P / ${stats.yellowApproved}A / ${stats.yellowRejected}R`} colour={T.primary} />
            <StatCard label="Zone Violations" value={stats.zoneViolationsDetected} colour={stats.zoneViolationsDetected > 0 ? T.red : T.green} />
          </div>

          {/* Authority latency chart */}
          {latencyData.length > 0 && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
              padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.textBright,
                fontFamily: "'JetBrains Mono', monospace" }}>
                Yellow Zone Approval Latency by Authority (Avg Days, 6 months)
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="authority" tick={{ fill: T.text, fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                  <YAxis tick={{ fill: T.text, fontSize: 12, fontFamily: 'JetBrains Mono' }}
                    label={{ value: 'Avg Days', angle: -90, position: 'insideLeft', fill: T.muted, fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`,
                    color: T.text, fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }} />
                  <Bar dataKey="avgDays" radius={[4, 4, 0, 0]}>
                    {latencyData.map((_, i) => (
                      <Cell key={i} fill={T.primary} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Violations table */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
            padding: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.textBright,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Zone Violations ({totalViolations} total)
            </h3>
            {violations.length === 0 ? (
              <div style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                No zone violations detected.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {['Mission ID', 'Pilot RPC', 'Drone UIN', 'Permitted', 'Actual', 'Deviation', 'Date'].map(h => (
                        <th key={h} style={{ padding: '0.5rem', textAlign: 'left', color: T.muted, fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((v, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}10` }}>
                        <td style={{ padding: '0.5rem', color: T.textBright }}>{v.missionId}</td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{v.pilotRpc}</td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{v.droneUin}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ color: ZONE_COLOUR[v.permittedZone] ?? T.text, fontWeight: 600 }}>{v.permittedZone}</span>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ color: ZONE_COLOUR[v.actualZone] ?? T.text, fontWeight: 600 }}>{v.actualZone}</span>
                        </td>
                        <td style={{ padding: '0.5rem', color: v.deviationMeters > 200 ? T.red : T.primary }}>
                          {v.deviationMeters}m
                        </td>
                        <td style={{ padding: '0.5rem', color: T.muted }}>{v.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
                background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              Prev
            </button>
            <span style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
              Page {page} · {totalViolations} violations
            </span>
            <button disabled={page * limit >= totalViolations} onClick={() => setPage(p => p + 1)}
              style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                cursor: page * limit >= totalViolations ? 'not-allowed' : 'pointer',
                opacity: page * limit >= totalViolations ? 0.5 : 1,
                background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

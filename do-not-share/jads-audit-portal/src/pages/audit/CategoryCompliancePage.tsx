import { useEffect, useState, useCallback } from 'react'
import { useAuditAuth, auditAxios } from '../../hooks/useAuditAuth'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

/* ── Theme ─────────────────────────────────── */

const T = {
  bg: '#050A08', surface: '#0A120E', border: '#1A3020',
  primary: '#FFB800', green: '#00FF88', red: '#FF3B3B',
  muted: '#6A6040', text: '#c8b890', textBright: '#e8d8b0',
}

/* ── Types ─────────────────────────────────── */

type DroneCategory = 'NANO_RECREATIONAL' | 'MICRO_RECREATIONAL' | 'MICRO_COMMERCIAL' | 'SMALL_VLOS' | 'AGRICULTURAL' | 'BVLOS_SPECIAL'

interface CategoryRow {
  category: DroneCategory
  totalFlights: number
  paViolations: number
  geofenceBreaches: number
  logUploadRate: number
  avgApprovalLatencyMin: number
}

interface MonthlyData {
  month: string
  NANO_RECREATIONAL: number
  MICRO_RECREATIONAL: number
  MICRO_COMMERCIAL: number
  SMALL_VLOS: number
  AGRICULTURAL: number
  BVLOS_SPECIAL: number
}

/* ── Constants ──────────────────────────────── */

const CATEGORY_LABELS: Record<DroneCategory, string> = {
  NANO_RECREATIONAL: 'Nano Rec',
  MICRO_RECREATIONAL: 'Micro Rec',
  MICRO_COMMERCIAL: 'Micro Com',
  SMALL_VLOS: 'Small VLOS',
  AGRICULTURAL: 'Agricultural',
  BVLOS_SPECIAL: 'BVLOS/Special',
}

const CATEGORY_COLOURS: Record<DroneCategory, string> = {
  NANO_RECREATIONAL: '#4CAF50',
  MICRO_RECREATIONAL: '#8BC34A',
  MICRO_COMMERCIAL: '#FF9800',
  SMALL_VLOS: '#2196F3',
  AGRICULTURAL: '#795548',
  BVLOS_SPECIAL: '#E91E63',
}

/* ── Main Page ───────────────────────────────── */

export function CategoryCompliancePage() {
  const { token } = useAuditAuth()
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const api = auditAxios(token)
      const [rowsRes, monthlyRes] = await Promise.all([
        api.get('/api/audit/drone/category-compliance'),
        api.get('/api/audit/drone/category-monthly'),
      ])
      setRows(rowsRes.data.rows ?? mockRows)
      setMonthlyData(monthlyRes.data.monthly ?? mockMonthly)
    } catch {
      setRows(mockRows)
      setMonthlyData(mockMonthly)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    const header = 'Category,Total Flights,PA Violations,Geofence Breaches,Log Upload Rate %,Avg Approval Latency Min\n'
    const body = rows.map(r =>
      `${CATEGORY_LABELS[r.category]},${r.totalFlights},${r.paViolations},${r.geofenceBreaches},${r.logUploadRate},${r.avgApprovalLatencyMin}`
    ).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'category-compliance-report.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '2rem', color: T.textBright }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', color: T.primary, fontFamily: "'JetBrains Mono', monospace" }}>CATEGORY COMPLIANCE</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: T.muted }}>Operator category compliance trends</p>
        </div>
        <button onClick={exportCSV}
          style={{ background: T.primary + '20', color: T.primary, border: `1px solid ${T.primary}40`, borderRadius: '4px', padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
          ↓ Download CSV
        </button>
      </div>

      {/* Stacked Bar Chart — Monthly Flights by Category */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: T.primary }}>Flight Permissions by Category (12 Months)</h3>
        {loading ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>Loading...</div>
        ) : (
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: T.muted, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, fontSize: '0.75rem', color: T.textBright }} />
                <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                {(Object.keys(CATEGORY_COLOURS) as DroneCategory[]).map(cat => (
                  <Bar key={cat} dataKey={cat} name={CATEGORY_LABELS[cat]} stackId="a" fill={CATEGORY_COLOURS[cat]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Compliance Rate Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}` }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', color: T.primary }}>Compliance Rate per Category</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th style={th}>Category</th>
              <th style={th}>Total Flights</th>
              <th style={th}>PA Violations</th>
              <th style={th}>Geofence Breaches</th>
              <th style={th}>Log Upload Rate</th>
              <th style={th}>Avg Approval Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.category} style={{ borderBottom: `1px solid ${T.border}15` }}>
                <td style={td}>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 600,
                    padding: '2px 6px', borderRadius: '3px',
                    background: CATEGORY_COLOURS[row.category] + '25',
                    color: CATEGORY_COLOURS[row.category],
                  }}>
                    {CATEGORY_LABELS[row.category]}
                  </span>
                </td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{row.totalFlights.toLocaleString()}</td>
                <td style={{ ...td, color: row.paViolations > 0 ? T.red : T.green }}>{row.paViolations}</td>
                <td style={{ ...td, color: row.geofenceBreaches > 0 ? T.red : T.green }}>{row.geofenceBreaches}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ flex: 1, height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${row.logUploadRate}%`, height: '100%', background: row.logUploadRate >= 90 ? T.green : row.logUploadRate >= 70 ? T.primary : T.red, borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace" }}>{row.logUploadRate}%</span>
                  </div>
                </td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{row.avgApprovalLatencyMin}m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.6rem 0.75rem', color: T.muted,
  fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', color: T.textBright,
}

/* ── Mock Data ───────────────────────────────── */

const mockRows: CategoryRow[] = [
  { category: 'NANO_RECREATIONAL', totalFlights: 4521, paViolations: 0, geofenceBreaches: 12, logUploadRate: 45, avgApprovalLatencyMin: 0 },
  { category: 'MICRO_RECREATIONAL', totalFlights: 2340, paViolations: 5, geofenceBreaches: 23, logUploadRate: 67, avgApprovalLatencyMin: 15 },
  { category: 'MICRO_COMMERCIAL', totalFlights: 1890, paViolations: 8, geofenceBreaches: 4, logUploadRate: 94, avgApprovalLatencyMin: 45 },
  { category: 'SMALL_VLOS', totalFlights: 890, paViolations: 3, geofenceBreaches: 2, logUploadRate: 97, avgApprovalLatencyMin: 60 },
  { category: 'AGRICULTURAL', totalFlights: 3200, paViolations: 15, geofenceBreaches: 45, logUploadRate: 82, avgApprovalLatencyMin: 30 },
  { category: 'BVLOS_SPECIAL', totalFlights: 156, paViolations: 1, geofenceBreaches: 0, logUploadRate: 100, avgApprovalLatencyMin: 180 },
]

const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const mockMonthly: MonthlyData[] = months.map(m => ({
  month: m,
  NANO_RECREATIONAL: Math.floor(300 + Math.random() * 200),
  MICRO_RECREATIONAL: Math.floor(150 + Math.random() * 100),
  MICRO_COMMERCIAL: Math.floor(120 + Math.random() * 80),
  SMALL_VLOS: Math.floor(50 + Math.random() * 50),
  AGRICULTURAL: Math.floor(200 + Math.random() * 150),
  BVLOS_SPECIAL: Math.floor(8 + Math.random() * 15),
}))

export default CategoryCompliancePage

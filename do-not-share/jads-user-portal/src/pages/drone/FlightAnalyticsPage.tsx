import React, { useState, useCallback } from 'react'
import { T } from '../../theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface MonthlyFlight {
  month: string
  flights: number
}

interface ZoneDistribution {
  zone: string
  count: number
  color: string
}

interface LatencyTrend {
  month: string
  avgDays: number
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_KPI = {
  totalFlights: 187,
  totalHours: 342.5,
  totalLocations: 24,
  complianceRate: 96.2,
}

const MOCK_MONTHLY: MonthlyFlight[] = [
  { month: 'Apr 25', flights: 8 },
  { month: 'May 25', flights: 12 },
  { month: 'Jun 25', flights: 15 },
  { month: 'Jul 25', flights: 18 },
  { month: 'Aug 25', flights: 14 },
  { month: 'Sep 25', flights: 20 },
  { month: 'Oct 25', flights: 22 },
  { month: 'Nov 25', flights: 16 },
  { month: 'Dec 25', flights: 10 },
  { month: 'Jan 26', flights: 19 },
  { month: 'Feb 26', flights: 24 },
  { month: 'Mar 26', flights: 9 },
]

const MOCK_ZONE_DIST: ZoneDistribution[] = [
  { zone: 'GREEN', count: 132, color: '#22C55E' },
  { zone: 'YELLOW', count: 41, color: '#EAB308' },
  { zone: 'RED', count: 14, color: '#EF4444' },
]

const MOCK_LATENCY: LatencyTrend[] = [
  { month: 'Apr 25', avgDays: 5.2 },
  { month: 'May 25', avgDays: 4.8 },
  { month: 'Jun 25', avgDays: 4.5 },
  { month: 'Jul 25', avgDays: 5.0 },
  { month: 'Aug 25', avgDays: 4.2 },
  { month: 'Sep 25', avgDays: 3.8 },
  { month: 'Oct 25', avgDays: 3.5 },
  { month: 'Nov 25', avgDays: 3.9 },
  { month: 'Dec 25', avgDays: 4.1 },
  { month: 'Jan 26', avgDays: 3.2 },
  { month: 'Feb 26', avgDays: 2.8 },
  { month: 'Mar 26', avgDays: 2.5 },
]

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, colour }: { label: string; value: string | number; colour?: string }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
      padding: '1rem', flex: 1, minWidth: '160px',
    }}>
      <div style={{
        fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '1.4rem', fontWeight: 700, color: colour ?? T.textBright,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </div>
    </div>
  )
}

// ── Custom Pie Label ─────────────────────────────────────────────────────────

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, zone }: any) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
      {zone} {(percent * 100).toFixed(0)}%
    </text>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function FlightAnalyticsPage() {
  const [kpi] = useState(MOCK_KPI)
  const [monthlyData] = useState(MOCK_MONTHLY)
  const [zoneDist] = useState(MOCK_ZONE_DIST)
  const [latencyData] = useState(MOCK_LATENCY)

  const exportCSV = useCallback(() => {
    // Compile all analytics into a CSV
    const lines: string[] = []
    lines.push('=== FLIGHT KPIs ===')
    lines.push('Metric,Value')
    lines.push(`Total Flights,${kpi.totalFlights}`)
    lines.push(`Total Hours,${kpi.totalHours}`)
    lines.push(`Total Locations,${kpi.totalLocations}`)
    lines.push(`Compliance Rate,${kpi.complianceRate}%`)
    lines.push('')
    lines.push('=== MONTHLY FREQUENCY ===')
    lines.push('Month,Flights')
    monthlyData.forEach(m => lines.push(`${m.month},${m.flights}`))
    lines.push('')
    lines.push('=== ZONE DISTRIBUTION ===')
    lines.push('Zone,Count')
    zoneDist.forEach(z => lines.push(`${z.zone},${z.count}`))
    lines.push('')
    lines.push('=== APPROVAL LATENCY ===')
    lines.push('Month,Avg Days')
    latencyData.forEach(l => lines.push(`${l.month},${l.avgDays}`))

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight_analytics_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [kpi, monthlyData, zoneDist, latencyData])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
            Flight Analytics
          </h2>
          <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '0.2rem' }}>
            YOUR DRONE FLIGHT PERFORMANCE & STATISTICS
          </div>
        </div>
        <button onClick={exportCSV}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${T.primary}40`, borderRadius: '4px',
            cursor: 'pointer', background: T.primary + '15', color: T.primary, fontSize: '0.8rem',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
          Export My Data
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <StatCard label="Total Flights" value={kpi.totalFlights} colour={T.primary} />
        <StatCard label="Flight Hours" value={`${kpi.totalHours}h`} colour={T.textBright} />
        <StatCard label="Locations" value={kpi.totalLocations} colour={T.textBright} />
        <StatCard label="Compliance Rate" value={`${kpi.complianceRate}%`} colour={kpi.complianceRate >= 90 ? '#22C55E' : T.amber} />
      </div>

      {/* Monthly Frequency Bar Chart */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem',
      }}>
        <div style={{
          color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
          marginBottom: '0.75rem', letterSpacing: '0.04em',
        }}>
          MONTHLY FLIGHT FREQUENCY
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="month" tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }} />
            <YAxis tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }} />
            <Tooltip
              contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}
            />
            <Bar dataKey="flights" fill={T.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column: Zone Distribution Pie + Approval Latency Line */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
        {/* Zone Distribution Pie */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem',
        }}>
          <div style={{
            color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
            marginBottom: '0.75rem', letterSpacing: '0.04em',
          }}>
            ZONE DISTRIBUTION
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={zoneDist}
                dataKey="count"
                nameKey="zone"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={renderCustomLabel}
                labelLine={false}
              >
                {zoneDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            {zoneDist.map(z => (
              <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: z.color }} />
                <span style={{ fontSize: '0.72rem', color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                  {z.zone}: {z.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Approval Latency Trend */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1rem',
        }}>
          <div style={{
            color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
            marginBottom: '0.75rem', letterSpacing: '0.04em',
          }}>
            APPROVAL LATENCY TREND (AVG DAYS)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={latencyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="month" tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }} />
              <YAxis tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }}
                label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fill: T.muted, fontSize: 11, fontFamily: 'JetBrains Mono' } }}
              />
              <Tooltip
                contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}
              />
              <Line type="monotone" dataKey="avgDays" stroke={T.primary} strokeWidth={2} dot={{ r: 3, fill: T.primary }} name="Avg Approval Days" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

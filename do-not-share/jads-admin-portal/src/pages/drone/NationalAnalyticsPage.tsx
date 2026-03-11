// ── National Traffic Analytics Page ──────────────────────────────────────────
// Admin portal: daily volume graph (90 days), zone breakdown donut,
// ATC performance table. Dark green HUD theme (ZT).

import React, { useState } from 'react'
import { ZT } from '../../theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyVolume {
  date: string
  flights: number
}

interface ZoneBreakdown {
  zone: string
  count: number
  color: string
}

interface ATCPerformance {
  authority:       string
  totalProcessed:  number
  avgApprovalDays: number
  approvalRate:    number
  slaCompliance:   number
  pendingQueue:    number
}

// ── Mock Data ────────────────────────────────────────────────────────────────

function generateDailyVolume(): DailyVolume[] {
  const data: DailyVolume[] = []
  const now = new Date()
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    const base = 120 + Math.sin(i * 0.15) * 40
    const noise = Math.floor(Math.random() * 30 - 15)
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? -30 : 0
    data.push({
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      flights: Math.max(20, Math.round(base + noise + weekend)),
    })
  }
  return data
}

const MOCK_DAILY_VOLUME = generateDailyVolume()

const MOCK_ZONE_BREAKDOWN: ZoneBreakdown[] = [
  { zone: 'GREEN', count: 8420, color: '#22C55E' },
  { zone: 'YELLOW', count: 2180, color: '#EAB308' },
  { zone: 'RED (Exempted)', count: 340, color: '#EF4444' },
  { zone: 'VLOS Only', count: 1560, color: '#3B82F6' },
  { zone: 'BVLOS', count: 620, color: '#A855F7' },
]

const MOCK_ATC_PERF: ATCPerformance[] = [
  { authority: 'AAI - Delhi FIR', totalProcessed: 420, avgApprovalDays: 3.2, approvalRate: 92.5, slaCompliance: 95.0, pendingQueue: 18 },
  { authority: 'AAI - Mumbai FIR', totalProcessed: 380, avgApprovalDays: 2.8, approvalRate: 94.1, slaCompliance: 97.2, pendingQueue: 12 },
  { authority: 'AAI - Kolkata FIR', totalProcessed: 210, avgApprovalDays: 4.5, approvalRate: 88.0, slaCompliance: 82.5, pendingQueue: 28 },
  { authority: 'AAI - Chennai FIR', totalProcessed: 310, avgApprovalDays: 3.0, approvalRate: 91.8, slaCompliance: 93.4, pendingQueue: 15 },
  { authority: 'IAF - Air Defence', totalProcessed: 85, avgApprovalDays: 6.2, approvalRate: 78.5, slaCompliance: 70.1, pendingQueue: 22 },
  { authority: 'Indian Navy', totalProcessed: 45, avgApprovalDays: 5.8, approvalRate: 82.0, slaCompliance: 75.0, pendingQueue: 8 },
  { authority: 'DGCA Direct', totalProcessed: 180, avgApprovalDays: 7.1, approvalRate: 85.2, slaCompliance: 68.5, pendingQueue: 35 },
]

// ── Main Page ────────────────────────────────────────────────────────────────

export function NationalAnalyticsPage() {
  const [dailyVolume] = useState(MOCK_DAILY_VOLUME)
  const [zoneBreakdown] = useState(MOCK_ZONE_BREAKDOWN)
  const [atcPerf] = useState(MOCK_ATC_PERF)

  // Summary stats
  const totalFlights90d = dailyVolume.reduce((s, d) => s + d.flights, 0)
  const avgDaily = Math.round(totalFlights90d / 90)
  const peakDay = dailyVolume.reduce((max, d) => d.flights > max.flights ? d : max, dailyVolume[0])
  const totalPending = atcPerf.reduce((s, a) => s + a.pendingQueue, 0)

  return (
    <div style={{ padding: '1.5rem', background: ZT.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: ZT.phosphor, fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            NATIONAL TRAFFIC ANALYTICS
          </span>
          <span style={{ color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            90-DAY OVERVIEW
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL FLIGHTS (90D)', value: totalFlights90d.toLocaleString(), colour: ZT.phosphor },
          { label: 'AVG DAILY', value: avgDaily, colour: ZT.textBright },
          { label: 'PEAK DAY', value: `${peakDay.flights} (${peakDay.date})`, colour: ZT.amber },
          { label: 'PENDING APPROVALS', value: totalPending, colour: ZT.red },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: 1, minWidth: '150px', background: ZT.surface,
            border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '0.75rem 1rem',
          }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colour, fontFamily: 'monospace' }}>
              {value}
            </div>
            <div style={{ fontSize: '0.65rem', color: ZT.muted, fontWeight: 600, marginTop: '0.15rem' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Volume Graph (90 days) */}
      <div style={{
        background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem',
      }}>
        <div style={{
          color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
          marginBottom: '0.75rem', letterSpacing: '0.04em',
        }}>
          DAILY FLIGHT VOLUME (LAST 90 DAYS)
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dailyVolume} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ZT.border} />
            <XAxis
              dataKey="date"
              tick={{ fill: ZT.text, fontSize: 9, fontFamily: 'monospace' }}
              axisLine={{ stroke: ZT.border }}
              tickLine={{ stroke: ZT.border }}
              interval={6}
            />
            <YAxis
              tick={{ fill: ZT.text, fontSize: 11, fontFamily: 'monospace' }}
              axisLine={{ stroke: ZT.border }}
              tickLine={{ stroke: ZT.border }}
            />
            <Tooltip
              contentStyle={{ background: ZT.bg, border: `1px solid ${ZT.border}`, color: ZT.text, fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
            <Bar dataKey="flights" fill={ZT.phosphor} fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column: Zone Donut + ATC Performance Table */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
        {/* Zone Breakdown Donut */}
        <div style={{
          background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '1rem',
        }}>
          <div style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
            marginBottom: '0.75rem', letterSpacing: '0.04em',
          }}>
            ZONE BREAKDOWN
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={zoneBreakdown}
                dataKey="count"
                nameKey="zone"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
              >
                {zoneBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: ZT.bg, border: `1px solid ${ZT.border}`, color: ZT.text, fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'monospace', fontSize: '0.72rem' }}
                formatter={(value: string) => <span style={{ color: ZT.text }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ATC Performance Table */}
        <div style={{
          background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '1rem',
        }}>
          <div style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
            marginBottom: '0.75rem', letterSpacing: '0.04em',
          }}>
            ATC AUTHORITY PERFORMANCE
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace',
            }}>
              <thead>
                <tr>
                  {['Authority', 'Processed', 'Avg Days', 'Approval %', 'SLA %', 'Pending'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atcPerf.map(a => (
                  <tr key={a.authority}
                    style={{ borderBottom: `1px solid ${ZT.border}` }}
                    onMouseEnter={e => { e.currentTarget.style.background = ZT.phosphor + '08' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...tdStyle, color: ZT.textBright, fontWeight: 600 }}>{a.authority}</td>
                    <td style={{ ...tdStyle, color: ZT.text }}>{a.totalProcessed}</td>
                    <td style={{
                      ...tdStyle,
                      color: a.avgApprovalDays > 6 ? ZT.red : a.avgApprovalDays > 4 ? ZT.amber : ZT.phosphor,
                      fontWeight: 700,
                    }}>
                      {a.avgApprovalDays}d
                    </td>
                    <td style={{ ...tdStyle, color: a.approvalRate >= 90 ? ZT.phosphor : a.approvalRate >= 80 ? ZT.amber : ZT.red }}>
                      {a.approvalRate}%
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                        background: a.slaCompliance >= 90 ? ZT.phosphor + '20' : a.slaCompliance >= 75 ? ZT.amber + '20' : ZT.red + '20',
                        color: a.slaCompliance >= 90 ? ZT.phosphor : a.slaCompliance >= 75 ? ZT.amber : ZT.red,
                      }}>
                        {a.slaCompliance}%
                      </span>
                    </td>
                    <td style={{
                      ...tdStyle,
                      color: a.pendingQueue > 25 ? ZT.red : a.pendingQueue > 15 ? ZT.amber : ZT.text,
                      fontWeight: a.pendingQueue > 20 ? 700 : 400,
                    }}>
                      {a.pendingQueue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared table styles ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  background: ZT.bg,
  color: ZT.phosphor,
  fontWeight: 700,
  borderBottom: `2px solid ${ZT.border}`,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  fontFamily: 'monospace',
}

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${ZT.border}`,
  fontFamily: 'monospace',
}

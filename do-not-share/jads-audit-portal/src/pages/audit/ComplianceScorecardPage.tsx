// ── Compliance Scorecard Page ────────────────────────────────────────────────
// Audit portal: composite compliance score based on 4 weighted factors:
// - Log upload rate (40%), Geofence compliance (30%), Time compliance (20%), Cert validity (10%)
// Leaderboard table ranked by score with color bands.
// Score trend chart (12 months).
// Amber HUD theme.

import { type CSSProperties, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

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

// ── Types ────────────────────────────────────────────────────────────────────

interface OperatorScore {
  rank:               number
  operatorId:         string
  operatorName:       string
  logUploadRate:      number   // 0-100
  geofenceCompliance: number   // 0-100
  timeCompliance:     number   // 0-100
  certValidity:       number   // 0-100
  compositeScore:     number   // weighted
  totalMissions:      number
  trend:              'UP' | 'DOWN' | 'STABLE'
}

interface MonthlyTrend {
  month: string
  avgScore: number
  topQuartile: number
  bottomQuartile: number
}

// ── Mock Data ────────────────────────────────────────────────────────────────

function computeScore(log: number, geo: number, time: number, cert: number): number {
  return Math.round((log * 0.4 + geo * 0.3 + time * 0.2 + cert * 0.1) * 10) / 10
}

const MOCK_OPERATORS: OperatorScore[] = ([
  { rank: 1, operatorId: 'OP-004', operatorName: 'MapIndia Surveys', logUploadRate: 99.2, geofenceCompliance: 98.5, timeCompliance: 97.8, certValidity: 100, compositeScore: 0, totalMissions: 680, trend: 'STABLE' as const },
  { rank: 2, operatorId: 'OP-001', operatorName: 'SkyView Aerial Solutions', logUploadRate: 97.5, geofenceCompliance: 95.0, timeCompliance: 94.2, certValidity: 96.0, compositeScore: 0, totalMissions: 2340, trend: 'UP' as const },
  { rank: 3, operatorId: 'OP-005', operatorName: 'InfraDrone Tech', logUploadRate: 95.0, geofenceCompliance: 93.8, timeCompliance: 92.5, certValidity: 98.0, compositeScore: 0, totalMissions: 890, trend: 'UP' as const },
  { rank: 4, operatorId: 'OP-002', operatorName: 'DroneWorks India Pvt Ltd', logUploadRate: 92.0, geofenceCompliance: 91.5, timeCompliance: 90.0, certValidity: 95.0, compositeScore: 0, totalMissions: 1120, trend: 'STABLE' as const },
  { rank: 5, operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', logUploadRate: 88.0, geofenceCompliance: 86.0, timeCompliance: 85.5, certValidity: 90.0, compositeScore: 0, totalMissions: 4560, trend: 'DOWN' as const },
  { rank: 6, operatorId: 'OP-007', operatorName: 'PrecisionAir Mapping', logUploadRate: 85.2, geofenceCompliance: 82.0, timeCompliance: 80.5, certValidity: 88.0, compositeScore: 0, totalMissions: 340, trend: 'DOWN' as const },
  { rank: 7, operatorId: 'OP-006', operatorName: 'Urban Air Logistics', logUploadRate: 72.0, geofenceCompliance: 68.5, timeCompliance: 75.0, certValidity: 82.0, compositeScore: 0, totalMissions: 1800, trend: 'DOWN' as const },
  { rank: 8, operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', logUploadRate: 65.0, geofenceCompliance: 60.0, timeCompliance: 62.5, certValidity: 70.0, compositeScore: 0, totalMissions: 520, trend: 'DOWN' as const },
]).map((op, i) => ({
  ...op,
  rank: i + 1,
  compositeScore: computeScore(op.logUploadRate, op.geofenceCompliance, op.timeCompliance, op.certValidity),
}))

const MOCK_TREND: MonthlyTrend[] = [
  { month: 'Apr 25', avgScore: 82.1, topQuartile: 95.2, bottomQuartile: 68.5 },
  { month: 'May 25', avgScore: 83.5, topQuartile: 95.8, bottomQuartile: 69.0 },
  { month: 'Jun 25', avgScore: 84.0, topQuartile: 96.0, bottomQuartile: 70.2 },
  { month: 'Jul 25', avgScore: 84.8, topQuartile: 96.2, bottomQuartile: 71.5 },
  { month: 'Aug 25', avgScore: 85.2, topQuartile: 96.5, bottomQuartile: 72.0 },
  { month: 'Sep 25', avgScore: 85.0, topQuartile: 96.1, bottomQuartile: 71.8 },
  { month: 'Oct 25', avgScore: 86.1, topQuartile: 96.8, bottomQuartile: 73.0 },
  { month: 'Nov 25', avgScore: 86.8, topQuartile: 97.0, bottomQuartile: 73.5 },
  { month: 'Dec 25', avgScore: 87.0, topQuartile: 97.2, bottomQuartile: 74.0 },
  { month: 'Jan 26', avgScore: 87.5, topQuartile: 97.5, bottomQuartile: 74.2 },
  { month: 'Feb 26', avgScore: 87.8, topQuartile: 97.8, bottomQuartile: 74.5 },
  { month: 'Mar 26', avgScore: 88.2, topQuartile: 98.0, bottomQuartile: 75.0 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return T.green
  if (score >= 70) return T.primary
  return T.red
}

function scoreBand(score: number): string {
  if (score >= 90) return 'GREEN'
  if (score >= 70) return 'AMBER'
  return 'RED'
}

function trendArrow(trend: 'UP' | 'DOWN' | 'STABLE'): string {
  switch (trend) {
    case 'UP': return '^'
    case 'DOWN': return 'v'
    case 'STABLE': return '-'
  }
}

function trendColor(trend: 'UP' | 'DOWN' | 'STABLE'): string {
  switch (trend) {
    case 'UP': return T.green
    case 'DOWN': return T.red
    case 'STABLE': return T.muted
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ComplianceScorecardPage() {
  const [operators] = useState<OperatorScore[]>(MOCK_OPERATORS)
  const [trendData] = useState<MonthlyTrend[]>(MOCK_TREND)
  const [selectedBand, setSelectedBand] = useState<string>('')

  const filtered = selectedBand
    ? operators.filter(o => scoreBand(o.compositeScore) === selectedBand)
    : operators

  // Stats
  const avgScore = (operators.reduce((s, o) => s + o.compositeScore, 0) / operators.length).toFixed(1)
  const greenCount = operators.filter(o => o.compositeScore >= 90).length
  const amberCount = operators.filter(o => o.compositeScore >= 70 && o.compositeScore < 90).length
  const redCount = operators.filter(o => o.compositeScore < 70).length

  const exportCSV = useCallback(() => {
    const headers = ['Rank', 'Operator', 'Log Upload (40%)', 'Geofence (30%)', 'Time (20%)', 'Cert (10%)', 'Composite', 'Band', 'Missions', 'Trend']
    const rows = operators.map(o => [
      o.rank, o.operatorName, o.logUploadRate, o.geofenceCompliance,
      o.timeCompliance, o.certValidity, o.compositeScore,
      scoreBand(o.compositeScore), o.totalMissions, o.trend,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance_scorecard_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [operators])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
            Compliance Scorecard
          </h2>
          <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '0.2rem' }}>
            WEIGHTED COMPOSITE SCORE: LOG UPLOAD (40%) + GEOFENCE (30%) + TIME (20%) + CERT (10%)
          </div>
        </div>
        <button onClick={exportCSV}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${T.primary}40`, borderRadius: '4px',
            cursor: 'pointer', background: T.primary + '15', color: T.primary, fontSize: '0.8rem',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
          Export CSV
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { label: 'AVG SCORE', value: avgScore, colour: T.primary },
          { label: 'GREEN (>=90%)', value: greenCount, colour: T.green },
          { label: 'AMBER (70-90%)', value: amberCount, colour: T.primary },
          { label: 'RED (<70%)', value: redCount, colour: T.red },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: 1, minWidth: '140px', background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: '6px', padding: '0.75rem 1rem',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colour, fontFamily: "'JetBrains Mono', monospace" }}>
              {value}
            </div>
            <div style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 600, marginTop: '0.15rem' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Score Trend Chart */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem',
      }}>
        <div style={{
          color: T.primary, fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
          marginBottom: '0.75rem', letterSpacing: '0.04em',
        }}>
          SCORE TREND (12 MONTHS)
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="month" tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }} />
            <YAxis domain={[50, 100]} tick={{ fill: T.text, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: T.border }} tickLine={{ stroke: T.border }} />
            <Tooltip
              contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}
            />
            <Line type="monotone" dataKey="topQuartile" stroke={T.green} strokeWidth={2} dot={false} name="Top 25%" />
            <Line type="monotone" dataKey="avgScore" stroke={T.primary} strokeWidth={2} dot={{ r: 3, fill: T.primary }} name="Average" />
            <Line type="monotone" dataKey="bottomQuartile" stroke={T.red} strokeWidth={2} dot={false} name="Bottom 25%" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Band Filter */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center',
      }}>
        <span style={{ color: T.muted, fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace" }}>FILTER:</span>
        {['', 'GREEN', 'AMBER', 'RED'].map(band => (
          <button key={band}
            onClick={() => setSelectedBand(band)}
            style={{
              padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${selectedBand === band ? T.primary : T.border}`,
              background: selectedBand === band ? T.primary + '20' : 'transparent',
              color: band === 'GREEN' ? T.green : band === 'RED' ? T.red : band === 'AMBER' ? T.primary : T.text,
              fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
            }}
          >
            {band || 'ALL'}
          </button>
        ))}
      </div>

      {/* Leaderboard Table */}
      <div style={{
        overflowX: 'auto', borderRadius: '6px', border: `1px solid ${T.border}`,
      }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <thead>
            <tr>
              {['#', 'Operator', 'Log Upload (40%)', 'Geofence (30%)', 'Time (20%)', 'Cert (10%)', 'Score', 'Band', 'Missions', 'Trend'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(op => (
              <tr key={op.operatorId}
                style={{ borderBottom: `1px solid ${T.border}` }}
                onMouseEnter={e => { e.currentTarget.style.background = T.primary + '08' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...tdStyle, color: T.muted, fontWeight: 700 }}>{op.rank}</td>
                <td style={{ ...tdStyle, color: T.textBright, fontWeight: 600, maxWidth: '220px' }}>{op.operatorName}</td>
                <td style={{ ...tdStyle, color: scoreColor(op.logUploadRate) }}>{op.logUploadRate}%</td>
                <td style={{ ...tdStyle, color: scoreColor(op.geofenceCompliance) }}>{op.geofenceCompliance}%</td>
                <td style={{ ...tdStyle, color: scoreColor(op.timeCompliance) }}>{op.timeCompliance}%</td>
                <td style={{ ...tdStyle, color: scoreColor(op.certValidity) }}>{op.certValidity}%</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700,
                    background: scoreColor(op.compositeScore) + '20',
                    color: scoreColor(op.compositeScore),
                  }}>
                    {op.compositeScore}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                    background: scoreColor(op.compositeScore) + '15',
                    color: scoreColor(op.compositeScore),
                    border: `1px solid ${scoreColor(op.compositeScore)}40`,
                  }}>
                    {scoreBand(op.compositeScore)}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: T.text }}>{op.totalMissions.toLocaleString()}</td>
                <td style={tdStyle}>
                  <span style={{
                    color: trendColor(op.trend), fontWeight: 700, fontSize: '0.85rem',
                  }}>
                    {trendArrow(op.trend)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{
          padding: '2rem', textAlign: 'center', color: T.muted,
          fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem',
        }}>
          No operators in the selected band.
        </div>
      )}
    </div>
  )
}

// ── Shared table styles ──────────────────────────────────────────────────────

const thStyle: CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  background: T.surface,
  color: T.primary,
  fontWeight: 700,
  borderBottom: `2px solid ${T.border}`,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  fontFamily: "'JetBrains Mono', monospace",
}

const tdStyle: CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${T.border}`,
  fontFamily: "'JetBrains Mono', monospace",
}

// ── Fleet Overview Page ──────────────────────────────────────────────────────
// PLATFORM_SUPER_ADMIN view: fleet stats by operator, type certificate status
// summary, real-time activity feed (auto-refresh 60s).
// Uses dark green HUD theme (ZT) from theme.ts.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ZT } from '../../theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface OperatorFleetStats {
  operatorId:      string
  operatorName:    string
  totalDrones:     number
  activeDrones:    number
  groundedDrones:  number
  maintenanceDrones: number
  totalFlightHours: number
  totalMissions:   number
  complianceRate:  number  // 0-100
  lastActivity:    string
}

interface TCStatusSummary {
  status:   string
  count:    number
  percentage: number
}

interface ActivityEvent {
  id:        string
  timestamp: string
  type:      'TAKEOFF' | 'LANDING' | 'REGISTRATION' | 'MAINTENANCE' | 'GROUNDING' | 'VIOLATION' | 'CERT_RENEWAL'
  droneUin:  string
  operator:  string
  details:   string
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_OPERATORS: OperatorFleetStats[] = [
  { operatorId: 'OP-001', operatorName: 'SkyView Aerial Solutions', totalDrones: 24, activeDrones: 18, groundedDrones: 2, maintenanceDrones: 4, totalFlightHours: 4520.5, totalMissions: 2340, complianceRate: 96.2, lastActivity: '2026-03-09T08:45:00Z' },
  { operatorId: 'OP-002', operatorName: 'DroneWorks India Pvt Ltd', totalDrones: 15, activeDrones: 12, groundedDrones: 1, maintenanceDrones: 2, totalFlightHours: 2100.8, totalMissions: 1120, complianceRate: 92.8, lastActivity: '2026-03-09T07:30:00Z' },
  { operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', totalDrones: 32, activeDrones: 22, groundedDrones: 5, maintenanceDrones: 5, totalFlightHours: 8200.0, totalMissions: 4560, complianceRate: 88.5, lastActivity: '2026-03-09T09:10:00Z' },
  { operatorId: 'OP-004', operatorName: 'MapIndia Surveys', totalDrones: 8, activeDrones: 6, groundedDrones: 0, maintenanceDrones: 2, totalFlightHours: 1250.3, totalMissions: 680, complianceRate: 98.1, lastActivity: '2026-03-08T16:20:00Z' },
  { operatorId: 'OP-005', operatorName: 'InfraDrone Tech', totalDrones: 11, activeDrones: 8, groundedDrones: 1, maintenanceDrones: 2, totalFlightHours: 1680.0, totalMissions: 890, complianceRate: 94.5, lastActivity: '2026-03-09T06:55:00Z' },
  { operatorId: 'OP-006', operatorName: 'Urban Air Logistics', totalDrones: 19, activeDrones: 14, groundedDrones: 3, maintenanceDrones: 2, totalFlightHours: 3400.2, totalMissions: 1800, complianceRate: 78.3, lastActivity: '2026-03-09T05:40:00Z' },
]

const MOCK_TC_STATUS: TCStatusSummary[] = [
  { status: 'VALID', count: 72, percentage: 66.1 },
  { status: 'EXPIRING_30D', count: 12, percentage: 11.0 },
  { status: 'EXPIRED', count: 8, percentage: 7.3 },
  { status: 'PENDING_RENEWAL', count: 6, percentage: 5.5 },
  { status: 'NOT_ISSUED', count: 11, percentage: 10.1 },
]

function generateMockActivity(): ActivityEvent[] {
  const types: ActivityEvent['type'][] = ['TAKEOFF', 'LANDING', 'REGISTRATION', 'MAINTENANCE', 'GROUNDING', 'VIOLATION', 'CERT_RENEWAL']
  const operators = ['SkyView', 'DroneWorks', 'AgroTech', 'MapIndia', 'InfraDrone', 'UrbanAir']
  const events: ActivityEvent[] = []
  const now = Date.now()
  for (let i = 0; i < 20; i++) {
    const type = types[Math.floor(Math.random() * types.length)]
    const op = operators[Math.floor(Math.random() * operators.length)]
    const uin = `UIN-IN-${String(Math.floor(Math.random() * 200) + 1).padStart(4, '0')}`
    const ts = new Date(now - i * 180000).toISOString()
    let details = ''
    switch (type) {
      case 'TAKEOFF': details = `Drone ${uin} departed for survey mission`; break
      case 'LANDING': details = `Drone ${uin} completed mission, landed safely`; break
      case 'REGISTRATION': details = `New drone ${uin} registered by ${op}`; break
      case 'MAINTENANCE': details = `Drone ${uin} entered scheduled maintenance`; break
      case 'GROUNDING': details = `Drone ${uin} grounded - certificate expired`; break
      case 'VIOLATION': details = `Drone ${uin} geofence boundary alert`; break
      case 'CERT_RENEWAL': details = `Type certificate renewed for ${uin}`; break
    }
    events.push({ id: `EVT-${i}`, timestamp: ts, type, droneUin: uin, operator: op, details })
  }
  return events
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const EVENT_COLORS: Record<ActivityEvent['type'], string> = {
  TAKEOFF:       ZT.phosphor,
  LANDING:       '#3B82F6',
  REGISTRATION:  ZT.textBright,
  MAINTENANCE:   ZT.amber,
  GROUNDING:     ZT.red,
  VIOLATION:     ZT.red,
  CERT_RENEWAL:  '#22C55E',
}

const TC_STATUS_COLORS: Record<string, string> = {
  VALID:           ZT.phosphor,
  EXPIRING_30D:    ZT.amber,
  EXPIRED:         ZT.red,
  PENDING_RENEWAL: '#3B82F6',
  NOT_ISSUED:      ZT.muted,
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function FleetOverviewPage() {
  const [operators] = useState<OperatorFleetStats[]>(MOCK_OPERATORS)
  const [tcStatus] = useState<TCStatusSummary[]>(MOCK_TC_STATUS)
  const [activities, setActivities] = useState<ActivityEvent[]>(() => generateMockActivity())
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  // Auto-refresh activity feed every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setActivities(generateMockActivity())
      setLastRefresh(new Date())
    }, 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const handleManualRefresh = useCallback(() => {
    setActivities(generateMockActivity())
    setLastRefresh(new Date())
  }, [])

  // Totals
  const totalDrones = operators.reduce((s, o) => s + o.totalDrones, 0)
  const totalActive = operators.reduce((s, o) => s + o.activeDrones, 0)
  const totalGrounded = operators.reduce((s, o) => s + o.groundedDrones, 0)
  const avgCompliance = (operators.reduce((s, o) => s + o.complianceRate, 0) / operators.length).toFixed(1)

  return (
    <div style={{ padding: '1.5rem', background: ZT.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: ZT.phosphor, fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            FLEET OVERVIEW
          </span>
          <span style={{ color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            NATIONAL DRONE FLEET STATUS
          </span>
        </div>
        <button onClick={handleManualRefresh}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${ZT.border}`, borderRadius: '4px',
            cursor: 'pointer', background: ZT.surface, color: ZT.text, fontSize: '0.78rem', fontFamily: 'monospace',
          }}>
          REFRESH
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL DRONES', value: totalDrones, colour: ZT.phosphor },
          { label: 'ACTIVE NOW', value: totalActive, colour: '#22C55E' },
          { label: 'GROUNDED', value: totalGrounded, colour: ZT.red },
          { label: 'AVG COMPLIANCE', value: `${avgCompliance}%`, colour: ZT.amber },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: 1, minWidth: '140px', background: ZT.surface,
            border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '0.75rem 1rem',
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

      {/* Fleet Stats by Operator Table */}
      <div style={{
        background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem',
      }}>
        <div style={{
          color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
          marginBottom: '0.75rem', letterSpacing: '0.04em',
        }}>
          FLEET STATS BY OPERATOR
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace',
          }}>
            <thead>
              <tr>
                {['Operator', 'Total', 'Active', 'Grounded', 'Maint.', 'Hours', 'Missions', 'Compliance', 'Last Activity'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map(op => (
                <tr key={op.operatorId}
                  style={{ borderBottom: `1px solid ${ZT.border}` }}
                  onMouseEnter={e => { e.currentTarget.style.background = ZT.phosphor + '08' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ ...tdStyle, color: ZT.textBright, fontWeight: 600, maxWidth: '200px' }}>
                    {op.operatorName}
                  </td>
                  <td style={{ ...tdStyle, color: ZT.phosphor, fontWeight: 700 }}>{op.totalDrones}</td>
                  <td style={{ ...tdStyle, color: '#22C55E' }}>{op.activeDrones}</td>
                  <td style={{ ...tdStyle, color: op.groundedDrones > 0 ? ZT.red : ZT.text }}>{op.groundedDrones}</td>
                  <td style={{ ...tdStyle, color: ZT.amber }}>{op.maintenanceDrones}</td>
                  <td style={{ ...tdStyle, color: ZT.text }}>{op.totalFlightHours.toFixed(0)}h</td>
                  <td style={{ ...tdStyle, color: ZT.text }}>{op.totalMissions.toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                      background: op.complianceRate >= 90 ? ZT.phosphor + '20' : op.complianceRate >= 70 ? ZT.amber + '20' : ZT.red + '20',
                      color: op.complianceRate >= 90 ? ZT.phosphor : op.complianceRate >= 70 ? ZT.amber : ZT.red,
                    }}>
                      {op.complianceRate}%
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: ZT.muted, whiteSpace: 'nowrap' }}>{fmtDate(op.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-column layout: TC Status + Activity Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Type Certificate Status Summary */}
        <div style={{
          background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '1rem',
        }}>
          <div style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
            marginBottom: '0.75rem', letterSpacing: '0.04em',
          }}>
            TYPE CERTIFICATE STATUS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tcStatus.map(tc => (
              <div key={tc.status} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0.75rem', borderRadius: '4px',
                background: ZT.bg,
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: TC_STATUS_COLORS[tc.status] ?? ZT.muted,
                  boxShadow: `0 0 4px ${TC_STATUS_COLORS[tc.status] ?? ZT.muted}`,
                  flexShrink: 0,
                }} />
                <span style={{ color: ZT.textBright, fontSize: '0.78rem', flex: 1 }}>
                  {tc.status.replace(/_/g, ' ')}
                </span>
                <span style={{ color: ZT.phosphor, fontWeight: 700, fontSize: '0.85rem', minWidth: '28px', textAlign: 'right' }}>
                  {tc.count}
                </span>
                <div style={{ width: '80px', height: '6px', background: ZT.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${tc.percentage}%`, height: '100%',
                    background: TC_STATUS_COLORS[tc.status] ?? ZT.muted,
                    borderRadius: '3px',
                  }} />
                </div>
                <span style={{ color: ZT.muted, fontSize: '0.7rem', minWidth: '36px', textAlign: 'right' }}>
                  {tc.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-Time Activity Feed */}
        <div style={{
          background: ZT.surface, border: `1px solid ${ZT.border}`, borderRadius: '6px', padding: '1rem',
          maxHeight: '400px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '0.75rem',
          }}>
            <div style={{
              color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
              letterSpacing: '0.04em',
            }}>
              REAL-TIME ACTIVITY FEED
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%', background: ZT.phosphor,
                animation: 'pulse 2s infinite',
              }} />
              <span style={{ fontSize: '0.65rem', color: ZT.muted, fontFamily: 'monospace' }}>
                Updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activities.map(evt => (
              <div key={evt.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.4rem 0', borderBottom: `1px solid ${ZT.border}10`,
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px',
                  background: EVENT_COLORS[evt.type], flexShrink: 0,
                  boxShadow: `0 0 4px ${EVENT_COLORS[evt.type]}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700,
                      color: EVENT_COLORS[evt.type],
                      textTransform: 'uppercase',
                    }}>
                      {evt.type.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: ZT.muted, whiteSpace: 'nowrap' }}>
                      {fmtDate(evt.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: ZT.text, marginTop: '1px' }}>
                    {evt.details}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: ZT.muted, marginTop: '1px' }}>
                    {evt.operator} | {evt.droneUin}
                  </div>
                </div>
              </div>
            ))}
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

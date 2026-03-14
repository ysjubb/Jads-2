// ── Anomaly Detection Page ───────────────────────────────────────────────────
// Audit portal: detects geofence skirting, permission washing, missing logs,
// altitude creep, and expired PA operations. Each anomaly rendered as a card
// with count, severity chip, and action buttons. Amber HUD theme.

import { useState, useCallback } from 'react'

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

type AnomalyType =
  | 'GEOFENCE_SKIRTING'
  | 'PERMISSION_WASHING'
  | 'MISSING_LOGS'
  | 'ALTITUDE_CREEP'
  | 'EXPIRED_PA_OPS'

type Severity = 'HIGH' | 'MEDIUM' | 'LOW'

interface AnomalyInstance {
  id:          string
  missionId:   string
  operatorId:  string
  operatorName: string
  droneUin:    string
  timestamp:   string
  details:     string
  resolved:    boolean
}

interface AnomalyCategory {
  type:         AnomalyType
  label:        string
  description:  string
  severity:     Severity
  count:        number
  instances:    AnomalyInstance[]
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ANOMALIES: AnomalyCategory[] = [
  {
    type: 'GEOFENCE_SKIRTING',
    label: 'Geofence Skirting',
    description: 'Drones operating consistently at the edge of permitted geofence boundaries, potentially testing enforcement limits.',
    severity: 'HIGH',
    count: 7,
    instances: [
      { id: 'AN-001', missionId: 'MSN-2026-0412', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0078', timestamp: '2026-03-08T14:22:00Z', details: 'Drone maintained position within 5m of GREEN/YELLOW boundary for 18 minutes. Lateral deviation: 4.8m from boundary.', resolved: false },
      { id: 'AN-002', missionId: 'MSN-2026-0398', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0078', timestamp: '2026-03-07T11:45:00Z', details: 'Repeated approach to restricted perimeter at DEL airport 5km gate. Min distance: 5.02km (gate: 5.00km).', resolved: false },
      { id: 'AN-003', missionId: 'MSN-2026-0385', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0122', timestamp: '2026-03-06T16:30:00Z', details: 'Flight path traced along RED zone boundary for 2.3km stretch. Average distance from boundary: 8m.', resolved: false },
      { id: 'AN-004', missionId: 'MSN-2026-0371', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0045', timestamp: '2026-03-05T09:15:00Z', details: 'Multiple incursions within 10m of YELLOW zone limit near military installation.', resolved: false },
      { id: 'AN-005', missionId: 'MSN-2026-0340', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0122', timestamp: '2026-03-03T13:50:00Z', details: 'Geofence boundary approach pattern consistent with systematic boundary testing.', resolved: false },
      { id: 'AN-006', missionId: 'MSN-2026-0320', operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', droneUin: 'UIN-IN-0034', timestamp: '2026-03-01T08:20:00Z', details: 'Agricultural survey extended to within 3m of restricted airspace boundary.', resolved: true },
      { id: 'AN-007', missionId: 'MSN-2026-0305', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0078', timestamp: '2026-02-28T15:10:00Z', details: 'Repeated geofence boundary approaches detected across 3 missions in 48h period.', resolved: true },
    ],
  },
  {
    type: 'PERMISSION_WASHING',
    label: 'Permission Washing',
    description: 'Operators repeatedly filing and cancelling permission artefacts to reset validity windows or circumvent rejection records.',
    severity: 'HIGH',
    count: 3,
    instances: [
      { id: 'AN-008', missionId: 'MSN-2026-0405', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0099', timestamp: '2026-03-08T10:00:00Z', details: '5 PA applications filed and cancelled within 72h for same zone. Pattern suggests systematic resubmission to circumvent earlier rejections.', resolved: false },
      { id: 'AN-009', missionId: 'MSN-2026-0380', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0056', timestamp: '2026-03-05T14:30:00Z', details: 'PA rejected for YELLOW zone, re-submitted with minimal changes to adjacent coordinates. 3 iterations detected.', resolved: false },
      { id: 'AN-010', missionId: 'MSN-2026-0350', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0099', timestamp: '2026-03-02T09:00:00Z', details: 'Operator cancelled approved PA 2h before expiry, re-filed for extended window. Possible validity window gaming.', resolved: false },
    ],
  },
  {
    type: 'MISSING_LOGS',
    label: 'Missing Telemetry Logs',
    description: 'Flights detected via ADS-B or witness reports where corresponding telemetry logs were not uploaded within the required timeframe.',
    severity: 'MEDIUM',
    count: 12,
    instances: [
      { id: 'AN-011', missionId: 'MSN-2026-0410', operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', droneUin: 'UIN-IN-0028', timestamp: '2026-03-08T06:00:00Z', details: 'ADS-B track detected for UIN-IN-0028, no corresponding telemetry upload within 24h window.', resolved: false },
      { id: 'AN-012', missionId: 'MSN-2026-0395', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0067', timestamp: '2026-03-07T08:30:00Z', details: 'Flight log gap: 14 minutes of missing telemetry during active mission. Hash chain broken at record #847.', resolved: false },
      { id: 'AN-013', missionId: 'MSN-2026-0388', operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', droneUin: 'UIN-IN-0041', timestamp: '2026-03-06T12:15:00Z', details: 'Partial upload: 234 of estimated 890 telemetry records received. Upload terminated mid-transfer.', resolved: false },
      { id: 'AN-014', missionId: 'MSN-2026-0375', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0110', timestamp: '2026-03-04T17:45:00Z', details: 'No telemetry upload for completed mission. PA status shows COMPLETED but log upload rate: 0%.', resolved: false },
    ],
  },
  {
    type: 'ALTITUDE_CREEP',
    label: 'Altitude Creep',
    description: 'Gradual altitude increase during flight that exceeds permitted AGL limits. May indicate intentional altitude limit evasion.',
    severity: 'MEDIUM',
    count: 5,
    instances: [
      { id: 'AN-015', missionId: 'MSN-2026-0415', operatorId: 'OP-002', operatorName: 'DroneWorks India Pvt Ltd', droneUin: 'UIN-IN-0015', timestamp: '2026-03-09T07:00:00Z', details: 'Permitted max: 120m AGL. Recorded: gradual climb from 115m to 148m over 8 minutes. Peak exceedance: 28m.', resolved: false },
      { id: 'AN-016', missionId: 'MSN-2026-0400', operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', droneUin: 'UIN-IN-0038', timestamp: '2026-03-07T15:20:00Z', details: 'Altitude ramp pattern detected: 90m -> 110m -> 130m -> 142m across survey waypoints. Limit: 120m AGL.', resolved: false },
      { id: 'AN-017', missionId: 'MSN-2026-0365', operatorId: 'OP-005', operatorName: 'InfraDrone Tech', droneUin: 'UIN-IN-0072', timestamp: '2026-03-04T10:40:00Z', details: 'Single altitude spike to 185m AGL (limit: 120m) lasting 45 seconds. Possible sensor error or intentional.', resolved: false },
    ],
  },
  {
    type: 'EXPIRED_PA_OPS',
    label: 'Expired PA Operations',
    description: 'Drone operations detected after the associated Permission Artefact has expired, indicating flights without valid authorization.',
    severity: 'HIGH',
    count: 4,
    instances: [
      { id: 'AN-018', missionId: 'MSN-2026-0408', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0089', timestamp: '2026-03-08T13:00:00Z', details: 'PA expired at 12:00 UTC. Flight continued until 13:47 UTC. Unauthorized operation duration: 1h 47m.', resolved: false },
      { id: 'AN-019', missionId: 'MSN-2026-0390', operatorId: 'OP-008', operatorName: 'QuickDrone Delivery', droneUin: 'UIN-IN-0105', timestamp: '2026-03-06T18:00:00Z', details: 'PA expiry: 2026-03-05. Mission initiated 2026-03-06. Operated on fully expired PA (+1 day).', resolved: false },
      { id: 'AN-020', missionId: 'MSN-2026-0355', operatorId: 'OP-006', operatorName: 'Urban Air Logistics', droneUin: 'UIN-IN-0056', timestamp: '2026-03-03T11:30:00Z', details: 'PA window: 09:00-11:00 UTC. Flight extended to 11:30 UTC. 30-minute unauthorized extension.', resolved: false },
      { id: 'AN-021', missionId: 'MSN-2026-0330', operatorId: 'OP-003', operatorName: 'AgroTech Aerial Services', droneUin: 'UIN-IN-0034', timestamp: '2026-03-02T07:00:00Z', details: 'Renewal PA not yet approved. Operator initiated flight using previous (expired) PA reference.', resolved: true },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<Severity, string> = {
  HIGH:   T.red,
  MEDIUM: T.primary,
  LOW:    T.green,
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Anomaly Card ─────────────────────────────────────────────────────────────

function AnomalyCard({
  anomaly,
  expanded,
  onToggle,
  onInvestigate,
  onClear,
}: {
  anomaly: AnomalyCategory
  expanded: boolean
  onToggle: () => void
  onInvestigate: (instanceId: string) => void
  onClear: (instanceId: string) => void
}) {
  const unresolved = anomaly.instances.filter(i => !i.resolved).length

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${SEVERITY_COLORS[anomaly.severity]}30`,
      borderRadius: '6px',
      marginBottom: '1rem',
      overflow: 'hidden',
    }}>
      {/* Card Header */}
      <div
        onClick={onToggle}
        style={{
          padding: '1rem 1.25rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: expanded ? `1px solid ${T.border}` : 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = SEVERITY_COLORS[anomaly.severity] + '08' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
            <span style={{
              color: T.textBright, fontWeight: 700, fontSize: '0.9rem',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {anomaly.label}
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 700,
              background: SEVERITY_COLORS[anomaly.severity] + '20',
              color: SEVERITY_COLORS[anomaly.severity],
              border: `1px solid ${SEVERITY_COLORS[anomaly.severity]}40`,
            }}>
              {anomaly.severity}
            </span>
          </div>
          <div style={{
            color: T.muted, fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace",
            lineHeight: '1.3',
          }}>
            {anomaly.description}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '1.5rem', fontWeight: 700,
              color: SEVERITY_COLORS[anomaly.severity],
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {anomaly.count}
            </div>
            <div style={{ fontSize: '0.6rem', color: T.muted, textTransform: 'uppercase' }}>
              DETECTED
            </div>
          </div>
          {unresolved > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '1.2rem', fontWeight: 700, color: T.red,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {unresolved}
              </div>
              <div style={{ fontSize: '0.6rem', color: T.muted, textTransform: 'uppercase' }}>
                UNRESOLVED
              </div>
            </div>
          )}
          <span style={{
            color: T.muted, fontSize: '1rem', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>
            V
          </span>
        </div>
      </div>

      {/* Expanded Instances */}
      {expanded && (
        <div style={{ padding: '0.75rem 1.25rem' }}>
          {anomaly.instances.map(inst => (
            <div key={inst.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '0.6rem 0.75rem', borderRadius: '4px', marginBottom: '0.5rem',
              background: inst.resolved ? T.bg : SEVERITY_COLORS[anomaly.severity] + '06',
              border: `1px solid ${inst.resolved ? T.border : SEVERITY_COLORS[anomaly.severity] + '20'}`,
              opacity: inst.resolved ? 0.6 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                  <span style={{
                    color: T.primary, fontSize: '0.75rem', fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {inst.missionId}
                  </span>
                  <span style={{ color: T.muted, fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace" }}>
                    {inst.droneUin}
                  </span>
                  <span style={{ color: T.text, fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace" }}>
                    {inst.operatorName}
                  </span>
                  {inst.resolved && (
                    <span style={{
                      padding: '1px 6px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                      background: T.green + '20', color: T.green,
                    }}>
                      CLEARED
                    </span>
                  )}
                </div>
                <div style={{
                  color: T.text, fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: '1.35', marginBottom: '0.2rem',
                }}>
                  {inst.details}
                </div>
                <div style={{ color: T.muted, fontSize: '0.65rem', fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtDate(inst.timestamp)}
                </div>
              </div>

              {!inst.resolved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginLeft: '0.75rem', flexShrink: 0 }}>
                  <button
                    onClick={() => onInvestigate(inst.id)}
                    style={{
                      padding: '4px 10px', border: `1px solid ${T.primary}40`, borderRadius: '3px',
                      background: T.primary + '15', color: T.primary, fontSize: '0.68rem',
                      cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    INVESTIGATE
                  </button>
                  <button
                    onClick={() => onClear(inst.id)}
                    style={{
                      padding: '4px 10px', border: `1px solid ${T.green}40`, borderRadius: '3px',
                      background: T.green + '10', color: T.green, fontSize: '0.68rem',
                      cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    CLEAR
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function AnomalyDetectionPage() {
  const [anomalies, setAnomalies] = useState<AnomalyCategory[]>(MOCK_ANOMALIES)
  const [expandedTypes, setExpandedTypes] = useState<Set<AnomalyType>>(new Set())
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('')

  const toggleExpand = useCallback((type: AnomalyType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const handleInvestigate = useCallback((instanceId: string) => {
    alert(`Opening investigation for anomaly ${instanceId}. In production, this would navigate to the forensic mission viewer.`)
  }, [])

  const handleClear = useCallback((instanceId: string) => {
    setAnomalies(prev => prev.map(cat => ({
      ...cat,
      instances: cat.instances.map(inst =>
        inst.id === instanceId ? { ...inst, resolved: true } : inst
      ),
    })))
  }, [])

  const filtered = severityFilter
    ? anomalies.filter(a => a.severity === severityFilter)
    : anomalies

  // Summary stats
  const totalAnomalies = anomalies.reduce((s, a) => s + a.count, 0)
  const totalUnresolved = anomalies.reduce((s, a) => s + a.instances.filter(i => !i.resolved).length, 0)
  const highCount = anomalies.filter(a => a.severity === 'HIGH').reduce((s, a) => s + a.instances.filter(i => !i.resolved).length, 0)
  const uniqueOperators = new Set(anomalies.flatMap(a => a.instances.filter(i => !i.resolved).map(i => i.operatorId))).size

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
            Anomaly Detection
          </h2>
          <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '0.2rem' }}>
            AUTOMATED PATTERN ANALYSIS FOR COMPLIANCE VIOLATIONS
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL ANOMALIES', value: totalAnomalies, colour: T.primary },
          { label: 'UNRESOLVED', value: totalUnresolved, colour: T.red },
          { label: 'HIGH SEVERITY', value: highCount, colour: T.red },
          { label: 'OPERATORS FLAGGED', value: uniqueOperators, colour: T.primary },
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

      {/* Severity Filter */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center',
      }}>
        <span style={{ color: T.muted, fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace" }}>SEVERITY:</span>
        {(['', 'HIGH', 'MEDIUM', 'LOW'] as (Severity | '')[]).map(sev => (
          <button key={sev}
            onClick={() => setSeverityFilter(sev)}
            style={{
              padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${severityFilter === sev ? T.primary : T.border}`,
              background: severityFilter === sev ? T.primary + '20' : 'transparent',
              color: sev === 'HIGH' ? T.red : sev === 'MEDIUM' ? T.primary : sev === 'LOW' ? T.green : T.text,
              fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
            }}
          >
            {sev || 'ALL'}
          </button>
        ))}
      </div>

      {/* Anomaly Cards */}
      {filtered.map(anomaly => (
        <AnomalyCard
          key={anomaly.type}
          anomaly={anomaly}
          expanded={expandedTypes.has(anomaly.type)}
          onToggle={() => toggleExpand(anomaly.type)}
          onInvestigate={handleInvestigate}
          onClear={handleClear}
        />
      ))}

      {filtered.length === 0 && (
        <div style={{
          padding: '3rem', textAlign: 'center', color: T.muted,
          fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem',
          background: T.surface, borderRadius: '6px', border: `1px solid ${T.border}`,
        }}>
          No anomalies detected for the selected severity filter.
        </div>
      )}
    </div>
  )
}

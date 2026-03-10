import React, { useState, useCallback } from 'react'
import { T } from '../../App'

// ── Types ────────────────────────────────────────────────────────────────────

type DroneStatus = 'ACTIVE' | 'STANDBY' | 'GROUNDED' | 'MAINTENANCE'

interface FleetDrone {
  id:               string
  model:            string
  manufacturer:     string
  uin:              string
  serialNumber:     string
  category:         string  // Nano, Micro, Small, Medium, Large
  photoUrl:         string | null
  typeCertificate:  string | null
  tcExpiry:         string | null
  insuranceExpiry:  string | null
  lastFlightDate:   string | null
  totalFlightHours: number
  totalMissions:    number
  status:           DroneStatus
  registeredAt:     string
  firmwareVersion:  string
  maxAltitudeM:     number
  maxRangeKm:       number
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_DRONES: FleetDrone[] = [
  {
    id: 'DRN-001', model: 'DJI Matrice 300 RTK', manufacturer: 'DJI', uin: 'UIN-IN-0001',
    serialNumber: 'SN-M300-A1', category: 'Small', photoUrl: null,
    typeCertificate: 'TC-DGCA-2024-0112', tcExpiry: '2026-08-15',
    insuranceExpiry: '2026-04-20', lastFlightDate: '2026-03-07',
    totalFlightHours: 342.5, totalMissions: 187, status: 'ACTIVE',
    registeredAt: '2024-06-01', firmwareVersion: 'v04.01.0200',
    maxAltitudeM: 120, maxRangeKm: 15,
  },
  {
    id: 'DRN-002', model: 'AgEagle eBee X', manufacturer: 'AgEagle', uin: 'UIN-IN-0002',
    serialNumber: 'SN-EBEE-B2', category: 'Small', photoUrl: null,
    typeCertificate: 'TC-DGCA-2024-0198', tcExpiry: '2027-01-30',
    insuranceExpiry: '2026-03-15', lastFlightDate: '2026-03-05',
    totalFlightHours: 210.0, totalMissions: 98, status: 'ACTIVE',
    registeredAt: '2024-09-15', firmwareVersion: 'v3.8.1',
    maxAltitudeM: 120, maxRangeKm: 40,
  },
  {
    id: 'DRN-003', model: 'Autel EVO II Pro', manufacturer: 'Autel Robotics', uin: 'UIN-IN-0003',
    serialNumber: 'SN-EVO2-C3', category: 'Micro', photoUrl: null,
    typeCertificate: 'TC-DGCA-2025-0044', tcExpiry: '2026-12-01',
    insuranceExpiry: '2026-09-10', lastFlightDate: '2026-02-28',
    totalFlightHours: 88.2, totalMissions: 45, status: 'STANDBY',
    registeredAt: '2025-03-20', firmwareVersion: 'v2.1.8.6',
    maxAltitudeM: 120, maxRangeKm: 9,
  },
  {
    id: 'DRN-004', model: 'Skydio X10', manufacturer: 'Skydio', uin: 'UIN-IN-0004',
    serialNumber: 'SN-X10-D4', category: 'Small', photoUrl: null,
    typeCertificate: null, tcExpiry: null,
    insuranceExpiry: '2026-06-30', lastFlightDate: '2026-01-15',
    totalFlightHours: 12.5, totalMissions: 8, status: 'GROUNDED',
    registeredAt: '2025-11-01', firmwareVersion: 'v1.2.0',
    maxAltitudeM: 120, maxRangeKm: 6,
  },
  {
    id: 'DRN-005', model: 'IdeaForge Ninja', manufacturer: 'IdeaForge', uin: 'UIN-IN-0005',
    serialNumber: 'SN-NJA-E5', category: 'Medium', photoUrl: null,
    typeCertificate: 'TC-DGCA-2024-0067', tcExpiry: '2026-03-20',
    insuranceExpiry: '2026-05-01', lastFlightDate: '2026-03-01',
    totalFlightHours: 560.0, totalMissions: 312, status: 'MAINTENANCE',
    registeredAt: '2023-12-10', firmwareVersion: 'v5.4.2',
    maxAltitudeM: 400, maxRangeKm: 25,
  },
  {
    id: 'DRN-006', model: 'DJI Mavic 3 Enterprise', manufacturer: 'DJI', uin: 'UIN-IN-0006',
    serialNumber: 'SN-M3E-F6', category: 'Micro', photoUrl: null,
    typeCertificate: 'TC-DGCA-2025-0101', tcExpiry: '2027-06-15',
    insuranceExpiry: '2026-11-20', lastFlightDate: '2026-03-08',
    totalFlightHours: 145.8, totalMissions: 76, status: 'ACTIVE',
    registeredAt: '2025-06-01', firmwareVersion: 'v01.00.0600',
    maxAltitudeM: 120, maxRangeKm: 12,
  },
  {
    id: 'DRN-007', model: 'Parrot Anafi USA', manufacturer: 'Parrot', uin: 'UIN-IN-0007',
    serialNumber: 'SN-ANFI-G7', category: 'Micro', photoUrl: null,
    typeCertificate: 'TC-DGCA-2024-0255', tcExpiry: '2026-04-01',
    insuranceExpiry: '2026-03-25', lastFlightDate: '2026-02-20',
    totalFlightHours: 55.3, totalMissions: 32, status: 'STANDBY',
    registeredAt: '2024-11-15', firmwareVersion: 'v1.10.2',
    maxAltitudeM: 120, maxRangeKm: 4,
  },
  {
    id: 'DRN-008', model: 'Asteria AeroStar', manufacturer: 'Asteria Aerospace', uin: 'UIN-IN-0008',
    serialNumber: 'SN-AERO-H8', category: 'Small', photoUrl: null,
    typeCertificate: 'TC-DGCA-2025-0178', tcExpiry: '2027-09-01',
    insuranceExpiry: '2026-07-15', lastFlightDate: '2026-03-06',
    totalFlightHours: 420.1, totalMissions: 201, status: 'ACTIVE',
    registeredAt: '2025-01-05', firmwareVersion: 'v3.2.0',
    maxAltitudeM: 200, maxRangeKm: 30,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DroneStatus, string> = {
  ACTIVE:      '#22C55E',
  STANDBY:     '#3B82F6',
  GROUNDED:    '#EF4444',
  MAINTENANCE: '#F59E0B',
}

function isExpiringSoon(dateStr: string | null, daysThreshold = 30): boolean {
  if (!dateStr) return false
  const diff = new Date(dateStr).getTime() - Date.now()
  return diff > 0 && diff < daysThreshold * 86400000
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr).getTime() < Date.now()
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

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

// ── Drone Detail Drawer ──────────────────────────────────────────────────────

function DroneDetailDrawer({ drone, onClose }: { drone: FleetDrone; onClose: () => void }) {
  const fields: [string, string][] = [
    ['Model',            drone.model],
    ['Manufacturer',     drone.manufacturer],
    ['UIN',              drone.uin],
    ['Serial Number',    drone.serialNumber],
    ['Category',         drone.category],
    ['Type Certificate', drone.typeCertificate ?? 'NOT ISSUED'],
    ['TC Expiry',        fmtDate(drone.tcExpiry)],
    ['Insurance Expiry', fmtDate(drone.insuranceExpiry)],
    ['Last Flight',      fmtDate(drone.lastFlightDate)],
    ['Total Hours',      `${drone.totalFlightHours.toFixed(1)}h`],
    ['Total Missions',   String(drone.totalMissions)],
    ['Registered',       fmtDate(drone.registeredAt)],
    ['Firmware',         drone.firmwareVersion],
    ['Max Altitude',     `${drone.maxAltitudeM}m AGL`],
    ['Max Range',        `${drone.maxRangeKm}km`],
  ]

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 9998,
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh',
        background: T.bg, borderLeft: `2px solid ${T.border}`, zIndex: 9999,
        overflow: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          position: 'sticky', top: 0, background: T.bg, zIndex: 1,
        }}>
          <span style={{ color: T.primary, fontWeight: 700, fontSize: '0.95rem', fontFamily: "'JetBrains Mono', monospace" }}>
            DRONE DETAIL
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${T.border}`, borderRadius: '4px',
            color: T.text, cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem',
          }}>
            CLOSE
          </button>
        </div>

        <div style={{ padding: '1.25rem' }}>
          {/* Status Badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: T.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '1.1rem' }}>
              {drone.id}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
              background: STATUS_COLORS[drone.status] + '25',
              color: STATUS_COLORS[drone.status],
              border: `1px solid ${STATUS_COLORS[drone.status]}50`,
            }}>
              {drone.status}
            </span>
          </div>

          {/* Photo placeholder */}
          <div style={{
            width: '100%', height: '140px', borderRadius: '6px',
            background: T.surface, border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1rem', color: T.muted, fontSize: '0.8rem',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {drone.photoUrl ? (
              <img src={drone.photoUrl} alt={drone.model} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
            ) : (
              `[${drone.model}]`
            )}
          </div>

          {/* Expiry alerts */}
          {(isExpired(drone.tcExpiry) || isExpiringSoon(drone.tcExpiry)) && (
            <div style={{
              padding: '0.6rem 0.8rem', marginBottom: '0.75rem', borderRadius: '6px',
              background: isExpired(drone.tcExpiry) ? T.red + '15' : T.amber + '15',
              border: `1px solid ${isExpired(drone.tcExpiry) ? T.red : T.amber}40`,
              color: isExpired(drone.tcExpiry) ? T.red : T.amber,
              fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
            }}>
              TC {isExpired(drone.tcExpiry) ? 'EXPIRED' : 'EXPIRING SOON'}: {fmtDate(drone.tcExpiry)}
            </div>
          )}
          {(isExpired(drone.insuranceExpiry) || isExpiringSoon(drone.insuranceExpiry)) && (
            <div style={{
              padding: '0.6rem 0.8rem', marginBottom: '0.75rem', borderRadius: '6px',
              background: isExpired(drone.insuranceExpiry) ? T.red + '15' : T.amber + '15',
              border: `1px solid ${isExpired(drone.insuranceExpiry) ? T.red : T.amber}40`,
              color: isExpired(drone.insuranceExpiry) ? T.red : T.amber,
              fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
            }}>
              INSURANCE {isExpired(drone.insuranceExpiry) ? 'EXPIRED' : 'EXPIRING SOON'}: {fmtDate(drone.insuranceExpiry)}
            </div>
          )}

          {/* Field Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
            border: `1px solid ${T.border}`, borderRadius: '6px', overflow: 'hidden',
          }}>
            {fields.map(([label, value], i) => (
              <div key={i} style={{
                padding: '0.5rem 0.75rem',
                borderBottom: `1px solid ${T.border}`,
                borderRight: i % 2 === 0 ? `1px solid ${T.border}` : 'none',
                gridColumn: i === fields.length - 1 && fields.length % 2 === 1 ? 'span 2' : undefined,
              }}>
                <div style={{ fontSize: '0.6rem', color: T.muted, fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.78rem', color: T.textBright, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Expiry Alerts Panel ──────────────────────────────────────────────────────

function ExpiryAlertsPanel({ drones }: { drones: FleetDrone[] }) {
  const alerts: { droneId: string; model: string; type: string; date: string; severity: 'EXPIRED' | 'WARNING' }[] = []

  drones.forEach(d => {
    if (isExpired(d.tcExpiry)) alerts.push({ droneId: d.id, model: d.model, type: 'Type Certificate', date: d.tcExpiry!, severity: 'EXPIRED' })
    else if (isExpiringSoon(d.tcExpiry)) alerts.push({ droneId: d.id, model: d.model, type: 'Type Certificate', date: d.tcExpiry!, severity: 'WARNING' })
    if (isExpired(d.insuranceExpiry)) alerts.push({ droneId: d.id, model: d.model, type: 'Insurance', date: d.insuranceExpiry!, severity: 'EXPIRED' })
    else if (isExpiringSoon(d.insuranceExpiry)) alerts.push({ droneId: d.id, model: d.model, type: 'Insurance', date: d.insuranceExpiry!, severity: 'WARNING' })
  })

  if (alerts.length === 0) return null

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
      padding: '1rem', marginBottom: '1.25rem',
    }}>
      <div style={{
        color: T.amber, fontWeight: 700, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
        marginBottom: '0.75rem', letterSpacing: '0.04em',
      }}>
        EXPIRY ALERTS ({alerts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {alerts.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem 0.75rem', borderRadius: '4px',
            background: a.severity === 'EXPIRED' ? T.red + '10' : T.amber + '10',
            border: `1px solid ${a.severity === 'EXPIRED' ? T.red : T.amber}30`,
          }}>
            <div>
              <span style={{ color: T.textBright, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                {a.droneId}
              </span>
              <span style={{ color: T.muted, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                {a.model}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: T.text, fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace" }}>
                {a.type}: {fmtDate(a.date)}
              </span>
              <span style={{
                padding: '2px 6px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
                background: a.severity === 'EXPIRED' ? T.red + '25' : T.amber + '25',
                color: a.severity === 'EXPIRED' ? T.red : T.amber,
              }}>
                {a.severity}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function FleetManagerPage() {
  const [drones] = useState<FleetDrone[]>(MOCK_DRONES)
  const [statusFilter, setStatusFilter] = useState<DroneStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDrone, setSelectedDrone] = useState<FleetDrone | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Derived stats
  const totalDrones = drones.length
  const activeDrones = drones.filter(d => d.status === 'ACTIVE').length
  const expiringCerts = drones.filter(d => isExpiringSoon(d.tcExpiry) || isExpiringSoon(d.insuranceExpiry)).length
  const approvedPAs = 24 // Mock: approved permission artefacts

  // Filtered drones
  const filtered = drones.filter(d => {
    if (statusFilter && d.status !== statusFilter) return false
    if (categoryFilter && d.category !== categoryFilter) return false
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      return d.model.toLowerCase().includes(s) || d.uin.toLowerCase().includes(s) || d.id.toLowerCase().includes(s)
    }
    return true
  })

  const categories = [...new Set(drones.map(d => d.category))]

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(d => d.id)))
    }
  }

  const handleBulkAction = useCallback((action: string) => {
    alert(`Bulk action "${action}" for ${selectedIds.size} drone(s): ${Array.from(selectedIds).join(', ')}`)
    setSelectedIds(new Set())
  }, [selectedIds])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
            Fleet Manager
          </h2>
          <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: '0.2rem' }}>
            DRONE FLEET OVERVIEW & MANAGEMENT
          </div>
        </div>
        <button onClick={() => window.location.reload()}
          style={{
            padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: 'pointer', background: T.surface, color: T.text, fontSize: '0.8rem',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
          Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <StatCard label="Total Drones" value={totalDrones} colour={T.primary} />
        <StatCard label="Active" value={activeDrones} colour="#22C55E" />
        <StatCard label="Expiring Certs" value={expiringCerts} colour={T.amber} />
        <StatCard label="Approved PAs" value={approvedPAs} colour={T.primary} />
      </div>

      {/* Expiry Alerts */}
      <ExpiryAlertsPanel drones={drones} />

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search model, UIN..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            padding: '0.4rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
            width: '200px',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as DroneStatus | '')}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <option value="">All Status</option>
          {(['ACTIVE', 'STANDBY', 'GROUNDED', 'MAINTENANCE'] as DroneStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.4rem 0.5rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '1rem', padding: '0.6rem 1rem',
          background: T.primary + '08', border: `1px solid ${T.primary}30`,
          borderRadius: '6px',
        }}>
          <span style={{ color: T.text, fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace" }}>
            {selectedIds.size} selected
          </span>
          <button onClick={() => handleBulkAction('SET_STANDBY')}
            style={{ padding: '0.3rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px', background: T.surface, color: '#3B82F6', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}>
            Set Standby
          </button>
          <button onClick={() => handleBulkAction('SET_GROUNDED')}
            style={{ padding: '0.3rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px', background: T.surface, color: T.red, fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}>
            Ground
          </button>
          <button onClick={() => handleBulkAction('EXPORT_SELECTED')}
            style={{ padding: '0.3rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px', background: T.surface, color: T.primary, fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}>
            Export
          </button>
        </div>
      )}

      {/* Fleet Table */}
      <div style={{
        overflowX: 'auto', borderRadius: '6px', border: `1px solid ${T.border}`,
      }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <thead>
            <tr>
              <th style={thStyle}>
                <input type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={handleSelectAll}
                  style={{ accentColor: T.primary }}
                />
              </th>
              {['Photo', 'Model', 'UIN', 'Category', 'TC', 'Insurance Expiry', 'Last Flight', 'Status', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(drone => (
              <tr key={drone.id}
                style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.primary + '08' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...tdStyle, width: '30px', textAlign: 'center' }}
                  onClick={e => e.stopPropagation()}>
                  <input type="checkbox"
                    checked={selectedIds.has(drone.id)}
                    onChange={() => toggleSelect(drone.id)}
                    style={{ accentColor: T.primary }}
                  />
                </td>
                <td style={{ ...tdStyle, width: '40px' }} onClick={() => setSelectedDrone(drone)}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '4px', background: T.surface,
                    border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '0.6rem', color: T.muted,
                  }}>
                    UAV
                  </div>
                </td>
                <td style={{ ...tdStyle, color: T.textBright, fontWeight: 600 }} onClick={() => setSelectedDrone(drone)}>
                  {drone.model}
                </td>
                <td style={{ ...tdStyle, color: T.primary }} onClick={() => setSelectedDrone(drone)}>
                  {drone.uin}
                </td>
                <td style={{ ...tdStyle, color: T.text }} onClick={() => setSelectedDrone(drone)}>
                  {drone.category}
                </td>
                <td style={{ ...tdStyle }} onClick={() => setSelectedDrone(drone)}>
                  {drone.typeCertificate ? (
                    <span style={{
                      color: isExpired(drone.tcExpiry) ? T.red : isExpiringSoon(drone.tcExpiry) ? T.amber : '#22C55E',
                      fontSize: '0.72rem',
                    }}>
                      {isExpired(drone.tcExpiry) ? 'EXPIRED' : isExpiringSoon(drone.tcExpiry) ? 'EXPIRING' : 'VALID'}
                    </span>
                  ) : (
                    <span style={{ color: T.muted }}>NONE</span>
                  )}
                </td>
                <td style={{ ...tdStyle }} onClick={() => setSelectedDrone(drone)}>
                  <span style={{
                    color: isExpired(drone.insuranceExpiry) ? T.red : isExpiringSoon(drone.insuranceExpiry) ? T.amber : T.text,
                  }}>
                    {fmtDate(drone.insuranceExpiry)}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: T.muted, whiteSpace: 'nowrap' }} onClick={() => setSelectedDrone(drone)}>
                  {fmtDate(drone.lastFlightDate)}
                </td>
                <td style={{ ...tdStyle }} onClick={() => setSelectedDrone(drone)}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                    background: STATUS_COLORS[drone.status] + '20',
                    color: STATUS_COLORS[drone.status],
                  }}>
                    {drone.status}
                  </span>
                </td>
                <td style={{ ...tdStyle }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedDrone(drone) }}
                    style={{
                      padding: '3px 8px', border: `1px solid ${T.border}`, borderRadius: '3px',
                      background: 'transparent', color: T.primary, fontSize: '0.7rem',
                      cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    View
                  </button>
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
          No drones match the current filters.
        </div>
      )}

      {/* Detail Drawer */}
      {selectedDrone && (
        <DroneDetailDrawer drone={selectedDrone} onClose={() => setSelectedDrone(null)} />
      )}
    </div>
  )
}

// ── Shared table styles ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
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

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: `1px solid ${T.border}`,
  fontFamily: "'JetBrains Mono', monospace",
}

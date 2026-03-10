// ── Zone Conflict Monitor Panel ──────────────────────────────────────────────
// Dashboard panel for PLATFORM_SUPER_ADMIN: India map with flight plan polygons,
// zone conflict alerts table, pending yellow zone badge, and detail drawer.
//
// Uses Leaflet loaded via CDN (index.html) — accessed as window.L.

import { useEffect, useState, useRef, useCallback } from 'react'
import { adminAxios } from '../hooks/useAdminAuth'
import { ZT } from '../theme'

declare const L: any

// ── Types ────────────────────────────────────────────────────────────────────

interface ZoneClassification {
  zone:          'GREEN' | 'YELLOW' | 'RED'
  reasons:       string[]
  atcAuthority?: string
}

interface MonitorPlan {
  id:                string
  planId:            string
  operatorId:        string
  droneSerialNumber: string
  uinNumber:         string | null
  areaType:          'POLYGON' | 'CIRCLE'
  areaGeoJson:       string | null
  centerLatDeg:      number | null
  centerLonDeg:      number | null
  radiusM:           number | null
  maxAltitudeAglM:   number
  status:            string
  purpose:           string
  remarks:           string | null
  rejectionReason:   string | null
  plannedStartUtc:   string
  plannedEndUtc:     string
  createdAt:         string
  submittedAt:       string | null
  approvedAt:        string | null
  approvedBy:        string | null
  zoneClassification: ZoneClassification
}

// ── Colour map for zone classification ───────────────────────────────────────

const ZONE_COLOUR: Record<string, string> = {
  GREEN:  '#00FF5F',
  YELLOW: '#FFB800',
  RED:    '#FF3B3B',
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:     ZT.muted,
  SUBMITTED: ZT.amber,
  APPROVED:  ZT.phosphor,
  REJECTED:  ZT.red,
  CANCELLED: '#666',
}

// ── Utility: format ISO date concisely ───────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Pending Yellow Zone Badge ────────────────────────────────────────────────

function PendingBadge({ count }: { count: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      background: count > 0 ? ZT.amber + '20' : ZT.surface,
      border: `1px solid ${count > 0 ? ZT.amber + '60' : ZT.border}`,
      borderRadius: '6px', padding: '0.5rem 1rem',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: count > 0 ? ZT.amber : ZT.muted,
        color: '#000', fontWeight: 700, fontSize: '0.85rem',
        borderRadius: '50%', width: '24px', height: '24px',
      }}>
        {count}
      </span>
      <span style={{ color: count > 0 ? ZT.amber : ZT.text, fontSize: '0.8rem', fontWeight: 600 }}>
        PENDING YELLOW ZONE APPROVALS
      </span>
    </div>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ plan, onClose }: { plan: MonitorPlan; onClose: () => void }) {
  const zc = plan.zoneClassification
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: '460px', height: '100vh',
      background: ZT.bg, borderLeft: `2px solid ${ZT.border}`,
      zIndex: 9999, overflow: 'auto',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 1.25rem', borderBottom: `1px solid ${ZT.border}`,
      }}>
        <span style={{ color: ZT.phosphor, fontWeight: 700, fontSize: '0.95rem', fontFamily: 'monospace' }}>
          FLIGHT PERMISSION DETAIL
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: `1px solid ${ZT.border}`, borderRadius: '4px',
          color: ZT.text, cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem',
        }}>
          CLOSE
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '1.25rem' }}>
        {/* Plan ID & Status */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <span style={{ color: ZT.phosphor, fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem' }}>
            {plan.planId}
          </span>
          <span style={{
            padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
            background: (STATUS_COLOUR[plan.status] ?? ZT.muted) + '25',
            color: STATUS_COLOUR[plan.status] ?? ZT.muted,
            border: `1px solid ${STATUS_COLOUR[plan.status] ?? ZT.muted}50`,
          }}>
            {plan.status}
          </span>
        </div>

        {/* Zone Classification Banner */}
        <div style={{
          background: (ZONE_COLOUR[zc.zone] ?? ZT.phosphor) + '12',
          border: `1px solid ${ZONE_COLOUR[zc.zone] ?? ZT.phosphor}40`,
          borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem',
          }}>
            <span style={{
              display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
              background: ZONE_COLOUR[zc.zone] ?? ZT.phosphor,
              boxShadow: `0 0 6px ${ZONE_COLOUR[zc.zone] ?? ZT.phosphor}`,
            }} />
            <span style={{
              color: ZONE_COLOUR[zc.zone] ?? ZT.phosphor, fontWeight: 700, fontSize: '0.85rem',
            }}>
              {zc.zone} ZONE
            </span>
            {zc.atcAuthority && (
              <span style={{ color: ZT.text, fontSize: '0.75rem', marginLeft: 'auto' }}>
                ATC: {zc.atcAuthority}
              </span>
            )}
          </div>
          {zc.reasons.map((r, i) => (
            <div key={i} style={{ color: ZT.text, fontSize: '0.75rem', marginTop: '0.2rem' }}>
              {r}
            </div>
          ))}
        </div>

        {/* Field grid */}
        <FieldGrid plan={plan} />
      </div>
    </div>
  )
}

function FieldGrid({ plan }: { plan: MonitorPlan }) {
  const fields: [string, string][] = [
    ['Application ID',     plan.planId],
    ['Operator ID',        plan.operatorId],
    ['Drone Serial',       plan.droneSerialNumber],
    ['UIN Number',         plan.uinNumber ?? '--'],
    ['Area Type',          plan.areaType],
    ['Purpose',            plan.purpose],
    ['Max Altitude (AGL)', `${plan.maxAltitudeAglM}m`],
    ['Planned Start',      fmtDate(plan.plannedStartUtc)],
    ['Planned End',        fmtDate(plan.plannedEndUtc)],
    ['Submitted At',       fmtDate(plan.submittedAt)],
    ['Approved At',        fmtDate(plan.approvedAt)],
    ['Approved By',        plan.approvedBy ?? '--'],
    ['Created At',         fmtDate(plan.createdAt)],
  ]

  if (plan.rejectionReason) {
    fields.push(['Rejection Reason', plan.rejectionReason])
  }
  if (plan.remarks) {
    fields.push(['Remarks', plan.remarks])
  }
  if (plan.areaType === 'CIRCLE') {
    fields.push(['Center Lat', String(plan.centerLatDeg ?? '--')])
    fields.push(['Center Lon', String(plan.centerLonDeg ?? '--')])
    fields.push(['Radius (m)', String(plan.radiusM ?? '--')])
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0',
      border: `1px solid ${ZT.border}`, borderRadius: '6px', overflow: 'hidden',
    }}>
      {fields.map(([label, value], i) => (
        <div key={i} style={{
          padding: '0.55rem 0.75rem',
          borderBottom: `1px solid ${ZT.border}`,
          borderRight: i % 2 === 0 ? `1px solid ${ZT.border}` : 'none',
          gridColumn: i === fields.length - 1 && fields.length % 2 === 1 ? 'span 2' : undefined,
        }}>
          <div style={{ fontSize: '0.65rem', color: ZT.muted, fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>
            {label}
          </div>
          <div style={{ fontSize: '0.8rem', color: ZT.textBright, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Conflict Alerts Table ────────────────────────────────────────────────────

function ConflictTable({
  alerts, onSelectPlan,
}: {
  alerts: MonitorPlan[]
  onSelectPlan: (plan: MonitorPlan) => void
}) {
  if (alerts.length === 0) {
    return (
      <div style={{
        padding: '1.5rem', textAlign: 'center', color: ZT.muted, fontSize: '0.85rem',
        background: ZT.surface, borderRadius: '6px', border: `1px solid ${ZT.border}`,
      }}>
        No zone conflict alerts in the last 24 hours.
      </div>
    )
  }

  const cols = ['Application ID', 'Pilot', 'Drone UIN', 'Zone', 'Authority', 'Status', 'Submitted At']

  return (
    <div style={{
      overflowX: 'auto', borderRadius: '6px', border: `1px solid ${ZT.border}`,
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
        fontFamily: 'monospace',
      }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                padding: '0.6rem 0.75rem', textAlign: 'left',
                background: ZT.surface, color: ZT.phosphor, fontWeight: 700,
                borderBottom: `2px solid ${ZT.border}`, fontSize: '0.7rem',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map(plan => {
            const zc = plan.zoneClassification
            return (
              <tr
                key={plan.id}
                onClick={() => onSelectPlan(plan)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = ZT.surface)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '0.55rem 0.75rem', color: ZT.phosphor, borderBottom: `1px solid ${ZT.border}` }}>
                  {plan.planId}
                </td>
                <td style={{ padding: '0.55rem 0.75rem', color: ZT.text, borderBottom: `1px solid ${ZT.border}` }}>
                  {plan.operatorId.slice(0, 12)}...
                </td>
                <td style={{ padding: '0.55rem 0.75rem', color: ZT.text, borderBottom: `1px solid ${ZT.border}` }}>
                  {plan.uinNumber ?? plan.droneSerialNumber}
                </td>
                <td style={{ padding: '0.55rem 0.75rem', borderBottom: `1px solid ${ZT.border}` }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontWeight: 700, fontSize: '0.7rem',
                    background: (ZONE_COLOUR[zc.zone] ?? ZT.muted) + '20',
                    color: ZONE_COLOUR[zc.zone] ?? ZT.muted,
                  }}>
                    {zc.zone}
                  </span>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', color: ZT.text, borderBottom: `1px solid ${ZT.border}` }}>
                  {zc.atcAuthority ?? '--'}
                </td>
                <td style={{ padding: '0.55rem 0.75rem', borderBottom: `1px solid ${ZT.border}` }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600,
                    color: STATUS_COLOUR[plan.status] ?? ZT.muted,
                  }}>
                    {plan.status}
                  </span>
                </td>
                <td style={{ padding: '0.55rem 0.75rem', color: ZT.text, borderBottom: `1px solid ${ZT.border}` }}>
                  {fmtDate(plan.submittedAt)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ZoneConflictMonitor({ token }: { token: string }) {
  const [plans, setPlans]             = useState<MonitorPlan[]>([])
  const [alerts, setAlerts]           = useState<MonitorPlan[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<MonitorPlan | null>(null)

  const mapRef         = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const layerGroupRef  = useRef<any>(null)

  // ── Fetch data ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await adminAxios(token).get('/zone-conflict-monitor')
      setPlans(data.plans24h ?? [])
      setAlerts(data.conflictAlerts ?? [])
      setPendingCount(data.pendingYellowCount ?? 0)
      setError(null)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to fetch zone monitor data')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Build Leaflet map ──────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || typeof (window as any).L === 'undefined') return

    const L = (window as any).L

    // Clean up previous
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    // India center view
    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([22.0, 78.5], 5)

    mapInstanceRef.current = map

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map)

    // Layer group for plan polygons
    const layerGroup = L.layerGroup().addTo(map)
    layerGroupRef.current = layerGroup

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // ── Plot plans on map ──────────────────────────────────────────────────

  useEffect(() => {
    if (!layerGroupRef.current || typeof (window as any).L === 'undefined') return
    const L = (window as any).L
    const layerGroup = layerGroupRef.current

    layerGroup.clearLayers()

    // Group plans by approximate grid cell (0.5 deg grid) for clustering
    const gridClusters: Record<string, MonitorPlan[]> = {}

    plans.forEach(plan => {
      let lat = 20.5, lng = 78.9 // fallback center of India

      if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
        lat = plan.centerLatDeg
        lng = plan.centerLonDeg
      } else if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
        try {
          const geo = JSON.parse(plan.areaGeoJson)
          if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
            const coords = geo.coordinates[0]
            lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
            lng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
          }
        } catch { /* skip */ }
      }

      const gridKey = `${Math.floor(lat * 2) / 2}_${Math.floor(lng * 2) / 2}`
      if (!gridClusters[gridKey]) gridClusters[gridKey] = []
      gridClusters[gridKey].push(plan)
    })

    Object.values(gridClusters).forEach(clusterPlans => {
      if (clusterPlans.length > 5) {
        // Cluster marker
        let clat = 0, clng = 0
        clusterPlans.forEach(p => {
          if (p.areaType === 'CIRCLE' && p.centerLatDeg != null && p.centerLonDeg != null) {
            clat += p.centerLatDeg; clng += p.centerLonDeg
          } else {
            clat += 20.5; clng += 78.9
          }
        })
        clat /= clusterPlans.length
        clng /= clusterPlans.length

        const clusterIcon = L.divIcon({
          className: '',
          html: `<div style="
            background: ${ZT.surface};
            border: 2px solid ${ZT.phosphor};
            border-radius: 50%;
            width: 36px; height: 36px;
            display: flex; align-items: center; justify-content: center;
            color: ${ZT.phosphor}; font-weight: 700; font-size: 14px;
            font-family: monospace;
            box-shadow: 0 0 10px ${ZT.phosphor}40;
            cursor: pointer;
          ">${clusterPlans.length}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })

        const marker = L.marker([clat, clng], { icon: clusterIcon }).addTo(layerGroup)

        // Build popup content with plan list
        const popupContent = `
          <div style="background:${ZT.bg};color:${ZT.textBright};font-family:monospace;font-size:12px;padding:8px;max-height:200px;overflow:auto;border-radius:4px;">
            <div style="color:${ZT.phosphor};font-weight:700;margin-bottom:6px;">${clusterPlans.length} PLANS IN AREA</div>
            ${clusterPlans.map(p => `
              <div style="padding:3px 0;border-bottom:1px solid ${ZT.border};">
                <span style="color:${ZONE_COLOUR[p.zoneClassification.zone]};">[${p.zoneClassification.zone}]</span>
                ${p.planId} - ${p.status}
              </div>
            `).join('')}
          </div>
        `
        marker.bindPopup(popupContent, {
          className: 'zcm-popup',
          maxWidth: 300,
        })
      } else {
        // Individual plan markers/polygons
        clusterPlans.forEach(plan => {
          const zoneColor = ZONE_COLOUR[plan.zoneClassification.zone] ?? ZT.phosphor
          const statusLabel = plan.status

          if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
            try {
              const geo = JSON.parse(plan.areaGeoJson)
              const polygon = L.geoJSON(geo, {
                style: {
                  color: zoneColor,
                  fillColor: zoneColor,
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: plan.status === 'REJECTED' ? '6,4' : undefined,
                },
              }).addTo(layerGroup)

              polygon.bindPopup(`
                <div style="background:${ZT.bg};color:${ZT.textBright};font-family:monospace;font-size:12px;padding:8px;border-radius:4px;">
                  <div style="color:${zoneColor};font-weight:700;">${plan.planId}</div>
                  <div>Zone: <span style="color:${zoneColor}">${plan.zoneClassification.zone}</span></div>
                  <div>Status: ${statusLabel}</div>
                  <div>Purpose: ${plan.purpose}</div>
                  <div>Alt: ${plan.maxAltitudeAglM}m AGL</div>
                </div>
              `, { className: 'zcm-popup' })
            } catch { /* skip bad GeoJSON */ }
          } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
            L.circle([plan.centerLatDeg, plan.centerLonDeg], {
              radius: plan.radiusM ?? 500,
              color: zoneColor,
              fillColor: zoneColor,
              fillOpacity: 0.15,
              weight: 2,
              dashArray: plan.status === 'REJECTED' ? '6,4' : undefined,
            }).addTo(layerGroup).bindPopup(`
              <div style="background:${ZT.bg};color:${ZT.textBright};font-family:monospace;font-size:12px;padding:8px;border-radius:4px;">
                <div style="color:${zoneColor};font-weight:700;">${plan.planId}</div>
                <div>Zone: <span style="color:${zoneColor}">${plan.zoneClassification.zone}</span></div>
                <div>Status: ${statusLabel}</div>
                <div>Purpose: ${plan.purpose}</div>
                <div>Alt: ${plan.maxAltitudeAglM}m AGL</div>
              </div>
            `, { className: 'zcm-popup' })
          }
        })
      }
    })
  }, [plans])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      background: ZT.bg, border: `1px solid ${ZT.border}`, borderRadius: '8px',
      padding: '1.25rem', marginTop: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            color: ZT.phosphor, fontWeight: 700, fontSize: '1rem', fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}>
            ZONE CONFLICT MONITOR
          </span>
          <span style={{
            color: ZT.muted, fontSize: '0.7rem', fontFamily: 'monospace',
          }}>
            LAST 24H
          </span>
        </div>
        <PendingBadge count={pendingCount} />
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: ZT.muted, fontFamily: 'monospace' }}>
          LOADING ZONE DATA...
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem', background: ZT.red + '15', border: `1px solid ${ZT.red}40`,
          borderRadius: '6px', color: ZT.red, fontSize: '0.85rem', marginBottom: '1rem',
        }}>
          ERROR: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Legend */}
          <div style={{
            display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', flexWrap: 'wrap',
          }}>
            {[
              { zone: 'GREEN', label: 'Auto-approved' },
              { zone: 'YELLOW', label: 'Pending ATC' },
              { zone: 'RED', label: 'Rejected / Flagged' },
            ].map(({ zone, label }) => (
              <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{
                  display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px',
                  background: ZONE_COLOUR[zone],
                }} />
                <span style={{ color: ZT.text, fontSize: '0.72rem', fontFamily: 'monospace' }}>
                  {zone} = {label}
                </span>
              </div>
            ))}
          </div>

          {/* Map */}
          <div
            ref={mapRef}
            style={{
              height: '400px', width: '100%', borderRadius: '6px',
              border: `1px solid ${ZT.border}`, overflow: 'hidden',
              marginBottom: '1.25rem',
            }}
          />

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap',
          }}>
            {[
              { label: 'TOTAL PLANS (24H)', value: plans.length, colour: ZT.phosphor },
              { label: 'GREEN ZONE', value: plans.filter(p => p.zoneClassification.zone === 'GREEN').length, colour: ZONE_COLOUR.GREEN },
              { label: 'YELLOW ZONE', value: plans.filter(p => p.zoneClassification.zone === 'YELLOW').length, colour: ZONE_COLOUR.YELLOW },
              { label: 'RED ZONE', value: plans.filter(p => p.zoneClassification.zone === 'RED').length, colour: ZONE_COLOUR.RED },
            ].map(({ label, value, colour }) => (
              <div key={label} style={{
                flex: 1, minWidth: '120px', background: ZT.surface,
                border: `1px solid ${ZT.border}`, borderRadius: '6px',
                padding: '0.75rem 1rem',
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

          {/* Conflict Alerts Table */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              color: ZT.phosphor, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace',
              marginBottom: '0.5rem', letterSpacing: '0.04em',
            }}>
              ZONE CONFLICT ALERTS
            </div>
            <ConflictTable alerts={alerts} onSelectPlan={setSelectedPlan} />
          </div>
        </>
      )}

      {/* Detail Drawer (overlay) */}
      {selectedPlan && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedPlan(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', zIndex: 9998,
            }}
          />
          <DetailDrawer plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
        </>
      )}

      {/* Popup styling override for dark theme */}
      <style>{`
        .zcm-popup .leaflet-popup-content-wrapper {
          background: ${ZT.bg} !important;
          border: 1px solid ${ZT.border} !important;
          border-radius: 6px !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
          color: ${ZT.textBright} !important;
        }
        .zcm-popup .leaflet-popup-tip {
          background: ${ZT.bg} !important;
          border: 1px solid ${ZT.border} !important;
        }
        .zcm-popup .leaflet-popup-close-button {
          color: ${ZT.phosphor} !important;
        }
      `}</style>
    </div>
  )
}

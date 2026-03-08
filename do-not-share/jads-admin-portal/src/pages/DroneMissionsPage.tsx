import { useEffect, useState, useCallback, useRef } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

const T = {
  bg:       '#050A08',
  surface:  '#0A120E',
  border:   '#1A3020',
  primary:  '#00FF88',
  amber:    '#FFB800',
  red:      '#FF3B3B',
  muted:    '#4A7A5A',
  text:     '#b0c8b8',
  textBright: '#d0e8d8',
}

interface DroneMission {
  id: string
  missionId: string
  operatorId: string
  operatorType: string
  deviceId: string
  deviceModel: string | null
  npntClassification: string
  uploadStatus: string
  missionStartUtcMs: string
  missionEndUtcMs: string | null
  ntpSyncStatus: string
  chainVerifiedByServer: boolean
  certValidAtStart: boolean
  uploadedAt: string
  droneWeightCategory: string
  droneManufacturer: string | null
  droneSerialNumber: string | null
  recordCount: number
  violationCount: number
}

interface MissionDetail {
  id: string; missionId: string; operatorId: string; operatorType: string
  deviceId: string; deviceModel: string | null; npntClassification: string
  uploadStatus: string; missionStartUtcMs: string; missionEndUtcMs: string | null
  ntpSyncStatus: string; ntpOffsetMs: number | null
  chainVerifiedByServer: boolean; chainFailureSequence: number | null
  certValidAtStart: boolean; certExpiryUtcMs: string | null
  uploadedAt: string; isDuplicate: boolean; duplicateOfMissionId: string | null
  strongboxBacked: boolean | null; secureBootVerified: boolean | null
  androidVersionAtUpload: string | null; sensorHealthSummaryFlags: number | null
  recordsWithDegradedGps: number | null
  droneWeightCategory: string; droneWeightGrams: number | null
  droneManufacturer: string | null; droneSerialNumber: string | null
  nanoAckNumber: string | null; uinNumber: string | null; npntExempt: boolean
  permissionArtefactId: string[]
  manufacturerPushId: string | null; manufacturerSource: string | null
  pqcPublicKeyHex: string | null
  _count: { telemetryRecords: number }
  violations: {
    id: string; missionId: string; sequence: string
    violationType: string; severity: string
    timestampUtcMs: string; detailJson: string
  }[]
}

declare const L: any

interface TrackPoint {
  sequence: number
  decoded: {
    latitudeDeg: number; longitudeDeg: number; altitudeM: number
    altitudeDisplay: string; speedMps: number; headingDeg: number
    timestampUtcMs: number
  } | null
}
interface TrackBbox { minLat: number; maxLat: number; minLon: number; maxLon: number }

const NPNT_COLOUR: Record<string, string> = {
  GREEN: '#00FF88', YELLOW: '#FFB800', RED: '#FF3B3B',
}
const UPLOAD_COLOUR: Record<string, string> = {
  PENDING: '#FFB800', VERIFIED: '#00FF88', FAILED: '#FF3B3B', REJECTED: '#FF3B3B',
}
const SEVERITY_COLOUR: Record<string, string> = {
  CRITICAL: '#FF3B3B', HIGH: '#FFB800', MEDIUM: '#FFB800', LOW: '#4A7A5A', WARNING: '#FFB800',
}

function fmtMs(ms: string | null | undefined): string {
  if (!ms) return '—'
  try { return new Date(parseInt(ms)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' }
  catch { return ms }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' }
  catch { return d }
}

function durationMin(startMs: string, endMs: string | null): string {
  if (!endMs) return '—'
  const mins = Math.round((parseInt(endMs) - parseInt(startMs)) / 60000)
  return `${mins} min`
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailPanel({ missionId, token, onClose }: {
  missionId: string; token: string; onClose: () => void
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [track, setTrack]     = useState<TrackPoint[]>([])
  const [bbox, setBbox]       = useState<TrackBbox | null>(null)
  const [opPlan, setOpPlan]   = useState<any>(null) // matching DroneOperationPlan
  const mapRef = useRef<HTMLDivElement | null>(null)
  const leafletMapRef = useRef<any>(null)

  useEffect(() => {
    const ax = adminAxios(token)
    Promise.all([
      ax.get(`/drone-missions/${missionId}`),
      ax.get(`/drone-missions/${missionId}/decoded-track`),
    ])
      .then(([mRes, tRes]) => {
        const m = mRes.data.mission ?? mRes.data
        setMission(m)
        setTrack(tRes.data.track ?? [])
        setBbox(tRes.data.bbox ?? null)
        // Try to find a matching operation plan for this drone
        ax.get('/drone-plans').then(r => {
          const plans = r.data.plans ?? []
          const match = plans.find((p: any) =>
            p.operatorId === m.operatorId &&
            p.droneSerialNumber === m.droneSerialNumber &&
            p.status === 'APPROVED'
          )
          if (match) setOpPlan(match)
        }).catch(() => {}) // non-critical
      })
      .catch(e => setError(e.response?.data?.error ?? 'FETCH_FAILED'))
      .finally(() => setLoading(false))
  }, [missionId, token])

  // ── Build Leaflet map ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || track.length === 0 || !mission) return
    if (typeof L === 'undefined') return

    if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null }

    const validPts = track.filter(t => t.decoded?.latitudeDeg != null)
    if (validPts.length === 0) return

    const map = L.map(mapRef.current)
    leafletMapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)

    const latlngs = validPts.map((t: TrackPoint) => [t.decoded!.latitudeDeg, t.decoded!.longitudeDeg])

    // Track polyline — amber
    L.polyline(latlngs, { color: T.amber, weight: 2.5, opacity: 0.85 }).addTo(map)

    // Start marker — green
    L.circleMarker(latlngs[0], { radius: 8, fillColor: T.primary, color: T.bg, fillOpacity: 1, weight: 2 })
      .bindTooltip('Mission Start').addTo(map)

    // End marker — muted
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, fillColor: T.muted, color: T.bg, fillOpacity: 1, weight: 2 })
      .bindTooltip('Mission End').addTo(map)

    // Track points
    validPts.forEach((pt: TrackPoint) => {
      L.circleMarker(
        [pt.decoded!.latitudeDeg, pt.decoded!.longitudeDeg],
        { radius: 3, fillColor: T.amber, color: T.bg, fillOpacity: 0.6, weight: 1 }
      ).bindTooltip(`Seq ${pt.sequence} · ${pt.decoded!.altitudeDisplay}`).addTo(map)
    })

    // Violation markers — labelled with type + timestamp directly on map
    const VTYPE_ABBR: Record<string, string> = {
      GEOFENCE_BREACH: 'GEO', ALTITUDE_VIOLATION: 'ALT', TIME_WINDOW_VIOLATION: 'TIME',
      ZONE_INCURSION: 'ZONE', GNSS_REJECTED: 'GNSS', AGL_EXCEEDED: 'AGL',
    }
    mission.violations.forEach(v => {
      const pt = validPts.find((t: TrackPoint) => t.sequence === Number(v.sequence))
      if (!pt) return
      const ts = v.timestampUtcMs ? new Date(parseInt(v.timestampUtcMs)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'
      const tsShort = v.timestampUtcMs ? new Date(parseInt(v.timestampUtcMs)).toISOString().slice(11, 16) : ''
      const abbr = VTYPE_ABBR[v.violationType] ?? v.violationType.slice(0, 4).toUpperCase()
      const col = SEVERITY_COLOUR[v.severity] ?? T.red
      let detailExcerpt = ''
      try { const d = JSON.parse(v.detailJson); detailExcerpt = JSON.stringify(d, null, 2).slice(0, 200) } catch { detailExcerpt = v.detailJson?.slice(0, 200) ?? '' }

      // Labelled marker with severity-coloured icon + type abbreviation + time
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap">` +
          `<div style="width:16px;height:16px;border-radius:50%;background:${col};border:2px solid ${T.bg};box-shadow:0 0 4px ${col}80"></div>` +
          `<span style="font-family:monospace;font-size:10px;font-weight:700;color:${col};text-shadow:0 0 3px #000,0 0 6px #000,1px 1px 2px #000;letter-spacing:0.03em">${abbr} ${tsShort}</span>` +
          `</div>`,
        iconSize: [100, 20],
        iconAnchor: [8, 10],
      })
      L.marker(
        [pt.decoded!.latitudeDeg, pt.decoded!.longitudeDeg],
        { icon, zIndexOffset: 1000 }
      )
        .bindTooltip(`${v.violationType} (${v.severity}) · ${ts}`)
        .bindPopup(
          `<div style="font-family:monospace;font-size:12px;max-width:300px">` +
          `<b style="color:${col}">${v.severity} — ${v.violationType}</b><br/>` +
          `<b>Seq:</b> ${v.sequence}<br/>` +
          `<b>Time:</b> ${ts}<br/>` +
          (detailExcerpt ? `<pre style="font-size:10px;max-height:120px;overflow:auto;margin:4px 0;background:#111;padding:4px;border-radius:3px;color:#b0c8b8">${detailExcerpt}</pre>` : '') +
          `</div>`,
          { maxWidth: 350 }
        )
        .addTo(map)
    })

    // Operation area boundary overlay (from matching DroneOperationPlan)
    if (opPlan) {
      const areaStyle = { color: '#00AAFF', fillColor: '#00AAFF', fillOpacity: 0.08, weight: 2, dashArray: '6 4' }
      if (opPlan.areaType === 'POLYGON' && opPlan.areaGeoJson) {
        try {
          const geo = JSON.parse(opPlan.areaGeoJson)
          L.geoJSON(geo, { style: areaStyle }).addTo(map)
            .bindTooltip(`Approved Op Area: ${opPlan.planId}`, { sticky: true })
        } catch { /* ignore parse errors */ }
      } else if (opPlan.areaType === 'CIRCLE' && opPlan.centerLatDeg != null) {
        L.circle([opPlan.centerLatDeg, opPlan.centerLonDeg], {
          ...areaStyle, radius: opPlan.radiusM ?? 500,
        }).addTo(map).bindTooltip(`Approved Op Area: ${opPlan.planId} (${opPlan.radiusM}m R)`, { sticky: true })
      }
    }

    if (bbox) {
      map.fitBounds([[bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]], { padding: [20, 20] })
    } else {
      map.fitBounds(latlngs as any, { padding: [20, 20] })
    }

    return () => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null } }
  }, [track, mission, bbox, opPlan])

  const row = (label: string, value: string | null | undefined, colour?: string) => (
    <div style={{ display: 'flex', padding: '0.35rem 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ width: '170px', flexShrink: 0, color: T.muted, fontSize: '0.78rem' }}>{label}</span>
      <span style={{ color: colour ?? T.textBright, fontSize: '0.82rem', fontFamily: 'monospace',
        wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )

  const boolRow = (label: string, value: boolean | null | undefined) => {
    const v = value === true ? 'YES' : value === false ? 'NO' : '—'
    const c = value === true ? T.primary : value === false ? T.red : T.muted
    return row(label, v, c)
  }

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: T.primary, marginBottom: '0.4rem',
        borderBottom: `1px solid ${T.border}`, paddingBottom: '0.3rem', letterSpacing: '0.04em' }}>
        {title}
      </div>
      {children}
    </div>
  )

  const m = mission

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: T.surface, borderRadius: '8px', width: '960px', maxWidth: '95vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: `0 8px 32px rgba(0,255,136,0.1)`, border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: T.textBright }}>
              {m?.missionId ?? 'Drone Mission'}
            </span>
            {m && (
              <>
                <span style={{ color: NPNT_COLOUR[m.npntClassification] ?? T.muted, fontWeight: 600,
                  fontSize: '0.8rem', padding: '0.15rem 0.5rem',
                  background: (NPNT_COLOUR[m.npntClassification] ?? T.muted) + '18',
                  borderRadius: '3px' }}>
                  {m.npntClassification}
                </span>
                <span style={{ color: UPLOAD_COLOUR[m.uploadStatus] ?? T.muted, fontWeight: 600,
                  fontSize: '0.75rem', padding: '0.15rem 0.5rem',
                  background: (UPLOAD_COLOUR[m.uploadStatus] ?? T.muted) + '18',
                  borderRadius: '3px' }}>
                  {m.uploadStatus}
                </span>
              </>
            )}
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: '1.25rem',
              cursor: 'pointer', color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
          {loading && <div style={{ color: T.muted, padding: '2rem', textAlign: 'center' }}>Loading...</div>}
          {error && <div style={{ color: T.red, padding: '1rem', background: T.red + '15',
            border: `1px solid ${T.red}40`, borderRadius: '4px' }}>{error}</div>}

          {m && (<>
            {/* Map */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: T.primary, marginBottom: '0.4rem',
                borderBottom: `1px solid ${T.border}`, paddingBottom: '0.3rem', letterSpacing: '0.04em' }}>
                FLIGHT TRACK MAP
              </div>
              <div ref={mapRef} style={{
                height: '320px', borderRadius: '6px', border: `1px solid ${T.border}`,
                background: T.bg,
              }} />
              {track.length === 0 && !loading && (
                <div style={{ color: T.muted, fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  No decoded track data available for this mission.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1.25rem' }}>
              {/* Left column */}
              <div style={{ flex: 2 }}>
                {section('MISSION', <>
                  {row('Mission ID', m.missionId)}
                  {row('Start', fmtMs(m.missionStartUtcMs))}
                  {row('End', fmtMs(m.missionEndUtcMs))}
                  {row('Duration', durationMin(m.missionStartUtcMs, m.missionEndUtcMs))}
                  {row('Records', m._count.telemetryRecords.toString())}
                  {row('Violations', m.violations.length.toString(),
                    m.violations.length > 0 ? T.red : T.primary)}
                  {row('Upload Status', m.uploadStatus, UPLOAD_COLOUR[m.uploadStatus])}
                  {row('Uploaded At', fmtDate(m.uploadedAt))}
                </>)}

                {section('OPERATOR & DEVICE', <>
                  {row('Operator ID', m.operatorId)}
                  {row('Operator Type', m.operatorType)}
                  {row('Device ID', m.deviceId)}
                  {row('Device Model', m.deviceModel)}
                  {row('Android Version', m.androidVersionAtUpload)}
                </>)}

                {section('DRONE DETAILS', <>
                  {row('Weight Category', m.droneWeightCategory)}
                  {row('Weight (grams)', m.droneWeightGrams?.toString())}
                  {row('Manufacturer', m.droneManufacturer)}
                  {row('Serial Number', m.droneSerialNumber)}
                  {row('UIN Number', m.uinNumber)}
                  {row('Nano Ack Number', m.nanoAckNumber)}
                  {boolRow('NPNT Exempt', m.npntExempt)}
                  {row('Manufacturer Push ID', m.manufacturerPushId)}
                  {row('Manufacturer Source', m.manufacturerSource)}
                </>)}

                {/* Violations list */}
                {m.violations.length > 0 && section('VIOLATIONS', (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {m.violations.map(v => (
                      <div key={v.id} style={{
                        background: (SEVERITY_COLOUR[v.severity] ?? T.muted) + '10',
                        borderLeft: `3px solid ${SEVERITY_COLOUR[v.severity] ?? T.muted}`,
                        borderRadius: '4px', padding: '0.5rem 0.75rem', fontSize: '0.8rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 600, color: SEVERITY_COLOUR[v.severity] }}>
                            {v.severity} — {v.violationType}
                          </span>
                          <span style={{ color: T.muted, fontSize: '0.72rem' }}>
                            Seq {v.sequence}
                          </span>
                        </div>
                        <div style={{ color: T.muted, fontSize: '0.72rem' }}>
                          {fmtMs(v.timestampUtcMs)}
                        </div>
                        {v.detailJson && (
                          <div style={{ color: T.text, fontSize: '0.72rem', marginTop: '0.2rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.detailJson}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Right column */}
              <div style={{ width: '280px', flexShrink: 0 }}>
                {section('NPNT & COMPLIANCE', <>
                  {row('Classification', m.npntClassification, NPNT_COLOUR[m.npntClassification])}
                  {boolRow('Cert Valid at Start', m.certValidAtStart)}
                  {row('Cert Expiry', fmtMs(m.certExpiryUtcMs))}
                  {m.permissionArtefactId && m.permissionArtefactId.length > 0 &&
                    row('Permission Artefacts', m.permissionArtefactId.join(', '))}
                </>)}

                {section('INTEGRITY', <>
                  {boolRow('Chain Verified', m.chainVerifiedByServer)}
                  {m.chainFailureSequence !== null &&
                    row('Chain Failure Seq', m.chainFailureSequence.toString(), T.red)}
                  {row('NTP Sync', m.ntpSyncStatus,
                    m.ntpSyncStatus === 'SYNCED' ? T.primary : T.amber)}
                  {m.ntpOffsetMs !== null &&
                    row('NTP Offset', `${m.ntpOffsetMs} ms`)}
                  {boolRow('Duplicate', m.isDuplicate)}
                  {m.duplicateOfMissionId &&
                    row('Duplicate Of', m.duplicateOfMissionId)}
                </>)}

                {section('HARDWARE SECURITY', <>
                  {boolRow('Strongbox Backed', m.strongboxBacked)}
                  {boolRow('Secure Boot', m.secureBootVerified)}
                  {m.sensorHealthSummaryFlags !== null &&
                    row('Sensor Health Flags', `0x${m.sensorHealthSummaryFlags.toString(16)}`)}
                  {m.recordsWithDegradedGps !== null &&
                    row('Degraded GPS Records', m.recordsWithDegradedGps.toString(),
                      m.recordsWithDegradedGps > 0 ? T.amber : T.primary)}
                </>)}

                {m.pqcPublicKeyHex && section('PQC (ML-DSA-65)', <>
                  <pre style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
                    padding: '0.5rem', fontSize: '0.65rem', color: T.muted, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all', fontFamily: 'monospace', margin: 0, maxHeight: '80px',
                    overflow: 'auto' }}>
                    {m.pqcPublicKeyHex}
                  </pre>
                </>)}
              </div>
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose}
            style={{ padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.text, fontSize: '0.875rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DroneMissionsPage() {
  const { token, logout } = useAdminAuth()
  const [missions, setMissions]   = useState<DroneMission[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [detailId, setDetailId]   = useState<string | null>(null)

  const fetchMissions = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, any> = { page, limit: 30 }
      if (statusFilter) params.status = statusFilter
      if (search)       params.search = search
      const { data } = await adminAxios(token).get('/drone-missions', { params })
      setMissions(data.missions ?? [])
      setTotal(data.total ?? 0)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, statusFilter, search, logout])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchMissions() }, 400)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, color: T.textBright }}>Drone Missions</h2>
        <span style={{ fontSize: '0.8rem', color: T.muted }}>{total} total</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          placeholder="Search mission ID, device, operator..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', flex: 1, minWidth: '200px',
            background: T.surface, color: T.text }}
        />
        <select value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            background: T.surface, color: T.text }}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="FAILED">Failed</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button onClick={fetchMissions}
          style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface, color: T.text }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: T.muted, marginBottom: '1rem' }}>Loading...</div>}
      {!loading && !error && missions.length === 0 && (
        <div style={{ color: T.muted, padding: '3rem', textAlign: 'center' }}>
          No drone missions found.
        </div>
      )}

      {/* Table */}
      {!loading && missions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: T.surface, borderBottom: `2px solid ${T.border}` }}>
                {['Mission ID', 'Device', 'NPNT', 'Status', 'Start', 'Duration',
                  'Records', 'Violations', 'Chain', 'Operator', 'Uploaded'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem',
                    textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', color: T.textBright }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                  onClick={() => setDetailId(m.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = T.primary + '08')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace',
                    fontWeight: 600, fontSize: '0.78rem', color: T.textBright }}>
                    {m.missionId.slice(0, 16)}...
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: T.text }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{m.deviceId.slice(0, 12)}...</div>
                    {m.deviceModel && <div style={{ fontSize: '0.68rem', color: T.muted }}>{m.deviceModel}</div>}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: NPNT_COLOUR[m.npntClassification] ?? T.muted,
                      fontWeight: 600, fontSize: '0.8rem' }}>
                      {m.npntClassification}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      color: UPLOAD_COLOUR[m.uploadStatus] ?? T.muted,
                      fontWeight: 500, fontSize: '0.8rem',
                      background: (UPLOAD_COLOUR[m.uploadStatus] ?? T.muted) + '18',
                      padding: '0.15rem 0.45rem', borderRadius: '3px',
                    }}>
                      {m.uploadStatus}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', color: T.text }}>
                    {fmtMs(m.missionStartUtcMs).slice(0, 16)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: T.text }}>
                    {durationMin(m.missionStartUtcMs, m.missionEndUtcMs)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace',
                    fontSize: '0.8rem', color: T.text }}>
                    {m.recordCount}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace',
                    fontSize: '0.8rem', color: m.violationCount > 0 ? T.red : T.primary, fontWeight: 600 }}>
                    {m.violationCount}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      color: m.chainVerifiedByServer ? T.primary : T.red,
                      fontSize: '0.75rem', fontWeight: 600,
                    }}>
                      {m.chainVerifiedByServer ? 'OK' : 'FAIL'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: T.text }}>
                    {m.operatorType}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem',
                    color: T.muted, whiteSpace: 'nowrap' }}>
                    {new Date(m.uploadedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Prev
        </button>
        <span style={{ fontSize: '0.85rem', color: T.text }}>Page {page} · {total} total</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: page * 30 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 30 >= total ? 0.5 : 1,
            background: 'transparent', color: T.text }}>
          Next
        </button>
      </div>

      {/* Detail Modal */}
      {detailId && token && (
        <DetailPanel missionId={detailId} token={token} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

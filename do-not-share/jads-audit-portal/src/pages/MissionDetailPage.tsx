import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate }              from 'react-router-dom'
import { useAuditAuth, auditAxios, droneAxios } from '../hooks/useAuditAuth'

// ── Leaflet loaded via CDN in public/index.html — NOT via npm install.
// Government installations must not depend on commercial map APIs.
declare const L: any

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface DecodedFields {
  latitudeDeg:      number
  longitudeDeg:     number
  latitudeDisplay:  string
  longitudeDisplay: string
  altitudeDisplay:  string
  altitudeM:        number
  groundspeedKph:   number
  timestampIso:     string
  npntClassLabel:   string
  satelliteCount:   number
  fixTypeLabel:     string
  hdop:             number
  crc32Valid:       boolean
}

interface TrackPoint {
  sequence:     number
  gnssStatus:   string
  chainHashHex: string
  signatureHex: string
  decoded:      DecodedFields
  decodeError?: string
}

interface Violation {
  id:             string
  sequence:       number
  violationType:  string
  severity:       string
  timestampUtcMs: string
  detailJson:     string
}

interface Mission {
  id:                      string
  missionId:               string
  operatorId:              string
  operatorType:            string
  deviceId:                string
  deviceModel:             string | null
  npntClassification:      string
  permissionArtefactId:    string | null
  missionStartUtcMs:       string
  missionEndUtcMs:         string | null
  chainVerifiedByServer:   boolean
  chainFailureSequence:    number | null
  certValidAtStart:        boolean
  certExpiryUtcMs:         string | null
  ntpSyncStatus:           string
  ntpOffsetMs:             number | null
  archivedCrlBase64:       string | null
  isDuplicate:             boolean
  strongboxBacked:         boolean | null
  secureBootVerified:      boolean | null
  androidVersionAtUpload:  string | null
  sensorHealthSummaryFlags: number | null
  recordsWithDegradedGps:  number | null
  uploadedAt:              string
}

// 8 invariants — each has a pass/fail state and an explanation
interface InvariantResult {
  label:       string          // short name shown in panel
  description: string          // what this invariant checks
  passed:      boolean
  detail:      string          // why it passed or failed
  critical:    boolean         // CRITICAL invariants turn the panel red
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SEVERITY_COLOURS: Record<string, string> = {
  CRITICAL: '#FF3B3B',
  HIGH:     '#FFB800',
  MEDIUM:   '#FFB800',
  WARNING:  '#FFB800',
  LOW:      '#6A6040',
}

const NPNT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  GREEN:      { bg: '#00FF88' + '15', color: '#00FF88', border: '#00FF88' + '40' },
  YELLOW:     { bg: '#FFB800' + '15', color: '#FFB800', border: '#FFB800' + '40' },
  RED:        { bg: '#FF3B3B' + '15', color: '#FF3B3B', border: '#FF3B3B' + '40' },
  DJI_IMPORT: { bg: '#4A9EFF' + '15', color: '#4A9EFF', border: '#4A9EFF' + '40' },
}

// ── 8-Invariant Evaluator ─────────────────────────────────────────────────────
//
// These are the same 8 invariants checked server-side in ForensicVerifier.ts.
// The UI re-evaluates them from available data so the panel is self-contained
// and shows the investigator exactly which check failed and why.

function evaluateInvariants(
  mission: Mission,
  track: TrackPoint[],
  violations: Violation[],
): InvariantResult[] {

  // I-1: Hash chain integrity
  const chainOk = mission.chainVerifiedByServer && mission.chainFailureSequence == null
  const inv1: InvariantResult = {
    label:       'I-1 Hash Chain (ISO 27037)',
    description: 'Every record\'s SHA-256 hash correctly chains from the previous record.',
    passed:      chainOk,
    critical:    true,
    detail:      chainOk
      ? `All ${track.length} records form an unbroken hash chain.`
      : `Chain broken at sequence ${mission.chainFailureSequence ?? '?'}. Possible tampering or replay.`,
  }

  // I-2: NTP time integrity
  const ntpOk   = mission.ntpSyncStatus === 'SYNCED'
  const ntpWarn = mission.ntpSyncStatus === 'DEGRADED'
  const inv2: InvariantResult = {
    label:       'I-2 Time Sync (RFC 3161)',
    description: 'Device clock was synchronised to NTP quorum before mission start.',
    passed:      ntpOk || ntpWarn,
    critical:    !ntpOk && !ntpWarn,
    detail:      ntpOk
      ? `Synced. Offset: ${mission.ntpOffsetMs ?? 0}ms.`
      : ntpWarn
        ? `Degraded. Offset: ${mission.ntpOffsetMs ?? '?'}ms — within tolerance but flagged.`
        : `FAILED — NTP sync not established. Timestamps are unreliable.`,
  }

  // I-3: Device certificate validity
  const certOk = mission.certValidAtStart
  const inv3: InvariantResult = {
    label:       'I-3 Device Certificate (CCA PKI)',
    description: 'The device\'s ECDSA P-256 certificate was valid and non-revoked at mission start.',
    passed:      certOk,
    critical:    true,
    detail:      certOk
      ? `Certificate valid at mission start.${mission.certExpiryUtcMs
          ? ` Expires: ${new Date(Number(mission.certExpiryUtcMs)).toISOString().slice(0, 10)}.`
          : ''}`
      : 'Certificate was invalid or revoked at mission start. Signatures cannot be trusted.',
  }

  // I-4: CRL archived
  const crlOk = mission.archivedCrlBase64 != null
  const inv4: InvariantResult = {
    label:       'I-4 CRL Archived (RFC 5280)',
    description: 'The Certificate Revocation List was archived at upload time for post-facto verification.',
    passed:      crlOk,
    critical:    false,
    detail:      crlOk
      ? 'CRL snapshot archived. Future revocation checks are possible.'
      : 'CRL not archived. Post-facto revocation verification will not be possible.',
  }

  // I-5: No duplicate mission
  const dupOk = !mission.isDuplicate
  const inv5: InvariantResult = {
    label:       'I-5 No Duplicate (ISO 27042)',
    description: 'This mission ID has not been submitted previously (replay protection).',
    passed:      dupOk,
    critical:    true,
    detail:      dupOk
      ? 'Mission ID is unique in the system.'
      : 'DUPLICATE detected — this missionId was submitted before. Possible replay attack.',
  }

  // I-6: NPNT zone compliance
  // Check if any violation is a GEOFENCE_BREACH or UNPERMITTED_ZONE
  const zoneViolations = violations.filter(v =>
    v.violationType === 'GEOFENCE_BREACH' || v.violationType === 'UNPERMITTED_ZONE'
  )
  const zoneOk  = zoneViolations.length === 0
  const inv6: InvariantResult = {
    label:       'I-6 Zone Compliance (DGCA Rule 36)',
    description: 'Flight remained within the declared NPNT zone classification; no zone breaches.',
    passed:      zoneOk,
    critical:    mission.npntClassification === 'RED' || mission.npntClassification === 'DJI_IMPORT',
    detail:      zoneOk
      ? `Zone: ${mission.npntClassification}. No zone breach violations recorded.`
      : `${zoneViolations.length} zone breach violation(s) recorded in a ${mission.npntClassification} zone.`,
  }

  // I-7: GNSS data integrity (no degraded GPS records above threshold)
  const degradedCount = mission.recordsWithDegradedGps ?? 0
  const totalCount    = track.length
  const degradedPct   = totalCount > 0 ? (degradedCount / totalCount) * 100 : 0
  const gnssOk        = degradedPct < 20   // >20% degraded = fail
  const inv7: InvariantResult = {
    label:       'I-7 GNSS Integrity (ICAO Annex 10)',
    description: 'Fewer than 20% of telemetry records had degraded GPS fix quality.',
    passed:      gnssOk,
    critical:    false,
    detail:      gnssOk
      ? `${degradedCount} of ${totalCount} records degraded (${degradedPct.toFixed(1)}%).`
      : `${degradedCount} of ${totalCount} records (${degradedPct.toFixed(1)}%) had degraded GNSS — exceeds 20% threshold.`,
  }

  // I-8: Hardware security (Strongbox / secure boot)
  const hwOk   = mission.strongboxBacked === true || mission.secureBootVerified === true
  const hwWarn = mission.strongboxBacked == null && mission.secureBootVerified == null
  const inv8: InvariantResult = {
    label:       'I-8 Hardware Security (FIPS 140-2)',
    description: 'Device uses Android Strongbox or verified secure boot for key storage.',
    passed:      hwOk || hwWarn,
    critical:    false,
    detail:      hwOk
      ? `Strongbox: ${mission.strongboxBacked ? 'Yes' : 'No'} · Secure boot: ${mission.secureBootVerified ? 'Yes' : 'No'}.`
      : hwWarn
        ? 'Hardware security data not reported by device (older Android or non-compliant device).'
        : 'Strongbox not backed and secure boot not verified.',
  }

  return [inv1, inv2, inv3, inv4, inv5, inv6, inv7, inv8]
}

// ── ForensicReportPanel ────────────────────────────────────────────────────────
// The single most important UI element for IAF demonstration.
// Shows all 10 invariants with clear pass/fail/warn status.

function ForensicReportPanel({
  mission,
  track,
  violations,
  complianceAnchor,
}: {
  mission:         Mission
  track:           TrackPoint[]
  violations:      Violation[]
  complianceAnchor:string
}) {
  const invariants   = evaluateInvariants(mission, track, violations)
  const criticalFail = invariants.some(i => i.critical && !i.passed)
  const anyFail      = invariants.some(i => !i.passed)
  const passCount    = invariants.filter(i => i.passed).length

  // Green header = all pass; Orange/amber header = warnings; Red header = critical failures
  const panelColour  = criticalFail ? T.red : anyFail ? T.primary : T.green
  const panelBg      = criticalFail ? T.red + '20' : anyFail ? T.primary + '20' : T.green + '20'
  const panelBorder  = criticalFail ? T.red + '40' : anyFail ? T.primary + '40' : T.green + '40'

  const overallLabel = criticalFail
    ? 'CRITICAL FORENSIC FAILURE'
    : anyFail
      ? 'FORENSIC WARNINGS'
      : 'ALL INVARIANTS HOLD'

  return (
    <div style={{ background: T.surface, border: `1px solid ${panelBorder}`,
      borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>

      {/* Panel header */}
      <div style={{ padding: '0.75rem 1rem', background: panelBg,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${panelBorder}` }}>
        <span style={{ color: panelColour, fontWeight: 700, fontSize: '0.875rem',
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.03em' }}>
          {criticalFail ? '\u2717' : anyFail ? '\u26A0' : '\u2713'} {overallLabel}
        </span>
        <span style={{ color: panelColour, fontSize: '0.75rem', opacity: 0.85,
          fontFamily: "'JetBrains Mono', monospace" }}>
          {passCount}/{invariants.length} passed
        </span>
      </div>

      {/* Invariant rows */}
      <div style={{ padding: '0.5rem' }}>
        {invariants.map((inv, i) => {
          const rowColour = inv.passed ? T.green : inv.critical ? T.red : T.primary
          const rowBg     = inv.passed ? 'transparent' : inv.critical ? T.red + '10' : T.primary + '10'
          return (
            <div key={i} style={{
              display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              padding: '0.5rem 0.5rem', marginBottom: '2px',
              background: rowBg, borderRadius: '4px',
            }}>
              {/* Status icon */}
              <span style={{
                fontSize: '0.95rem', lineHeight: 1,
                color: rowColour, flexShrink: 0, marginTop: '0.1rem',
                fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              }}>
                {inv.passed ? '\u2713' : inv.critical ? '\u2717' : '\u26A0'}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: T.textBright,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {inv.label}
                  </span>
                  {inv.critical && !inv.passed && (
                    <span style={{ fontSize: '0.65rem', background: T.red, color: T.bg,
                      padding: '0.1rem 0.3rem', borderRadius: '2px', flexShrink: 0,
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                      CRITICAL
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: T.muted, marginTop: '0.15rem',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  {inv.description}
                </div>
                <div style={{ fontSize: '0.75rem', color: rowColour,
                  marginTop: '0.2rem', fontWeight: inv.passed ? 400 : 500,
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  {inv.detail}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer — compliance anchor */}
      {complianceAnchor && (
        <div style={{ padding: '0.5rem 1rem', borderTop: `1px solid ${T.border}`,
          fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          Compliance anchor: {complianceAnchor}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function MissionDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { auth } = useAuditAuth()

  const mapRef        = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<any>(null)

  const [mission,     setMission]    = useState<Mission | null>(null)
  const [track,       setTrack]      = useState<TrackPoint[]>([])
  const [violations,  setViolations] = useState<Violation[]>([])
  const [bbox,        setBbox]       = useState<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null)
  const [complianceAnchor, setAnchor] = useState('')
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState<string | null>(null)

  // ── Load all data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth || !id) return
    const aax = auditAxios(auth.token)
    const dax = droneAxios(auth.token)

    setLoading(true); setError(null)

    Promise.all([
      aax.get(`/missions/${id}`),
      dax.get(`/missions/${id}/decoded-track`).catch(() => ({ data: { track: [], bbox: null } })),
      aax.get(`/violations?missionId=${id}`).catch(() => ({ data: { violations: [] } })),
      aax.get(`/missions/${id}/forensic`).catch(() => ({ data: { verification: null } })),
    ])
    .then(([mRes, tRes, vRes, fRes]) => {
      setMission(mRes.data.mission ?? null)
      setTrack(tRes.data.track ?? [])
      setBbox(tRes.data.bbox ?? null)
      // Sort violations by sequence ascending
      const raw: Violation[] = vRes.data.violations ?? []
      setViolations([...raw].sort((a, b) => Number(a.sequence) - Number(b.sequence)))
      setAnchor(fRes.data.verification?.complianceTimeAnchor ?? '')
    })
    .catch(e => setError(e.response?.data?.error ?? 'LOAD_FAILED'))
    .finally(() => setLoading(false))
  }, [id, auth?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build Leaflet map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || track.length === 0) return
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded — check CDN in public/index.html')
      return
    }

    if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null }

    const validPts = track.filter(t => t.decoded?.latitudeDeg != null)
    if (validPts.length === 0) return

    const map = L.map(mapRef.current)
    leafletMapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    const latlngs = validPts.map(t => [t.decoded.latitudeDeg, t.decoded.longitudeDeg])

    // Amber track line
    L.polyline(latlngs, { color: T.primary, weight: 2.5, opacity: 0.85 }).addTo(map)

    // Start — green
    L.circleMarker(latlngs[0], {
      radius: 8, fillColor: T.green, color: T.bg, fillOpacity: 1, weight: 2,
    }).bindTooltip('Mission Start').addTo(map)

    // End — muted
    L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 8, fillColor: T.muted, color: T.bg, fillOpacity: 1, weight: 2,
    }).bindTooltip('Mission End').addTo(map)

    // Track points — clickable
    validPts.forEach(pt => {
      const mk = L.circleMarker(
        [pt.decoded.latitudeDeg, pt.decoded.longitudeDeg],
        { radius: 4, fillColor: T.primary, color: T.bg, fillOpacity: 0.7, weight: 1 }
      )
      mk.on('click', () => setSelectedSeq(pt.sequence))
      mk.bindTooltip(`Seq ${pt.sequence} · ${pt.decoded.altitudeDisplay}`)
      mk.addTo(map)
    })

    // Violation markers — coloured by severity, larger radius
    violations.forEach(v => {
      const pt = validPts.find(t => t.sequence === Number(v.sequence))
      if (!pt) return
      L.circleMarker(
        [pt.decoded.latitudeDeg, pt.decoded.longitudeDeg],
        { radius: 11, fillColor: SEVERITY_COLOURS[v.severity] ?? T.red,
          color: T.bg, fillOpacity: 0.9, weight: 2 }
      ).bindTooltip(`${v.violationType} (${v.severity})`).addTo(map)
    })

    if (bbox) {
      map.fitBounds([[bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]], { padding: [20, 20] })
    } else {
      map.fitBounds(latlngs as any, { padding: [20, 20] })
    }

    return () => {
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null }
    }
  }, [track, violations, bbox])

  // ── Derived values ───────────────────────────────────────────────────────────

  const selectedPoint = selectedSeq !== null
    ? track.find(t => t.sequence === selectedSeq) ?? null
    : null

  const durationMin = mission?.missionEndUtcMs
    ? Math.round((Number(mission.missionEndUtcMs) - Number(mission.missionStartUtcMs)) / 60000)
    : null

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: '2rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>Loading mission data...</div>
  )
  if (error) return (
    <div style={{ padding: '2rem', color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>Error: {error}</div>
  )
  if (!mission) return (
    <div style={{ padding: '2rem', color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>Mission not found.</div>
  )

  const npntStyle = NPNT_STYLE[mission.npntClassification] ?? NPNT_STYLE.GREEN

  return (
    <div style={{ padding: '1.5rem' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem',
        flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/missions')}
          style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`,
            borderRadius: '4px', cursor: 'pointer', background: T.surface, color: T.text,
            flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
          Missions
        </button>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontFamily: "'JetBrains Mono', monospace",
          color: T.textBright }}>
          {mission.missionId}
        </h2>
        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem',
          fontWeight: 600, background: npntStyle.bg, color: npntStyle.color,
          border: `1px solid ${npntStyle.border}`, flexShrink: 0,
          fontFamily: "'JetBrains Mono', monospace" }}>
          {mission.npntClassification}
        </span>
        {mission.isDuplicate && (
          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem',
            fontWeight: 700, background: T.red + '15', color: T.red,
            border: `1px solid ${T.red}40`, flexShrink: 0,
            fontFamily: "'JetBrains Mono', monospace" }}>
            DUPLICATE / REPLAY
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: T.muted,
          fontFamily: "'JetBrains Mono', monospace" }}>
          {auth?.role} · Read-only
        </span>
      </div>

      {/* ── Summary bar ── */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem',
        background: T.surface, padding: '0.75rem 1rem', borderRadius: '6px',
        border: `1px solid ${T.border}`, fontSize: '0.82rem', flexWrap: 'wrap',
        color: T.text, fontFamily: "'JetBrains Mono', monospace",
        boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
        <span>Device: <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: T.textBright }}>
          {mission.deviceId}{mission.deviceModel ? ` (${mission.deviceModel})` : ''}</strong></span>
        <span>Records: <strong style={{ color: T.textBright }}>{track.length}</strong></span>
        <span>Violations: <strong style={{ color: violations.length > 0 ? T.red : T.textBright }}>
          {violations.length}</strong></span>
        {durationMin !== null && <span>Duration: <strong style={{ color: T.textBright }}>{durationMin} min</strong></span>}
        <span>Chain: <strong style={{ color: mission.chainVerifiedByServer ? T.green : T.red }}>
          {mission.chainVerifiedByServer ? 'Verified' : 'Failed'}</strong></span>
        <span>Cert: <strong style={{ color: mission.certValidAtStart ? T.green : T.red }}>
          {mission.certValidAtStart ? 'Valid' : 'Invalid'}</strong></span>
        <span>NTP: <strong style={{
          color: mission.ntpSyncStatus === 'SYNCED' ? T.green :
                 mission.ntpSyncStatus === 'DEGRADED' ? T.primary : T.red }}>
          {mission.ntpSyncStatus}{mission.ntpOffsetMs != null ? ` (${mission.ntpOffsetMs}ms)` : ''}
        </strong></span>
        <span>Android: <strong style={{ color: T.textBright }}>{mission.androidVersionAtUpload ?? '—'}</strong></span>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>

        {/* ── Left: Map ── */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={{ height: '480px', borderRadius: '6px', overflow: 'hidden',
            border: `1px solid ${T.border}`, background: T.bg }}>
            {track.length === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: T.muted, fontSize: '0.9rem',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  No GPS track data available.
                </div>
              : <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            }
          </div>

          {/* Selected track point detail below map */}
          {selectedPoint && (
            <div style={{ marginTop: '0.75rem', background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: '6px', padding: '0.75rem 1rem', fontSize: '0.8rem',
              boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: T.primary,
                fontFamily: "'JetBrains Mono', monospace" }}>
                Record #{selectedPoint.sequence}
              </div>
              {selectedPoint.decodeError
                ? <span style={{ color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                    Decode error: {selectedPoint.decodeError}
                  </span>
                : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1.5rem',
                    color: T.text, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>Time: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.timestampIso.replace('T',' ').slice(0,19)} UTC</strong></span>
                    <span>Speed: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.groundspeedKph} km/h</strong></span>
                    <span>Lat: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.latitudeDisplay}</strong></span>
                    <span>Sats: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.satelliteCount} ({selectedPoint.decoded.fixTypeLabel})</strong></span>
                    <span>Lon: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.longitudeDisplay}</strong></span>
                    <span>HDOP: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.hdop}</strong></span>
                    <span>Alt: <strong style={{ color: T.textBright }}>{selectedPoint.decoded.altitudeDisplay}</strong></span>
                    <span>CRC32: <strong style={{ color: selectedPoint.decoded.crc32Valid ? T.green : T.red }}>
                      {selectedPoint.decoded.crc32Valid ? 'Valid' : 'Invalid'}</strong></span>
                    <span style={{ gridColumn: '1 / -1', fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.7rem', color: T.muted }}>
                      Hash: {selectedPoint.chainHashHex.slice(0, 32)}...
                    </span>
                  </div>
              }
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ width: '320px', flexShrink: 0, display: 'flex',
          flexDirection: 'column', gap: '0.75rem' }}>

          {/* Forensic Report Panel — 8 invariants */}
          <ForensicReportPanel
            mission={mission}
            track={track}
            violations={violations}
            complianceAnchor={complianceAnchor}
          />

          {/* Violation timeline */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: '6px', padding: '0.75rem', maxHeight: '260px', overflowY: 'auto',
            boxShadow: '0 1px 4px rgba(255,184,0,0.05)' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem',
              color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
              Violations ({violations.length})
            </div>
            {violations.length === 0
              ? <div style={{ color: T.muted, fontSize: '0.8rem',
                  fontFamily: "'JetBrains Mono', monospace" }}>No violations.</div>
              : violations.map(v => (
                  <div key={v.id}
                    onClick={() => setSelectedSeq(Number(v.sequence))}
                    style={{ borderLeft: `3px solid ${SEVERITY_COLOURS[v.severity] ?? T.border}`,
                      paddingLeft: '0.6rem', marginBottom: '0.6rem', cursor: 'pointer',
                      userSelect: 'none' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem',
                      color: SEVERITY_COLOURS[v.severity], fontFamily: "'JetBrains Mono', monospace" }}>
                      {v.violationType}
                      <span style={{ fontWeight: 400, marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                        {v.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: T.muted,
                      fontFamily: "'JetBrains Mono', monospace" }}>
                      Seq {v.sequence} · {new Date(parseInt(v.timestampUtcMs))
                        .toISOString().replace('T',' ').slice(0,19)} UTC
                    </div>
                    <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: '0.15rem',
                      fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-word' }}>
                      {(() => { try { return JSON.stringify(JSON.parse(v.detailJson), null, 0) } catch { return v.detailJson } })()}
                    </div>
                  </div>
                ))
            }
          </div>

        </div>
      </div>
    </div>
  )
}

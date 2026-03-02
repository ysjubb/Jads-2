import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate }              from 'react-router-dom'
import { useAuditAuth, auditAxios, droneAxios } from '../hooks/useAuditAuth'

// ── Leaflet loaded via CDN in public/index.html — NOT via npm install.
// Government installations must not depend on commercial map APIs.
declare const L: any

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
  CRITICAL: '#cf1322',
  HIGH:     '#d46b08',
  MEDIUM:   '#d4b106',
  WARNING:  '#d4b106',
  LOW:      '#389e0d',
}

const NPNT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  GREEN:  { bg: '#f6ffed', color: '#389e0d', border: '#b7eb8f' },
  YELLOW: { bg: '#fffbe6', color: '#d46b08', border: '#ffe58f' },
  RED:    { bg: '#fff2f0', color: '#cf1322', border: '#ffccc7' },
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
    label:       'I-1 Hash Chain',
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
    label:       'I-2 NTP Sync',
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
    label:       'I-3 Device Certificate',
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
    label:       'I-4 CRL Archived',
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
    label:       'I-5 No Duplicate',
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
  const npntOk  = mission.npntClassification === 'GREEN'
  const zoneOk  = zoneViolations.length === 0
  const inv6: InvariantResult = {
    label:       'I-6 Zone Compliance',
    description: 'Flight remained within the declared NPNT zone classification; no zone breaches.',
    passed:      zoneOk,
    critical:    mission.npntClassification === 'RED',
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
    label:       'I-7 GNSS Integrity',
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
    label:       'I-8 Hardware Security',
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
// Shows all 8 invariants with clear pass/fail/warn status.

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

  const panelColour  = criticalFail ? '#cf1322' : anyFail ? '#d46b08' : '#389e0d'
  const panelBg      = criticalFail ? '#fff2f0' : anyFail ? '#fff7e6' : '#f6ffed'
  const panelBorder  = criticalFail ? '#ffccc7' : anyFail ? '#ffd591' : '#b7eb8f'

  const overallLabel = criticalFail
    ? '✗ CRITICAL FORENSIC FAILURE'
    : anyFail
      ? '⚠ FORENSIC WARNINGS'
      : '✓ ALL INVARIANTS HOLD'

  return (
    <div style={{ background: panelBg, border: `1px solid ${panelBorder}`,
      borderRadius: '8px', overflow: 'hidden' }}>

      {/* Panel header */}
      <div style={{ padding: '0.75rem 1rem', background: panelColour,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>
          {overallLabel}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem' }}>
          {passCount}/{invariants.length} passed
        </span>
      </div>

      {/* Invariant rows */}
      <div style={{ padding: '0.5rem' }}>
        {invariants.map((inv, i) => {
          const rowColour = inv.passed ? '#389e0d' : inv.critical ? '#cf1322' : '#d46b08'
          const rowBg     = inv.passed ? 'transparent' : inv.critical ? '#fff2f0' : '#fff7e6'
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
                fontWeight: 700,
              }}>
                {inv.passed ? '✓' : inv.critical ? '✗' : '⚠'}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1d1d1d' }}>
                    {inv.label}
                  </span>
                  {inv.critical && !inv.passed && (
                    <span style={{ fontSize: '0.65rem', background: '#cf1322', color: 'white',
                      padding: '0.1rem 0.3rem', borderRadius: '2px', flexShrink: 0 }}>
                      CRITICAL
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#595959', marginTop: '0.15rem' }}>
                  {inv.description}
                </div>
                <div style={{ fontSize: '0.75rem', color: rowColour,
                  marginTop: '0.2rem', fontWeight: inv.passed ? 400 : 500 }}>
                  {inv.detail}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer — compliance anchor */}
      {complianceAnchor && (
        <div style={{ padding: '0.5rem 1rem', borderTop: `1px solid ${panelBorder}`,
          fontSize: '0.7rem', color: '#8c8c8c' }}>
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

    // Blue track line
    L.polyline(latlngs, { color: '#1890ff', weight: 2.5, opacity: 0.85 }).addTo(map)

    // Start — green
    L.circleMarker(latlngs[0], {
      radius: 8, fillColor: '#52c41a', color: 'white', fillOpacity: 1, weight: 2,
    }).bindTooltip('Mission Start').addTo(map)

    // End — grey
    L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 8, fillColor: '#8c8c8c', color: 'white', fillOpacity: 1, weight: 2,
    }).bindTooltip('Mission End').addTo(map)

    // Track points — clickable
    validPts.forEach(pt => {
      const mk = L.circleMarker(
        [pt.decoded.latitudeDeg, pt.decoded.longitudeDeg],
        { radius: 4, fillColor: '#1890ff', color: 'white', fillOpacity: 0.7, weight: 1 }
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
        { radius: 11, fillColor: SEVERITY_COLOURS[v.severity] ?? '#cf1322',
          color: 'white', fillOpacity: 0.9, weight: 2 }
      ).bindTooltip(`⚠ ${v.violationType} (${v.severity})`).addTo(map)
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
    <div style={{ padding: '2rem', color: '#8c8c8c' }}>Loading mission data…</div>
  )
  if (error) return (
    <div style={{ padding: '2rem', color: '#cf1322' }}>Error: {error}</div>
  )
  if (!mission) return (
    <div style={{ padding: '2rem' }}>Mission not found.</div>
  )

  const npntStyle = NPNT_STYLE[mission.npntClassification] ?? NPNT_STYLE.GREEN

  return (
    <div style={{ padding: '1.5rem' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem',
        flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/missions')}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9',
            borderRadius: '4px', cursor: 'pointer', background: 'white', flexShrink: 0 }}>
          ← Missions
        </button>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'monospace' }}>
          {mission.missionId}
        </h2>
        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem',
          fontWeight: 600, background: npntStyle.bg, color: npntStyle.color,
          border: `1px solid ${npntStyle.border}`, flexShrink: 0 }}>
          {mission.npntClassification}
        </span>
        {mission.isDuplicate && (
          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem',
            fontWeight: 700, background: '#fff2f0', color: '#cf1322',
            border: '1px solid #ffccc7', flexShrink: 0 }}>
            DUPLICATE / REPLAY
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#8c8c8c' }}>
          {auth?.role} · Read-only
        </span>
      </div>

      {/* ── Summary bar ── */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem',
        background: 'white', padding: '0.75rem 1rem', borderRadius: '6px',
        border: '1px solid #f0f0f0', fontSize: '0.82rem', flexWrap: 'wrap' }}>
        <span>Device: <strong style={{ fontFamily:'monospace' }}>
          {mission.deviceId}{mission.deviceModel ? ` (${mission.deviceModel})` : ''}</strong></span>
        <span>Records: <strong>{track.length}</strong></span>
        <span>Violations: <strong style={{ color: violations.length > 0 ? '#cf1322' : 'inherit' }}>
          {violations.length}</strong></span>
        {durationMin !== null && <span>Duration: <strong>{durationMin} min</strong></span>}
        <span>Chain: <strong style={{ color: mission.chainVerifiedByServer ? '#389e0d' : '#cf1322' }}>
          {mission.chainVerifiedByServer ? '✓ Verified' : '✗ Failed'}</strong></span>
        <span>Cert: <strong style={{ color: mission.certValidAtStart ? '#389e0d' : '#cf1322' }}>
          {mission.certValidAtStart ? '✓ Valid' : '✗ Invalid'}</strong></span>
        <span>NTP: <strong style={{
          color: mission.ntpSyncStatus === 'SYNCED' ? '#389e0d' :
                 mission.ntpSyncStatus === 'DEGRADED' ? '#d48806' : '#cf1322' }}>
          {mission.ntpSyncStatus}{mission.ntpOffsetMs != null ? ` (±${mission.ntpOffsetMs}ms)` : ''}
        </strong></span>
        <span>Android: <strong>{mission.androidVersionAtUpload ?? '—'}</strong></span>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>

        {/* ── Left: Map ── */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={{ height: '480px', borderRadius: '6px', overflow: 'hidden',
            border: '1px solid #d9d9d9', background: '#f0f0f0' }}>
            {track.length === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: '#8c8c8c', fontSize: '0.9rem' }}>
                  No GPS track data available.
                </div>
              : <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            }
          </div>

          {/* Selected track point detail below map */}
          {selectedPoint && (
            <div style={{ marginTop: '0.75rem', background: 'white', border: '1px solid #d9d9d9',
              borderRadius: '6px', padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                Record #{selectedPoint.sequence}
              </div>
              {selectedPoint.decodeError
                ? <span style={{ color: '#cf1322' }}>Decode error: {selectedPoint.decodeError}</span>
                : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1.5rem',
                    color: '#595959', lineHeight: 1.7 }}>
                    <span>Time: <strong>{selectedPoint.decoded.timestampIso.replace('T',' ').slice(0,19)} UTC</strong></span>
                    <span>Speed: <strong>{selectedPoint.decoded.groundspeedKph} km/h</strong></span>
                    <span>Lat: <strong>{selectedPoint.decoded.latitudeDisplay}</strong></span>
                    <span>Sats: <strong>{selectedPoint.decoded.satelliteCount} ({selectedPoint.decoded.fixTypeLabel})</strong></span>
                    <span>Lon: <strong>{selectedPoint.decoded.longitudeDisplay}</strong></span>
                    <span>HDOP: <strong>{selectedPoint.decoded.hdop}</strong></span>
                    <span>Alt: <strong>{selectedPoint.decoded.altitudeDisplay}</strong></span>
                    <span>CRC32: <strong style={{ color: selectedPoint.decoded.crc32Valid ? '#389e0d' : '#cf1322' }}>
                      {selectedPoint.decoded.crc32Valid ? '✓ Valid' : '✗ Invalid'}</strong></span>
                    <span style={{ gridColumn: '1 / -1', fontFamily: 'monospace',
                      fontSize: '0.7rem', color: '#8c8c8c' }}>
                      Hash: {selectedPoint.chainHashHex.slice(0, 32)}…
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
          <div style={{ background: 'white', border: '1px solid #d9d9d9',
            borderRadius: '6px', padding: '0.75rem', maxHeight: '260px', overflowY: 'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Violations ({violations.length})
            </div>
            {violations.length === 0
              ? <div style={{ color: '#8c8c8c', fontSize: '0.8rem' }}>No violations.</div>
              : violations.map(v => (
                  <div key={v.id}
                    onClick={() => setSelectedSeq(Number(v.sequence))}
                    style={{ borderLeft: `3px solid ${SEVERITY_COLOURS[v.severity] ?? '#d9d9d9'}`,
                      paddingLeft: '0.6rem', marginBottom: '0.6rem', cursor: 'pointer',
                      userSelect: 'none' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem',
                      color: SEVERITY_COLOURS[v.severity] }}>
                      {v.violationType}
                      <span style={{ fontWeight: 400, marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                        {v.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#8c8c8c' }}>
                      Seq {v.sequence} · {new Date(parseInt(v.timestampUtcMs))
                        .toISOString().replace('T',' ').slice(0,19)} UTC
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#8c8c8c', marginTop: '0.15rem',
                      fontFamily: 'monospace', wordBreak: 'break-word' }}>
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

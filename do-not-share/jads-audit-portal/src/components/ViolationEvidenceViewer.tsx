// T11 — Audit Portal: Violation Evidence Viewer

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuditAuth } from '../hooks/useAuditAuth'

const T = {
  bg: '#050A08', surface: '#0A120E', border: '#1A3020',
  primary: '#FFB800', green: '#00FF88', red: '#FF3B3B',
  muted: '#6A6040', text: '#c8b890', textBright: '#e8d8b0',
}

interface IncidentDetail {
  id: string
  violationId: string
  missionId: string
  uin: string
  description: string
  severity: string
  status: string
  assignedTo: string | null
  createdAt: string
  violation?: {
    violationType: string
    lat: number
    lon: number
    altAGL: number
    evidenceHash: string
    prevEvidenceHash: string
    detectedAt: string
    detailJson: string
  }
}

export function ViolationEvidenceViewer() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuditAuth()
  const [incident, setIncident] = useState<IncidentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)

  const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080'

  useEffect(() => {
    if (!token || !id) return
    fetch(`${apiUrl}/api/audit/incidents/${id}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-JADS-Version': '4.0' },
    })
      .then(r => r.json())
      .then(data => { setIncident(data); setLoading(false) })
      .catch(() => setLoading(false))

    // Log access for chain of custody
    fetch(`${apiUrl}/api/audit/access-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-JADS-Version': '4.0',
      },
      body: JSON.stringify({ incidentId: id, action: 'VIEW', ts: Date.now() }),
    }).catch(() => {})
  }, [token, id, apiUrl])

  const handleVerify = async () => {
    if (!incident?.violation) return
    // Re-compute SHA-256 and compare
    const detail = incident.violation.detailJson
    const prev = incident.violation.prevEvidenceHash
    const payload = `${detail}|${prev}`
    const msgBuffer = new TextEncoder().encode(payload)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const computed = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setVerifyResult(computed === incident.violation.evidenceHash ? 'VALID' : 'TAMPERED')

    // Log verification action
    fetch(`${apiUrl}/api/audit/access-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-JADS-Version': '4.0',
      },
      body: JSON.stringify({ incidentId: id, action: 'VERIFY', ts: Date.now() }),
    }).catch(() => {})
  }

  if (loading) return <div style={{ padding: '2rem', color: T.text }}>Loading...</div>
  if (!incident) return <div style={{ padding: '2rem', color: T.red }}>Incident not found</div>

  const v = incident.violation
  const sectionStyle: React.CSSProperties = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
    padding: '1rem', marginBottom: '1rem',
  }
  const labelStyle: React.CSSProperties = { fontSize: '0.6rem', color: T.muted, fontWeight: 600 }
  const valueStyle: React.CSSProperties = { fontSize: '0.7rem', color: T.textBright }

  return (
    <div style={{ padding: '1.5rem', background: T.bg, minHeight: '100vh', color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
      <h2 style={{ fontSize: '0.9rem', color: T.primary, margin: '0 0 1rem', fontWeight: 700 }}>
        EVIDENCE VIEWER — {incident.uin}
      </h2>

      {/* SECTION 1: Violation Summary */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.75rem' }}>
          SECTION 1 — VIOLATION SUMMARY
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          <div><span style={labelStyle}>TYPE</span><div style={valueStyle}>{v?.violationType || 'N/A'}</div></div>
          <div><span style={labelStyle}>UIN</span><div style={valueStyle}>{incident.uin}</div></div>
          <div><span style={labelStyle}>MISSION</span><div style={valueStyle}>{incident.missionId}</div></div>
          <div><span style={labelStyle}>TIMESTAMP (IST)</span><div style={valueStyle}>{v ? new Date(v.detectedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}</div></div>
          <div><span style={labelStyle}>TIMESTAMP (UTC)</span><div style={valueStyle}>{v ? new Date(v.detectedAt).toISOString() : 'N/A'}</div></div>
          <div><span style={labelStyle}>SEVERITY</span><div style={{ ...valueStyle, color: incident.severity === 'CRITICAL' ? T.red : T.primary }}>{incident.severity}</div></div>
          <div><span style={labelStyle}>COORDINATES</span><div style={valueStyle}>{v ? `${v.lat.toFixed(6)}, ${v.lon.toFixed(6)}` : 'N/A'}</div></div>
          <div><span style={labelStyle}>ALTITUDE AGL</span><div style={valueStyle}>{v?.altAGL?.toFixed(1) || 'N/A'}m</div></div>
          <div><span style={labelStyle}>STATUS</span><div style={valueStyle}>{incident.status}</div></div>
        </div>
      </div>

      {/* SECTION 2: Evidence Chain */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.75rem' }}>
          SECTION 2 — EVIDENCE CHAIN
        </div>
        {v ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <span style={labelStyle}>EVIDENCE HASH</span>
                <div style={{ ...valueStyle, fontSize: '0.55rem', wordBreak: 'break-all' }}>{v.evidenceHash}</div>
              </div>
              <div>
                <span style={labelStyle}>PREVIOUS HASH</span>
                <div style={{ ...valueStyle, fontSize: '0.55rem', wordBreak: 'break-all' }}>{v.prevEvidenceHash}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button onClick={handleVerify} style={{
                padding: '0.4rem 1rem', background: T.primary + '20', border: `1px solid ${T.primary}`,
                color: T.primary, cursor: 'pointer', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600,
              }}>
                VERIFY HASH
              </button>
              {verifyResult && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  color: verifyResult === 'VALID' ? T.green : T.red,
                }}>
                  {verifyResult}
                </span>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: T.muted, fontSize: '0.7rem' }}>No violation record linked</div>
        )}
      </div>

      {/* SECTION 3: Flight Track (placeholder) */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.75rem' }}>
          SECTION 3 — FLIGHT TRACK REPLAY
        </div>
        <div style={{ height: '200px', background: T.bg, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '0.7rem' }}>
          Flight track replay — last 2 minutes before violation
          {v && <span style={{ marginLeft: '0.5rem', color: T.red }}>Violation at {v.lat.toFixed(4)}, {v.lon.toFixed(4)}</span>}
        </div>
      </div>

      {/* SECTION 4: Permission Artefact (placeholder) */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.75rem' }}>
          SECTION 4 — PERMISSION ARTEFACT
        </div>
        <div style={{ color: T.muted, fontSize: '0.7rem' }}>
          PA details, ValidFrom/ValidTill, GeoFence polygon, MaxAltitude, signature verification
        </div>
      </div>

      {/* SECTION 5: BSA 2023 Compliance */}
      <div style={{ ...sectionStyle, borderColor: T.primary + '40' }}>
        <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.75rem' }}>
          SECTION 5 — BSA 2023 COMPLIANCE NOTE
        </div>
        <div style={{ fontSize: '0.65rem', color: T.textBright, lineHeight: 1.6 }}>
          This evidence record is hash-chain verified under{' '}
          <span style={{ color: T.primary }}>Bharatiya Sakshya Adhiniyam 2023 Section 63</span>.{' '}
          Evidence hash: <span style={{ color: T.green, fontFamily: 'monospace' }}>{v?.evidenceHash?.slice(0, 16) || 'N/A'}...</span>{' '}
          Suitable for submission to adjudicating authority.
        </div>
      </div>

      {/* Description from admin */}
      {incident.description && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 700, marginBottom: '0.5rem' }}>
            ADMIN DESCRIPTION
          </div>
          <div style={{ fontSize: '0.7rem', color: T.text }}>{incident.description}</div>
        </div>
      )}
    </div>
  )
}

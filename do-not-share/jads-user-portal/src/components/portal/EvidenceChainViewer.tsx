import React, { useState, useEffect } from 'react'
import { T } from '../../theme'
import { userApi } from '../../api/client'

type DocumentType = 'NPNT_PA' | 'FLIGHT_LOG' | 'ICAO_FPL' | 'NOTAM_ACK' | 'JEPPESEN_CHART_ACCESS' | 'PILOT_BRIEFING' | 'INVESTIGATION_NOTE' | 'AUDIT_EXPORT'

interface EvidenceRecord {
  id: string
  type: DocumentType
  missionType: 'DRONE' | 'AIRCRAFT'
  missionId: string
  hash: string
  signingEntity: string
  createdAt: string
  verifiedAt?: string
  documentCategory?: string
}

const TYPE_BADGE: Record<DocumentType, { color: string; label: string }> = {
  NPNT_PA: { color: '#00C864', label: 'NPNT PA' },
  FLIGHT_LOG: { color: T.amber, label: 'Flight Log' },
  ICAO_FPL: { color: T.primary, label: 'ICAO FPL' },
  NOTAM_ACK: { color: '#FF8833', label: 'NOTAM Ack' },
  JEPPESEN_CHART_ACCESS: { color: '#9933CC', label: 'Chart Access' },
  PILOT_BRIEFING: { color: '#40A0FF', label: 'Briefing' },
  INVESTIGATION_NOTE: { color: T.red, label: 'Investigation' },
  AUDIT_EXPORT: { color: '#CC6633', label: 'Audit Export' },
}

// Mock data for development
const MOCK_RECORDS: EvidenceRecord[] = [
  { id: 'ev-001', type: 'NPNT_PA', missionType: 'DRONE', missionId: 'DM-2026-00001', hash: 'a1b2c3d4e5f6...', signingEntity: 'DGCA', createdAt: '2026-03-08T10:30:00Z', verifiedAt: '2026-03-08T10:30:05Z' },
  { id: 'ev-002', type: 'FLIGHT_LOG', missionType: 'DRONE', missionId: 'DM-2026-00001', hash: 'f7e8d9c0b1a2...', signingEntity: 'RFM_UA-12345678', createdAt: '2026-03-08T14:00:00Z' },
  { id: 'ev-003', type: 'ICAO_FPL', missionType: 'AIRCRAFT', missionId: 'FPL-2026-00045', hash: '3c4d5e6f7a8b...', signingEntity: 'JADS_SYSTEM', createdAt: '2026-03-09T06:00:00Z', verifiedAt: '2026-03-09T06:00:02Z' },
  { id: 'ev-004', type: 'NOTAM_ACK', missionType: 'AIRCRAFT', missionId: 'FPL-2026-00045', hash: '9a0b1c2d3e4f...', signingEntity: 'PILOT_PVT001', createdAt: '2026-03-09T06:15:00Z' },
]

export function EvidenceChainViewer() {
  const [records, setRecords] = useState<EvidenceRecord[]>(MOCK_RECORDS)
  const [filterType, setFilterType] = useState<DocumentType | ''>('')
  const [filterMission, setFilterMission] = useState<'DRONE' | 'AIRCRAFT' | ''>('')
  const [verifying, setVerifying] = useState<string | null>(null)

  const filtered = records.filter(r => {
    if (filterType && r.type !== filterType) return false
    if (filterMission && r.missionType !== filterMission) return false
    return true
  })

  const handleVerify = async (id: string) => {
    setVerifying(id)
    // Simulate verification
    await new Promise(r => setTimeout(r, 1500))
    setRecords(rs => rs.map(r => r.id === id ? { ...r, verifiedAt: new Date().toISOString() } : r))
    setVerifying(null)
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.25rem' }}>Evidence Chain</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Forensic-grade document audit trail — {records.length} records
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <select style={{
          padding: '0.35rem', background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '4px', color: T.textBright, fontSize: '0.7rem', fontFamily: 'inherit',
        }} value={filterType} onChange={e => setFilterType(e.target.value as any)}>
          <option value="">All Types</option>
          {Object.entries(TYPE_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={{
          padding: '0.35rem', background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '4px', color: T.textBright, fontSize: '0.7rem', fontFamily: 'inherit',
        }} value={filterMission} onChange={e => setFilterMission(e.target.value as any)}>
          <option value="">All Missions</option>
          <option value="DRONE">Drone</option>
          <option value="AIRCRAFT">Aircraft</option>
        </select>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
        <div style={{
          position: 'absolute', left: '6px', top: 0, bottom: 0,
          width: '2px', background: T.border,
        }} />
        {filtered.map(r => {
          const badge = TYPE_BADGE[r.type]
          return (
            <div key={r.id} style={{
              position: 'relative', marginBottom: '0.75rem', padding: '0.6rem',
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
            }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: '-1.5rem', top: '0.8rem',
                width: '10px', height: '10px', borderRadius: '50%',
                background: badge.color, border: `2px solid ${T.bg}`,
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{
                    padding: '1px 5px', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700,
                    background: badge.color + '20', color: badge.color,
                  }}>{badge.label}</span>
                  <span style={{ fontSize: '0.6rem', color: T.muted, marginLeft: '0.5rem' }}>
                    {r.missionType} | {r.missionId}
                  </span>
                </div>
                <span style={{ fontSize: '0.55rem', color: T.muted }}>
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.6rem', color: T.textBright }}>
                <span style={{ color: T.muted }}>Hash: </span>
                <span style={{ fontFamily: 'monospace' }}>{r.hash}</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: T.muted }}>
                Signed by: {r.signingEntity}
                {r.verifiedAt && <span style={{ color: '#00C864', marginLeft: '0.5rem' }}>Verified ✓</span>}
              </div>
              {!r.verifiedAt && (
                <button onClick={() => handleVerify(r.id)} disabled={verifying === r.id}
                  style={{
                    marginTop: '0.3rem', padding: '0.2rem 0.5rem', background: T.primary + '15',
                    border: `1px solid ${T.primary}40`, borderRadius: '3px', color: T.primary,
                    cursor: 'pointer', fontSize: '0.55rem', fontFamily: 'inherit',
                  }}>
                  {verifying === r.id ? 'Verifying...' : 'Verify Signature'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

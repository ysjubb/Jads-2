import React, { useState, useEffect } from 'react'
import { T } from '../../theme'
import { fetchAuditRecords, generateAuditPackage, exportToJSON, exportToCSV } from '../../services/auditHandoffService'
import type { AuditExportRecord, AuditPackage } from '../../services/auditHandoffService'

const TYPE_COLOR: Record<string, string> = {
  NPNT_PA: '#C850C0',
  FLIGHT_LOG: '#00C864',
  ICAO_FPL: '#00AAFF',
  COMPLIANCE_CHECK: '#FFB800',
  CLEARANCE: '#40A0FF',
  NOTAM_ACK: '#888',
}

export function EvidenceExportPanel() {
  const [records, setRecords] = useState<AuditExportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'ALL' | 'DRONE' | 'AIRCRAFT'>('ALL')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [auditPkg, setAuditPkg] = useState<AuditPackage | null>(null)

  useEffect(() => {
    fetchAuditRecords(
      undefined,
      filterType === 'ALL' ? undefined : filterType,
    ).then(r => {
      setRecords(r)
      setLoading(false)
    })
  }, [filterType])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }

  const exportJSON = async () => {
    const selected = records.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    const pkg = await generateAuditPackage(selected, 'JSON')
    setAuditPkg(pkg)
    const blob = new Blob([exportToJSON(pkg)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${pkg.packageId}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportCSVFile = async () => {
    const selected = records.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    const csv = exportToCSV(selected)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `audit-export-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>
        Evidence Export & Audit Handoff
      </h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Export cryptographically verified evidence records for DGCA/AAI regulatory audits
      </p>

      {/* Filters & actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['ALL', 'DRONE', 'AIRCRAFT'] as const).map(f => (
          <button
            key={f}
            onClick={() => { setFilterType(f); setSelectedIds(new Set()); setLoading(true) }}
            style={{
              padding: '4px 12px', fontSize: '0.65rem', fontWeight: 600,
              background: filterType === f ? T.primary + '20' : 'transparent',
              color: filterType === f ? T.primary : T.muted,
              border: `1px solid ${filterType === f ? T.primary + '40' : T.border}`,
              borderRadius: '3px', cursor: 'pointer',
            }}
          >
            {f}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <span style={{ color: T.muted, fontSize: '0.6rem' }}>
          {selectedIds.size}/{records.length} selected
        </span>
        <button onClick={selectAll} style={{
          padding: '4px 10px', fontSize: '0.6rem', background: T.bg, color: T.text,
          border: `1px solid ${T.border}`, borderRadius: '3px', cursor: 'pointer',
        }}>
          {selectedIds.size === records.length ? 'Deselect All' : 'Select All'}
        </button>
        <button onClick={exportJSON} disabled={selectedIds.size === 0} style={{
          padding: '4px 10px', fontSize: '0.6rem', fontWeight: 600,
          background: selectedIds.size > 0 ? T.primary + '20' : T.bg,
          color: selectedIds.size > 0 ? T.primary : T.muted,
          border: `1px solid ${selectedIds.size > 0 ? T.primary + '40' : T.border}`,
          borderRadius: '3px', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
        }}>
          Export JSON
        </button>
        <button onClick={exportCSVFile} disabled={selectedIds.size === 0} style={{
          padding: '4px 10px', fontSize: '0.6rem', fontWeight: 600,
          background: selectedIds.size > 0 ? T.amber + '20' : T.bg,
          color: selectedIds.size > 0 ? T.amber : T.muted,
          border: `1px solid ${selectedIds.size > 0 ? T.amber + '40' : T.border}`,
          borderRadius: '3px', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
        }}>
          Export CSV
        </button>
      </div>

      {loading ? (
        <p style={{ color: T.muted, fontSize: '0.7rem' }}>Loading audit records...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '0.4rem', width: '30px' }}></th>
                <th style={{ padding: '0.4rem' }}>Type</th>
                <th style={{ padding: '0.4rem' }}>Mission</th>
                <th style={{ padding: '0.4rem' }}>Reference</th>
                <th style={{ padding: '0.4rem' }}>Timestamp</th>
                <th style={{ padding: '0.4rem' }}>Hash</th>
                <th style={{ padding: '0.4rem' }}>Verified</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: `1px solid ${T.border}08`,
                    background: selectedIds.has(r.id) ? T.primary + '08' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSelect(r.id)}
                >
                  <td style={{ padding: '0.4rem' }}>
                    <input type="checkbox" checked={selectedIds.has(r.id)} readOnly />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: '2px', fontSize: '0.55rem',
                      fontWeight: 700, color: '#fff', background: TYPE_COLOR[r.type] ?? T.muted,
                    }}>{r.type}</span>
                  </td>
                  <td style={{ padding: '0.4rem' }}>{r.missionType}</td>
                  <td style={{ padding: '0.4rem', color: T.primary, fontFamily: 'monospace', fontSize: '0.6rem' }}>
                    {r.referenceId}
                  </td>
                  <td style={{ padding: '0.4rem', fontSize: '0.6rem' }}>
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.4rem', fontFamily: 'monospace', fontSize: '0.55rem', color: T.muted }}>
                    {r.hash.slice(0, 20)}...
                  </td>
                  <td style={{ padding: '0.4rem', color: r.verified ? '#00C864' : T.red, fontWeight: 600 }}>
                    {r.verified ? 'YES' : 'NO'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditPkg && (
        <div style={{
          marginTop: '0.75rem', padding: '0.5rem', background: T.primary + '10',
          border: `1px solid ${T.primary}30`, borderRadius: '3px',
          fontSize: '0.6rem', color: T.primary,
        }}>
          Package exported: {auditPkg.packageId} | Records: {auditPkg.records.length} |
          Integrity: {auditPkg.integrityHash.slice(0, 24)}...
        </div>
      )}
    </div>
  )
}

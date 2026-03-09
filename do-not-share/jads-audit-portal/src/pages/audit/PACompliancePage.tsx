import { useEffect, useState, useCallback } from 'react'
import { useAuditAuth, auditAxios } from '../../hooks/useAuditAuth'

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

/* ---------- Interfaces ---------- */

interface PAComplianceStats {
  totalPAsAudited: number
  signatureValidPct: number
  logUploadRatePct: number
  expiryViolations: number
  overallComplianceScore: number
}

interface PAComplianceRecord {
  applicationId: string
  pilotRpc: string
  droneUin: string
  signatureStatus: 'VALID' | 'INVALID' | 'NOT_CHECKED'
  logUploaded: boolean
  logOverdue: boolean
  expiryStatus: 'ACTIVE' | 'EXPIRED' | 'EXPIRING_SOON'
  complianceScore: number
  flightEndTime: string | null
  logUploadTime: string | null
}

interface VerificationDetail {
  applicationId: string
  signatureStatus: 'VALID' | 'INVALID' | 'NOT_CHECKED'
  certificateIssuer: string | null
  algorithm: string | null
  verificationTimestamp: string | null
  certificateExpiry: string | null
  errorMessage: string | null
}

/* ---------- Shared components ---------- */

function StatCard({ label, value, colour }: { label: string; value: string | number; colour?: string }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '6px',
      padding: '1rem',
      flex: 1,
      minWidth: '180px',
    }}>
      <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colour ?? T.textBright,
        fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  )
}

function ComplianceGauge({ score }: { score: number }) {
  const clamp = Math.max(0, Math.min(100, score))
  const gaugeColour = clamp >= 80 ? T.green : clamp >= 50 ? T.primary : T.red
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamp / 100) * circumference

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '6px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: '200px',
    }}>
      <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
        Overall Compliance
      </div>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* Background circle */}
        <circle cx="65" cy="65" r={radius} fill="none" stroke={T.border} strokeWidth="10" />
        {/* Score arc */}
        <circle cx="65" cy="65" r={radius} fill="none" stroke={gaugeColour} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {/* Score text */}
        <text x="65" y="60" textAnchor="middle" fill={gaugeColour}
          fontFamily="'JetBrains Mono', monospace" fontSize="28" fontWeight="700">
          {clamp}
        </text>
        <text x="65" y="80" textAnchor="middle" fill={T.muted}
          fontFamily="'JetBrains Mono', monospace" fontSize="11">
          / 100
        </text>
      </svg>
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: gaugeColour,
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
        {clamp >= 80 ? 'COMPLIANT' : clamp >= 50 ? 'NEEDS ATTENTION' : 'NON-COMPLIANT'}
      </div>
    </div>
  )
}

function SignatureBadge({ status }: { status: 'VALID' | 'INVALID' | 'NOT_CHECKED' }) {
  const map: Record<string, { colour: string; bg: string }> = {
    VALID:       { colour: T.green, bg: T.green + '15' },
    INVALID:     { colour: T.red,   bg: T.red + '15' },
    NOT_CHECKED: { colour: T.muted, bg: T.muted + '15' },
  }
  const s = map[status] ?? map.NOT_CHECKED
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem',
      borderRadius: '3px', background: s.bg, color: s.colour,
      border: `1px solid ${s.colour}40`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {status}
    </span>
  )
}

function ExpiryBadge({ status }: { status: 'ACTIVE' | 'EXPIRED' | 'EXPIRING_SOON' }) {
  const map: Record<string, { colour: string; label: string }> = {
    ACTIVE:        { colour: T.green,   label: 'ACTIVE' },
    EXPIRED:       { colour: T.red,     label: 'EXPIRED' },
    EXPIRING_SOON: { colour: T.primary, label: 'EXPIRING' },
  }
  const s = map[status] ?? map.ACTIVE
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem',
      borderRadius: '3px', background: s.colour + '15', color: s.colour,
      border: `1px solid ${s.colour}40`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {s.label}
    </span>
  )
}

/* ---------- Main page ---------- */

export function PACompliancePage() {
  const { token, role, logout } = useAuditAuth()

  // Data state
  const [stats, setStats]           = useState<PAComplianceStats | null>(null)
  const [records, setRecords]       = useState<PAComplianceRecord[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Filters
  const [filterCompliance, setFilterCompliance] = useState<string>('')
  const [dateFrom, setDateFrom]                 = useState<string>('')
  const [dateTo, setDateTo]                     = useState<string>('')

  // Pagination
  const [page, setPage] = useState(1)
  const limit = 20

  // Verification detail modal
  const [detailLoading, setDetailLoading]         = useState(false)
  const [verificationDetail, setVerificationDetail] = useState<VerificationDetail | null>(null)
  const [detailError, setDetailError]               = useState<string | null>(null)

  /* ---------- Fetch main data ---------- */

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const ax = auditAxios(token)
      const params: Record<string, string | number> = { page, limit }
      if (filterCompliance) params.compliance = filterCompliance
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo

      const { data } = await ax.get('/pa/compliance-report', { params })
      setStats(data.stats ?? null)
      setRecords(data.records ?? [])
      setTotal(data.total ?? 0)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      if (e.response?.status === 403) { setError('ACCESS_DENIED: Insufficient role permissions'); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, filterCompliance, dateFrom, dateTo, logout])

  useEffect(() => { fetchData() }, [fetchData])

  /* ---------- Fetch verification detail ---------- */

  const openVerificationDetail = useCallback(async (applicationId: string) => {
    if (!token) return
    setDetailLoading(true); setDetailError(null); setVerificationDetail(null)
    try {
      const ax = auditAxios(token)
      const { data } = await ax.get(`/pa/${applicationId}/verification-detail`)
      setVerificationDetail(data)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setDetailError(e.response?.data?.error ?? 'Failed to load verification detail')
    } finally {
      setDetailLoading(false)
    }
  }, [token, logout])

  const closeDetail = useCallback(() => {
    setVerificationDetail(null)
    setDetailError(null)
  }, [])

  /* ---------- CSV export ---------- */

  const exportCSV = useCallback(() => {
    if (!records.length) return
    const headers = [
      'Application ID', 'Pilot RPC', 'Drone UIN', 'Signature Status',
      'Log Uploaded', 'Log Overdue', 'Expiry Status', 'Compliance Score',
      'Flight End Time', 'Log Upload Time',
    ]
    const rows = records.map(r => [
      r.applicationId, r.pilotRpc, r.droneUin, r.signatureStatus,
      r.logUploaded ? 'Yes' : 'No', r.logOverdue ? 'Yes' : 'No',
      r.expiryStatus, r.complianceScore,
      r.flightEndTime ?? '', r.logUploadTime ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pa_compliance_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [records])

  /* ---------- Helpers ---------- */

  const overdueRecords = records.filter(r => r.logOverdue)
  const sigVerificationRecords = records // all records show sig status

  const scoreColour = (score: number) =>
    score >= 80 ? T.green : score >= 50 ? T.primary : T.red

  /* ---------- Render ---------- */

  return (
    <div style={{ padding: '1.5rem' }}>

      {/* ---- Header ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace" }}>
          PA Compliance Report
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} disabled={!records.length}
            style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.primary}40`, borderRadius: '4px',
              cursor: records.length ? 'pointer' : 'not-allowed', background: T.primary + '15',
              color: T.primary, fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace",
              opacity: records.length ? 1 : 0.5 }}>
            Export CSV
          </button>
          <button onClick={fetchData}
            style={{ padding: '0.4rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
              cursor: 'pointer', background: T.surface, color: T.text, fontSize: '0.8rem',
              fontFamily: "'JetBrains Mono', monospace" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Role badge */}
      {role && (
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.75rem', background: T.primary + '15',
            border: `1px solid ${T.primary}40`, color: T.primary,
            padding: '0.2rem 0.6rem', borderRadius: '4px',
            fontFamily: "'JetBrains Mono', monospace" }}>
            Role: {role}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem',
          fontFamily: "'JetBrains Mono', monospace" }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: T.muted, padding: '1rem', fontFamily: "'JetBrains Mono', monospace" }}>Loading PA compliance data...</div>}

      {!loading && stats && (
        <>
          {/* ---- Stats row + Gauge ---- */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flex: 1, flexWrap: 'wrap' }}>
              <StatCard label="Total PAs Audited" value={stats.totalPAsAudited} />
              <StatCard label="Signature Valid %" value={`${stats.signatureValidPct}%`}
                colour={stats.signatureValidPct >= 90 ? T.green : stats.signatureValidPct >= 70 ? T.primary : T.red} />
              <StatCard label="Log Upload Rate %" value={`${stats.logUploadRatePct}%`}
                colour={stats.logUploadRatePct >= 90 ? T.green : stats.logUploadRatePct >= 70 ? T.primary : T.red} />
              <StatCard label="Expiry Violations" value={stats.expiryViolations}
                colour={stats.expiryViolations > 0 ? T.red : T.green} />
            </div>
            <ComplianceGauge score={stats.overallComplianceScore} />
          </div>

          {/* ---- Filters ---- */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterCompliance}
              onChange={e => { setFilterCompliance(e.target.value); setPage(1) }}
              style={{ padding: '0.4rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.85rem', outline: 'none' }}>
              <option value="">All Compliance</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="NON_COMPLIANT">Non-Compliant</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>From</span>
              <input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                style={{ padding: '0.35rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                  background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8rem', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>To</span>
              <input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                style={{ padding: '0.35rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                  background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8rem', outline: 'none' }} />
            </div>
            {(filterCompliance || dateFrom || dateTo) && (
              <button onClick={() => { setFilterCompliance(''); setDateFrom(''); setDateTo(''); setPage(1) }}
                style={{ padding: '0.35rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                  cursor: 'pointer', background: T.surface, color: T.muted, fontSize: '0.75rem',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                Clear Filters
              </button>
            )}
          </div>

          {/* ---- Main PA Compliance Table ---- */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
            padding: '1rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.textBright,
              fontFamily: "'JetBrains Mono', monospace" }}>
              PA Compliance Records ({total} total)
            </h3>
            {records.length === 0 ? (
              <div style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                No PA compliance records found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {['Application ID', 'Pilot RPC', 'Drone UIN', 'Signature', 'Log Uploaded', 'Expiry', 'Score'].map(h => (
                        <th key={h} style={{ padding: '0.5rem', textAlign: 'left', color: T.muted, fontWeight: 600,
                          fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}10`,
                        cursor: 'pointer' }}
                        onClick={() => openVerificationDetail(r.applicationId)}
                      >
                        <td style={{ padding: '0.5rem', color: T.primary, textDecoration: 'underline',
                          textDecorationColor: T.primary + '40' }}>
                          {r.applicationId}
                        </td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{r.pilotRpc}</td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{r.droneUin}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <SignatureBadge status={r.signatureStatus} />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem',
                            borderRadius: '3px',
                            background: r.logOverdue ? T.red + '15' : r.logUploaded ? T.green + '15' : T.muted + '15',
                            color: r.logOverdue ? T.red : r.logUploaded ? T.green : T.muted,
                            border: `1px solid ${r.logOverdue ? T.red : r.logUploaded ? T.green : T.muted}40`,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {r.logOverdue ? 'OVERDUE' : r.logUploaded ? 'YES' : 'NO'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <ExpiryBadge status={r.expiryStatus} />
                        </td>
                        <td style={{ padding: '0.5rem', color: scoreColour(r.complianceScore), fontWeight: 600 }}>
                          {r.complianceScore}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Pagination ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1,
                background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              Prev
            </button>
            <span style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
              Page {page} · {total} records
            </span>
            <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}
              style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                cursor: page * limit >= total ? 'not-allowed' : 'pointer',
                opacity: page * limit >= total ? 0.5 : 1,
                background: T.surface, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              Next
            </button>
          </div>

          {/* ---- Signature Verification Section ---- */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
            padding: '1rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.textBright,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Signature Verification Results
            </h3>
            <div style={{ fontSize: '0.75rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
              marginBottom: '0.75rem' }}>
              Click any Application ID above to view full verification detail.
            </div>
            {sigVerificationRecords.length === 0 ? (
              <div style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                No signature verification data available.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sigVerificationRecords.map((r, i) => (
                  <div key={i}
                    onClick={() => openVerificationDetail(r.applicationId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0.75rem',
                      borderRadius: '4px', cursor: 'pointer',
                      background: r.signatureStatus === 'INVALID' ? T.red + '08' : 'transparent',
                      borderLeft: `3px solid ${r.signatureStatus === 'VALID' ? T.green : r.signatureStatus === 'INVALID' ? T.red : T.muted}`,
                    }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem',
                      color: T.textBright, minWidth: '140px' }}>
                      {r.applicationId}
                    </span>
                    <SignatureBadge status={r.signatureStatus} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                      color: T.muted }}>
                      {r.pilotRpc}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                      color: T.primary, marginLeft: 'auto' }}>
                      View detail
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Flight Log Upload Compliance ---- */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
            padding: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.textBright,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Flight Log Upload Compliance
              {overdueRecords.length > 0 && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.15rem 0.45rem',
                  borderRadius: '3px', background: T.red + '15', color: T.red,
                  border: `1px solid ${T.red}40`, fontWeight: 600 }}>
                  {overdueRecords.length} OVERDUE
                </span>
              )}
            </h3>
            <div style={{ fontSize: '0.75rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
              marginBottom: '0.75rem' }}>
              Approved PAs with flight log upload status. Logs overdue &gt;48h after flight end are flagged.
            </div>
            {records.length === 0 ? (
              <div style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                No flight log data available.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {['Application ID', 'Pilot RPC', 'Drone UIN', 'Flight End', 'Log Uploaded', 'Upload Time', 'Status'].map(h => (
                        <th key={h} style={{ padding: '0.5rem', textAlign: 'left', color: T.muted, fontWeight: 600,
                          fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${T.border}10`,
                        background: r.logOverdue ? T.red + '08' : 'transparent',
                      }}>
                        <td style={{ padding: '0.5rem', color: T.textBright }}>{r.applicationId}</td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{r.pilotRpc}</td>
                        <td style={{ padding: '0.5rem', color: T.text }}>{r.droneUin}</td>
                        <td style={{ padding: '0.5rem', color: T.muted }}>
                          {r.flightEndTime ? new Date(r.flightEndTime).toISOString().replace('T', ' ').slice(0, 19) : '-'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem',
                            borderRadius: '3px',
                            background: r.logUploaded ? T.green + '15' : T.muted + '15',
                            color: r.logUploaded ? T.green : T.muted,
                            border: `1px solid ${r.logUploaded ? T.green : T.muted}40`,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {r.logUploaded ? 'YES' : 'NO'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', color: T.muted }}>
                          {r.logUploadTime ? new Date(r.logUploadTime).toISOString().replace('T', ' ').slice(0, 19) : '-'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {r.logOverdue ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.red,
                              fontFamily: "'JetBrains Mono', monospace" }}>
                              OVERDUE (&gt;48h)
                            </span>
                          ) : r.logUploaded ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: T.green,
                              fontFamily: "'JetBrains Mono', monospace" }}>
                              ON TIME
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: T.muted,
                              fontFamily: "'JetBrains Mono', monospace" }}>
                              PENDING
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Verification Detail Modal ---- */}
      {(verificationDetail || detailLoading || detailError) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999,
        }}
        onClick={closeDetail}>
          <div style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: '8px',
            padding: '1.5rem', maxWidth: '520px', width: '90%',
            boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
          }}
          onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: T.textBright, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.95rem' }}>
                Signature Verification Detail
              </h3>
              <button onClick={closeDetail}
                style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer',
                  fontSize: '1.2rem', fontFamily: "'JetBrains Mono', monospace" }}>
                X
              </button>
            </div>

            {detailLoading && (
              <div style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem',
                padding: '1rem 0' }}>
                Loading verification details...
              </div>
            )}

            {detailError && (
              <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
                border: `1px solid ${T.red}40`, borderRadius: '4px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                {detailError}
              </div>
            )}

            {verificationDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <DetailRow label="Application ID" value={verificationDetail.applicationId} colour={T.primary} />
                <DetailRow label="Signature Status">
                  <SignatureBadge status={verificationDetail.signatureStatus} />
                </DetailRow>
                <DetailRow label="Certificate Issuer"
                  value={verificationDetail.certificateIssuer ?? 'N/A'}
                  colour={verificationDetail.certificateIssuer ? T.textBright : T.muted} />
                <DetailRow label="Algorithm"
                  value={verificationDetail.algorithm ?? 'N/A'}
                  colour={verificationDetail.algorithm ? T.textBright : T.muted} />
                <DetailRow label="Verification Timestamp"
                  value={verificationDetail.verificationTimestamp
                    ? new Date(verificationDetail.verificationTimestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
                    : 'N/A'}
                  colour={verificationDetail.verificationTimestamp ? T.textBright : T.muted} />
                <DetailRow label="Certificate Expiry"
                  value={verificationDetail.certificateExpiry
                    ? new Date(verificationDetail.certificateExpiry).toISOString().replace('T', ' ').slice(0, 10)
                    : 'N/A'}
                  colour={verificationDetail.certificateExpiry ? T.textBright : T.muted} />
                {verificationDetail.errorMessage && (
                  <DetailRow label="Error" value={verificationDetail.errorMessage} colour={T.red} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Detail row for modal ---------- */

function DetailRow({ label, value, colour, children }: {
  label: string; value?: string; colour?: string; children?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.4rem 0', borderBottom: `1px solid ${T.border}30` }}>
      <span style={{ fontSize: '0.75rem', color: T.muted, fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children ?? (
        <span style={{ fontSize: '0.8rem', color: colour ?? T.textBright,
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
          {value}
        </span>
      )}
    </div>
  )
}

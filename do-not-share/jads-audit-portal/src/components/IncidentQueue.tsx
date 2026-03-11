// T11 — Audit Portal: Incident Queue

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuditAuth } from '../hooks/useAuditAuth'

const T = {
  bg: '#050A08', surface: '#0A120E', border: '#1A3020',
  primary: '#FFB800', green: '#00FF88', red: '#FF3B3B',
  muted: '#6A6040', text: '#c8b890', textBright: '#e8d8b0',
}

interface Incident {
  id: string
  violationId: string
  missionId: string
  uin: string
  description: string
  severity: string
  status: string
  assignedTo: string | null
  createdAt: string
}

export function IncidentQueue() {
  const { token } = useAuditAuth()
  const navigate = useNavigate()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterUin, setFilterUin] = useState('')

  const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080'

  useEffect(() => {
    if (!token) return
    const params = new URLSearchParams()
    if (filterSeverity) params.set('severity', filterSeverity)
    if (filterStatus) params.set('status', filterStatus)
    if (filterUin) params.set('uin', filterUin)

    fetch(`${apiUrl}/api/audit/incidents?${params}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-JADS-Version': '4.0' },
    })
      .then(r => r.json())
      .then(data => { setIncidents(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token, filterSeverity, filterStatus, filterUin, apiUrl])

  const updateStatus = async (id: string, status: string) => {
    if (!token) return
    await fetch(`${apiUrl}/api/audit/incidents/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-JADS-Version': '4.0',
      },
      body: JSON.stringify({ status }),
    })
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  const severityColor = (s: string) =>
    s === 'CRITICAL' ? T.red : s === 'HIGH' ? T.primary : s === 'MEDIUM' ? T.primary : T.green

  const statusColor = (s: string) =>
    s === 'OPEN' ? T.red : s === 'UNDER_REVIEW' ? T.primary : T.green

  const selectStyle: React.CSSProperties = {
    padding: '0.35rem 0.5rem', background: T.bg, border: `1px solid ${T.border}`,
    color: T.text, borderRadius: '3px', fontSize: '0.65rem',
  }

  return (
    <div style={{ padding: '1.5rem', background: T.bg, minHeight: '100vh', color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
      <h2 style={{ fontSize: '0.9rem', color: T.primary, margin: '0 0 1rem', fontWeight: 700 }}>
        INCIDENT QUEUE
      </h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="">All Severities</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="UNDER_REVIEW">UNDER REVIEW</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <input
          value={filterUin}
          onChange={e => setFilterUin(e.target.value)}
          placeholder="Filter by UIN..."
          style={{ ...selectStyle, width: '160px' }}
        />
        <span style={{ fontSize: '0.65rem', color: T.muted, alignSelf: 'center' }}>
          {incidents.length} incidents
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: T.muted, padding: '2rem', textAlign: 'center' }}>Loading...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Severity', 'UIN', 'Mission', 'Description', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.5rem', textAlign: 'left', color: T.muted, fontWeight: 600, fontSize: '0.6rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id} style={{ borderBottom: `1px solid ${T.border}10` }}>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{
                      background: severityColor(inc.severity) + '20',
                      color: severityColor(inc.severity),
                      padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700,
                    }}>
                      {inc.severity}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', color: T.textBright }}>{inc.uin}</td>
                  <td style={{ padding: '0.5rem', color: T.text }}>{inc.missionId}</td>
                  <td style={{ padding: '0.5rem', color: T.text, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inc.description}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{ color: statusColor(inc.status), fontWeight: 600 }}>{inc.status}</span>
                  </td>
                  <td style={{ padding: '0.5rem', color: T.muted }}>
                    {new Date(inc.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                        style={{
                          padding: '0.2rem 0.4rem', background: T.primary + '20',
                          border: `1px solid ${T.primary}40`, color: T.primary,
                          cursor: 'pointer', borderRadius: '3px', fontSize: '0.55rem',
                        }}
                      >
                        VIEW
                      </button>
                      {inc.status === 'OPEN' && (
                        <button
                          onClick={() => updateStatus(inc.id, 'UNDER_REVIEW')}
                          style={{
                            padding: '0.2rem 0.4rem', background: 'none',
                            border: `1px solid ${T.border}`, color: T.muted,
                            cursor: 'pointer', borderRadius: '3px', fontSize: '0.55rem',
                          }}
                        >
                          REVIEW
                        </button>
                      )}
                      {inc.status === 'UNDER_REVIEW' && (
                        <button
                          onClick={() => updateStatus(inc.id, 'RESOLVED')}
                          style={{
                            padding: '0.2rem 0.4rem', background: 'none',
                            border: `1px solid ${T.green}40`, color: T.green,
                            cursor: 'pointer', borderRadius: '3px', fontSize: '0.55rem',
                          }}
                        >
                          RESOLVE
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: T.muted }}>
                    No incidents found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

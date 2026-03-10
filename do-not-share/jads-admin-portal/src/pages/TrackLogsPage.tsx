import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#00FF88',
  amber:      '#FFB800',
  red:        '#FF3B3B',
  muted:      '#4A7A5A',
  text:       '#b0c8b8',
  textBright: '#d0e8d8',
}

interface TrackLog {
  id: string
  operatorId: string
  droneSerialNumber: string
  format: string
  maxAltitude: number
  breachCount: number
  createdAt: string
}

export function TrackLogsPage() {
  const { token } = useAdminAuth()
  const [logs, setLogs]       = useState<TrackLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const { data } = await adminAxios(token).get('/track-logs')
        setLogs(data.trackLogs ?? data.logs ?? [])
      } catch (e: any) {
        setError(e.response?.data?.error ?? 'Failed to fetch track logs')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString() : '\u2014'
  const truncId = (id: string) => id.length > 12 ? id.slice(0, 12) + '...' : id

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'monospace', color: T.text }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        TRACK LOGS
        <span style={{ fontSize: '0.65rem', color: T.muted, marginLeft: 'auto' }}>
          {logs.length} log(s)
        </span>
      </h1>

      {loading && <p style={{ color: T.muted }}>Loading...</p>}
      {error && (
        <div style={{ color: T.red, padding: '0.75rem', background: T.red + '15',
          border: `1px solid ${T.red}40`, borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <p style={{ color: T.muted }}>No track logs found.</p>
      )}

      {!loading && logs.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>ID</th>
                <th style={{ padding: '0.5rem' }}>Operator ID</th>
                <th style={{ padding: '0.5rem' }}>Drone S/N</th>
                <th style={{ padding: '0.5rem' }}>Format</th>
                <th style={{ padding: '0.5rem' }}>Max Alt</th>
                <th style={{ padding: '0.5rem' }}>Breach Count</th>
                <th style={{ padding: '0.5rem' }}>Uploaded At</th>
                <th style={{ padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: `1px solid ${T.border}10` }}>
                  <td style={{ padding: '0.4rem 0.5rem', color: T.primary, fontWeight: 600 }}>{truncId(log.id)}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{truncId(log.operatorId ?? '\u2014')}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{log.droneSerialNumber}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{log.format}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{log.maxAltitude != null ? `${log.maxAltitude}m` : '\u2014'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', color: log.breachCount > 0 ? T.red : T.primary, fontWeight: 600 }}>
                    {log.breachCount}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.65rem' }}>{fmtDate(log.createdAt)}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>
                    <Link to={`/track-logs/${log.id}`}
                      style={{
                        background: 'transparent', border: `1px solid ${T.border}`, borderRadius: '3px',
                        color: T.primary, padding: '2px 8px', cursor: 'pointer', fontSize: '0.65rem',
                        textDecoration: 'none',
                      }}>VIEW</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

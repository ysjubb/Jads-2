import React, { useEffect, useState } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'
import { useNavigate } from 'react-router-dom'

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

interface DashboardStats {
  civilianUsers:    number
  specialUsers:     number
  pendingVersions:  number
  suspendedUsers:   number
  dueReconfirmation: number
}

function StatCard({ label, value, colour, onClick }: {
  label: string; value: number; colour: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px',
        padding: '1.25rem 1.5rem', flex: 1, minWidth: '160px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: `0 1px 4px rgba(0,255,136,0.05)`
      }}
    >
      <div style={{ fontSize: '2rem', fontWeight: 700, color: colour }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: T.text, marginTop: '0.25rem' }}>{label}</div>
    </div>
  )
}

export function DashboardPage() {
  const { token, logout } = useAdminAuth()
  const navigate = useNavigate()
  const [stats, setStats]     = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      adminAxios(token).get('/users?limit=1'),
      adminAxios(token).get('/special-users?limit=1'),
      adminAxios(token).get('/airspace/versions?limit=1'),
      adminAxios(token).get('/users?limit=1&status=SUSPENDED'),
    ])
      .then(([u, su, v, suspended]) => {
        setStats({
          civilianUsers:     u.data.total,
          specialUsers:      su.data.total,
          pendingVersions:   v.data.total,
          suspendedUsers:    suspended.data.total,
          dueReconfirmation: 0,
        })
      })
      .catch(e => {
        if (e.response?.status === 401) { logout(); return }
        setError(e.response?.data?.error ?? 'FETCH_FAILED')
      })
      .finally(() => setLoading(false))
  }, [token, logout])

  if (loading) return <div style={{ padding: '2rem', color: T.muted }}>Loading dashboard...</div>
  if (error)   return <div style={{ padding: '2rem', color: T.red }}>Error: {error}</div>

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1.5rem', color: T.textBright }}>Dashboard</h2>

      {stats && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <StatCard
            label="Civilian Users" value={stats.civilianUsers}
            colour={T.primary} onClick={() => navigate('/users')}
          />
          <StatCard
            label="Special Users" value={stats.specialUsers}
            colour="#B060FF" onClick={() => navigate('/special-users')}
          />
          <StatCard
            label="Suspended Users" value={stats.suspendedUsers}
            colour={stats.suspendedUsers > 0 ? T.red : T.primary}
            onClick={() => navigate('/users')}
          />
          <StatCard
            label="Airspace Versions" value={stats.pendingVersions}
            colour={T.amber} onClick={() => navigate('/airspace')}
          />
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: T.amber + '15',
        border: `1px solid ${T.amber}40`, borderRadius: '6px', fontSize: '0.85rem', color: T.amber }}>
        <strong>Platform invariants:</strong> No user deletions — only suspend.
        No airspace deletions — only deprecate or expire. All write actions logged to audit_log.
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'
import { useNavigate } from 'react-router-dom'

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
        background: 'white', border: '1px solid #f0f0f0', borderRadius: '8px',
        padding: '1.25rem 1.5rem', flex: 1, minWidth: '160px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
      }}
    >
      <div style={{ fontSize: '2rem', fontWeight: 700, color: colour }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#595959', marginTop: '0.25rem' }}>{label}</div>
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

  if (loading) return <div style={{ padding: '2rem', color: '#8c8c8c' }}>Loading dashboard…</div>
  if (error)   return <div style={{ padding: '2rem', color: '#cf1322' }}>Error: {error}</div>

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Dashboard</h2>

      {stats && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <StatCard
            label="Civilian Users" value={stats.civilianUsers}
            colour="#1890ff" onClick={() => navigate('/users')}
          />
          <StatCard
            label="Special Users" value={stats.specialUsers}
            colour="#722ed1" onClick={() => navigate('/special-users')}
          />
          <StatCard
            label="Suspended Users" value={stats.suspendedUsers}
            colour={stats.suspendedUsers > 0 ? '#ff4d4f' : '#52c41a'}
            onClick={() => navigate('/users')}
          />
          <StatCard
            label="Airspace Versions" value={stats.pendingVersions}
            colour="#fa8c16" onClick={() => navigate('/airspace')}
          />
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#fffbe6',
        border: '1px solid #ffe58f', borderRadius: '6px', fontSize: '0.85rem' }}>
        <strong>Platform invariants:</strong> No user deletions — only suspend.
        No airspace deletions — only deprecate or expire. All write actions logged to audit_log.
      </div>
    </div>
  )
}

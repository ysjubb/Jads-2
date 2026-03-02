import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

interface SpecialUser {
  id: string
  specialUserId: string
  entityCode: string
  serviceNumber: string
  officialEmail: string
  mobileNumber: string
  unitDesignation: string
  role: string
  accountStatus: string
  lastAdminReconfirmAt: string | null
  nextAdminReconfirmDue: string | null
  authorisedCallsigns: string[]
  createdAt: string
}

const STATUS_COLOUR: Record<string, string> = {
  ACTIVE:    '#52c41a',
  SUSPENDED: '#ff4d4f',
  EXPIRED:   '#faad14',
}

export function SpecialUsersPage() {
  const { token, logout } = useAdminAuth()
  const [users, setUsers]         = useState<SpecialUser[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [entityFilter, setEntity] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, any> = { page, limit: 50 }
      if (entityFilter) params.entityCode = entityFilter
      const { data } = await adminAxios(token).get('/special-users', { params })
      setUsers(data.users)
      setTotal(data.total)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, entityFilter, logout])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const reconfirm = async (userId: string) => {
    if (!token) return
    try {
      await adminAxios(token).patch(`/special-users/${userId}/reconfirm`)
      fetchUsers()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'RECONFIRM_FAILED')
    }
  }

  const suspend = async (userId: string) => {
    if (!token) return
    const reason = window.prompt('Reason for suspension:')
    if (!reason) return
    try {
      await adminAxios(token).patch(`/special-users/${userId}/status`, { status: 'SUSPENDED', reason })
      fetchUsers()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'SUSPEND_FAILED')
    }
  }

  const isDueSoon = (due: string | null) => {
    if (!due) return false
    return new Date(due).getTime() - Date.now() < 7 * 24 * 3600000
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Special Users</h2>
        <span style={{ fontSize: '0.8rem', color: '#8c8c8c' }}>{total} total</span>
      </div>

      {/* Entity filter */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select
          value={entityFilter}
          onChange={e => { setEntity(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: '1px solid #d9d9d9', borderRadius: '4px' }}
        >
          <option value="">All entities</option>
          <option value="IAF">IAF</option>
          <option value="ARMY">ARMY</option>
          <option value="NAVY">NAVY</option>
          <option value="DGCA">DGCA</option>
          <option value="AAI">AAI</option>
        </select>
      </div>

      {error && (
        <div style={{ color: '#cf1322', padding: '0.75rem', background: '#fff2f0',
          border: '1px solid #ffccc7', borderRadius: '4px', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color: '#8c8c8c', marginBottom: '1rem' }}>Loading…</div>}
      {!loading && !error && users.length === 0 && (
        <div style={{ color: '#8c8c8c', padding: '2rem', textAlign: 'center' }}>No special users found.</div>
      )}

      {!loading && users.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
              {['Special ID', 'Entity', 'Unit', 'Role', 'Status', 'Reconfirm Due', 'Callsigns', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {u.specialUserId}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.entityCode}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.unitDesignation}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.role}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{ color: STATUS_COLOUR[u.accountStatus] ?? '#8c8c8c', fontWeight: 500 }}>
                    {u.accountStatus}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem',
                  color: isDueSoon(u.nextAdminReconfirmDue) ? '#d48806' : 'inherit' }}>
                  {u.nextAdminReconfirmDue
                    ? new Date(u.nextAdminReconfirmDue).toLocaleDateString()
                    : '—'}
                  {isDueSoon(u.nextAdminReconfirmDue) && (
                    <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>⚠</span>
                  )}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#595959' }}>
                  {u.authorisedCallsigns.join(', ') || '—'}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => reconfirm(u.id)}
                    style={{ padding: '0.2rem 0.45rem', background: '#e6f7ff',
                      border: '1px solid #91d5ff', color: '#0050b3',
                      borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Reconfirm
                  </button>
                  {u.accountStatus === 'ACTIVE' && (
                    <button
                      onClick={() => suspend(u.id)}
                      style={{ padding: '0.2rem 0.45rem', background: '#fff1f0',
                        border: '1px solid #ffccc7', color: '#cf1322',
                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <span>Page {page} · {total} total</span>
        <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page * 50 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 50 >= total ? 0.5 : 1 }}>
          Next
        </button>
      </div>
    </div>
  )
}

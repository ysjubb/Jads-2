import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../hooks/useAdminAuth'

interface UserRow {
  id: string
  email: string
  mobileNumber: string
  role: string
  accountStatus: string
  verificationStatus: string
  aadhaarLast4: string | null
  lastLoginAt: string | null
  createdAt: string
}

const STATUS_COLOUR: Record<string, string> = {
  ACTIVE:               '#52c41a',
  SUSPENDED:            '#ff4d4f',
  PENDING_VERIFICATION: '#faad14',
}

export function UsersPage() {
  const { token, logout } = useAdminAuth()
  const [users, setUsers]     = useState<UserRow[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const params: Record<string, any> = { page, limit: 50 }
      if (search) params.search = search
      if (status) params.status = status
      const { data } = await adminAxios(token).get('/users', { params })
      setUsers(data.users)
      setTotal(data.total)
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); return }
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token, page, search, status, logout])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const updateStatus = async (userId: string, newStatus: string) => {
    if (!token) return
    const reason = window.prompt(`Reason for changing status to ${newStatus}:`)
    if (!reason) return
    try {
      await adminAxios(token).patch(`/users/${userId}/status`, { status: newStatus, reason })
      fetchUsers()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'UPDATE_FAILED')
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Civilian Users</h2>
        <span style={{ fontSize: '0.8rem', color: '#8c8c8c' }}>{total} total</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input
          placeholder="Search email or mobile"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px', flex: 1 }}
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem', border: '1px solid #d9d9d9', borderRadius: '4px' }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="PENDING_VERIFICATION">Pending Verification</option>
        </select>
      </div>

      {/* States */}
      {error && (
        <div style={{ color: '#cf1322', padding: '0.75rem', background: '#fff2f0',
          border: '1px solid #ffccc7', borderRadius: '4px', marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}
      {loading && <div style={{ color: '#8c8c8c', marginBottom: '1rem' }}>Loading users…</div>}
      {!loading && !error && users.length === 0 && (
        <div style={{ color: '#8c8c8c', padding: '2rem', textAlign: 'center' }}>No users found.</div>
      )}

      {!loading && users.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
              {['Email', 'Mobile', 'Role', 'Status', 'Aadhaar', 'Last Login', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.email}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.mobileNumber}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{u.role}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{ color: STATUS_COLOUR[u.accountStatus] ?? '#8c8c8c', fontWeight: 500 }}>
                    {u.accountStatus}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  {u.aadhaarLast4 ? `****${u.aadhaarLast4}` : '—'}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  {/* WARNING 2: Only PATCH/suspend — never DELETE */}
                  {u.accountStatus === 'ACTIVE'
                    ? (
                      <button
                        onClick={() => updateStatus(u.id, 'SUSPENDED')}
                        style={{ padding: '0.25rem 0.5rem', background: '#fff1f0',
                          border: '1px solid #ffccc7', color: '#cf1322',
                          borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => updateStatus(u.id, 'ACTIVE')}
                        style={{ padding: '0.25rem 0.5rem', background: '#f6ffed',
                          border: '1px solid #b7eb8f', color: '#389e0d',
                          borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Reinstate
                      </button>
                    )
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
        >
          Prev
        </button>
        <span>Page {page} · {total} total users</span>
        <button
          disabled={page * 50 >= total}
          onClick={() => setPage(p => p + 1)}
          style={{ padding: '0.3rem 0.75rem', border: '1px solid #d9d9d9', borderRadius: '4px',
            cursor: page * 50 >= total ? 'not-allowed' : 'pointer',
            opacity: page * 50 >= total ? 0.5 : 1 }}
        >
          Next
        </button>
      </div>
    </div>
  )
}

// ── NotificationsPage ────────────────────────────────────────────────────────
// Full notification centre with table view, filters, and bulk actions.
// Route: /drone/notifications
//
// Features:
//   - Full table: Type | Title | Message | Date | Status
//   - Filter: unread only, category, date range
//   - "Mark All Read" button
//   - Pagination

import React, { useState, useEffect, useCallback } from 'react'
import { T } from '../../App'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id:        string
  type:      string
  title:     string
  body:      string
  read:      boolean
  createdAt: string
  readAt:    string | null
  metadata:  Record<string, unknown>
}

type CategoryFilter = 'ALL' | 'EXPIRY' | 'PERMISSION' | 'COMPLIANCE' | 'SYSTEM'

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  EXPIRY:     '#FFB800',
  PERMISSION: '#00AAFF',
  COMPLIANCE: '#FF3B3B',
  SYSTEM:     '#8B5CF6',
}

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  ALL:        'All',
  EXPIRY:     'Expiry',
  PERMISSION: 'Permissions',
  COMPLIANCE: 'Compliance',
  SYSTEM:     'System',
}

function getCategoryFromType(type: string): string {
  if (type.startsWith('EXPIRY'))     return 'EXPIRY'
  if (type.startsWith('PERMISSION')) return 'PERMISSION'
  if (type === 'VIOLATION_DETECTED' || type === 'COMPLIANCE_WARNING') return 'COMPLIANCE'
  return 'SYSTEM'
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const PAGE_SIZE = 20

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [unreadOnly, setUnreadOnly]     = useState(false)
  const [category, setCategory]         = useState<CategoryFilter>('ALL')
  const [loading, setLoading]           = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page:  String(page),
        limit: String(PAGE_SIZE),
      }
      if (unreadOnly) params.unread = 'true'
      if (category !== 'ALL') params.category = category

      const { data } = await userApi().get('/drone/notifications', { params })
      setNotifications(data.notifications ?? [])
      setTotal(data.total ?? 0)
    } catch { /* silent */ }
    setLoading(false)
  }, [page, unreadOnly, category])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const markAllRead = async () => {
    try {
      await userApi().post('/drone/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() })))
    } catch { /* silent */ }
  }

  const markRead = async (id: string) => {
    try {
      await userApi().post(`/drone/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    } catch { /* silent */ }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Styles ──────────────────────────────────────────────────────────────

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.6rem', fontSize: '0.72rem', color: T.text,
    borderBottom: `1px solid ${T.border}`, verticalAlign: 'top',
  }

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle, color: T.muted, fontWeight: 600, fontSize: '0.65rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    position: 'sticky', top: 0, background: T.surface, zIndex: 1,
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ color: T.textBright, fontSize: '1.1rem', margin: 0, fontWeight: 700 }}>
            NOTIFICATIONS
          </h1>
          <span style={{ color: T.muted, fontSize: '0.7rem' }}>
            {total} total notification{total !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={markAllRead}
          style={{
            background: T.primary + '15',
            border: `1px solid ${T.primary}40`,
            borderRadius: '6px', padding: '0.4rem 0.8rem',
            color: T.primary, fontSize: '0.72rem', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Mark All Read
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Unread toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          color: T.text, fontSize: '0.72rem', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => { setUnreadOnly(e.target.checked); setPage(1) }}
            style={{ accentColor: T.primary }}
          />
          Unread only
        </label>

        {/* Category filter pills */}
        {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map(cat => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); setPage(1) }}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              border: category === cat ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
              background: category === cat ? T.primary + '15' : 'transparent',
              color: category === cat ? T.primary : T.muted,
              fontSize: '0.68rem', fontWeight: 500, cursor: 'pointer',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        border: `1px solid ${T.border}`, borderRadius: '8px',
        overflow: 'auto', maxHeight: 'calc(100vh - 260px)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '130px' }}>TYPE</th>
              <th style={{ ...headerCellStyle, width: '200px' }}>TITLE</th>
              <th style={headerCellStyle}>MESSAGE</th>
              <th style={{ ...headerCellStyle, width: '140px' }}>DATE</th>
              <th style={{ ...headerCellStyle, width: '80px', textAlign: 'center' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ ...cellStyle, textAlign: 'center', color: T.muted, padding: '2rem' }}>
                  Loading...
                </td>
              </tr>
            ) : notifications.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...cellStyle, textAlign: 'center', color: T.muted, padding: '2rem' }}>
                  No notifications found
                </td>
              </tr>
            ) : (
              notifications.map(n => {
                const cat = getCategoryFromType(n.type)
                const catColor = CATEGORY_COLORS[cat] ?? T.muted
                return (
                  <tr
                    key={n.id}
                    style={{
                      background: n.read ? 'transparent' : T.primary + '06',
                      cursor: n.read ? 'default' : 'pointer',
                    }}
                    onClick={() => { if (!n.read) markRead(n.id) }}
                  >
                    <td style={cellStyle}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.4rem',
                        borderRadius: '3px', fontSize: '0.6rem', fontWeight: 600,
                        background: catColor + '20', color: catColor,
                        letterSpacing: '0.03em',
                      }}>
                        {formatType(n.type)}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, color: n.read ? T.text : T.textBright, fontWeight: n.read ? 400 : 600 }}>
                      {n.title}
                    </td>
                    <td style={{ ...cellStyle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.body}
                    </td>
                    <td style={{ ...cellStyle, fontSize: '0.65rem' }}>
                      {formatDate(n.createdAt)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', width: '8px', height: '8px',
                        borderRadius: '50%',
                        background: n.read ? T.muted : T.primary,
                      }} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '0.4rem',
          marginTop: '1rem',
        }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '0.3rem 0.6rem', border: `1px solid ${T.border}`,
              borderRadius: '4px', background: 'transparent',
              color: page <= 1 ? T.muted : T.text,
              fontSize: '0.7rem', cursor: page <= 1 ? 'default' : 'pointer',
            }}
          >
            Prev
          </button>
          <span style={{ color: T.muted, fontSize: '0.7rem', padding: '0.3rem 0.5rem' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '0.3rem 0.6rem', border: `1px solid ${T.border}`,
              borderRadius: '4px', background: 'transparent',
              color: page >= totalPages ? T.muted : T.text,
              fontSize: '0.7rem', cursor: page >= totalPages ? 'default' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

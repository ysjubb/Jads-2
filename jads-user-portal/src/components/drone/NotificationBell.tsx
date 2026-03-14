// ── NotificationBell ─────────────────────────────────────────────────────────
// Bell icon with unread count badge for the header/sidebar.
// Shows a dropdown with the last 10 notifications, colour-coded by category.
// Clicking "View All" navigates to /drone/notifications.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id:        string
  type:      string
  title:     string
  body:      string
  read:      boolean
  createdAt: string
  metadata:  Record<string, unknown>
}

// ── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  EXPIRY:     '#FFB800',  // amber
  PERMISSION: '#00AAFF',  // blue
  COMPLIANCE: '#FF3B3B',  // red
  SYSTEM:     '#8B5CF6',  // purple
}

function getCategoryFromType(type: string): string {
  if (type.startsWith('EXPIRY'))     return 'EXPIRY'
  if (type.startsWith('PERMISSION')) return 'PERMISSION'
  if (type === 'VIOLATION_DETECTED' || type === 'COMPLIANCE_WARNING') return 'COMPLIANCE'
  return 'SYSTEM'
}

function getCategoryColor(type: string): string {
  return CATEGORY_COLORS[getCategoryFromType(type)] ?? T.muted
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch unread count every 30 seconds
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await userApi().get('/drone/notifications/unread-count')
      setUnreadCount(data.count ?? 0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30_000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Fetch last 10 notifications when dropdown opens
  const fetchRecent = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await userApi().get('/drone/notifications', {
        params: { limit: 10, page: 1 },
      })
      setNotifications(data.notifications ?? [])
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) fetchRecent()
  }, [open, fetchRecent])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Mark single as read
  const markRead = async (id: string) => {
    try {
      await userApi().post(`/drone/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* silent */ }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent',
          border: `1px solid ${T.border}`,
          borderRadius: '6px',
          padding: '6px 10px',
          cursor: 'pointer',
          position: 'relative',
          color: T.text,
          fontSize: '0.85rem',
        }}
        title="Notifications"
      >
        {/* Bell SVG */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: T.red, color: '#fff', borderRadius: '50%',
            minWidth: '16px', height: '16px', fontSize: '0.6rem',
            fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '8px',
          width: '340px', maxHeight: '420px', overflowY: 'auto',
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: '0.6rem 0.8rem', borderBottom: `1px solid ${T.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: T.textBright, fontSize: '0.8rem', fontWeight: 600 }}>
              NOTIFICATIONS
            </span>
            <button
              onClick={() => { setOpen(false); navigate('/drone/notifications') }}
              style={{
                background: 'none', border: 'none', color: T.primary,
                cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500,
              }}
            >
              View All
            </button>
          </div>

          {/* Notification list */}
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: T.muted, fontSize: '0.75rem' }}>
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: T.muted, fontSize: '0.75rem' }}>
              No notifications
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => { if (!n.read) markRead(n.id) }}
                style={{
                  padding: '0.6rem 0.8rem',
                  borderBottom: `1px solid ${T.border}`,
                  cursor: n.read ? 'default' : 'pointer',
                  background: n.read ? 'transparent' : T.primary + '08',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  {/* Category colour dot */}
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: getCategoryColor(n.type), flexShrink: 0,
                  }} />
                  <span style={{
                    color: n.read ? T.muted : T.textBright,
                    fontSize: '0.75rem', fontWeight: n.read ? 400 : 600,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.title}
                  </span>
                  <span style={{ color: T.muted, fontSize: '0.6rem', flexShrink: 0 }}>
                    {formatTimeAgo(n.createdAt)}
                  </span>
                </div>
                <div style={{
                  color: T.muted, fontSize: '0.65rem', lineHeight: 1.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  paddingLeft: '10px',
                }}>
                  {n.body}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

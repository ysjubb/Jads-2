import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuditLoginPage }    from './pages/AuditLoginPage'
import { MissionsPage }      from './pages/MissionsPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { FlightPlansPage }       from './pages/FlightPlansPage'
import { FlightPlanDetailPage } from './pages/FlightPlanDetailPage'
import { ViolationsPage }    from './pages/ViolationsPage'
import { TrackLogsPage }         from './pages/TrackLogsPage'
import { TrackLogDetailPage }    from './pages/TrackLogDetailPage'
import { useAuditAuth }      from './hooks/useAuditAuth'

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

const NAV_ITEMS = [
  { to: '/missions',     label: 'Missions',     icon: 'M3 3h18v2H3V3zm0 8h18v2H3v-2zm0 8h18v2H3v-2z' },
  { to: '/flight-plans', label: 'Flight Plans',  icon: 'M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z' },
  { to: '/violations',   label: 'Violations',    icon: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' },
  { to: '/track-logs',   label: 'Track Logs',    icon: 'M3 3v18h18V3H3zm16 16H5V5h14v14zM7 7h2v10H7V7zm4 4h2v6h-2v-6zm4-2h2v8h-2V9z' },
]

function SidebarNav() {
  const { logout } = useAuditAuth()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <nav style={{
      width: collapsed ? '56px' : '200px',
      minHeight: '100vh',
      background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{
        padding: collapsed ? '1rem 0.5rem' : '1.25rem 1rem',
        borderBottom: `1px solid ${T.border}`,
        textAlign: collapsed ? 'center' : 'left',
      }}>
        <div style={{
          fontWeight: 700,
          fontSize: collapsed ? '0.75rem' : '0.95rem',
          color: T.primary,
          letterSpacing: '0.08em',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {collapsed ? 'JA' : 'JADS'}
        </div>
        {!collapsed && (
          <div style={{ fontSize: '0.65rem', color: T.muted, marginTop: '0.15rem',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>
            AUDIT PORTAL v4.0
          </div>
        )}
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, padding: '0.5rem 0' }}>
        {NAV_ITEMS.map(item => {
          const active = loc.pathname.startsWith(item.to)
          return (
            <Link key={item.to} to={item.to} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: collapsed ? '0.7rem 0' : '0.6rem 1rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              color: active ? T.primary : T.text,
              background: active ? T.primary + '15' : 'transparent',
              borderRight: active ? `2px solid ${T.primary}` : '2px solid transparent',
              fontSize: '0.8rem',
              fontWeight: active ? 600 : 400,
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 0.15s ease',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={active ? T.primary : T.muted}
                style={{ flexShrink: 0 }}>
                <path d={item.icon} />
              </svg>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </div>

      {/* Collapse toggle + Sign out */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: '0.5rem' }}>
        <button onClick={() => setCollapsed(c => !c)}
          style={{
            width: '100%',
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${T.border}`,
            borderRadius: '4px',
            color: T.muted,
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: '0.4rem',
          }}>
          {collapsed ? '>>' : '<< Collapse'}
        </button>
        <button onClick={logout}
          style={{
            width: '100%',
            padding: '0.4rem',
            background: 'transparent',
            border: `1px solid ${T.border}`,
            borderRadius: '4px',
            color: T.red,
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
          {collapsed ? 'X' : 'Sign Out'}
        </button>
      </div>
    </nav>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuditAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <SidebarNav />
      <main style={{ flex: 1, minHeight: '100vh', background: T.bg, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuditLoginPage />} />
        <Route path="/missions" element={
          <Protected><Layout><MissionsPage /></Layout></Protected>
        } />
        <Route path="/missions/:id" element={
          <Protected><Layout><MissionDetailPage /></Layout></Protected>
        } />
        <Route path="/flight-plans" element={
          <Protected><Layout><FlightPlansPage /></Layout></Protected>
        } />
        <Route path="/flight-plans/:id" element={
          <Protected><Layout><FlightPlanDetailPage /></Layout></Protected>
        } />
        <Route path="/violations" element={
          <Protected><Layout><ViolationsPage /></Layout></Protected>
        } />
        <Route path="/track-logs" element={
          <Protected><Layout><TrackLogsPage /></Layout></Protected>
        } />
        <Route path="/track-logs/:id" element={
          <Protected><Layout><TrackLogDetailPage /></Layout></Protected>
        } />
        <Route path="*" element={<Navigate to="/missions" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

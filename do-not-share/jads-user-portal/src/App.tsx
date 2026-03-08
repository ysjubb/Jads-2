import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LoginPage }             from './pages/LoginPage'
import { DashboardPage }         from './pages/DashboardPage'
import { FileFlightPlanPage }    from './pages/FileFlightPlanPage'
import { FileDronePlanPage }     from './pages/FileDronePlanPage'
import { FlightPlanDetailPage }  from './pages/FlightPlanDetailPage'
import { EditFlightPlanPage }    from './pages/EditFlightPlanPage'
import { DronePlanDetailPage }   from './pages/DronePlanDetailPage'
import { useAuth }               from './hooks/useAuth'

// ── Theme Constants (blue-tinted variant for user portal) ─────────────────────
export const T = {
  bg:         '#050A08',
  surface:    '#0A0E12',
  border:     '#1A2030',
  primary:    '#00AAFF',
  amber:      '#FFB800',
  red:        '#FF3B3B',
  muted:      '#4A6A7A',
  text:       '#b0c8d8',
  textBright: '#d0e8f8',
}

const NAV_ITEMS = [
  { to: '/',                 label: 'DASHBOARD',  icon: '///' },
  { to: '/file-flight-plan', label: 'FILE FPL',   icon: 'FPL' },
  { to: '/file-drone-plan',  label: 'FILE DRONE', icon: 'DOP' },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { logout } = useAuth()
  const w = collapsed ? '52px' : '200px'

  return (
    <nav style={{
      width: w, minWidth: w, height: '100vh', position: 'sticky', top: 0,
      background: T.surface, borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', transition: 'width 0.2s',
      overflow: 'hidden',
    }}>
      <div onClick={onToggle}
        style={{
          padding: collapsed ? '1rem 0.5rem' : '1rem',
          borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
        <span style={{ color: T.primary, fontWeight: 700, fontSize: '1rem' }}>
          {collapsed ? 'J' : 'JADS'}
        </span>
        {!collapsed && <span style={{ fontSize: '0.6rem', color: T.muted }}>USER PORTAL v4.0</span>}
      </div>

      <div style={{ flex: 1, padding: '0.5rem 0' }}>
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: collapsed ? '0.6rem 0' : '0.6rem 1rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500,
              color: isActive ? T.primary : T.muted,
              background: isActive ? T.primary + '10' : 'transparent',
              borderLeft: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
              transition: 'all 0.15s',
            })}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, width: '24px', textAlign: 'center' }}>
              {item.icon}
            </span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </div>

      <button onClick={logout}
        style={{
          padding: '0.75rem', border: 'none', borderTop: `1px solid ${T.border}`,
          background: 'transparent', color: T.red, cursor: 'pointer',
          fontSize: '0.7rem', fontWeight: 600,
        }}>
        {collapsed ? 'X' : 'SIGN OUT'}
      </button>
    </nav>
  )
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  if (!token) return <Navigate to="/login" replace />
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main style={{ flex: 1, minHeight: '100vh', overflow: 'auto' }}>{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/"                    element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/file-flight-plan"    element={<ProtectedLayout><FileFlightPlanPage /></ProtectedLayout>} />
        <Route path="/file-drone-plan"     element={<ProtectedLayout><FileDronePlanPage /></ProtectedLayout>} />
        <Route path="/flight-plan/:id"     element={<ProtectedLayout><FlightPlanDetailPage /></ProtectedLayout>} />
        <Route path="/edit-flight-plan/:id" element={<ProtectedLayout><EditFlightPlanPage /></ProtectedLayout>} />
        <Route path="/drone-plan/:id"      element={<ProtectedLayout><DronePlanDetailPage /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

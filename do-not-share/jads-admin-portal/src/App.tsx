import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LoginPage }        from './pages/LoginPage'
import { DashboardPage }    from './pages/DashboardPage'
import { UsersPage }        from './pages/UsersPage'
import { SpecialUsersPage } from './pages/SpecialUsersPage'
import { AirspacePage }     from './pages/AirspacePage'
import { FlightPlansPage }  from './pages/FlightPlansPage'
import { DroneZonesPage }   from './pages/DroneZonesPage'
import { useAdminAuth }     from './hooks/useAdminAuth'

// ── HUD Theme Constants ─────────────────────────────────────────────────────
export const T = {
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

const NAV_ITEMS = [
  { to: '/',              label: 'DASHBOARD',     icon: '///' },
  { to: '/users',         label: 'USERS',         icon: 'USR' },
  { to: '/special-users', label: 'SPECIAL USERS', icon: 'GOV' },
  { to: '/airspace',      label: 'AIRSPACE',      icon: 'AIR' },
  { to: '/drone-zones',   label: 'DRONE ZONES',   icon: 'DRN' },
  { to: '/flight-plans',  label: 'FLIGHT PLANS',  icon: 'FPL' },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { logout } = useAdminAuth()
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
        {!collapsed && <span style={{ fontSize: '0.65rem', color: T.muted }}>ADMIN v4.0</span>}
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
  const { token } = useAdminAuth()
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
        <Route path="/"              element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/users"         element={<ProtectedLayout><UsersPage /></ProtectedLayout>} />
        <Route path="/special-users" element={<ProtectedLayout><SpecialUsersPage /></ProtectedLayout>} />
        <Route path="/airspace"      element={<ProtectedLayout><AirspacePage /></ProtectedLayout>} />
        <Route path="/drone-zones"   element={<ProtectedLayout><DroneZonesPage /></ProtectedLayout>} />
        <Route path="/flight-plans"  element={<ProtectedLayout><FlightPlansPage /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

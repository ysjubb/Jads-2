import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LoginPage }        from './pages/LoginPage'
import { DashboardPage }    from './pages/DashboardPage'
import { UsersPage }        from './pages/UsersPage'
import { SpecialUsersPage } from './pages/SpecialUsersPage'
import { AirspacePage }     from './pages/AirspacePage'
import { FlightPlansPage }  from './pages/FlightPlansPage'
import { DroneZonesPage }    from './pages/DroneZonesPage'
import { DroneMissionsPage } from './pages/DroneMissionsPage'
import { DroneOperationPlansPage } from './pages/DroneOperationPlansPage'
import { ATCQueuePage }     from './pages/drone/ATCQueuePage'
import { UserCategoryPage } from './pages/drone/UserCategoryPage'
import { NPNTTestPage }    from './pages/drone/NPNTTestPage'
import { ValidationAnalyticsPage } from './pages/drone/ValidationAnalyticsPage'
import { AlertManagementPage } from './pages/drone/AlertManagementPage'
import { FleetOverviewPage }   from './pages/drone/FleetOverviewPage'
import { NationalAnalyticsPage } from './pages/drone/NationalAnalyticsPage'
import { SystemPage }       from './pages/SystemPage'
import { ViolationAlertDashboard } from './components/ViolationAlertDashboard'
import { ViolationDashboard }     from './pages/ViolationDashboard'
import { useAdminAuth }     from './hooks/useAdminAuth'
import { T }                from './theme'
export { T }                from './theme'

const NAV_ITEMS = [
  { to: '/',              label: 'DASHBOARD',     icon: '///' },
  { to: '/users',         label: 'USERS',         icon: 'USR' },
  { to: '/special-users', label: 'SPECIAL USERS', icon: 'GOV' },
  { to: '/airspace',      label: 'AIRSPACE',      icon: 'AIR' },
  { to: '/drone-zones',    label: 'DRONE ZONES',    icon: 'DRN' },
  { to: '/drone-missions', label: 'DRONE MISSIONS', icon: 'MSN' },
  { to: '/flight-plans',  label: 'FLIGHT PLANS',   icon: 'FPL' },
  { to: '/drone-plans',   label: 'DRONE PLANS',    icon: 'DOP' },
  { to: '/atc-queue',     label: 'ATC QUEUE',       icon: 'ATC' },
  { to: '/user-categories', label: 'USER CATS',     icon: 'CAT' },
  { to: '/npnt-test',     label: 'NPNT TEST',       icon: 'NPT' },
  { to: '/validation-analytics', label: 'VAL ANALYTICS', icon: 'VAL' },
  { to: '/alert-management',    label: 'ALERTS',         icon: 'ALR' },
  { to: '/fleet-overview',      label: 'FLEET OVW',      icon: 'FLO' },
  { to: '/national-analytics',  label: 'NATL ANALYTICS', icon: 'NAT' },
  { to: '/violation-alerts',     label: 'LIVE ALERTS',    icon: 'VIO' },
  { to: '/violation-dashboard', label: 'VIOLATIONS',     icon: 'VDH' },
  { to: '/system',              label: 'SYSTEM',         icon: 'SYS' },
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
        <Route path="/drone-zones"    element={<ProtectedLayout><DroneZonesPage /></ProtectedLayout>} />
        <Route path="/drone-missions" element={<ProtectedLayout><DroneMissionsPage /></ProtectedLayout>} />
        <Route path="/flight-plans"  element={<ProtectedLayout><FlightPlansPage /></ProtectedLayout>} />
        <Route path="/drone-plans"  element={<ProtectedLayout><DroneOperationPlansPage /></ProtectedLayout>} />
        <Route path="/atc-queue"   element={<ProtectedLayout><ATCQueuePage /></ProtectedLayout>} />
        <Route path="/user-categories" element={<ProtectedLayout><UserCategoryPage /></ProtectedLayout>} />
        <Route path="/npnt-test"   element={<ProtectedLayout><NPNTTestPage /></ProtectedLayout>} />
        <Route path="/validation-analytics" element={<ProtectedLayout><ValidationAnalyticsPage /></ProtectedLayout>} />
        <Route path="/alert-management"    element={<ProtectedLayout><AlertManagementPage /></ProtectedLayout>} />
        <Route path="/fleet-overview"      element={<ProtectedLayout><FleetOverviewPage /></ProtectedLayout>} />
        <Route path="/national-analytics" element={<ProtectedLayout><NationalAnalyticsPage /></ProtectedLayout>} />
        <Route path="/violation-alerts" element={<ProtectedLayout><ViolationAlertDashboard /></ProtectedLayout>} />
        <Route path="/violation-dashboard" element={<ProtectedLayout><ViolationDashboard /></ProtectedLayout>} />
        <Route path="/system"      element={<ProtectedLayout><SystemPage /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

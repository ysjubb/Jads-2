import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LoginPage }             from './pages/LoginPage'
import { DashboardPage }         from './pages/DashboardPage'
import { FileFlightPlanPage }    from './pages/FileFlightPlanPage'
import { FileDronePlanPage }     from './pages/FileDronePlanPage'
import { FlightPlanDetailPage }  from './pages/FlightPlanDetailPage'
import { EditFlightPlanPage }    from './pages/EditFlightPlanPage'
import { DronePlanDetailPage }   from './pages/DronePlanDetailPage'
import { PreFlightBriefing }    from './pages/PreFlightBriefing'
import { useAuth }               from './hooks/useAuth'
import { T }                     from './theme'

// Portal components
import { AirspaceMap }           from './components/portal/AirspaceMap'
import { FlightPlanForm }        from './components/portal/FlightPlanForm'
import { DroneTrackSubmission }  from './components/portal/DroneTrackSubmission'
import { NOTAMCenter }           from './components/portal/NOTAMCenter'
import { ComplianceChecklist }   from './components/portal/ComplianceChecklist'
import { EvidenceChainViewer }   from './components/portal/EvidenceChainViewer'
import { FleetManager }          from './components/portal/FleetManager'
import { WeightBalance }         from './components/portal/WeightBalance'
import { FuelPlanning }          from './components/portal/FuelPlanning'
import { APISettings }           from './components/portal/APISettings'

const NAV_ITEMS = [
  { to: '/',                 label: 'DASHBOARD',  icon: '///' },
  { to: '/file-flight-plan', label: 'FILE FPL',   icon: 'FPL' },
  { to: '/file-drone-plan',  label: 'FILE DRONE', icon: 'DOP' },
  { to: '/airspace',         label: 'AIRSPACE',   icon: 'MAP' },
  { to: '/icao-fpl',         label: 'ICAO FPL',   icon: 'ICO' },
  { to: '/drone-track',      label: 'NPNT LOG',   icon: 'LOG' },
  { to: '/notams',           label: 'NOTAMS',     icon: 'NOT' },
  { to: '/compliance',       label: 'COMPLIANCE', icon: 'CHK' },
  { to: '/evidence',         label: 'EVIDENCE',   icon: 'EVD' },
  { to: '/fleet',            label: 'FLEET',      icon: 'FLT' },
  { to: '/planning',         label: 'PLANNING',   icon: 'PLN' },
  { to: '/settings',         label: 'SETTINGS',   icon: 'SET' },
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

        <Route path="/briefing/:id"    element={<ProtectedLayout><PreFlightBriefing /></ProtectedLayout>} />

        {/* Portal routes */}
        <Route path="/airspace"    element={<ProtectedLayout><AirspaceMap /></ProtectedLayout>} />
        <Route path="/icao-fpl"    element={<ProtectedLayout><FlightPlanForm /></ProtectedLayout>} />
        <Route path="/drone-track" element={<ProtectedLayout><DroneTrackSubmission /></ProtectedLayout>} />
        <Route path="/notams"      element={<ProtectedLayout><NOTAMCenter /></ProtectedLayout>} />
        <Route path="/compliance"  element={<ProtectedLayout><ComplianceChecklist /></ProtectedLayout>} />
        <Route path="/evidence"    element={<ProtectedLayout><EvidenceChainViewer /></ProtectedLayout>} />
        <Route path="/fleet"       element={<ProtectedLayout><FleetManager /></ProtectedLayout>} />
        <Route path="/planning"    element={<ProtectedLayout><><FuelPlanning /><div style={{ marginTop: '1.5rem' }}><WeightBalance /></div></></ProtectedLayout>} />
        <Route path="/settings"    element={<ProtectedLayout><APISettings /></ProtectedLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

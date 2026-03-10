import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { LoginPage }             from './pages/LoginPage'
import { DashboardPage }         from './pages/DashboardPage'
import { FileFlightPlanPage }    from './pages/FileFlightPlanPage'
import { FileDronePlanPage }     from './pages/FileDronePlanPage'
import { FlightPlanDetailPage }  from './pages/FlightPlanDetailPage'
import { EditFlightPlanPage }    from './pages/EditFlightPlanPage'
import { DronePlanDetailPage }   from './pages/DronePlanDetailPage'
import { ChartsPage }            from './pages/ChartsPage'
import { NOTAMPage }             from './pages/NOTAMPage'
import { RouteBuilderPage }      from './pages/RouteBuilderPage'
import { EvidencePage }          from './pages/EvidencePage'
import { LogUploadPage }         from './pages/LogUploadPage'
import { WeightBalancePage }     from './pages/WeightBalancePage'
import { FleetManager }          from './components/portal/FleetManager'
import { BVLOSWizard }           from './components/portal/BVLOSWizard'
import { TrajectoryViewer }      from './components/portal/TrajectoryViewer'
import { APISettings }           from './components/portal/APISettings'
import { EvidenceExportPanel }   from './components/portal/EvidenceExportPanel'
import { GpsRecorderPage }       from './pages/GpsRecorderPage'
import { SystemStatusBar }       from './components/portal/SystemStatusBar'
import { useAuth }               from './hooks/useAuth'

import { T } from './theme'

// ── Navigation grouped by section ─────────────────────────────────────────────
// domain: 'AIRCRAFT' = aircraft-only, 'DRONE' = drone-only, 'BOTH' = visible to all
type DomainTag = 'AIRCRAFT' | 'DRONE' | 'BOTH'
interface NavItem { to: string; label: string; icon: string; domain: DomainTag }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'OPERATIONS',
    items: [
      { to: '/',                 label: 'Dashboard',     icon: '///', domain: 'BOTH' },
      { to: '/file-flight-plan', label: 'File FPL',      icon: 'FPL', domain: 'AIRCRAFT' },
      { to: '/file-drone-plan',  label: 'File Drone',    icon: 'DOP', domain: 'DRONE' },
      { to: '/bvlos',            label: 'BVLOS Wizard',  icon: 'BVL', domain: 'DRONE' },
    ],
  },
  {
    title: 'PLANNING',
    items: [
      { to: '/route-builder',   label: 'Route Builder',  icon: 'RTE', domain: 'AIRCRAFT' },
      { to: '/weight-balance',  label: 'W&B / Fuel',     icon: 'W&B', domain: 'AIRCRAFT' },
      { to: '/charts',          label: 'Charts & eAIP',  icon: 'CHR', domain: 'BOTH' },
      { to: '/notams',          label: 'NOTAMs',         icon: 'NTM', domain: 'BOTH' },
      { to: '/trajectory',      label: 'Trajectory',     icon: 'TRJ', domain: 'DRONE' },
    ],
  },
  {
    title: 'FLEET & LOGS',
    items: [
      { to: '/fleet',           label: 'Fleet Manager',  icon: 'FLT', domain: 'DRONE' },
      { to: '/log-upload',      label: 'Log Upload',     icon: 'LOG', domain: 'DRONE' },
      { to: '/gps-recorder',   label: 'GPS Recorder',   icon: 'GPS', domain: 'DRONE' },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { to: '/evidence',        label: 'Evidence Chain',  icon: 'EVC', domain: 'DRONE' },
      { to: '/audit-export',    label: 'Audit Export',    icon: 'AUD', domain: 'DRONE' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { to: '/api-settings',    label: 'API Settings',   icon: 'API', domain: 'BOTH' },
    ],
  },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const { logout, credentialDomain, role } = useAuth()
  const w = collapsed ? '52px' : '210px'

  const handleSwitchDomain = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // Super admins see everything; others see only their domain + BOTH
  const isSuperAdmin = role === 'PLATFORM_SUPER_ADMIN'
  const visibleItems = (items: NavItem[]) =>
    items.filter(i => isSuperAdmin || i.domain === 'BOTH' || i.domain === credentialDomain)

  const domainBadgeColor = credentialDomain === 'AIRCRAFT' ? '#40A0FF' : T.amber
  const domainLabel = credentialDomain === 'AIRCRAFT' ? 'AIRCRAFT' : credentialDomain === 'DRONE' ? 'DRONE' : ''

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
          flexWrap: 'wrap',
        }}>
        <span style={{ color: T.primary, fontWeight: 700, fontSize: '1rem' }}>
          {collapsed ? 'J' : 'JADS'}
        </span>
        {!collapsed && <span style={{ fontSize: '0.6rem', color: T.muted }}>USER PORTAL v5.0</span>}
        {!collapsed && domainLabel && (
          <span style={{
            fontSize: '0.5rem', fontWeight: 700, padding: '1px 6px',
            borderRadius: '3px', color: '#fff', background: domainBadgeColor,
            marginLeft: 'auto',
          }}>{domainLabel}</span>
        )}
      </div>

      <div style={{ flex: 1, padding: '0.3rem 0', overflowY: 'auto' }}>
        {NAV_GROUPS.map(group => {
          const items = visibleItems(group.items)
          if (items.length === 0) return null
          return (
            <div key={group.title}>
              {!collapsed && (
                <div style={{
                  padding: '0.5rem 1rem 0.2rem',
                  fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em',
                  color: T.muted, opacity: 0.6,
                }}>
                  {group.title}
                </div>
              )}
              {items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: collapsed ? '0.45rem 0' : '0.45rem 1rem',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    textDecoration: 'none', fontSize: '0.7rem', fontWeight: 500,
                    color: isActive ? T.primary : T.muted,
                    background: isActive ? T.primary + '10' : 'transparent',
                    borderLeft: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
                    transition: 'all 0.15s',
                  })}>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, width: '24px', textAlign: 'center' }}>
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )
        })}
      </div>

      <button onClick={handleSwitchDomain}
        style={{
          padding: '0.5rem', border: 'none', borderTop: `1px solid ${T.border}`,
          background: 'transparent', color: T.amber, cursor: 'pointer',
          fontSize: '0.6rem', fontWeight: 600,
        }}>
        {collapsed ? '⇄' : 'SWITCH DOMAIN'}
      </button>
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

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return mobile
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { token, credentialDomain } = useAuth()
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(isMobile)

  useEffect(() => { setCollapsed(isMobile) }, [isMobile])

  useEffect(() => {
    document.title = credentialDomain === 'AIRCRAFT' ? 'JADS Aircraft Portal'
                   : credentialDomain === 'DRONE'    ? 'JADS Drone Portal'
                   : 'JADS User Portal'
  }, [credentialDomain])

  if (!token) return <Navigate to="/login" replace />
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      {/* On mobile when expanded, overlay the sidebar */}
      {isMobile && !collapsed && (
        <div onClick={() => setCollapsed(true)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99,
        }} />
      )}
      <div style={isMobile && !collapsed ? { position: 'fixed', zIndex: 100, height: '100vh' } : undefined}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>
      <main style={{ flex: 1, minHeight: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <div onClick={() => setCollapsed(false)} style={{
            padding: '0.5rem 1rem', borderBottom: `1px solid ${T.border}`,
            cursor: 'pointer', fontSize: '0.8rem', color: T.primary, fontWeight: 700,
          }}>
            &#9776; MENU
          </div>
        )}
        <div style={{ flex: 1 }}>{children}</div>
        <SystemStatusBar />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Operations */}
        <Route path="/"                     element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/file-flight-plan"     element={<ProtectedLayout><FileFlightPlanPage /></ProtectedLayout>} />
        <Route path="/file-drone-plan"      element={<ProtectedLayout><FileDronePlanPage /></ProtectedLayout>} />
        <Route path="/bvlos"                element={<ProtectedLayout><BVLOSWizard /></ProtectedLayout>} />

        {/* Planning */}
        <Route path="/route-builder"        element={<ProtectedLayout><RouteBuilderPage /></ProtectedLayout>} />
        <Route path="/weight-balance"       element={<ProtectedLayout><WeightBalancePage /></ProtectedLayout>} />
        <Route path="/charts"               element={<ProtectedLayout><ChartsPage /></ProtectedLayout>} />
        <Route path="/notams"               element={<ProtectedLayout><NOTAMPage /></ProtectedLayout>} />
        <Route path="/trajectory"           element={<ProtectedLayout><TrajectoryViewer /></ProtectedLayout>} />

        {/* Fleet & Logs */}
        <Route path="/fleet"                element={<ProtectedLayout><FleetManager /></ProtectedLayout>} />
        <Route path="/log-upload"           element={<ProtectedLayout><LogUploadPage /></ProtectedLayout>} />
        <Route path="/gps-recorder"        element={<ProtectedLayout><GpsRecorderPage /></ProtectedLayout>} />

        {/* Compliance */}
        <Route path="/evidence"             element={<ProtectedLayout><EvidencePage /></ProtectedLayout>} />
        <Route path="/audit-export"         element={<ProtectedLayout><EvidenceExportPanel /></ProtectedLayout>} />

        {/* Settings */}
        <Route path="/api-settings"         element={<ProtectedLayout><APISettings /></ProtectedLayout>} />

        {/* Detail pages */}
        <Route path="/flight-plan/:id"      element={<ProtectedLayout><FlightPlanDetailPage /></ProtectedLayout>} />
        <Route path="/edit-flight-plan/:id" element={<ProtectedLayout><EditFlightPlanPage /></ProtectedLayout>} />
        <Route path="/drone-plan/:id"       element={<ProtectedLayout><DronePlanDetailPage /></ProtectedLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

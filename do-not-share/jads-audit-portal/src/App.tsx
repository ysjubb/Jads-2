import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuditLoginPage }    from './pages/AuditLoginPage'
import { MissionsPage }      from './pages/MissionsPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { FlightPlansPage }       from './pages/FlightPlansPage'
import { FlightPlanDetailPage } from './pages/FlightPlanDetailPage'
import { ViolationsPage }    from './pages/ViolationsPage'
import { ForensicTimeline }  from './pages/ForensicTimeline'
import { AdapterStatusPage } from './pages/AdapterStatusPage'
import { ZoneCompliancePage } from './pages/audit/ZoneCompliancePage'
import { CategoryCompliancePage } from './pages/audit/CategoryCompliancePage'
import { ComplianceScorecardPage } from './pages/audit/ComplianceScorecardPage'
import { AnomalyDetectionPage } from './pages/audit/AnomalyDetectionPage'
import { IncidentQueue }     from './components/IncidentQueue'
import { ViolationEvidenceViewer } from './components/ViolationEvidenceViewer'
import { useAuditAuth }      from './hooks/useAuditAuth'
import { EgcaSyncBadge }     from './components/EgcaSyncBadge'

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
  { to: '/zone-compliance', label: 'Zone Compliance', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { to: '/category-compliance', label: 'Category Trends', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm5-4H5v-2h12v2zm0-4H5V7h12v2z' },
  { to: '/compliance-scorecard', label: 'Scorecard', icon: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z' },
  { to: '/anomaly-detection', label: 'Anomalies', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' },
  { to: '/incidents', label: 'Incidents', icon: 'M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 8h2v2h-2v-2zm0-6h2v4h-2V8z' },
  { to: '/forensic-timeline', label: 'Timeline', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/system-status', label: 'System Status', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
]

function SidebarNav() {
  const { token, role, logout } = useAuditAuth()
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

      {/* eGCA Sync + Collapse toggle + Sign out */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: '0.5rem' }}>
        <EgcaSyncBadge token={token} role={role} collapsed={collapsed} />
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
        <Route path="/zone-compliance" element={
          <Protected><Layout><ZoneCompliancePage /></Layout></Protected>
        } />
        <Route path="/category-compliance" element={
          <Protected><Layout><CategoryCompliancePage /></Layout></Protected>
        } />
        <Route path="/compliance-scorecard" element={
          <Protected><Layout><ComplianceScorecardPage /></Layout></Protected>
        } />
        <Route path="/anomaly-detection" element={
          <Protected><Layout><AnomalyDetectionPage /></Layout></Protected>
        } />
        <Route path="/incidents" element={
          <Protected><Layout><IncidentQueue /></Layout></Protected>
        } />
        <Route path="/incidents/:id" element={
          <Protected><Layout><ViolationEvidenceViewer /></Layout></Protected>
        } />
        <Route path="/forensic-timeline" element={
          <Protected><Layout><ForensicTimeline /></Layout></Protected>
        } />
        <Route path="/system-status" element={
          <Protected><Layout><AdapterStatusPage /></Layout></Protected>
        } />
        <Route path="*" element={<Navigate to="/missions" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

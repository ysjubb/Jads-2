import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuditLoginPage }    from './pages/AuditLoginPage'
import { MissionsPage }      from './pages/MissionsPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { FlightPlansPage }   from './pages/FlightPlansPage'
import { ViolationsPage }    from './pages/ViolationsPage'
import { useAuditAuth }      from './hooks/useAuditAuth'

function NavBar() {
  const { logout } = useAuditAuth()
  const loc = useLocation()
  const link = (to: string, label: string) => (
    <Link to={to} style={{
      padding: '0 1rem', textDecoration: 'none',
      color: loc.pathname.startsWith(to) ? '#1890ff' : '#595959',
      fontWeight: loc.pathname.startsWith(to) ? 600 : 400
    }}>{label}</Link>
  )
  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #f0f0f0',
      padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontWeight: 700, marginRight: '1rem', color: '#262626' }}>JADS Audit Portal</span>
      {link('/missions', 'Missions')}
      {link('/flight-plans', 'Flight Plans')}
      {link('/violations', 'Violations')}
      <span style={{ flex: 1 }} />
      <button onClick={logout}
        style={{ padding: '0.25rem 0.75rem', border: '1px solid #d9d9d9',
          borderRadius: '4px', cursor: 'pointer', background: 'white', color: '#595959' }}>
        Sign Out
      </button>
    </nav>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuditAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main style={{ minHeight: 'calc(100vh - 49px)', background: '#f5f5f5' }}>
        {children}
      </main>
    </>
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
        <Route path="/violations" element={
          <Protected><Layout><ViolationsPage /></Layout></Protected>
        } />
        <Route path="*" element={<Navigate to="/missions" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

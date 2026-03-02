import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LoginPage }        from './pages/LoginPage'
import { DashboardPage }    from './pages/DashboardPage'
import { UsersPage }        from './pages/UsersPage'
import { SpecialUsersPage } from './pages/SpecialUsersPage'
import { AirspacePage }     from './pages/AirspacePage'
import { FlightPlansPage }  from './pages/FlightPlansPage'
import { DroneZonesPage }   from './pages/DroneZonesPage'
import { useAdminAuth }     from './hooks/useAdminAuth'

function NavBar() {
  const { logout } = useAdminAuth()
  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: '0.4rem 0.75rem',
    background: isActive ? '#e6f7ff' : 'transparent',
    color: isActive ? '#1890ff' : '#262626',
    borderRadius: '4px', textDecoration: 'none',
    fontSize: '0.875rem', fontWeight: isActive ? 600 : 400,
  })
  return (
    <nav style={{ display:'flex', alignItems:'center', gap:'0.25rem',
      padding:'0.75rem 1.5rem', background:'white',
      borderBottom:'1px solid #f0f0f0', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      <span style={{ fontWeight:700, color:'#1890ff', marginRight:'1rem', fontSize:'1rem' }}>JADS Admin</span>
      <NavLink to="/"              style={linkStyle} end>Dashboard</NavLink>
      <NavLink to="/users"         style={linkStyle}>Users</NavLink>
      <NavLink to="/special-users" style={linkStyle}>Special Users</NavLink>
      <NavLink to="/airspace"      style={linkStyle}>Airspace</NavLink>
      <NavLink to="/drone-zones"   style={linkStyle}>Drone Zones</NavLink>
      <NavLink to="/flight-plans"  style={linkStyle}>Flight Plans</NavLink>
      <button onClick={logout}
        style={{ marginLeft:'auto', padding:'0.3rem 0.75rem', border:'1px solid #d9d9d9',
          borderRadius:'4px', cursor:'pointer', fontSize:'0.875rem', background:'white' }}>
        Logout
      </button>
    </nav>
  )
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth()
  if (!token) return <Navigate to="/login" replace />
  return (
    <>
      <NavBar />
      <main style={{ minHeight:'calc(100vh - 49px)', background:'#f5f5f5' }}>{children}</main>
    </>
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

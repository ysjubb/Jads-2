import { useState, useCallback } from 'react'
import axios from 'axios'

// Vite proxy forwards /api → http://localhost:8080/api — no hardcoded port needed
const API       = '/api'
const TOKEN_KEY = 'jads_audit_token'
const ROLE_KEY  = 'jads_audit_role'

export function useAuditAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [role,  setRole]  = useState<string | null>(() => localStorage.getItem(ROLE_KEY))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Audit portal: username + password (same admin-style login, different JWT scope)
  // Falls back to special user two-step if /auth/admin/login fails
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true); setError(null)
    try {
      // Try admin login first (covers DGCA_AUDITOR, IAF_AUDITOR, etc.)
      const { data } = await axios.post(
        `${API}/admin/login`,
        { username, password },
        { headers: { 'X-JADS-Version': '4.0' } }
      )
      localStorage.setItem(TOKEN_KEY, data.accessToken)
      localStorage.setItem(ROLE_KEY,  data.role ?? 'AUDITOR')
      setToken(data.accessToken)
      setRole(data.role ?? 'AUDITOR')
      return true
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'LOGIN_FAILED')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ROLE_KEY)
    setToken(null)
    setRole(null)
  }, [])

  // auth object — used by MissionDetailPage and other components
  // that need both token and role together
  const auth = token ? { token, role: role ?? 'AUDITOR' } : null

  return { token, role, auth, login, logout, error, loading }
}

// Pre-configured axios instances

export function auditAxios(token: string) {
  return axios.create({
    baseURL: `${API}/audit`,
    headers: { Authorization: `Bearer ${token}`, 'X-JADS-Version': '4.0' },
  })
}

export function droneAxios(token: string) {
  return axios.create({
    baseURL: `${API}/drone`,
    headers: { Authorization: `Bearer ${token}`, 'X-JADS-Version': '4.0' },
  })
}

export function flightPlanAxios(token: string) {
  return axios.create({
    baseURL: `${API}`,
    headers: { Authorization: `Bearer ${token}`, 'X-JADS-Version': '4.0' },
  })
}

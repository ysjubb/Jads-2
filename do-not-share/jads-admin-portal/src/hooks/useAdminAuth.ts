import { useState, useCallback } from 'react'
import axios from 'axios'

// Vite proxy forwards /api → http://localhost:8080/api — no hardcoded port needed
const API       = '/api'
const TOKEN_KEY = 'jads_admin_token'

export function useAdminAuth() {
  const [token, setToken]   = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const { data } = await axios.post(
        `${API}/admin/login`,
        { username, password },
        { headers: { 'X-JADS-Version': '4.0' } }
      )
      // Token is signed with ADMIN_JWT_SECRET — verified server-side on every request
      localStorage.setItem(TOKEN_KEY, data.accessToken)
      setToken(data.accessToken)
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
    setToken(null)
  }, [])

  return { token, login, logout, error, loading }
}

// Pre-configured axios instance for all /api/admin/* calls.
// Authorization header carries the ADMIN_JWT_SECRET-signed token.
export function adminAxios(token: string) {
  return axios.create({
    baseURL: `${API}/admin`,
    headers: {
      Authorization:    `Bearer ${token}`,
      'X-JADS-Version': '4.0'
    }
  })
}

import { useState, useCallback } from 'react'
import axios from 'axios'
import { getToken, setToken, clearToken } from '../api/client'

const API = '/api'

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [error, setError]      = useState<string | null>(null)
  const [loading, setLoading]  = useState(false)
  const [loginStep, setLoginStep] = useState<'IDLE' | 'OTP_SENT' | 'DONE'>('IDLE')
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // Civilian login — step 1: send OTP
  const loginInitiate = useCallback(async (emailOrMobile: string) => {
    setLoading(true); setError(null)
    try {
      const { data } = await axios.post(
        `${API}/auth/civilian/login/initiate`,
        { emailOrMobile },
        { headers: { 'X-JADS-Version': '4.0' } }
      )
      setPendingUserId(data.userId)
      setLoginStep('OTP_SENT')
      return data.userId
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'LOGIN_INITIATE_FAILED')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Civilian login — step 2: verify OTP
  const loginComplete = useCallback(async (userId: string, otp: string) => {
    setLoading(true); setError(null)
    try {
      const { data } = await axios.post(
        `${API}/auth/civilian/login/complete`,
        { userId, otp },
        { headers: { 'X-JADS-Version': '4.0' } }
      )
      setToken(data.accessToken)
      setTokenState(data.accessToken)
      setLoginStep('DONE')
      return true
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'LOGIN_FAILED')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // Special user login (username + password)
  const loginSpecial = useCallback(async (username: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const { data } = await axios.post(
        `${API}/auth/special/login`,
        { username, password },
        { headers: { 'X-JADS-Version': '4.0' } }
      )
      setToken(data.accessToken)
      setTokenState(data.accessToken)
      setLoginStep('DONE')
      return true
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'LOGIN_FAILED')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
    setLoginStep('IDLE')
    setPendingUserId(null)
  }, [])

  return { token, error, loading, loginStep, pendingUserId, loginInitiate, loginComplete, loginSpecial, logout }
}

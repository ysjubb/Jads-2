import { useState, useEffect, useCallback, useRef } from 'react'
import { adminAxios } from './useAdminAuth'

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE'

export interface EgcaCallLogEntry {
  timestamp: string
  method:    string
  path:      string
  status:    number
  latencyMs: number
  error?:    string
}

export interface EgcaStatusData {
  health: {
    status:    HealthStatus
    latencyMs: number
    error:     string | null
  }
  token: {
    hasToken:    boolean
    expiresAt:   string | null
    secondsLeft: number | null
  }
  recentCalls: EgcaCallLogEntry[]
  adapter: {
    mode:    'MOCK' | 'LIVE' | 'UNKNOWN'
    version: string
    baseUrl: string
  }
}

export interface UseEgcaStatusReturn {
  data:          EgcaStatusData | null
  loading:       boolean
  error:         string | null
  lastFetchedAt: Date | null
  reconnecting:  boolean
  reconnectError: string | null
  fetch:         () => Promise<void>
  reconnect:     () => Promise<void>
  /** Live countdown of token seconds remaining (ticks every second) */
  tokenCountdown: number | null
}

// ── Poll interval ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEgcaStatus(token: string | null): UseEgcaStatusReturn {
  const [data, setData]                   = useState<EgcaStatusData | null>(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [reconnecting, setReconnecting]   = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)
  const [tokenCountdown, setTokenCountdown] = useState<number | null>(null)

  // Keep a ref to the latest secondsLeft from the server so the
  // countdown timer can decrement without re-fetching.
  const serverSecondsRef = useRef<number | null>(null)
  const fetchTimeRef     = useRef<number>(0)

  // ── Fetch status ──────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const { data: statusData } = await adminAxios(token).get('/egca-status')
      setData(statusData)
      setLastFetchedAt(new Date())
      serverSecondsRef.current = statusData.token.secondsLeft
      fetchTimeRef.current     = Date.now()
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token])

  // ── Reconnect ─────────────────────────────────────────────────────────

  const reconnect = useCallback(async () => {
    if (!token) return
    setReconnecting(true)
    setReconnectError(null)
    try {
      await adminAxios(token).post('/egca-reconnect')
      // Immediately re-fetch status after reconnect
      await fetchStatus()
    } catch (e: any) {
      setReconnectError(e.response?.data?.detail ?? e.response?.data?.error ?? 'RECONNECT_FAILED')
    } finally {
      setReconnecting(false)
    }
  }, [token, fetchStatus])

  // ── Initial fetch + polling ───────────────────────────────────────────

  useEffect(() => {
    if (!token) return
    fetchStatus()
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [token, fetchStatus])

  // ── Token countdown timer (ticks every second) ────────────────────────

  useEffect(() => {
    if (serverSecondsRef.current == null) {
      setTokenCountdown(null)
      return
    }

    const tick = () => {
      if (serverSecondsRef.current == null) {
        setTokenCountdown(null)
        return
      }
      const elapsed = Math.floor((Date.now() - fetchTimeRef.current) / 1_000)
      const remaining = Math.max(0, serverSecondsRef.current - elapsed)
      setTokenCountdown(remaining)
    }

    tick()
    const interval = setInterval(tick, 1_000)
    return () => clearInterval(interval)
  }, [data]) // re-attach whenever data refreshes

  return {
    data,
    loading,
    error,
    lastFetchedAt,
    reconnecting,
    reconnectError,
    fetch: fetchStatus,
    reconnect,
    tokenCountdown,
  }
}

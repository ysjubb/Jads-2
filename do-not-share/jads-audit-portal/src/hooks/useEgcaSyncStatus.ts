import { useState, useEffect, useCallback, useRef } from 'react'
import { auditAxios } from './useAuditAuth'

export interface EgcaSyncError {
  timestamp: string
  errorCode: string
  message:   string
}

export interface EgcaSyncStatus {
  lastSyncTimestamp:    string | null
  lastSyncAgoMs:       number | null
  permissionsSynced24h: number
  pasDownloaded24h:     number
  syncEventsLast24h:    number
  errors:              EgcaSyncError[]
  status:              'SYNCED' | 'STALE' | 'OUT_OF_SYNC' | 'NEVER_SYNCED'
}

const POLL_INTERVAL_MS = 60_000 // 1 minute

export function useEgcaSyncStatus(token: string | null) {
  const [data, setData]       = useState<EgcaSyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const resp = await auditAxios(token).get('/egca-sync/status')
      setData(resp.data)
      setError(null)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'FETCH_FAILED')
    } finally {
      setLoading(false)
    }
  }, [token])

  const forceSync = useCallback(async () => {
    if (!token) return
    try {
      await auditAxios(token).post('/egca-sync/force')
      // Re-fetch status after force sync
      await fetchStatus()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'FORCE_SYNC_FAILED')
    }
  }, [token, fetchStatus])

  // Initial fetch + polling
  useEffect(() => {
    if (!token) return

    fetchStatus()

    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [token, fetchStatus])

  return { data, loading, error, refresh: fetchStatus, forceSync }
}

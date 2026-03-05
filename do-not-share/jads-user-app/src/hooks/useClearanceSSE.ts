/**
 * useClearanceSSE — React hook that opens an SSE connection to the backend
 * and receives real-time ADC/FIC clearance updates for a given flight plan.
 *
 * Backend endpoint: GET /api/flight-plans/:id/events
 * Events emitted by ClearanceService:
 *   - adc_issued      → ADC number assigned by IAF (AFMLU)
 *   - fic_issued      → FIC number assigned by AAI (FIR)
 *   - clearance_rejected → Clearance denied
 *
 * React Native does not ship a native EventSource. This hook uses
 * react-native-sse (or any EventSource polyfill) if available, and
 * falls back to a fetch-based SSE reader.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { getClearanceEventsUrl } from '../api/flightPlanApi'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface AdcIssuedEvent {
  adcNumber:  string
  adcType:    string
  afmluId:    number
  issuedAt:   string
  status:     string
}

export interface FicIssuedEvent {
  ficNumber:  string
  firCode:    string
  subject:    string
  issuedAt:   string
  status:     string
  allFicRefs: Array<{
    ficNumber:   string
    firCode:     string
    subject:     string
    issuedAt:    string
    officerName: string
  }>
}

export interface ClearanceRejectedEvent {
  reason:     string
  rejectedBy: string
}

export type ClearanceEvent =
  | { type: 'adc_issued';          data: AdcIssuedEvent }
  | { type: 'fic_issued';          data: FicIssuedEvent }
  | { type: 'clearance_rejected';  data: ClearanceRejectedEvent }

interface UseClearanceSSEOptions {
  flightPlanId: string | null
  onEvent:      (event: ClearanceEvent) => void
}

/**
 * Opens a persistent SSE connection for clearance events.
 * Reconnects automatically on disconnect (with 3s backoff).
 * Cleans up on unmount or when flightPlanId changes.
 */
export function useClearanceSSE({ flightPlanId, onEvent }: UseClearanceSSEOptions) {
  const [connected, setConnected] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(async (planId: string) => {
    // Abort any existing connection
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const token = await AsyncStorage.getItem('auth:jwt')
    const url = getClearanceEventsUrl(planId)

    try {
      const response = await fetch(url, {
        headers: {
          'Accept':         'text/event-stream',
          'X-JADS-Version': '4.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        setConnected(false)
        return
      }

      setConnected(true)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim()
          } else if (line === '' && currentEvent && currentData) {
            // End of SSE message block
            try {
              const parsed = JSON.parse(currentData)
              onEventRef.current({
                type: currentEvent as ClearanceEvent['type'],
                data: parsed,
              })
            } catch {
              // Skip malformed JSON
            }
            currentEvent = ''
            currentData = ''
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return // Expected on cleanup
    } finally {
      setConnected(false)
    }

    // Auto-reconnect after 3 seconds (unless aborted)
    if (!controller.signal.aborted) {
      setTimeout(() => {
        if (!controller.signal.aborted) connect(planId)
      }, 3000)
    }
  }, [])

  useEffect(() => {
    if (!flightPlanId) return
    connect(flightPlanId)
    return () => { abortRef.current?.abort() }
  }, [flightPlanId, connect])

  return { connected }
}

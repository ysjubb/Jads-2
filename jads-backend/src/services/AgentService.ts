// AgentService — proxy layer for JADS AI agent microservices.
// Routes requests to the 4 agent endpoints and handles connectivity gracefully.
// Agents are optional — all methods return a degraded response if agents are offline.

import { createServiceLogger } from '../logger'
import { env } from '../env'

const log = createServiceLogger('AgentService')

// Agent endpoint configuration
const AGENT_ENDPOINTS = {
  notamInterpreter:  { host: 'http://localhost:3101', path: '/interpret' },
  forensicNarrator:  { host: 'http://localhost:3102', path: '/narrate' },
  aftnDraft:         { host: 'http://localhost:3103', path: '/draft' },
  anomalyAdvisor:    { host: 'http://localhost:3104', path: '/analyze' },
} as const

type AgentName = keyof typeof AGENT_ENDPOINTS

async function callAgent<T>(agent: AgentName, body: unknown): Promise<{ available: boolean; data?: T; error?: string }> {
  const endpoint = AGENT_ENDPOINTS[agent]
  const url = `${endpoint.host}${endpoint.path}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errBody = await response.text()
      log.warn('agent_error_response', { data: { agent, status: response.status, body: errBody.substring(0, 200) } })
      return { available: true, error: `Agent returned ${response.status}` }
    }

    const data = await response.json() as T
    return { available: true, data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.debug('agent_unavailable', { data: { agent, error: msg } })
    return { available: false, error: `Agent ${agent} is offline` }
  }
}

export class AgentService {

  async interpretNotam(notamRaw: string, icaoCode?: string) {
    return callAgent('notamInterpreter', { notamRaw, icaoCode })
  }

  async narrateForensic(input: {
    missionId: string
    chainVerified: boolean
    chainFailureSequence: number | null
    ntpSyncStatus: string
    certValidAtStart: boolean
    isDuplicate: boolean
    violationCount: number
    criticalViolations: number
    recordCount: number
    npntClass: string
    gnssDegradedPercent: number
    strongboxBacked: boolean
    secureBootVerified: boolean
  }) {
    return callAgent('forensicNarrator', input)
  }

  async draftAftnMessage(input: {
    messageType: 'FPL' | 'CNL' | 'DLA' | 'CHG'
    callsign: string
    departureIcao: string
    destinationIcao: string
    eobt: string
    [key: string]: unknown
  }) {
    return callAgent('aftnDraft', input)
  }

  async analyzeAnomalies(input: {
    points: Array<{
      sequence: number
      latDeg: number
      lonDeg: number
      altitudeFt: number
      velocityMs: number
      timestampMs: number
      gnssStatus: string
    }>
    maxAglFt?: number
    npntClass?: string
  }) {
    return callAgent('anomalyAdvisor', input)
  }

  async healthCheck(): Promise<Record<AgentName, { available: boolean; latencyMs: number }>> {
    const results = {} as Record<AgentName, { available: boolean; latencyMs: number }>

    for (const [name, endpoint] of Object.entries(AGENT_ENDPOINTS)) {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const response = await fetch(`${endpoint.host}/health`, { signal: controller.signal })
        clearTimeout(timeout)
        results[name as AgentName] = { available: response.ok, latencyMs: Date.now() - start }
      } catch {
        results[name as AgentName] = { available: false, latencyMs: Date.now() - start }
      }
    }

    return results
  }
}

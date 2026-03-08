/**
 * Flight Plan API client.
 * Talks to jads-backend endpoints for flight plan listing and clearance status.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE = 'http://localhost:8080/api'
const JADS_VERSION = '4.0'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('auth:jwt')
  return {
    'Content-Type':   'application/json',
    'X-JADS-Version': JADS_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface FlightPlanSummary {
  id:             string
  aircraftId:     string
  adep:           string
  ades:           string
  eobt:           string
  flightRules:    string
  cruisingLevel:  string
  status:         string
  adcNumber:      string | null
  ficNumber:      string | null
  filedAt:        string
}

export interface ClearanceStatus {
  status:   string
  adcRefs:  ClearanceRef[]
  ficRefs:  ClearanceRef[]
}

export interface ClearanceRef {
  afmluId?:    number
  adcNumber?:  string
  adcType?:    string
  firCode?:    string
  ficNumber?:  string
  subject?:    string
  issuedAt:    string
  officerName: string
}

export async function fetchMyFlightPlans(): Promise<FlightPlanSummary[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/flight-plans`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch flight plans: ${res.status}`)
  const body = await res.json()
  return body.data ?? body
}

export async function fetchClearanceStatus(flightPlanId: string): Promise<ClearanceStatus> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/flight-plans/${flightPlanId}/clearance`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch clearance: ${res.status}`)
  return res.json()
}

export interface RoutePoint {
  identifier: string
  type:       string
  latDeg:     number
  lonDeg:     number
}

export interface RouteGeometry {
  success: boolean
  adep:    string
  ades:    string
  route:   string
  points:  RoutePoint[]
}

export async function fetchRouteGeometry(flightPlanId: string): Promise<RouteGeometry> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/flight-plans/${flightPlanId}/route-geometry`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch route geometry: ${res.status}`)
  return res.json()
}

/**
 * Returns the SSE event stream URL for a given flight plan.
 * The caller opens an EventSource connection to this URL.
 */
export function getClearanceEventsUrl(flightPlanId: string): string {
  return `${API_BASE}/flight-plans/${flightPlanId}/events`
}

/**
 * Drone Operation Plan API client.
 * CRUD + submit/cancel for drone operation plans.
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

export interface DroneOperationPlan {
  id:                string
  planId:            string
  operatorId:        string
  droneSerialNumber: string
  uinNumber:         string | null
  areaType:          'POLYGON' | 'CIRCLE'
  areaGeoJson:       string | null
  centerLatDeg:      number | null
  centerLonDeg:      number | null
  radiusM:           number | null
  maxAltitudeAglM:   number
  minAltitudeAglM:   number
  plannedStartUtc:   string
  plannedEndUtc:     string
  purpose:           string
  remarks:           string | null
  status:            string
  rejectionReason:   string | null
  createdAt:         string
}

export async function fetchMyDronePlans(): Promise<DroneOperationPlan[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/drone-plans`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch drone plans: ${res.status}`)
  const body = await res.json()
  return body.plans ?? []
}

export async function createDronePlan(plan: Record<string, unknown>): Promise<DroneOperationPlan> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/drone-plans`, {
    method: 'POST', headers, body: JSON.stringify(plan),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? err.error ?? `Create failed: ${res.status}`)
  }
  const body = await res.json()
  return body.plan
}

export async function submitDronePlan(planId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/drone-plans/${planId}/submit`, {
    method: 'POST', headers,
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
}

export async function cancelDronePlan(planId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/drone-plans/${planId}/cancel`, {
    method: 'POST', headers, body: JSON.stringify({ reason: 'User cancelled' }),
  })
  if (!res.ok) throw new Error(`Cancel failed: ${res.status}`)
}

export async function editFlightPlan(planId: string, data: Record<string, unknown>): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/flight-plans/${planId}`, {
    method: 'PUT', headers, body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Edit failed: ${res.status}`)
  }
}

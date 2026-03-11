// T02 — Broadcast functions for live telemetry events

import { WebSocket } from 'ws'
import { missionSubscribers, adminClients } from './wsServer'
import { TelemetryPoint, GeofenceStatus } from '../types/telemetry'

function sendToAll(subs: Set<WebSocket> | undefined, payload: string): void {
  subs?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  })
  // Also send to all admin subscribers
  adminClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  })
}

export function broadcastTelemetry(point: TelemetryPoint): void {
  const payload = JSON.stringify({ type: 'TELEMETRY_POINT', data: point })
  sendToAll(missionSubscribers.get(point.missionId), payload)
}

export function broadcastViolation(point: TelemetryPoint, status: GeofenceStatus): void {
  const payload = JSON.stringify({
    type: 'GEOFENCE_VIOLATION',
    data: {
      point,
      violationType: status.violationType,
      distanceToEdge: status.distanceToEdge,
      ts: Date.now(),
    },
  })
  sendToAll(missionSubscribers.get(point.missionId), payload)
}

export function broadcastBatteryCritical(point: TelemetryPoint): void {
  const payload = JSON.stringify({ type: 'BATTERY_CRITICAL', data: point })
  sendToAll(missionSubscribers.get(point.missionId), payload)
}

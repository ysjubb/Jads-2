// T02 — WebSocket server for live telemetry broadcast

import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import jwt from 'jsonwebtoken'
import { env } from '../env'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('WsServer')

// Map: missionId → Set of connected WebSocket clients
export const missionSubscribers = new Map<string, Set<WebSocket>>()

// Set of admin clients subscribed to ALL missions
export const adminClients = new Set<WebSocket>()

/**
 * Verify JWT from WebSocket query param.
 * Accepts both user JWT (JWT_SECRET) and admin JWT (ADMIN_JWT_SECRET).
 */
function verifyWsToken(token: string | null): { userId: string; role: string } | null {
  if (!token) return null

  // Try admin JWT first
  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as Record<string, unknown>
    return {
      userId: (payload.adminUserId as string) || '',
      role:   (payload.adminRole as string) || '',
    }
  } catch { /* not admin token */ }

  // Try user JWT
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>
    return {
      userId: (payload.userId as string) || '',
      role:   (payload.role as string) || '',
    }
  } catch { /* invalid token */ }

  return null
}

export function initWsServer(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/missions' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, 'http://localhost')
    const token = url.searchParams.get('token')
    const subscribeParam = url.searchParams.get('subscribe') || ''

    // Verify JWT
    const user = verifyWsToken(token)
    if (!user) {
      ws.close(4401, 'Unauthorized')
      return
    }

    // Handle ALL subscription for admin users
    if (subscribeParam === 'ALL') {
      const adminRoles = [
        'GOVT_ADMIN', 'PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR',
        'AAI_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
      ]
      if (adminRoles.includes(user.role)) {
        adminClients.add(ws)
        log.info('admin_ws_connected', { data: { userId: user.userId, role: user.role } })
      } else {
        ws.close(4403, 'Admin role required for ALL subscription')
        return
      }
    } else {
      // Subscribe to specific missions (capped to prevent abuse)
      const MAX_SUBSCRIPTIONS = 50
      const missions = subscribeParam.split(',').filter(Boolean).slice(0, MAX_SUBSCRIPTIONS)
      if (missions.length === 0) {
        ws.close(4400, 'No mission IDs provided')
        return
      }
      missions.forEach((mId) => {
        if (!missionSubscribers.has(mId)) missionSubscribers.set(mId, new Set())
        missionSubscribers.get(mId)!.add(ws)
      })
      log.info('ws_connected', { data: { userId: user.userId, missions } })
    }

    // Cleanup on disconnect
    ws.on('close', () => {
      missionSubscribers.forEach((subs) => subs.delete(ws))
      adminClients.delete(ws)
    })

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      subscribedTo: subscribeParam === 'ALL' ? 'ALL' : subscribeParam.split(',').filter(Boolean),
    }))
  })

  log.info('ws_server_started', { data: { path: '/ws/missions' } })
}

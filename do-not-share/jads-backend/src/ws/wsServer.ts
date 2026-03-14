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
 * Verify JWT.
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

/**
 * Complete WebSocket subscription setup after auth is confirmed.
 */
function setupSubscription(
  ws: WebSocket,
  user: { userId: string; role: string },
  subscribeParam: string
): void {
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
}

export function initWsServer(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/missions' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, 'http://localhost')
    const subscribeParam = url.searchParams.get('subscribe') || ''

    // ── Auth Strategy 1: Sec-WebSocket-Protocol header ──────────────
    // Client sends: new WebSocket(url, ['jads-v4', 'Bearer.<token>'])
    // The token travels inside the Upgrade headers, not the URL.
    // Browsers include Sec-WebSocket-Protocol automatically.
    const protocols = req.headers['sec-websocket-protocol']?.split(',').map(s => s.trim()) ?? []
    const bearerProto = protocols.find(p => p.startsWith('Bearer.'))
    const headerToken = bearerProto ? bearerProto.slice(7) : null

    if (headerToken) {
      const user = verifyWsToken(headerToken)
      if (!user) {
        ws.close(4401, 'Unauthorized')
        return
      }
      // Echo back both sub-protocols so the browser accepts the handshake
      // (ws library handles this automatically via handleProtocols or by
      //  setting ws.protocol — we don't need to do anything extra here)
      setupSubscription(ws, user, subscribeParam)
      return
    }

    // ── Auth Strategy 2 (DEPRECATED): URL query parameter ───────────
    // Kept for backward compatibility with existing clients.
    // Tokens in URLs are logged in proxy/server access logs — migrate
    // clients to header-based auth and remove this path.
    const queryToken = url.searchParams.get('token')
    if (queryToken) {
      log.warn('ws_token_in_url_deprecated', {
        data: { hint: 'Client should migrate to Sec-WebSocket-Protocol header auth' },
      })
      const user = verifyWsToken(queryToken)
      if (!user) {
        ws.close(4401, 'Unauthorized')
        return
      }
      setupSubscription(ws, user, subscribeParam)
      return
    }

    // ── Auth Strategy 3: First-message auth handshake ───────────────
    // Client connects without credentials, then sends:
    //   { type: "AUTH", token: "...", subscribe: "missionId" }
    // as the first message.  Useful for environments where custom
    // headers aren't available (some mobile WebSocket libraries).
    const authTimeout = setTimeout(() => {
      ws.close(4401, 'Auth timeout — send AUTH message within 5 seconds')
    }, 5000)

    ws.once('message', (raw) => {
      clearTimeout(authTimeout)
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type !== 'AUTH' || !msg.token) {
          ws.close(4401, 'First message must be { type: "AUTH", token: "..." }')
          return
        }
        const user = verifyWsToken(msg.token)
        if (!user) {
          ws.close(4401, 'Unauthorized')
          return
        }
        // Allow subscribe override from AUTH message
        const sub = msg.subscribe || subscribeParam
        setupSubscription(ws, user, sub)
      } catch {
        ws.close(4401, 'Invalid AUTH message')
      }
    })
  })

  log.info('ws_server_started', { data: { path: '/ws/missions' } })
}

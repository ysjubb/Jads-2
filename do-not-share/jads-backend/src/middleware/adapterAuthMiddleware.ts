// Middleware for inbound adapter push webhooks (AFMLU, FIR).
// AFMLU and FIR office systems authenticate using a pre-shared key in
// the X-JADS-Adapter-Key header. This is separate from:
//   - User JWTs (JWT_SECRET)
//   - Admin portal JWTs (ADMIN_JWT_SECRET)
// The adapter key never changes mid-session — it's a long-lived secret
// that government systems embed in their integration configuration.

import { Request, Response, NextFunction } from 'express'
import { env }                from '../env'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AdapterAuthMiddleware')

const ADAPTER_KEY_HEADER = 'x-jads-adapter-key'

export function requireAdapterAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers[ADAPTER_KEY_HEADER] as string | undefined

  if (!key) {
    log.warn('adapter_auth_missing_key', {
      data: { ip: req.ip, path: req.path }
    })
    res.status(401).json({ error: 'ADAPTER_KEY_REQUIRED', header: 'X-JADS-Adapter-Key' })
    return
  }

  // Constant-time comparison to prevent timing attacks
  const expected = env.ADAPTER_INBOUND_KEY
  if (key.length !== expected.length || !timingSafeEqual(key, expected)) {
    log.warn('adapter_auth_invalid_key', {
      data: { ip: req.ip, path: req.path }
    })
    res.status(401).json({ error: 'INVALID_ADAPTER_KEY' })
    return
  }

  log.info('adapter_auth_ok', { data: { ip: req.ip, path: req.path } })
  next()
}

// Node's crypto.timingSafeEqual requires equal-length Buffers.
// Pre-check length above prevents short-circuit, this handles byte comparison.
function timingSafeEqual(a: string, b: string): boolean {
  // Already verified a.length === b.length above
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

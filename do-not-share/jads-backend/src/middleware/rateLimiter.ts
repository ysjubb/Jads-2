import { Request, Response, NextFunction } from 'express'

// ── In-process sliding window rate limiter ────────────────────────────────────
// VULN-03 FIX: Prevents mission upload flooding.
// For HA deployments: replace with Redis-backed implementation.
const uploadBuckets = new Map<string, { count: number; resetAt: number }>()
const UPLOAD_RATE_LIMIT = 20          // max uploads per window per operator
const UPLOAD_WINDOW_MS  = 60 * 1000  // 1 minute

export function missionUploadRateLimit(req: Request, res: Response, next: NextFunction): void {
  const operatorId = (req as any).auth?.userId
  if (!operatorId) { next(); return }

  const now    = Date.now()
  const bucket = uploadBuckets.get(operatorId)

  if (!bucket || bucket.resetAt < now) {
    uploadBuckets.set(operatorId, { count: 1, resetAt: now + UPLOAD_WINDOW_MS })
    next(); return
  }

  bucket.count++
  if (bucket.count > UPLOAD_RATE_LIMIT) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      detail: `Max ${UPLOAD_RATE_LIMIT} mission uploads/minute per operator`,
      retryAfterSeconds: retryAfter,
    })
    return
  }
  next()
}

// Global rate limiter for all /api routes (DoS protection)
const globalBuckets = new Map<string, { count: number; resetAt: number }>()
const GLOBAL_RATE_LIMIT = 500          // req/min per IP
const GLOBAL_WINDOW_MS  = 60 * 1000

export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const bucket = globalBuckets.get(ip)

  if (!bucket || bucket.resetAt < now) {
    globalBuckets.set(ip, { count: 1, resetAt: now + GLOBAL_WINDOW_MS })
    next(); return
  }
  bucket.count++
  if (bucket.count > GLOBAL_RATE_LIMIT) {
    res.status(429).json({ error: 'GLOBAL_RATE_LIMIT_EXCEEDED' })
    return
  }
  next()
}

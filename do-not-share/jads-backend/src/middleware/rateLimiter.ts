import { Request, Response, NextFunction } from 'express'

// ── Sliding window rate limiter factory ──────────────────────────────────────
// In-process implementation. For HA deployments: replace with Redis-backed.

function createSlidingWindowLimiter(
  bucketMap: Map<string, { count: number; resetAt: number }>,
  maxRequests: number,
  windowMs: number,
  keyFn: (req: Request) => string,
  errorDetail: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const key = keyFn(req)
    if (!key) { next(); return }

    const now    = Date.now()
    const bucket = bucketMap.get(key)

    if (!bucket || bucket.resetAt < now) {
      bucketMap.set(key, { count: 1, resetAt: now + windowMs })
      next(); return
    }

    bucket.count++
    if (bucket.count > maxRequests) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        detail: errorDetail,
        retryAfterSeconds: retryAfter,
      })
      return
    }
    next()
  }
}

// ── Mission upload rate limiter ──────────────────────────────────────────────
// VULN-03 FIX: 10 uploads/min per IP.
const uploadBuckets = new Map<string, { count: number; resetAt: number }>()
export const missionUploadRateLimit = createSlidingWindowLimiter(
  uploadBuckets,
  10,                   // max 10 uploads per minute per IP
  60 * 1000,            // 1-minute window
  (req) => req.ip ?? 'unknown',
  'Max 10 mission uploads/minute per IP',
)

// ── Auth login rate limiters ─────────────────────────────────────────────────
// Brute-force protection: 5 login attempts/min per IP.

const authLoginBuckets = new Map<string, { count: number; resetAt: number }>()
export const authLoginRateLimit = createSlidingWindowLimiter(
  authLoginBuckets,
  5,                    // max 5 login attempts per minute per IP
  60 * 1000,
  (req) => req.ip ?? 'unknown',
  'Max 5 login attempts/minute per IP',
)

const adminLoginBuckets = new Map<string, { count: number; resetAt: number }>()
export const adminLoginRateLimit = createSlidingWindowLimiter(
  adminLoginBuckets,
  5,                    // max 5 admin login attempts per minute per IP
  60 * 1000,
  (req) => req.ip ?? 'unknown',
  'Max 5 admin login attempts/minute per IP',
)

// ── Global rate limiter ──────────────────────────────────────────────────────
// DoS protection: 500 req/min per IP across all /api routes.
const globalBuckets = new Map<string, { count: number; resetAt: number }>()
export const globalRateLimit = createSlidingWindowLimiter(
  globalBuckets,
  500,
  60 * 1000,
  (req) => req.ip ?? 'unknown',
  'Global rate limit exceeded',
)

// Legacy alias — authRoutes imports this name
export const authRateLimit = authLoginRateLimit

// ── Periodic cleanup of expired buckets (prevents memory leak) ──────────────
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // every 5 minutes

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of uploadBuckets) {
    if (bucket.resetAt < now) uploadBuckets.delete(key)
  }
  for (const [key, bucket] of authLoginBuckets) {
    if (bucket.resetAt < now) authLoginBuckets.delete(key)
  }
  for (const [key, bucket] of adminLoginBuckets) {
    if (bucket.resetAt < now) adminLoginBuckets.delete(key)
  }
  for (const [key, bucket] of globalBuckets) {
    if (bucket.resetAt < now) globalBuckets.delete(key)
  }
}, CLEANUP_INTERVAL_MS).unref()

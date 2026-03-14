// T01 — Live telemetry REST endpoints

import express from 'express'
import { TelemetryService } from '../services/telemetryService'
import { requireAuth } from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { TelemetryPoint, TelemetryBatch } from '../types/telemetry'
import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'

const router = express.Router()
const service = new TelemetryService(prisma)

// ── Rate limiter: 100 req/min per missionId ──
const telemetryBuckets = new Map<string, { count: number; resetAt: number }>()
const TELEMETRY_RATE_LIMIT = 100
const TELEMETRY_WINDOW_MS  = 60 * 1000

function telemetryRateLimit(req: Request, res: Response, next: NextFunction): void {
  const missionId = req.params.id
  if (!missionId) { next(); return }

  const now = Date.now()
  const bucket = telemetryBuckets.get(missionId)

  if (!bucket || bucket.resetAt < now) {
    telemetryBuckets.set(missionId, { count: 1, resetAt: now + TELEMETRY_WINDOW_MS })
    next(); return
  }

  bucket.count++
  if (bucket.count > TELEMETRY_RATE_LIMIT) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    res.status(429).json({
      error: 'TELEMETRY_RATE_LIMIT_EXCEEDED',
      detail: `Max ${TELEMETRY_RATE_LIMIT} telemetry uploads/minute per mission`,
      retryAfterSeconds: retryAfter,
    })
    return
  }
  next()
}

// POST /api/missions/:id/telemetry — ingest single point or batch
router.post('/:id/telemetry', requireAuth, telemetryRateLimit, async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id
    const body = req.body

    if (body.points && Array.isArray(body.points)) {
      // Batch ingestion (max 10)
      const batch: TelemetryBatch = {
        points: body.points.slice(0, 10).map((p: TelemetryPoint) => ({
          ...p,
          missionId,
        })),
      }
      await service.ingestBatch(batch)
      res.json({ received: true, count: batch.points.length, ts: Date.now() })
    } else {
      // Single point
      const point: TelemetryPoint = { ...body, missionId }
      await service.ingestPoint(point)
      res.json({ received: true, ts: Date.now() })
    }
  } catch (err) {
    res.status(500).json({
      error: 'TELEMETRY_INGESTION_FAILED',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

// GET /api/missions/:id/track — full track history for replay
router.get('/:id/track', requireAuth, async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id
    const since = req.query.since ? Number(req.query.since) : undefined
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 5000) : 500

    const track = await service.getMissionTrack(missionId, since, limit)
    res.json(serializeForJson(track))
  } catch (err) {
    res.status(500).json({
      error: 'TRACK_FETCH_FAILED',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

// GET /api/missions/:id/track/live — latest single point (polling fallback)
router.get('/:id/track/live', requireAuth, async (req: Request, res: Response) => {
  try {
    const missionId = req.params.id
    const point = await service.getLatestPoint(missionId)
    if (!point) {
      res.status(404).json({ error: 'NO_TELEMETRY_DATA' })
      return
    }
    res.json(serializeForJson(point))
  } catch (err) {
    res.status(500).json({
      error: 'LIVE_POINT_FETCH_FAILED',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

export default router

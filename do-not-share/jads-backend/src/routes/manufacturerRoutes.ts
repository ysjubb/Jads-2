// manufacturerRoutes.ts — Manufacturer auto-share push API.
//
// When the Indian government mandates that DJI, Autel, and other drone OEMs
// automatically share flight data with JADS, this is the receiving endpoint.
//
// Two push modes:
//   REAL_TIME — pushed immediately after drone landing (connectivity available)
//   DEFERRED  — pushed when connectivity becomes available after offline ops
//
// Authentication: X-JADS-Vendor-Key header (per-vendor pre-shared key).
// Each manufacturer gets a unique key stored in ManufacturerVendor table.
//
// Data flow:
//   1. Drone lands → manufacturer cloud receives flight log
//   2. Manufacturer cloud calls POST /api/manufacturer/push with batch of flights
//   3. JADS validates, queues, and processes asynchronously
//   4. If operator has an existing JADS mission (phone GPS), the manufacturer
//      data is linked as corroborating evidence (higher-fidelity drone GPS)
//   5. If no matching JADS mission exists, a new mission is created from vendor data
//
// Deferred sync flow (no-connectivity areas):
//   1. Drone operates in area with no cell/internet (border, mountains, forests)
//   2. Drone stores flight logs locally on aircraft + controller
//   3. When connectivity is restored (hours/days later), manufacturer cloud
//      receives the backlog and pushes to JADS with pushType=DEFERRED
//   4. deferredSinceUtcMs indicates when the flight actually occurred
//   5. JADS processes identically but marks forensic trail as DEFERRED

import express          from 'express'
import { PrismaClient } from '@prisma/client'
import * as bcrypt       from 'bcryptjs'
import { createServiceLogger } from '../logger'
import { serializeForJson }    from '../utils/bigintSerializer'
import { MANUFACTURER_PUSH_SOURCES, categorizeByWeight } from '../constants'
import type { ManufacturerPushSource } from '../constants'

const router = express.Router()
const prisma = new PrismaClient()
const log    = createServiceLogger('ManufacturerRoutes')

// ── Vendor authentication middleware ────────────────────────────────────────
// Each manufacturer has a unique API key. The key is sent in X-JADS-Vendor-Key.
// Unlike the single ADAPTER_INBOUND_KEY, vendor keys are per-manufacturer and
// stored as bcrypt hashes in ManufacturerVendor table.
async function requireVendorAuth(
  req: express.Request, res: express.Response, next: express.NextFunction
): Promise<void> {
  const vendorKey  = req.headers['x-jads-vendor-key'] as string | undefined
  const vendorCode = req.headers['x-jads-vendor-code'] as string | undefined

  if (!vendorKey || !vendorCode) {
    res.status(401).json({
      error: 'VENDOR_AUTH_REQUIRED',
      required: ['X-JADS-Vendor-Key', 'X-JADS-Vendor-Code']
    })
    return
  }

  if (!MANUFACTURER_PUSH_SOURCES.includes(vendorCode as ManufacturerPushSource)) {
    res.status(400).json({ error: 'INVALID_VENDOR_CODE', valid: MANUFACTURER_PUSH_SOURCES })
    return
  }

  const vendor = await prisma.manufacturerVendor.findUnique({
    where: { vendorCode: vendorCode as any }
  })

  if (!vendor || !vendor.isActive) {
    log.warn('vendor_auth_failed', { data: { vendorCode, reason: vendor ? 'INACTIVE' : 'NOT_FOUND' } })
    res.status(403).json({ error: 'VENDOR_NOT_AUTHORIZED' })
    return
  }

  const keyValid = await bcrypt.compare(vendorKey, vendor.vendorKeyHash)
  if (!keyValid) {
    log.warn('vendor_auth_invalid_key', { data: { vendorCode } })
    res.status(403).json({ error: 'INVALID_VENDOR_KEY' })
    return
  }

  // Attach vendor info to request for downstream handlers
  ;(req as any).vendor = vendor
  next()
}

// ── Input types ─────────────────────────────────────────────────────────────

interface PushFlightInput {
  vendorFlightId:     string
  droneSerialNumber:  string
  droneModel:         string
  droneWeightGrams?:  number
  operatorId?:        string    // DGCA operator ID if known by manufacturer
  pilotId?:           string    // DGCA pilot ID if known by manufacturer
  flightStartUtcMs:   number
  flightEndUtcMs:     number
  takeoffLat:         number
  takeoffLon:         number
  landingLat?:        number
  landingLon?:        number
  maxAltitudeMeters?: number
  maxSpeedMs?:        number
  totalDistanceMeters?: number
  telemetry:          Array<{
    timestampMs:  number
    lat:          number
    lon:          number
    altMeters:    number
    speedMs?:     number
    headingDeg?:  number
  }>
}

interface PushBatchInput {
  batchReference:     string     // vendor's unique batch ID (idempotency)
  pushType:           string     // REAL_TIME | DEFERRED
  deferredReason?:    string     // why data was delayed
  deferredSinceUtcMs?: number   // when the data was originally captured
  flights:            PushFlightInput[]
}

// ── POST /api/manufacturer/push ─────────────────────────────────────────────
// Main endpoint: manufacturer pushes a batch of flight data to JADS.
// Supports both real-time (after landing) and deferred (post-connectivity) pushes.
//
// Idempotent: same batchReference from same vendor = 200 (already received).
// New batch = 201 (queued for processing).
router.post('/push', requireVendorAuth, async (req, res) => {
  try {
    const vendor = (req as any).vendor
    const input  = req.body as PushBatchInput

    // ── Validate input ──────────────────────────────────────────────────
    if (!input.batchReference || !input.pushType || !Array.isArray(input.flights)) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        required: ['batchReference', 'pushType', 'flights']
      })
      return
    }

    if (!['REAL_TIME', 'DEFERRED'].includes(input.pushType)) {
      res.status(400).json({ error: 'INVALID_PUSH_TYPE', valid: ['REAL_TIME', 'DEFERRED'] })
      return
    }

    if (input.flights.length === 0) {
      res.status(400).json({ error: 'EMPTY_FLIGHTS' })
      return
    }

    // Cap at 500 flights per batch to prevent abuse
    if (input.flights.length > 500) {
      res.status(400).json({ error: 'TOO_MANY_FLIGHTS', limit: 500, received: input.flights.length })
      return
    }

    // Validate each flight has required fields
    for (let i = 0; i < input.flights.length; i++) {
      const f = input.flights[i]
      if (!f.vendorFlightId || !f.droneSerialNumber || !f.droneModel ||
          !f.flightStartUtcMs || !f.flightEndUtcMs || f.takeoffLat == null || f.takeoffLon == null) {
        res.status(400).json({
          error: 'INVALID_FLIGHT_DATA',
          index: i,
          required: ['vendorFlightId', 'droneSerialNumber', 'droneModel',
                     'flightStartUtcMs', 'flightEndUtcMs', 'takeoffLat', 'takeoffLon']
        })
        return
      }
    }

    // ── Idempotency check ───────────────────────────────────────────────
    const existing = await prisma.manufacturerPushBatch.findUnique({
      where: { batchReference: input.batchReference }
    })

    if (existing) {
      log.info('manufacturer_push_idempotent', {
        data: { batchReference: input.batchReference, vendorCode: vendor.vendorCode }
      })
      res.status(200).json(serializeForJson({
        success: true,
        status:  'ALREADY_RECEIVED',
        batchId: existing.id,
        message: 'Batch already received and is being processed.'
      }))
      return
    }

    // ── Create batch + flights in transaction ───────────────────────────
    const batch = await prisma.$transaction(async tx => {
      const b = await tx.manufacturerPushBatch.create({
        data: {
          vendorId:           vendor.id,
          batchReference:     input.batchReference,
          pushType:           input.pushType,
          deferredReason:     input.deferredReason ?? null,
          deferredSinceUtcMs: input.deferredSinceUtcMs ? String(input.deferredSinceUtcMs) : null,
          receivedAtUtcMs:    String(Date.now()),
          status:             'QUEUED',
          flightCount:        input.flights.length,
        }
      })

      await tx.manufacturerPushFlight.createMany({
        data: input.flights.map(f => ({
          batchId:              b.id,
          vendorFlightId:       f.vendorFlightId,
          droneSerialNumber:    f.droneSerialNumber,
          droneModel:           f.droneModel,
          droneWeightCategory:  f.droneWeightGrams
            ? categorizeByWeight(f.droneWeightGrams) as any
            : 'UNKNOWN',
          operatorId:           f.operatorId ?? null,
          pilotId:              f.pilotId ?? null,
          flightStartUtcMs:     String(f.flightStartUtcMs),
          flightEndUtcMs:       String(f.flightEndUtcMs),
          takeoffLatDeg:        f.takeoffLat,
          takeoffLonDeg:        f.takeoffLon,
          landingLatDeg:        f.landingLat ?? null,
          landingLonDeg:        f.landingLon ?? null,
          maxAltitudeMeters:    f.maxAltitudeMeters ?? null,
          maxSpeedMs:           f.maxSpeedMs ?? null,
          totalDistanceMeters:  f.totalDistanceMeters ?? null,
          telemetryJson:        JSON.stringify(f.telemetry || []),
          telemetryPointCount:  f.telemetry?.length ?? 0,
          telemetryHz:          f.telemetry && f.telemetry.length >= 2
            ? 1000 / ((f.telemetry[1].timestampMs - f.telemetry[0].timestampMs) || 1)
            : null,
          ingestionStatus:      'PENDING',
        }))
      })

      // Update vendor stats
      await tx.manufacturerVendor.update({
        where: { id: vendor.id },
        data: {
          lastPushAt:   new Date(),
          totalBatches: { increment: 1 },
          totalFlights: { increment: input.flights.length },
        }
      })

      return b
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorType:    'MANUFACTURER_VENDOR',
        actorId:      vendor.id,
        action:       'manufacturer_flight_data_push',
        resourceType: 'manufacturer_push_batch',
        resourceId:   batch.id,
        detailJson:   JSON.stringify({
          vendorCode:     vendor.vendorCode,
          batchReference: input.batchReference,
          pushType:       input.pushType,
          flightCount:    input.flights.length,
          deferredReason: input.deferredReason ?? null,
        })
      }
    })

    log.info('manufacturer_push_accepted', {
      data: {
        batchId:        batch.id,
        vendorCode:     vendor.vendorCode,
        batchReference: input.batchReference,
        pushType:       input.pushType,
        flightCount:    input.flights.length,
      }
    })

    res.status(201).json(serializeForJson({
      success:     true,
      status:      'QUEUED',
      batchId:     batch.id,
      flightCount: input.flights.length,
      message:     input.pushType === 'DEFERRED'
        ? `Deferred batch of ${input.flights.length} flight(s) queued for processing.`
        : `Real-time batch of ${input.flights.length} flight(s) queued for processing.`,
    }))
  } catch (e: unknown) {
    // Handle idempotency race (P2002 on batchReference unique constraint)
    if ((e as { code?: string }).code === 'P2002') {
      const existing = await prisma.manufacturerPushBatch.findUnique({
        where: { batchReference: (req.body as any).batchReference }
      })
      if (existing) {
        res.status(200).json(serializeForJson({
          success: true, status: 'ALREADY_RECEIVED', batchId: existing.id,
        }))
        return
      }
    }
    log.error('manufacturer_push_error', {
      data: { error: e instanceof Error ? e.message : String(e) }
    })
    res.status(500).json({ error: 'PUSH_FAILED' })
  }
})

// ── GET /api/manufacturer/batches ───────────────────────────────────────────
// Vendor can query status of their submitted batches.
router.get('/batches', requireVendorAuth, async (req, res) => {
  try {
    const vendor = (req as any).vendor
    const page   = Math.max(1, parseInt((req.query.page as string) ?? '1'))
    const limit  = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20')))
    const status = req.query.status as string | undefined

    const where: any = { vendorId: vendor.id }
    if (status) where.status = status

    const [batches, total] = await Promise.all([
      prisma.manufacturerPushBatch.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { receivedAtUtcMs: 'desc' },
        select: {
          id: true, batchReference: true, pushType: true,
          status: true, flightCount: true, processedCount: true,
          failedCount: true, receivedAtUtcMs: true, processedAt: true,
          deferredReason: true, deferredSinceUtcMs: true,
        }
      }),
      prisma.manufacturerPushBatch.count({ where }),
    ])

    res.json(serializeForJson({ success: true, batches, total, page, limit }))
  } catch (e: unknown) {
    res.status(500).json({ error: 'BATCHES_LIST_FAILED' })
  }
})

// ── GET /api/manufacturer/batches/:id ───────────────────────────────────────
// Vendor can check detailed status of a specific batch including per-flight results.
router.get('/batches/:id', requireVendorAuth, async (req, res) => {
  try {
    const vendor = (req as any).vendor
    const batch  = await prisma.manufacturerPushBatch.findUnique({
      where:   { id: req.params.id },
      include: {
        flights: {
          select: {
            id: true, vendorFlightId: true, droneSerialNumber: true,
            droneModel: true, droneWeightCategory: true,
            flightStartUtcMs: true, flightEndUtcMs: true,
            ingestionStatus: true, ingestionError: true,
            linkedMissionId: true, matchConfidence: true,
          }
        }
      }
    })

    if (!batch || batch.vendorId !== vendor.id) {
      res.status(404).json({ error: 'BATCH_NOT_FOUND' })
      return
    }

    res.json(serializeForJson({ success: true, batch }))
  } catch (e: unknown) {
    res.status(500).json({ error: 'BATCH_FETCH_FAILED' })
  }
})

export default router

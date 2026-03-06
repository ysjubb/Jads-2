import express           from 'express'
import { PrismaClient }  from '@prisma/client'
import { requireAuth }   from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { ClearanceService, registerSseClient, unregisterSseClient } from '../services/ClearanceService'
import { FlightPlanService }   from '../services/FlightPlanService'
import { RoutePlanningService } from '../services/RoutePlanningService'
import { createServiceLogger } from '../logger'

const router       = express.Router()
const prisma       = new PrismaClient()
const service      = new ClearanceService(prisma)
const fplService   = new FlightPlanService(prisma)
const routeService = new RoutePlanningService()
const log          = createServiceLogger('FlightPlanRoutes')

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans/route-plan
// Route planning with segment-by-segment semicircular rule validation.
// Called from the user app route planning tab BEFORE filing.
// Returns: route analysis (bearings, FL parity requirements), AFTN route string.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/route-plan', requireAuth, async (req, res) => {
  try {
    const {
      adep,
      ades,
      cruisingLevel,
      flightRules = 'I',
      mode = 'AIRWAYS',            // AIRWAYS | DIRECT | MIXED
      waypoints = [],
      userType,
    } = req.body

    if (!adep || !ades) {
      res.status(400).json({ error: 'ADEP_AND_ADES_REQUIRED' })
      return
    }

    // Special users default to DIRECT routing; civilian to AIRWAYS
    const effectiveMode = mode ?? (req.auth!.userType === 'SPECIAL' ? 'DIRECT' : 'AIRWAYS')

    const plan = routeService.planRoute(
      waypoints,
      waypoints.slice(0, -1).map(() => ({ type: effectiveMode === 'DIRECT' ? 'DIRECT' as const : 'AIRWAY' as const })),
      480,  // Default groundspeed for planning (480 kts)
      typeof cruisingLevel === 'number' ? cruisingLevel : parseInt(String(cruisingLevel).replace(/\D/g, '')) || 350,
    )

    res.json({ success: true, routePlan: plan })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('route_plan_error', { data: { error: msg } })
    res.status(500).json({ error: 'ROUTE_PLAN_FAILED', detail: msg })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans
// File a manned aircraft flight plan. Validates, builds AFTN message,
// generates AFTN addressees, transmits via AFTN stub, sends confirmation.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await fplService.createAndFilePlan(
      {
        ...req.body,
        filedBy:    req.auth!.userId,
        entityCode: req.auth!.entityCode,
      },
      req.auth!.userId,
      req.auth!.userType as 'CIVILIAN' | 'SPECIAL'
    )

    if (result.status === 'VALIDATION_FAILED') {
      res.status(422).json({ success: false, ...result.report })
      return
    }

    res.status(201).json(serializeForJson({ success: true, ...result }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('flight_plan_file_error', { data: { error: msg } })
    res.status(500).json({ error: 'FLIGHT_PLAN_FILE_FAILED' })
  }
})

// GET /api/flight-plans
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, userType } = req.auth!
    const where = userType === 'CIVILIAN'
      ? { filedBy: userId }
      : { filedBy: userId }

    const plans = await prisma.mannedFlightPlan.findMany({
      where, take: 50, orderBy: { createdAt: 'desc' },
      select: {
        id: true, flightPlanId: true, aircraftId: true,
        adep: true, ades: true,
        eobt: true, status: true, filedAt: true,
      }
    })
    res.json(serializeForJson({ success: true, plans }))
  } catch {
    res.status(500).json({ error: 'FLIGHT_PLAN_LIST_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans/:id/cancel
// Cancel a filed flight plan. Builds and transmits AFTN CNL message.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'REASON_REQUIRED' })
      return
    }

    const result = await fplService.cancelPlan(
      req.params.id,
      req.auth!.userId,
      req.auth!.userType as 'CIVILIAN' | 'SPECIAL',
      reason.trim()
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('NOT_YOUR') ? 403
      : msg.includes('CANNOT_CANCEL') ? 409
      : 500
    log.error('flight_plan_cancel_error', { data: { error: msg } })
    res.status(status).json({ error: msg })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans/:id/delay
// Delay a filed flight plan. Builds and transmits AFTN DLA message.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/delay', requireAuth, async (req, res) => {
  try {
    const { newEobt, reason } = req.body
    if (!newEobt || !/^\d{6}$/.test(newEobt)) {
      res.status(400).json({ error: 'VALID_NEW_EOBT_REQUIRED', detail: 'Must be DDHHmm format' })
      return
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'REASON_REQUIRED' })
      return
    }

    const result = await fplService.delayPlan(
      req.params.id,
      req.auth!.userId,
      req.auth!.userType as 'CIVILIAN' | 'SPECIAL',
      newEobt,
      reason.trim()
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('NOT_YOUR') ? 403
      : msg.includes('CANNOT_DELAY') ? 409
      : msg.includes('must differ') ? 422
      : msg.includes('DELAY_TOO_SHORT') ? 422
      : 500
    log.error('flight_plan_delay_error', { data: { error: msg } })
    res.status(status).json({ error: msg })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans/:id/arrive
// Report arrival of a flight. Builds and transmits AFTN ARR message.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/arrive', requireAuth, async (req, res) => {
  try {
    const { arrivalTime, arrivalIcao } = req.body
    if (!arrivalTime || !/^\d{4}$/.test(arrivalTime)) {
      res.status(400).json({ error: 'VALID_ARRIVAL_TIME_REQUIRED', detail: 'Must be HHmm UTC format' })
      return
    }
    if (arrivalIcao && !/^[A-Z]{4}$/.test(arrivalIcao)) {
      res.status(400).json({ error: 'INVALID_ARRIVAL_ICAO', detail: 'Must be 4-char ICAO code' })
      return
    }

    const result = await fplService.arrivePlan(
      req.params.id,
      req.auth!.userId,
      req.auth!.userType as 'CIVILIAN' | 'SPECIAL',
      arrivalTime,
      arrivalIcao
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('NOT_YOUR') ? 403
      : msg.includes('CANNOT_ARRIVE') ? 409
      : 500
    log.error('flight_plan_arrive_error', { data: { error: msg } })
    res.status(status).json({ error: msg })
  }
})

// GET /api/flight-plans/:id — full plan with ADC/FIC refs
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, plan }))
  } catch {
    res.status(500).json({ error: 'FLIGHT_PLAN_FETCH_FAILED' })
  }
})

// GET /api/flight-plans/:id/clearance — current clearance snapshot (no SSE)
router.get('/:id/clearance', requireAuth, async (req, res) => {
  try {
    const clearance = await service.getClearanceStatus(req.params.id)
    res.json({ success: true, ...clearance })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(msg.includes('not found') ? 404 : 500).json({ error: 'CLEARANCE_FETCH_FAILED' })
  }
})

// GET /api/flight-plans/:id/events — SSE stream for real-time clearance updates
//
// Pilot's app opens this once after filing. Server pushes events as AFMLU/FIR
// issue ADC and FIC numbers. No polling. No phone calls.
//
// Events:
//   connected        — snapshot of current clearance uploadStatus
//   adc_issued       — AFMLU issued an ADC number
//   fic_issued       — FIR issued a FIC number
//   clearance_rejected
//   keepalive        — every 25s to prevent proxy timeout
router.get('/:id/events', requireAuth, async (req, res) => {
  const flightPlanId = req.params.id

  // Verify plan exists and belongs to this user before opening SSE
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({
      where:  { id: flightPlanId },
      select: { id: true, filedBy: true }
    })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }

    const ownsIt = plan.filedBy === req.auth!.userId
    if (!ownsIt) { res.status(403).json({ error: 'NOT_YOUR_FLIGHT_PLAN' }); return }
  } catch {
    res.status(500).json({ error: 'SSE_SETUP_FAILED' })
    return
  }

  // SSE headers
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')  // Nginx: disable response buffering
  res.flushHeaders()

  // Send current clearance snapshot so app doesn't need a second request
  try {
    const snapshot = await service.getClearanceStatus(flightPlanId)
    res.write(`event: connected\ndata: ${JSON.stringify({
      flightPlanId, ...snapshot,
      message: 'Connected. Waiting for AFMLU and FIR clearances.',
    })}\n\n`)
  } catch {
    res.write(`event: connected\ndata: ${JSON.stringify({ flightPlanId })}\n\n`)
  }

  registerSseClient(flightPlanId, res)
  log.info('sse_stream_opened', { data: { flightPlanId, userId: req.auth!.userId } })

  // Keepalive every 25s — prevents load balancers/proxies closing idle connections
  const keepalive = setInterval(() => {
    try { res.write(`event: keepalive\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`) }
    catch { clearInterval(keepalive) }
  }, 25000)

  req.on('close', () => {
    clearInterval(keepalive)
    unregisterSseClient(flightPlanId, res)
    log.info('sse_stream_closed', { data: { flightPlanId } })
  })
})

export default router

import express           from 'express'
import { PrismaClient }  from '@prisma/client'
import { requireAuth, requireRole, requireDomain } from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { ClearanceService, registerSseClient, unregisterSseClient } from '../services/ClearanceService'
import { FlightPlanService }   from '../services/FlightPlanService'
import { RoutePlanningService } from '../services/RoutePlanningService'
import { RouteAdvisoryService } from '../services/RouteAdvisoryService'
import { createServiceLogger } from '../logger'

const router       = express.Router()
const prisma       = new PrismaClient()
const service      = new ClearanceService(prisma)
const fplService   = new FlightPlanService(prisma)
const routeService   = new RoutePlanningService()
const advisoryService = new RouteAdvisoryService()
const log          = createServiceLogger('FlightPlanRoutes')

// Roles authorised for manned flight plan filing and lifecycle operations
const FPL_ROLES = ['PILOT', 'PILOT_AND_DRONE', 'GOVT_PILOT', 'GOVT_DRONE_OPERATOR', 'PLATFORM_SUPER_ADMIN']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans/route-plan
// Route planning with segment-by-segment semicircular rule validation.
// Called from the user app route planning tab BEFORE filing.
// Returns: route analysis (bearings, FL parity requirements), AFTN route string.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/route-plan', requireAuth, requireDomain('AIRCRAFT'), requireRole(FPL_ROLES), async (req, res) => {
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
// POST /api/flight-plans/route-advisory
// Advisory-only route recommendation. Returns recommended airway route,
// flight level advisory, reporting points, FIR crossings, and direct route
// comparison. Purely computational — no DB writes, no audit log.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/route-advisory', requireAuth, requireDomain('AIRCRAFT'), async (req, res) => {
  try {
    const { adep, ades, cruisingLevel, cruisingSpeed } = req.body

    if (!adep || !ades) {
      res.status(400).json({ error: 'ADEP_AND_ADES_REQUIRED' })
      return
    }

    const advisory = advisoryService.generateAdvisory({
      adep: String(adep).toUpperCase(),
      ades: String(ades).toUpperCase(),
      cruisingLevel: cruisingLevel || 'VFR',
      cruisingSpeed: cruisingSpeed || 'N0240',
    })

    res.json({ success: true, advisory })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('route_advisory_error', { data: { error: msg } })
    res.status(500).json({ error: 'ROUTE_ADVISORY_FAILED', detail: msg })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Map form field names (UI) → FlightPlanService internal field names.
// The user portal sends user-friendly fields (adep, ades, cruisingSpeed)
// while the service expects ICAO-oriented names (departureIcao, speedIndicator).
// ─────────────────────────────────────────────────────────────────────────────
function mapFormToService(body: Record<string, any>): Record<string, any> {
  // Parse cruising speed: "N0120" → indicator="N", value="0120"
  const speed = body.cruisingSpeed || ''
  const speedIndicator = speed.charAt(0) || 'N'
  const speedValue     = speed.substring(1) || '0000'

  // Parse cruising level: "VFR" stays as-is; "F350" → indicator="F", value="350"
  const level = body.cruisingLevel || 'VFR'
  let levelIndicator = 'VFR'
  let levelValue     = ''
  if (level !== 'VFR') {
    levelIndicator = level.charAt(0) // F, A, S, M
    levelValue     = level.substring(1)
  }

  // Convert ISO eobt to DDHHmm format for service's parseEobt()
  let estimatedOffBlock = body.eobt || ''
  if (estimatedOffBlock.includes('T') || estimatedOffBlock.includes('-')) {
    const d = new Date(estimatedOffBlock)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      estimatedOffBlock = `${dd}${hh}${mm}`
    }
  }

  // Map form flightRules: "VFR"→"V", "IFR"→"I", "Y"→"Y", "Z"→"Z"
  const rulesMap: Record<string, string> = { VFR: 'V', IFR: 'I', Y: 'Y', Z: 'Z', V: 'V', I: 'I' }
  const flightRules = rulesMap[body.flightRules] || body.flightRules

  return {
    ...body,
    flightRules,
    // Service field names — keep hyphens for validation (VT-ABC), AFTN builder handles stripping
    callsign:          body.aircraftId   || body.callsign,
    departureIcao:     body.adep         || body.departureIcao,
    destinationIcao:   body.ades         || body.destinationIcao,
    alternate1:        body.altn1        || body.alternate1 || undefined,
    alternate2:        body.altn2        || body.alternate2 || undefined,
    estimatedOffBlock,
    speedIndicator,
    speedValue,
    levelIndicator,
    levelValue,
    enduranceHHmm:     body.endurance    || body.enduranceHHmm,
    otherInfo:         body.item18       || body.otherInfo,
    pilotEmail:        body.notifyEmail  || body.pilotEmail,
    pilotMobile:       body.notifyMobile || body.pilotMobile,
    surveillance:      body.surveillance || '',
    equipment:         body.equipment    || 'S',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/flight-plans
// File a manned aircraft flight plan. Validates, builds AFTN message,
// generates AFTN addressees, transmits via AFTN stub, sends confirmation.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireDomain('AIRCRAFT'), requireRole(FPL_ROLES), async (req, res) => {
  try {
    const mapped = mapFormToService(req.body)
    const result = await fplService.createAndFilePlan(
      {
        ...mapped,
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
    const stack = e instanceof Error ? e.stack : undefined
    log.error('flight_plan_file_error', { data: { error: msg, stack } })
    res.status(500).json({ error: 'FLIGHT_PLAN_FILE_FAILED', detail: msg })
  }
})

// GET /api/flight-plans
router.get('/', requireAuth, requireDomain('AIRCRAFT'), async (req, res) => {
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
router.post('/:id/cancel', requireAuth, requireDomain('AIRCRAFT'), requireRole([...FPL_ROLES, 'DGCA_AUDITOR']), async (req, res) => {
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
      reason.trim(),
      req.auth!.role
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('FORBIDDEN') ? 403
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
router.post('/:id/delay', requireAuth, requireDomain('AIRCRAFT'), requireRole(FPL_ROLES), async (req, res) => {
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
      reason.trim(),
      req.auth!.role
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('FORBIDDEN') ? 403
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
router.post('/:id/arrive', requireAuth, requireDomain('AIRCRAFT'), requireRole(FPL_ROLES), async (req, res) => {
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
      arrivalIcao,
      req.auth!.role
    )

    res.json({ ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('NOT_FOUND') ? 404
      : msg.includes('FORBIDDEN') ? 403
      : msg.includes('CANNOT_ARRIVE') ? 409
      : 500
    log.error('flight_plan_arrive_error', { data: { error: msg } })
    res.status(status).json({ error: msg })
  }
})

// ── Edit before clearance ────────────────────────────────────────────────────
// PUT /api/flight-plans/:id — amend a filed plan before ADC/FIC clearance
const EDITABLE_STATUSES = ['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE']
const EDITABLE_FIELDS   = [
  'eobt', 'route', 'cruisingLevel', 'cruisingSpeed',
  'altn1', 'altn2', 'eet', 'endurance', 'personsOnBoard',
  'notifyEmail', 'notifyMobile', 'additionalEmails', 'item18', 'remarks',
]

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({ where: { id: req.params.id } })
    if (!plan)                                { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' });  return }
    if (plan.filedBy !== req.auth!.userId)    { res.status(403).json({ error: 'NOT_YOUR_FLIGHT_PLAN' });   return }
    if (!EDITABLE_STATUSES.includes(plan.status)) {
      res.status(409).json({ error: 'CANNOT_EDIT_AFTER_CLEARANCE', status: plan.status }); return
    }

    // Build update payload from whitelisted fields only
    const data: Record<string, unknown> = {}
    for (const f of EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) {
        if (f === 'eobt')           data.eobt = new Date(req.body.eobt)
        else if (f === 'personsOnBoard') data.personsOnBoard = parseInt(req.body.personsOnBoard) || null
        else if (f === 'additionalEmails') data.additionalEmails = Array.isArray(req.body.additionalEmails) ? req.body.additionalEmails : []
        else                        data[f] = req.body[f]
      }
    }
    if (Object.keys(data).length === 0) { res.status(400).json({ error: 'NO_EDITABLE_FIELDS' }); return }

    // If route changed, re-validate via route planning service
    if (data.route && data.route !== plan.route) {
      try {
        // planRoute expects (waypoints: AtsWaypoint[], routeTypes, groundspeedKts, flightLevel)
        // For re-validation on edit, we parse existing validation to get waypoints
        const existingVr = JSON.parse(plan.validationResultJson ?? '{}')
        const wpList = existingVr.routeLegs?.length > 0
          ? (() => {
              const seen = new Set<string>()
              const pts: any[] = []
              for (const leg of existingVr.routeLegs) {
                if (!seen.has(leg.from.identifier)) { seen.add(leg.from.identifier); pts.push({ identifier: leg.from.identifier, type: leg.from.type ?? 'FIX', lat: leg.from.latDeg, lon: leg.from.lonDeg }) }
                if (!seen.has(leg.to.identifier))   { seen.add(leg.to.identifier);   pts.push({ identifier: leg.to.identifier,   type: leg.to.type ?? 'FIX',   lat: leg.to.latDeg,   lon: leg.to.lonDeg }) }
              }
              return pts
            })()
          : []

        if (wpList.length >= 2) {
          const flStr = (data.cruisingLevel as string) ?? plan.cruisingLevel
          const fl = parseInt(String(flStr).replace(/\D/g, '')) || 350
          const step2 = routeService.planRoute(
            wpList,
            wpList.slice(0, -1).map(() => ({ type: 'DIRECT' as const })),
            480, fl
          )
          data.validationResultJson = JSON.stringify({
            ...existingVr,
            routeLegs: step2.segments?.map((seg: any) => ({
              from: { identifier: seg.from.identifier, type: seg.from.type, latDeg: seg.from.lat, lonDeg: seg.from.lon },
              to:   { identifier: seg.to.identifier,   type: seg.to.type,   latDeg: seg.to.lat,   lonDeg: seg.to.lon },
              distanceNm: seg.distanceNm,
            })) ?? [],
            totalEet: step2.totalEet,
          })
          if (step2.totalEet) data.totalEet = String(step2.totalEet)
        }
      } catch (routeErr) {
        log.warn('route_revalidation_failed', { data: { error: String(routeErr) } })
        // Allow edit even if route validation fails — field values still updated
      }
    }

    data.amendmentCount = (plan.amendmentCount ?? 0) + 1
    data.lastAmendmentAt = new Date()
    data.updatedAt = new Date()

    const updated = await prisma.mannedFlightPlan.update({
      where: { id: req.params.id },
      data: data as any,
    })

    // Audit log
    await prisma.auditLog.create({ data: {
      actorType:    'USER',
      actorId:      req.auth!.userId,
      actorRole:    'PILOT',
      action:       'FLIGHT_PLAN_AMENDED',
      resourceType: 'manned_flight_plan',
      resourceId:   plan.id,
      detailJson:   JSON.stringify({ amendmentCount: data.amendmentCount, changedFields: Object.keys(data).filter(k => !['amendmentCount', 'lastAmendmentAt', 'updatedAt'].includes(k)) }),
    }})

    log.info('flight_plan_amended', { data: { planId: plan.id, amendment: data.amendmentCount } })
    res.json({ success: true, plan: serializeForJson(updated) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('flight_plan_edit_error', { data: { error: msg } })
    res.status(500).json({ error: 'EDIT_FAILED' })
  }
})

// GET /api/flight-plans/:id/route-geometry — waypoint coordinates for map
router.get('/:id/route-geometry', requireAuth, async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({
      where: { id: req.params.id },
      select: { adep: true, ades: true, route: true, validationResultJson: true, filedBy: true }
    })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }
    if (plan.filedBy !== req.auth!.userId) { res.status(403).json({ error: 'NOT_YOUR_FLIGHT_PLAN' }); return }

    let points: { identifier: string; type: string; latDeg: number; lonDeg: number }[] = []
    try {
      const vr = JSON.parse(plan.validationResultJson ?? '{}')
      if (vr.routeLegs && vr.routeLegs.length > 0) {
        const seen = new Set<string>()
        for (const leg of vr.routeLegs) {
          if (!seen.has(leg.from.identifier)) { seen.add(leg.from.identifier); points.push(leg.from) }
          if (!seen.has(leg.to.identifier))   { seen.add(leg.to.identifier);   points.push(leg.to) }
        }
      }
    } catch { /* validationResultJson may not have routeLegs */ }

    // Filter out points with invalid (0,0) coordinates
    points = points.filter(p => p.latDeg !== 0 || p.lonDeg !== 0)

    // Fallback: look up ADEP/ADES from AerodromeRecord
    if (points.length === 0) {
      const [dep, dest] = await Promise.all([
        prisma.aerodromeRecord.findFirst({ where: { OR: [{ icao: plan.adep }, { icaoCode: plan.adep }] } }),
        prisma.aerodromeRecord.findFirst({ where: { OR: [{ icao: plan.ades }, { icaoCode: plan.ades }] } }),
      ])
      const depLat = dep?.latDeg ?? dep?.latitudeDeg ?? 0
      const depLon = dep?.lonDeg ?? dep?.longitudeDeg ?? 0
      if (dep && (depLat !== 0 || depLon !== 0))  points.push({ identifier: plan.adep, type: 'AERODROME', latDeg: depLat, lonDeg: depLon })
      const destLat = dest?.latDeg ?? dest?.latitudeDeg ?? 0
      const destLon = dest?.lonDeg ?? dest?.longitudeDeg ?? 0
      if (dest && (destLat !== 0 || destLon !== 0)) points.push({ identifier: plan.ades, type: 'AERODROME', latDeg: destLat, lonDeg: destLon })
    }

    res.json({ success: true, adep: plan.adep, ades: plan.ades, route: plan.route, points })
  } catch {
    res.status(500).json({ error: 'ROUTE_GEOMETRY_FAILED' })
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

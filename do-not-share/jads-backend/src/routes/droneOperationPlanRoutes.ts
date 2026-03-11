// Drone Operation Plan Routes — CRUD + submit/cancel for pre-flight area planning.
// Users create plans (POLYGON or CIRCLE area), submit for approval.
// Admin routes (approve/reject) live in adminRoutes.ts.

import express          from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth, requireRole, requireDomain } from '../middleware/authMiddleware'
import { serializeForJson }         from '../utils/bigintSerializer'
import { createServiceLogger }      from '../logger'
import { DigitalSkyAdapterStub }    from '../adapters/stubs/DigitalSkyAdapterStub'
import { ConflictDetectionService } from '../services/ConflictDetectionService'
import { AfmluAdapterStub }         from '../adapters/stubs/AfmluAdapterStub'
import { FirAdapterStub }           from '../adapters/stubs/FirAdapterStub'
import { AAIDataAdapterStub }       from '../adapters/stubs/AAIDataAdapterStub'

const router = express.Router()
const prisma = new PrismaClient()
const log    = createServiceLogger('DroneOperationPlanRoutes')
const digitalSkyAdapter = new DigitalSkyAdapterStub()
const conflictService = new ConflictDetectionService(prisma, new AfmluAdapterStub(), new FirAdapterStub(), new AAIDataAdapterStub())

// Roles allowed to file drone operation plans
const DOP_ROLES = ['DRONE_OPERATOR', 'GOVT_DRONE_OPERATOR', 'PLATFORM_SUPER_ADMIN']

// Statuses where plan edits are still allowed
const EDITABLE_STATUSES = ['DRAFT', 'SUBMITTED']

// Generate human-readable plan ID: DOP-YYYY-NNNNN
async function generatePlanId(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.droneOperationPlan.count({
    where: { planId: { startsWith: `DOP-${year}-` } }
  })
  return `DOP-${year}-${String(count + 1).padStart(5, '0')}`
}

// ── Validation helpers ───────────────────────────────────────────────────────

function validateAreaPayload(body: Record<string, unknown>): string | null {
  const { areaType } = body
  if (!areaType || (areaType !== 'POLYGON' && areaType !== 'CIRCLE')) {
    return 'areaType must be POLYGON or CIRCLE'
  }
  if (areaType === 'POLYGON') {
    if (!body.areaGeoJson || typeof body.areaGeoJson !== 'string') {
      return 'areaGeoJson (GeoJSON Polygon string) required for POLYGON type'
    }
    try {
      const geo = JSON.parse(body.areaGeoJson as string)
      if (geo.type !== 'Polygon' || !Array.isArray(geo.coordinates)) {
        return 'areaGeoJson must be a valid GeoJSON Polygon with coordinates array'
      }
    } catch {
      return 'areaGeoJson is not valid JSON'
    }
  }
  if (areaType === 'CIRCLE') {
    if (typeof body.centerLatDeg !== 'number' || typeof body.centerLonDeg !== 'number') {
      return 'centerLatDeg and centerLonDeg (numbers) required for CIRCLE type'
    }
    if (typeof body.radiusM !== 'number' || body.radiusM <= 0) {
      return 'radiusM (positive number in meters) required for CIRCLE type'
    }
    if (Math.abs(body.centerLatDeg as number) > 90 || Math.abs(body.centerLonDeg as number) > 180) {
      return 'centerLatDeg must be ±90, centerLonDeg must be ±180'
    }
  }
  if (typeof body.maxAltitudeAglM !== 'number' || body.maxAltitudeAglM <= 0) {
    return 'maxAltitudeAglM (positive number in meters AGL) is required'
  }
  if (!body.plannedStartUtc || !body.plannedEndUtc) {
    return 'plannedStartUtc and plannedEndUtc are required'
  }
  if (new Date(body.plannedStartUtc as string) >= new Date(body.plannedEndUtc as string)) {
    return 'plannedEndUtc must be after plannedStartUtc'
  }
  if (!body.purpose || typeof body.purpose !== 'string') {
    return 'purpose is required'
  }
  if (!body.droneSerialNumber || typeof body.droneSerialNumber !== 'string') {
    return 'droneSerialNumber is required'
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drone-plans — Create a new drone operation plan (DRAFT)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireDomain('DRONE'), requireRole(DOP_ROLES), async (req, res) => {
  try {
    const err = validateAreaPayload(req.body)
    if (err) { res.status(400).json({ error: 'VALIDATION_FAILED', detail: err }); return }

    const planId = await generatePlanId()

    const plan = await prisma.droneOperationPlan.create({
      data: {
        planId,
        operatorId:        req.auth!.userId,
        droneSerialNumber: req.body.droneSerialNumber,
        uinNumber:         req.body.uinNumber ?? null,
        areaType:          req.body.areaType,
        areaGeoJson:       req.body.areaType === 'POLYGON' ? req.body.areaGeoJson : null,
        centerLatDeg:      req.body.areaType === 'CIRCLE' ? req.body.centerLatDeg : null,
        centerLonDeg:      req.body.areaType === 'CIRCLE' ? req.body.centerLonDeg : null,
        radiusM:           req.body.areaType === 'CIRCLE' ? req.body.radiusM : null,
        maxAltitudeAglM:   req.body.maxAltitudeAglM,
        minAltitudeAglM:   req.body.minAltitudeAglM ?? 0,
        plannedStartUtc:   new Date(req.body.plannedStartUtc),
        plannedEndUtc:     new Date(req.body.plannedEndUtc),
        purpose:           req.body.purpose,
        remarks:           req.body.remarks ?? null,
        notifyEmail:       req.body.notifyEmail ?? null,
        notifyMobile:      req.body.notifyMobile ?? null,
        additionalEmails:  Array.isArray(req.body.additionalEmails) ? req.body.additionalEmails : [],
        status:            'DRAFT',
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: req.auth!.userId, actorRole: req.auth!.role,
        action: 'DRONE_PLAN_CREATED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId, areaType: req.body.areaType, purpose: req.body.purpose }),
      }
    })

    log.info('drone_plan_created', { data: { planId: plan.planId, operatorId: plan.operatorId } })
    res.status(201).json(serializeForJson({ success: true, plan }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_create_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_CREATE_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/drone-plans/:id — Edit a plan (DRAFT or SUBMITTED only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.operatorId !== req.auth!.userId) { res.status(403).json({ error: 'NOT_YOUR_PLAN' }); return }
    if (!EDITABLE_STATUSES.includes(plan.status)) {
      res.status(409).json({ error: 'CANNOT_EDIT_AFTER_APPROVAL', status: plan.status }); return
    }

    // If area type changed or coordinates updated, re-validate
    const newAreaType = req.body.areaType ?? plan.areaType
    const needsAreaValidation = req.body.areaType || req.body.areaGeoJson || req.body.centerLatDeg || req.body.radiusM
    if (needsAreaValidation) {
      const merged = { ...plan, ...req.body, areaType: newAreaType }
      const err = validateAreaPayload(merged as Record<string, unknown>)
      if (err) { res.status(400).json({ error: 'VALIDATION_FAILED', detail: err }); return }
    }

    const data: Record<string, unknown> = {}
    const editableFields = [
      'droneSerialNumber', 'uinNumber', 'areaType', 'areaGeoJson',
      'centerLatDeg', 'centerLonDeg', 'radiusM',
      'maxAltitudeAglM', 'minAltitudeAglM',
      'purpose', 'remarks', 'notifyEmail', 'notifyMobile', 'additionalEmails',
    ]
    for (const f of editableFields) {
      if (req.body[f] !== undefined) {
        if (f === 'additionalEmails') data[f] = Array.isArray(req.body[f]) ? req.body[f] : []
        else data[f] = req.body[f]
      }
    }
    if (req.body.plannedStartUtc) data.plannedStartUtc = new Date(req.body.plannedStartUtc)
    if (req.body.plannedEndUtc)   data.plannedEndUtc   = new Date(req.body.plannedEndUtc)

    // If switching from CIRCLE→POLYGON, clear circle fields
    if (newAreaType === 'POLYGON') {
      data.centerLatDeg = null
      data.centerLonDeg = null
      data.radiusM      = null
    }
    // If switching from POLYGON→CIRCLE, clear polygon field
    if (newAreaType === 'CIRCLE') {
      data.areaGeoJson = null
    }

    if (Object.keys(data).length === 0) { res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' }); return }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: data as any,
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: req.auth!.userId, actorRole: req.auth!.role,
        action: 'DRONE_PLAN_EDITED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ changedFields: Object.keys(data) }),
      }
    })

    log.info('drone_plan_edited', { data: { planId: plan.planId } })
    res.json(serializeForJson({ success: true, plan: updated }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_edit_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_EDIT_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drone-plans/:id/submit — Submit plan for approval
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/submit', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.operatorId !== req.auth!.userId) { res.status(403).json({ error: 'NOT_YOUR_PLAN' }); return }
    if (plan.status !== 'DRAFT') {
      res.status(409).json({ error: 'CANNOT_SUBMIT', detail: `Plan is already ${plan.status}` }); return
    }

    // Digital Sky validation — non-blocking. Check drone registration if UIN is provided.
    let digitalSkyValidation: { checked: boolean; registered: boolean; registration?: any; error?: string } = {
      checked: false, registered: false,
    }
    if (plan.uinNumber) {
      try {
        const registration = await digitalSkyAdapter.getDroneRegistration(plan.uinNumber)
        digitalSkyValidation = {
          checked: true,
          registered: registration !== null,
          registration: registration ?? undefined,
        }
        log.info('digital_sky_check', { data: { planId: plan.planId, uin: plan.uinNumber, registered: registration !== null } })
      } catch (dsErr: unknown) {
        const dsMsg = dsErr instanceof Error ? dsErr.message : String(dsErr)
        digitalSkyValidation = { checked: true, registered: false, error: dsMsg }
        log.warn('digital_sky_check_failed', { data: { planId: plan.planId, uin: plan.uinNumber, error: dsMsg } })
      }
    }

    // Conflict detection — non-blocking. Check against active flight plans.
    let conflictCheck: any = { hasConflicts: false, conflicts: [], checkedAt: new Date().toISOString(), summary: { critical: 0, warning: 0, info: 0, dronePlansChecked: 0, flightPlansChecked: 0 } }
    try {
      conflictCheck = await conflictService.checkDronePlanConflicts(plan)
      log.info('conflict_check_done', { data: { planId: plan.planId, critical: conflictCheck.summary.critical, warning: conflictCheck.summary.warning } })
    } catch (cErr: unknown) {
      const cMsg = cErr instanceof Error ? cErr.message : String(cErr)
      log.warn('conflict_check_failed', { data: { planId: plan.planId, error: cMsg } })
    }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: req.auth!.userId, actorRole: req.auth!.role,
        action: 'DRONE_PLAN_SUBMITTED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId: plan.planId, digitalSkyValidation, conflictCheck: conflictCheck.summary }),
      }
    })

    log.info('drone_plan_submitted', { data: { planId: plan.planId } })
    res.json(serializeForJson({ success: true, plan: updated, digitalSkyValidation, conflictCheck }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_submit_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_SUBMIT_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drone-plans/:id/cancel — Cancel plan (user-initiated)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.operatorId !== req.auth!.userId) { res.status(403).json({ error: 'NOT_YOUR_PLAN' }); return }
    if (['CANCELLED', 'REJECTED'].includes(plan.status)) {
      res.status(409).json({ error: 'PLAN_ALREADY_TERMINAL', status: plan.status }); return
    }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: req.auth!.userId, actorRole: req.auth!.role,
        action: 'DRONE_PLAN_CANCELLED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId: plan.planId, reason: req.body.reason ?? 'User cancelled' }),
      }
    })

    log.info('drone_plan_cancelled', { data: { planId: plan.planId } })
    res.json(serializeForJson({ success: true, plan: updated }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_cancel_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_CANCEL_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drone-plans — List user's own plans
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plans = await prisma.droneOperationPlan.findMany({
      where: { operatorId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(serializeForJson({ success: true, plans }))
  } catch {
    res.status(500).json({ error: 'DRONE_PLAN_LIST_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drone-plans/:id — Get plan detail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    // Owner or admin can view
    if (plan.operatorId !== req.auth!.userId) {
      res.status(403).json({ error: 'NOT_YOUR_PLAN' }); return
    }
    res.json(serializeForJson({ success: true, plan }))
  } catch {
    res.status(500).json({ error: 'DRONE_PLAN_FETCH_FAILED' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drone-plans/:id/flight-feedback — Record post-flight feedback
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/flight-feedback', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.operatorId !== req.auth!.userId) { res.status(403).json({ error: 'NOT_YOUR_PLAN' }); return }
    if (plan.status !== 'APPROVED') {
      res.status(409).json({ error: 'PLAN_NOT_APPROVED', detail: `Plan is ${plan.status}, must be APPROVED` }); return
    }

    const { feedback, trackLogId } = req.body
    if (!feedback || !['FLEW', 'DID_NOT_FLY'].includes(feedback)) {
      res.status(400).json({ error: 'INVALID_FEEDBACK', detail: "feedback must be 'FLEW' or 'DID_NOT_FLY'" }); return
    }
    if (feedback === 'FLEW' && !trackLogId) {
      res.status(400).json({ error: 'TRACK_LOG_REQUIRED', detail: 'trackLogId is required when feedback is FLEW' }); return
    }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: {
        flightFeedback:   feedback,
        flightFeedbackAt: new Date(),
        trackLogId:       feedback === 'FLEW' ? trackLogId : null,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: req.auth!.userId, actorRole: req.auth!.role,
        action: 'DRONE_PLAN_FLIGHT_FEEDBACK', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId: plan.planId, feedback, trackLogId: trackLogId ?? null }),
      }
    })

    log.info('drone_plan_flight_feedback', { data: { planId: plan.planId, feedback } })
    res.json(serializeForJson({ success: true, plan: updated }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_flight_feedback_error', { data: { error: msg } })
    res.status(500).json({ error: 'FLIGHT_FEEDBACK_FAILED' })
  }
})

export default router

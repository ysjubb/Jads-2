// droneRoutes.ts — drone mission upload, query, and forensic endpoints.
//
// All field accesses here match the migration SQL schema exactly:
//   DroneMission.missionId is TEXT (not BigInt)
//   DroneTelemetryRecord.canonicalPayloadHex (not canonicalHex)
//   DroneTelemetryRecord.missionId is FK to DroneMission.id (TEXT)
//   DroneTelemetryRecord.sequence is INT (not BigInt)

import express                 from 'express'
import multer                  from 'multer'
import { MissionService, MissionSubmissionInput } from '../services/MissionService'
import { ForensicVerifier }    from '../services/ForensicVerifier'
import { PALifecycleService }  from '../services/PALifecycleService'
import { requireAuth, requireRole, requireAuditAuth, requireDomain } from '../middleware/authMiddleware'
import { missionUploadRateLimit } from '../middleware/rateLimiter'
import { serializeForJson }    from '../utils/bigintSerializer'
import { decodeCanonical }     from '../telemetry/telemetryDecoder'
import { classifyPolygon, LatLng } from '../services/ZoneClassificationService'
import {
  YellowZoneRoutingService,
  FlightPermissionPayload,
} from '../services/YellowZoneRoutingService'
import {
  FlightPlanValidationService,
  FlightPlanInput,
} from '../services/FlightPlanValidationService'
import {
  DroneNotificationService,
  getCategoryForType,
  NotificationCategory,
} from '../services/DroneNotificationService'
import { createServiceLogger } from '../logger'
import { createDeviceAttestationService } from '../services/DeviceAttestationService'
import { prisma }              from '../lib/prisma'

const router      = express.Router()
const service     = new MissionService(prisma)
const verifier    = new ForensicVerifier(prisma)
const paLifecycle = new PALifecycleService(prisma)
const notifService = new DroneNotificationService(prisma)
const attestationService = createDeviceAttestationService()
const log         = createServiceLogger('DroneRoutes')

// Multer for file uploads — 20MB limit, memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── GET /api/drone/devices/:deviceId/attestation-nonce ──────────────────────
// Issue a one-use nonce for StrongBox attestation challenge.
// Android app must fetch this BEFORE generating the keystore key pair.
router.get('/devices/:deviceId/attestation-nonce', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params
    const nonce = attestationService.generateAttestationNonce(deviceId)
    return res.json({ nonce, expiresInSeconds: 600 })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/drone/missions ──────────────────────────────────────────────────
// Upload a completed mission from the Android device.
// Body: MissionSubmissionInput
// Response 201: mission accepted
// Response 202: duplicate (safe retry — same missionId already accepted)
// Response 409: replay attack (same missionId, different operator)
// Response 422: chain verification failed
router.post('/missions', requireAuth, requireDomain('DRONE'), missionUploadRateLimit, async (req, res) => {
  try {
    const { userId, userType } = req.auth!
    const input = req.body as MissionSubmissionInput

    // Basic input validation
    if (!input.missionId || !input.deviceId || !Array.isArray(input.records)) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', required: ['missionId', 'deviceId', 'records'] })
      return
    }
    // Validate droneWeightCategory if provided
    const VALID_CATEGORIES = ['NANO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN']
    if (input.droneWeightCategory && !VALID_CATEGORIES.includes(input.droneWeightCategory)) {
      res.status(400).json({ error: 'INVALID_WEIGHT_CATEGORY', valid: VALID_CATEGORIES })
      return
    }
    // deviceNonce validation: if present, must be a valid UUID v4
    if (input.deviceNonce !== undefined && input.deviceNonce !== null) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.deviceNonce)) {
        res.status(400).json({ error: 'INVALID_DEVICE_NONCE', detail: 'deviceNonce must be a UUID v4' })
        return
      }
    }
    // VULN-01 FIX: missionId must be a valid uint64 decimal string.
    // Without this, BigInt(missionId) in verifyChain throws unhandled exception → 500 leak.
    if (!/^\d{1,20}$/.test(input.missionId)) {
      res.status(400).json({ error: 'INVALID_MISSION_ID', detail: 'missionId must be a positive integer string' })
      return
    }
    // VULN-04/05 FIX: hard cap on record count before any crypto work.
    // Prevents OOM via crafted payloads — 10k records = ~30 minutes of 1Hz telemetry.
    const MAX_RECORDS = 10_000
    if (input.records.length === 0) {
      res.status(400).json({ error: 'EMPTY_RECORDS' })
      return
    }
    if (input.records.length > MAX_RECORDS) {
      res.status(400).json({ error: 'TOO_MANY_RECORDS', limit: MAX_RECORDS, received: input.records.length })
      return
    }

    // Attestation nonce verification — replay protection for StrongBox key generation.
    // If the device submitted an attestationNonce, verify it matches what the server issued.
    // Missing nonce = static challenge fallback (reduced trust, advisory logged).
    if (input.deviceAttestation) {
      const submittedNonce = (input as any).attestationNonce as string | undefined
      if (submittedNonce && input.deviceId) {
        const nonceValid = attestationService.verifyAttestationNonce(input.deviceId, submittedNonce)
        if (!nonceValid) {
          input.deviceAttestation.strongboxBacked = false
          ;(input as any)._attestationAdvisory = 'Attestation nonce invalid or expired — trust level reduced to PARTIAL'
        }
      } else if (!submittedNonce) {
        ;(input as any)._attestationAdvisory = 'Attestation nonce missing — replay protection not verified. Key generated with static challenge.'
      }
    }

    const result = await service.submitMission(input, userId, userType as 'CIVILIAN' | 'SPECIAL')

    // Auto-run forensic verification after successful creation.
    // Ensures every uploaded mission (including DJI imports) has a
    // forensic report available immediately — no manual trigger needed.
    let forensicResult: any = null
    if (result.status === 'CREATED' && result.missionDbId) {
      try {
        forensicResult = await verifier.verify(result.missionDbId)
        log.info('auto_forensic_verification', {
          data: {
            missionDbId: result.missionDbId,
            allInvariantsHold: forensicResult.allInvariantsHold,
          }
        })
      } catch (e) {
        log.warn('auto_forensic_verification_failed', {
          data: { missionDbId: result.missionDbId, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }

    const httpStatus =
      result.status === 'CREATED'             ? 201 :
      result.status === 'DUPLICATE'           ? 202 :
      result.status === 'REPLAY_REJECTED'     ? 409 : 422

    res.status(httpStatus).json(serializeForJson({
      success:             result.status === 'CREATED' || result.status === 'DUPLICATE',
      status:              result.status,
      missionDbId:         result.missionDbId,
      verificationErrors:  result.verificationErrors,
      forensicVerification: forensicResult ?? undefined,
    }))
  } catch (e: unknown) {
    // VULN-02 FIX: P2002 = unique constraint violation from concurrent upload race.
    // Return 202 DUPLICATE instead of 500 INTERNAL_SERVER_ERROR.
    if ((e as { code?: string }).code === 'P2002') {
      try {
        const raceResult = await service.handleUniqueConstraintViolation(
          (req.body as any).missionId, req.auth!.userId
        )
        res.status(202).json({ success: true, status: raceResult.status, missionDbId: raceResult.missionDbId })
        return
      } catch { /* fall through to 500 */ }
    }
    log.error('mission_upload_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'MISSION_UPLOAD_FAILED' })
  }
})

// ── GET /api/drone/missions ───────────────────────────────────────────────────
// List the authenticated operator's missions (paginated).
router.get('/missions', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const { userId } = req.auth!
    const page  = Math.max(1, parseInt((req.query.page  as string) ?? '1'))
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20')))

    const [missions, total] = await Promise.all([
      prisma.droneMission.findMany({
        where:   { operatorId: userId },
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true, missionId: true, npntClassification: true,
          missionStartUtcMs: true, missionEndUtcMs: true,
          ntpSyncStatus: true, certValidAtStart: true,
          chainVerifiedByServer: true, uploadStatus: true, uploadedAt: true,
          droneWeightCategory: true, droneManufacturer: true, npntExempt: true,
          droneWeightGrams: true, droneSerialNumber: true,
          _count: { select: { telemetryRecords: true, violations: true } }
        }
      }),
      prisma.droneMission.count({ where: { operatorId: userId } })
    ])

    res.json(serializeForJson({ success: true, missions, total, page, limit }))
  } catch (e: unknown) {
    log.error('missions_list_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'MISSIONS_LIST_FAILED' })
  }
})

// ── GET /api/drone/missions/:id ───────────────────────────────────────────────
// Full mission detail with telemetry. Operator sees own missions; auditors see all.
router.get('/missions/:id', requireAuth, async (req, res) => {
  try {
    const { userId, role } = req.auth!
    const mission = await prisma.droneMission.findUnique({
      where:   { id: req.params.id },
      include: {
        telemetryRecords: { orderBy: { sequence: 'asc' } },
        violations:       { orderBy: { sequence: 'asc' } }
      }
    })
    if (!mission) { res.status(404).json({ error: 'MISSION_NOT_FOUND' }); return }

    const AUDITOR_ROLES = ['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
                           'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
    const isOwner   = mission.operatorId === userId
    const isAuditor = AUDITOR_ROLES.includes(role)
    if (!isOwner && !isAuditor) { res.status(403).json({ error: 'ACCESS_DENIED' }); return }

    res.json(serializeForJson({ success: true, mission }))
  } catch (e: unknown) {
    res.status(500).json({ error: 'MISSION_FETCH_FAILED' })
  }
})

// ── GET /api/drone/missions/:id/forensic ─────────────────────────────────────
// Run all 8 forensic invariant checks. Auditors only.
// Returns InvariantResult[] for the ForensicReportPanel in the audit portal.
router.get(
  '/missions/:id/forensic',
  requireAuth,
  requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
               'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']),
  async (req, res) => {
    try {
      const result = await verifier.verify(req.params.id)
      res.json(serializeForJson({ success: true, verification: result }))
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2025') {
        res.status(404).json({ error: 'MISSION_NOT_FOUND' }); return
      }
      res.status(500).json({ error: 'FORENSIC_FAILED' })
    }
  }
)

// ── GET /api/drone/missions/:id/decoded-track ─────────────────────────────────
// Decode all telemetry records into human-readable GPS track for Leaflet map.
// Auditors only. Uses canonicalPayloadHex (migration SQL field name).
router.get(
  '/missions/:id/decoded-track',
  requireAuditAuth,
  requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
               'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']),
  async (req, res) => {
    try {
      const records = await prisma.droneTelemetryRecord.findMany({
        where:   { missionId: req.params.id },
        orderBy: { sequence: 'asc' },
        select:  {
          sequence:            true,
          canonicalPayloadHex: true,
          signatureHex:        true,
          chainHashHex:        true,
          gnssStatus:          true,
          sensorHealthFlags:   true,
          recordedAtUtcMs:     true,
        }
      })

      if (records.length === 0) {
        res.json(serializeForJson({ success: true, track: [], count: 0, bbox: null })); return
      }

      const track = records.map(r => {
        try {
          const decoded = decodeCanonical(r.canonicalPayloadHex)
          return {
            sequence:          r.sequence,
            gnssStatus:        r.gnssStatus,
            sensorHealthFlags: r.sensorHealthFlags,
            recordedAtUtcMs:   r.recordedAtUtcMs,
            chainHashHex:      r.chainHashHex,
            signatureHex:      r.signatureHex,
            decoded,
          }
        } catch (e: unknown) {
          return {
            sequence:    r.sequence,
            gnssStatus:  r.gnssStatus,
            decodeError: (e as Error).message,
          }
        }
      })

      // Bounding box for Leaflet map auto-zoom
      const valid = track.filter((t: any) => t.decoded?.latitudeDeg != null)
      const bbox = valid.length > 0 ? {
        minLat: Math.min(...valid.map((t: any) => t.decoded.latitudeDeg as number)),
        maxLat: Math.max(...valid.map((t: any) => t.decoded.latitudeDeg as number)),
        minLon: Math.min(...valid.map((t: any) => t.decoded.longitudeDeg as number)),
        maxLon: Math.max(...valid.map((t: any) => t.decoded.longitudeDeg as number)),
      } : null

      res.json(serializeForJson({ success: true, track, count: track.length, bbox }))
    } catch {
      res.status(500).json({ error: 'TRACK_DECODE_FAILED' })
    }
  }
)

// ── GET /api/drone/missions/:id/decoded-record/:sequence ──────────────────────
// Decode a single record. Used when auditor clicks a GPS point on the map.
router.get(
  '/missions/:id/decoded-record/:sequence',
  requireAuditAuth,
  requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
               'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']),
  async (req, res) => {
    try {
      const sequence = parseInt(req.params.sequence)
      const record   = await prisma.droneTelemetryRecord.findFirst({
        where: { missionId: req.params.id, sequence }
      })
      if (!record) { res.status(404).json({ error: 'RECORD_NOT_FOUND' }); return }

      const decoded = decodeCanonical(record.canonicalPayloadHex)
      res.json(serializeForJson({
        success: true,
        decoded,
        raw: {
          canonicalPayloadHex: record.canonicalPayloadHex,
          signatureHex:        record.signatureHex,
          chainHashHex:        record.chainHashHex,
          gnssStatus:          record.gnssStatus,
          sensorHealthFlags:   record.sensorHealthFlags,
          recordedAtUtcMs:     record.recordedAtUtcMs,
        }
      }))
    } catch {
      res.status(500).json({ error: 'RECORD_DECODE_FAILED' })
    }
  }
)

// ── POST /api/drone/zone-check ────────────────────────────────────────────────
// Classify a geofence polygon against India's drone airspace zones.
// Body: { polygon: Array<{ lat: number, lng: number }>, altitudeAGL: number }
// Response 200: ZoneClassificationResult
// No auth required — zone data is public per DGCA Digital Sky Platform.
router.post('/zone-check', async (req, res) => {
  try {
    const { polygon, altitudeAGL } = req.body as {
      polygon:     LatLng[]
      altitudeAGL: number
    }

    // Input validation
    if (!Array.isArray(polygon) || polygon.length < 3) {
      res.status(400).json({
        error: 'INVALID_POLYGON',
        detail: 'polygon must be an array of at least 3 { lat, lng } points',
      })
      return
    }

    for (let i = 0; i < polygon.length; i++) {
      const pt = polygon[i]
      if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number' ||
          pt.lat < -90 || pt.lat > 90 || pt.lng < -180 || pt.lng > 180) {
        res.status(400).json({
          error: 'INVALID_COORDINATE',
          detail: `polygon[${i}] has invalid lat/lng values`,
        })
        return
      }
    }

    if (typeof altitudeAGL !== 'number' || altitudeAGL < 0) {
      res.status(400).json({
        error: 'INVALID_ALTITUDE',
        detail: 'altitudeAGL must be a non-negative number (meters AGL)',
      })
      return
    }

    // Hard cap on polygon vertex count to prevent CPU abuse
    const MAX_VERTICES = 500
    if (polygon.length > MAX_VERTICES) {
      res.status(400).json({
        error: 'TOO_MANY_VERTICES',
        detail: `polygon has ${polygon.length} vertices, maximum is ${MAX_VERTICES}`,
      })
      return
    }

    const result = await classifyPolygon(polygon, altitudeAGL)
    res.json({ success: true, classification: result })
  } catch (e: unknown) {
    log.error('zone_check_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'ZONE_CHECK_FAILED' })
  }
})

// ── POST /api/drone/validate-flight-plan ──────────────────────────────────────
// Run pre-submission validation engine on a drone flight plan.
// Returns ValidationResult with failures[], warnings[], info[].
// Body: FlightPlanInput
// Response 200: ValidationResult
router.post('/validate-flight-plan', requireAuth, async (req, res) => {
  try {
    const input = req.body as FlightPlanInput

    // Basic input validation
    if (!input.droneSerialNumber) {
      res.status(400).json({ error: 'MISSING_DRONE_SERIAL', detail: 'droneSerialNumber is required' })
      return
    }
    if (!input.droneWeightCategory) {
      res.status(400).json({ error: 'MISSING_WEIGHT_CATEGORY', detail: 'droneWeightCategory is required' })
      return
    }
    if (!input.areaType || !['POLYGON', 'CIRCLE'].includes(input.areaType)) {
      res.status(400).json({ error: 'INVALID_AREA_TYPE', detail: 'areaType must be POLYGON or CIRCLE' })
      return
    }
    if (typeof input.maxAltitudeAglM !== 'number' || input.maxAltitudeAglM <= 0) {
      res.status(400).json({ error: 'INVALID_ALTITUDE', detail: 'maxAltitudeAglM must be a positive number' })
      return
    }
    if (!input.plannedStartUtc || !input.plannedEndUtc) {
      res.status(400).json({ error: 'MISSING_TIME_WINDOW', detail: 'plannedStartUtc and plannedEndUtc are required' })
      return
    }
    if (new Date(input.plannedStartUtc) >= new Date(input.plannedEndUtc)) {
      res.status(400).json({ error: 'INVALID_TIME_WINDOW', detail: 'plannedEndUtc must be after plannedStartUtc' })
      return
    }

    // Set operatorId from authenticated user
    const validationInput: FlightPlanInput = {
      ...input,
      operatorId: input.operatorId ?? req.auth!.userId,
    }

    const result = await FlightPlanValidationService.validateFlightPlan(validationInput, prisma)

    res.json({ success: true, validation: result })
  } catch (e: unknown) {
    log.error('validate_flight_plan_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'VALIDATION_FAILED' })
  }
})

// ── POST /api/drone/yellow-zone-route ─────────────────────────────────────────
// Determine ATC authority routing and expedited eligibility for a yellow-zone
// drone flight permission application.
// Body: FlightPermissionPayload (area, altitude, operator info, etc.)
// Response 200: RoutingResult
// Optionally links to a DroneOperationPlan if planId is provided.
router.post('/yellow-zone-route', requireAuth, async (req, res) => {
  try {
    const body = req.body as FlightPermissionPayload & { planId?: string; zoneIcao?: string }

    // Input validation
    if (!body.areaType || !['POLYGON', 'CIRCLE'].includes(body.areaType)) {
      res.status(400).json({ error: 'INVALID_AREA_TYPE', detail: 'areaType must be POLYGON or CIRCLE' })
      return
    }
    if (body.areaType === 'POLYGON' && !body.areaGeoJson) {
      res.status(400).json({ error: 'MISSING_GEOJSON', detail: 'areaGeoJson required for POLYGON type' })
      return
    }
    if (body.areaType === 'CIRCLE') {
      if (typeof body.centerLatDeg !== 'number' || typeof body.centerLonDeg !== 'number') {
        res.status(400).json({ error: 'MISSING_CENTER', detail: 'centerLatDeg and centerLonDeg required for CIRCLE type' })
        return
      }
      if (typeof body.radiusM !== 'number' || body.radiusM <= 0) {
        res.status(400).json({ error: 'INVALID_RADIUS', detail: 'radiusM must be a positive number' })
        return
      }
    }
    if (typeof body.maxAltitudeAglM !== 'number' || body.maxAltitudeAglM <= 0) {
      res.status(400).json({ error: 'INVALID_ALTITUDE', detail: 'maxAltitudeAglM must be a positive number' })
      return
    }
    if (!body.plannedStartUtc || !body.plannedEndUtc) {
      res.status(400).json({ error: 'MISSING_TIME_WINDOW', detail: 'plannedStartUtc and plannedEndUtc are required' })
      return
    }
    if (new Date(body.plannedStartUtc) >= new Date(body.plannedEndUtc)) {
      res.status(400).json({ error: 'INVALID_TIME_WINDOW', detail: 'plannedEndUtc must be after plannedStartUtc' })
      return
    }
    if (!body.droneSerialNumber) {
      res.status(400).json({ error: 'MISSING_DRONE_SERIAL', detail: 'droneSerialNumber is required' })
      return
    }

    // Set operatorId from authenticated user if not provided
    const payload: FlightPermissionPayload = {
      ...body,
      operatorId: body.operatorId ?? req.auth!.userId,
    }

    // Route the application
    const result = await YellowZoneRoutingService.routeApplication(
      payload,
      body.zoneIcao ?? null,
      prisma
    )

    // If a planId is provided, update the DroneOperationPlan with routing decision
    if (body.planId) {
      try {
        const plan = await prisma.droneOperationPlan.findUnique({
          where: { id: body.planId },
        })
        if (plan && plan.operatorId === req.auth!.userId) {
          const routedAt = new Date()
          const approvalDueBy = new Date(routedAt)
          approvalDueBy.setDate(approvalDueBy.getDate() + result.expectedProcessingDays)

          await prisma.droneOperationPlan.update({
            where: { id: body.planId },
            data: {
              routingAuthority: result.authority.name,
              expeditedFlag: result.expedited,
              routedAt,
              approvalDueBy,
            },
          })

          // Audit log
          await prisma.auditLog.create({
            data: {
              actorType: 'USER',
              actorId: req.auth!.userId,
              actorRole: req.auth!.role,
              action: 'DRONE_PLAN_ROUTED',
              resourceType: 'drone_operation_plan',
              resourceId: body.planId,
              detailJson: JSON.stringify({
                planId: plan.planId,
                authority: result.authority.name,
                authorityType: result.authority.type,
                expedited: result.expedited,
                expectedProcessingDays: result.expectedProcessingDays,
              }),
            },
          })

          log.info('drone_plan_routing_saved', {
            data: {
              planId: plan.planId,
              authority: result.authority.name,
              expedited: result.expedited,
            },
          })
        }
      } catch (planErr) {
        log.warn('drone_plan_routing_update_failed', {
          data: { planId: body.planId, error: planErr instanceof Error ? planErr.message : String(planErr) },
        })
        // Do not fail the route response — routing result is still valid
      }
    }

    res.json({
      success: true,
      routing: {
        authority: result.authority,
        expectedProcessingDays: result.expectedProcessingDays,
        expedited: result.expedited,
        submissionInstructions: result.submissionInstructions,
        requiredDocuments: result.requiredDocuments,
        contactDetails: result.contactDetails,
      },
    })
  } catch (e: unknown) {
    log.error('yellow_zone_route_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'YELLOW_ZONE_ROUTE_FAILED' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION ARTEFACT LIFECYCLE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/drone/permissions ───────────────────────────────────────────────
// List the authenticated user's Permission Artefacts (paginated).
router.get('/permissions', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const page  = Math.max(1, parseInt((req.query.page  as string) ?? '1'))
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20')))
    const status = req.query.status as string | undefined

    const where: Record<string, unknown> = { operatorId: userId }
    if (status) {
      where.status = status
    }

    const [permissions, total] = await Promise.all([
      prisma.permissionArtefact.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:                   true,
          applicationId:        true,
          permissionArtifactId: true,
          uinNumber:            true,
          pilotId:              true,
          status:               true,
          primaryZone:          true,
          flightStartTime:      true,
          flightEndTime:        true,
          maxAltitudeMeters:    true,
          paZipHash:            true,
          loadedToDroneAt:      true,
          flightLogUploadedAt:  true,
          submittedAt:          true,
          approvedAt:           true,
          downloadedAt:         true,
          createdAt:            true,
        },
      }),
      prisma.permissionArtefact.count({ where }),
    ])

    res.json(serializeForJson({ success: true, permissions, total, page, limit }))
  } catch (e: unknown) {
    log.error('permissions_list_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'PERMISSIONS_LIST_FAILED' })
  }
})

// ── GET /api/drone/permissions/:id ──────────────────────────────────────────
// Get full PA details. Operator sees own PAs; auditors see all.
router.get('/permissions/:id', requireAuth, async (req, res) => {
  try {
    const { userId, role } = req.auth!
    const pa = await prisma.permissionArtefact.findUnique({
      where: { id: req.params.id },
      include: { plan: true },
    })
    if (!pa) {
      res.status(404).json({ error: 'PERMISSION_NOT_FOUND' })
      return
    }

    const AUDITOR_ROLES = ['DGCA_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
                           'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN']
    const isOwner   = pa.operatorId === userId
    const isAuditor = AUDITOR_ROLES.includes(role)
    if (!isOwner && !isAuditor) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    // Omit rawPaXml (binary) from JSON response
    const { rawPaXml, ...safePA } = pa
    res.json(serializeForJson({
      success: true,
      permission: {
        ...safePA,
        hasRawPaXml: rawPaXml !== null,
      },
    }))
  } catch (e: unknown) {
    log.error('permission_detail_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'PERMISSION_FETCH_FAILED' })
  }
})

// ── GET /api/drone/permissions/:id/download ─────────────────────────────────
// Proxy PA ZIP download. Returns the stored PA ZIP binary.
router.get('/permissions/:id/download', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const pa = await prisma.permissionArtefact.findUnique({
      where: { id: req.params.id },
      select: {
        id:          true,
        operatorId:  true,
        applicationId: true,
        status:      true,
        rawPaXml:    true,
        paZipHash:   true,
      },
    })

    if (!pa) {
      res.status(404).json({ error: 'PERMISSION_NOT_FOUND' })
      return
    }
    if (pa.operatorId !== userId) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    // If we don't have the ZIP stored locally, try downloading from eGCA
    let zipData = pa.rawPaXml ? Buffer.from(pa.rawPaXml) : null
    if (!zipData) {
      try {
        await paLifecycle.downloadAndStorePA(pa.applicationId)
        const updated = await prisma.permissionArtefact.findUnique({
          where: { id: pa.id },
          select: { rawPaXml: true },
        })
        zipData = updated?.rawPaXml ? Buffer.from(updated.rawPaXml) : null
      } catch (dlErr) {
        log.warn('pa_download_proxy_failed', {
          data: { id: pa.id, error: dlErr instanceof Error ? dlErr.message : String(dlErr) },
        })
      }
    }

    if (!zipData) {
      res.status(404).json({ error: 'PA_ZIP_NOT_AVAILABLE' })
      return
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="PA-${pa.applicationId}.zip"`)
    res.setHeader('X-PA-SHA256', pa.paZipHash ?? 'unknown')
    res.send(zipData)
  } catch (e: unknown) {
    log.error('pa_download_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'PA_DOWNLOAD_FAILED' })
  }
})

// ── POST /api/drone/permissions/:id/loaded ──────────────────────────────────
// Mark a PA as loaded to a drone. Body: { droneUin: string }
router.post('/permissions/:id/loaded', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const { droneUin } = req.body as { droneUin?: string }

    if (!droneUin) {
      res.status(400).json({ error: 'MISSING_DRONE_UIN', detail: 'droneUin is required' })
      return
    }

    const pa = await prisma.permissionArtefact.findUnique({
      where: { id: req.params.id },
    })
    if (!pa) {
      res.status(404).json({ error: 'PERMISSION_NOT_FOUND' })
      return
    }
    if (pa.operatorId !== userId) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    await paLifecycle.markLoadedToDrone(pa.applicationId, droneUin)

    res.json({ success: true, message: 'PA marked as loaded to drone', droneUin })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('pa_mark_loaded_error', { data: { error: msg } })

    if (msg.includes('UIN mismatch') || msg.includes('must be DOWNLOADED')) {
      res.status(400).json({ error: 'PA_LOAD_FAILED', detail: msg })
      return
    }
    res.status(500).json({ error: 'PA_MARK_LOADED_FAILED' })
  }
})

// ── POST /api/drone/permissions/:id/log ─────────────────────────────────────
// Upload a signed flight log for a PA.
// Body: raw JWT-signed log bundle (application/octet-stream or JSON)
router.post('/permissions/:id/log', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!

    const pa = await prisma.permissionArtefact.findUnique({
      where: { id: req.params.id },
    })
    if (!pa) {
      res.status(404).json({ error: 'PERMISSION_NOT_FOUND' })
      return
    }
    if (pa.operatorId !== userId) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    // Accept log bundle as raw body or JSON with logBundle field
    let logBundle: Buffer
    if (Buffer.isBuffer(req.body)) {
      logBundle = req.body
    } else if (typeof req.body === 'object' && req.body.logBundle) {
      logBundle = Buffer.from(req.body.logBundle, typeof req.body.logBundle === 'string' ? 'utf-8' : undefined)
    } else if (typeof req.body === 'string') {
      logBundle = Buffer.from(req.body, 'utf-8')
    } else {
      res.status(400).json({ error: 'MISSING_LOG_BUNDLE', detail: 'Request body must contain the signed flight log' })
      return
    }

    const report = await paLifecycle.processFlightLog(pa.applicationId, logBundle)

    res.json(serializeForJson({
      success: true,
      report,
    }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('pa_log_upload_error', { data: { error: msg } })

    if (msg.includes('JWT verification failed') || msg.includes('missing entries')) {
      res.status(400).json({ error: 'INVALID_LOG_BUNDLE', detail: msg })
      return
    }
    if (msg.includes('Cannot process flight log')) {
      res.status(400).json({ error: 'PA_LOG_FAILED', detail: msg })
      return
    }
    res.status(500).json({ error: 'PA_LOG_UPLOAD_FAILED' })
  }
})

// ── GET /api/drone/violations ─────────────────────────────────────────────────
// List the authenticated operator's violations.
router.get('/violations', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const { violationType, severity } = req.query

    const missionIds = (await prisma.droneMission.findMany({
      where:  { operatorId: userId },
      select: { id: true }
    })).map(m => m.id)

    const violations = await prisma.droneViolation.findMany({
      where: {
        missionId:       { in: missionIds },
        ...(violationType && { violationType: violationType as any }),
        ...(severity      && { severity:      severity      as any }),
      },
      orderBy: { timestampUtcMs: 'desc' },
      take: 200,
    })

    res.json(serializeForJson({ success: true, violations, count: violations.length }))
  } catch (e: unknown) {
    res.status(500).json({ error: 'VIOLATIONS_LIST_FAILED' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/drone/notifications ─────────────────────────────────────────────
// List notifications for the authenticated user (paginated, filterable).
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const page       = parseInt((req.query.page  as string) ?? '1')
    const limit      = parseInt((req.query.limit as string) ?? '20')
    const unreadOnly = req.query.unread === 'true'
    const category   = req.query.category as NotificationCategory | undefined

    const result = await notifService.getNotifications({
      userId,
      unreadOnly,
      category: category && ['EXPIRY', 'PERMISSION', 'COMPLIANCE', 'SYSTEM'].includes(category)
        ? category
        : undefined,
      page,
      limit,
    })

    res.json({ success: true, ...result })
  } catch (e: unknown) {
    log.error('notifications_list_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'NOTIFICATIONS_LIST_FAILED' })
  }
})

// ── GET /api/drone/notifications/unread-count ────────────────────────────────
// Quick unread count for the bell badge.
router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await notifService.getUnreadCount(req.auth!.userId)
    res.json({ success: true, count })
  } catch (e: unknown) {
    res.status(500).json({ error: 'UNREAD_COUNT_FAILED' })
  }
})

// ── POST /api/drone/notifications/:id/read ───────────────────────────────────
// Mark a single notification as read.
router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const record = await notifService.markRead(req.params.id, req.auth!.userId)
    if (!record) {
      res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' })
      return
    }
    res.json({ success: true, notification: record })
  } catch (e: unknown) {
    res.status(500).json({ error: 'MARK_READ_FAILED' })
  }
})

// ── POST /api/drone/notifications/read-all ───────────────────────────────────
// Mark all notifications as read for the authenticated user.
router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const result = await notifService.markAllRead(req.auth!.userId)
    res.json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({ error: 'MARK_ALL_READ_FAILED' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// FLIGHT PLAN TEMPLATE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════
//
// In-memory store for flight corridor templates. Templates are scoped per user.
// TODO: Migrate to a FlightTemplate Prisma model for persistence once the
// schema migration is approved. The API contract will remain identical.

interface FlightTemplateRecord {
  id: string
  userId: string
  name: string
  description: string
  zone: 'GREEN' | 'YELLOW' | 'RED'
  areaSqKm: number
  geometry: any
  waypoints: Array<{ lat: number; lng: number }>
  bufferWidthM: number
  shared: boolean
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

const flightTemplateStore: FlightTemplateRecord[] = []

function generateTemplateId(): string {
  return 'ftpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

// ── GET /api/drone/flight-templates ─────────────────────────────────────────
// List all flight templates for the authenticated user, plus shared templates.
router.get('/flight-templates', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!

    // Return user's own templates + all shared templates
    const templates = flightTemplateStore.filter(
      t => t.userId === userId || t.shared
    )

    res.json({
      success: true,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        zone: t.zone,
        areaSqKm: t.areaSqKm,
        geometry: t.geometry,
        waypoints: t.waypoints,
        bufferWidthM: t.bufferWidthM,
        shared: t.shared,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        createdBy: t.shared ? t.userId : undefined,
      })),
      count: templates.length,
    })
  } catch (e: unknown) {
    log.error('flight_templates_list_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'TEMPLATES_LIST_FAILED' })
  }
})

// ── POST /api/drone/flight-templates ────────────────────────────────────────
// Create a new flight template.
router.post('/flight-templates', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const { name, description, geometry, waypoints, bufferWidthM, areaSqKm, shared } = req.body as {
      name: string
      description?: string
      geometry?: any
      waypoints?: Array<{ lat: number; lng: number }>
      bufferWidthM?: number
      areaSqKm?: number
      shared?: boolean
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'MISSING_NAME', detail: 'name is required' })
      return
    }
    if (name.trim().length > 200) {
      res.status(400).json({ error: 'NAME_TOO_LONG', detail: 'name must be 200 characters or less' })
      return
    }

    // Determine zone classification based on geometry if provided
    let zone: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN'
    if (waypoints && waypoints.length >= 3) {
      try {
        const polygon = waypoints.map(p => ({ lat: p.lat, lng: p.lng }))
        const result = await classifyPolygon(polygon, 120)
        zone = result.primaryZone as 'GREEN' | 'YELLOW' | 'RED'
      } catch {
        // Default to GREEN if classification fails
      }
    }

    const now = new Date().toISOString()
    const template: FlightTemplateRecord = {
      id: generateTemplateId(),
      userId,
      name: name.trim(),
      description: (description || '').trim(),
      zone,
      areaSqKm: areaSqKm ?? 0,
      geometry: geometry ?? null,
      waypoints: waypoints ?? [],
      bufferWidthM: bufferWidthM ?? 100,
      shared: shared ?? false,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    flightTemplateStore.push(template)

    log.info('flight_template_created', {
      data: { templateId: template.id, name: template.name, userId },
    })

    res.status(201).json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        zone: template.zone,
        areaSqKm: template.areaSqKm,
        geometry: template.geometry,
        waypoints: template.waypoints,
        bufferWidthM: template.bufferWidthM,
        shared: template.shared,
        lastUsedAt: template.lastUsedAt,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    })
  } catch (e: unknown) {
    log.error('flight_template_create_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'TEMPLATE_CREATE_FAILED' })
  }
})

// ── PUT /api/drone/flight-templates/:id ─────────────────────────────────────
// Update an existing flight template. Only the owner can update.
router.put('/flight-templates/:id', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const { id } = req.params
    const { name, description, geometry, waypoints, bufferWidthM, areaSqKm, shared } = req.body as {
      name?: string
      description?: string
      geometry?: any
      waypoints?: Array<{ lat: number; lng: number }>
      bufferWidthM?: number
      areaSqKm?: number
      shared?: boolean
    }

    const idx = flightTemplateStore.findIndex(t => t.id === id)
    if (idx === -1) {
      res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' })
      return
    }

    const template = flightTemplateStore[idx]
    if (template.userId !== userId) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'INVALID_NAME' })
        return
      }
      template.name = name.trim()
    }
    if (description !== undefined) template.description = description.trim()
    if (geometry !== undefined)    template.geometry = geometry
    if (waypoints !== undefined)   template.waypoints = waypoints
    if (bufferWidthM !== undefined) template.bufferWidthM = bufferWidthM
    if (areaSqKm !== undefined)    template.areaSqKm = areaSqKm
    if (shared !== undefined)      template.shared = shared
    template.updatedAt = new Date().toISOString()

    flightTemplateStore[idx] = template

    log.info('flight_template_updated', {
      data: { templateId: id, userId },
    })

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        zone: template.zone,
        areaSqKm: template.areaSqKm,
        geometry: template.geometry,
        waypoints: template.waypoints,
        bufferWidthM: template.bufferWidthM,
        shared: template.shared,
        lastUsedAt: template.lastUsedAt,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    })
  } catch (e: unknown) {
    log.error('flight_template_update_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'TEMPLATE_UPDATE_FAILED' })
  }
})

// ── DELETE /api/drone/flight-templates/:id ───────────────────────────────────
// Delete a flight template. Only the owner can delete.
router.delete('/flight-templates/:id', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!
    const { id } = req.params

    const idx = flightTemplateStore.findIndex(t => t.id === id)
    if (idx === -1) {
      res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' })
      return
    }

    const template = flightTemplateStore[idx]
    if (template.userId !== userId) {
      res.status(403).json({ error: 'ACCESS_DENIED' })
      return
    }

    flightTemplateStore.splice(idx, 1)

    log.info('flight_template_deleted', {
      data: { templateId: id, name: template.name, userId },
    })

    res.json({ success: true, deleted: id })
  } catch (e: unknown) {
    log.error('flight_template_delete_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'TEMPLATE_DELETE_FAILED' })
  }
})

// ── POST /api/drone/track-logs/upload-file ──────────────────────────────────
// Upload a raw flight log file (DJI CSV, PhantomHelp CSV, NPNT JSON, or GPS track JSON).
// Backend parses the file and creates a track log record.
// Accepts multipart/form-data with field "file" + optional "droneSerialNumber" and "droneOperationPlanId".
router.post(
  '/track-logs/upload-file',
  requireAuth,
  requireDomain('DRONE'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { userId } = req.auth!
      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'NO_FILE', detail: 'Attach a file as multipart field "file"' })
        return
      }

      const text = file.buffer.toString('utf-8')
      const filename = file.originalname.toLowerCase()
      const droneSerialNumber = (req.body.droneSerialNumber as string) || 'UNKNOWN'
      const droneOperationPlanId = (req.body.droneOperationPlanId as string) || null

      // ── Detect format and parse ──────────────────────────────────
      let format: string
      let pathPoints: { lat: number; lon: number; alt?: number; timestampMs?: number }[] = []
      let takeoffLat: number | null = null
      let takeoffLon: number | null = null
      let landingLat: number | null = null
      let landingLon: number | null = null
      let maxAltitudeM = 0
      let durationSec  = 0
      let breachCount  = 0

      if (filename.endsWith('.json')) {
        // NPNT JSON or GPS track JSON
        const json = JSON.parse(text)
        if (json.flightLog?.logEntries) {
          format = 'NPNT_JSON'
          const entries = json.flightLog.logEntries as any[]
          pathPoints = entries
            .filter((e: any) => e.latitude != null && e.longitude != null)
            .map((e: any) => ({ lat: e.latitude, lon: e.longitude, alt: e.altitude ?? 0, timestampMs: e.timeStamp }))
          const breaches = entries.filter((e: any) => e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH')
          breachCount = breaches.length
        } else if (json.type === 'GPS_TRACK' && Array.isArray(json.points)) {
          format = 'GPS_TRACK'
          pathPoints = json.points.map((p: any) => ({
            lat: p.lat, lon: p.lon, alt: p.alt ?? 0, timestampMs: p.timestampMs ?? p.t,
          }))
        } else {
          res.status(400).json({ error: 'UNSUPPORTED_JSON_FORMAT' })
          return
        }
      } else if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
        const lines = text.trim().split('\n')
        if (lines.length < 2) {
          res.status(400).json({ error: 'EMPTY_FILE' })
          return
        }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

        if (headers.includes('osd.latitude')) {
          format = 'DJI_PHANTOMHELP'
          const latIdx = headers.indexOf('osd.latitude')
          const lonIdx = headers.indexOf('osd.longitude')
          const altIdx = headers.indexOf('osd.altitude [m]') >= 0 ? headers.indexOf('osd.altitude [m]') : headers.indexOf('osd.altitude')
          for (let i = 1; i < lines.length; i += 10) {
            const cols = lines[i].split(',')
            const lat = parseFloat(cols[latIdx])
            const lon = parseFloat(cols[lonIdx])
            const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0
            if (!isNaN(lat) && !isNaN(lon)) pathPoints.push({ lat, lon, alt: isNaN(alt) ? 0 : alt })
          }
        } else if (headers.includes('latitude') && (headers.includes('longitude') || headers.includes('longitude'))) {
          format = 'DJI_AIRDATA'
          const latIdx = headers.indexOf('latitude')
          const lonIdx = headers.indexOf('longitude')
          const altIdx = headers.indexOf('height_above_takeoff')
          for (let i = 1; i < lines.length; i += 10) {
            const cols = lines[i].split(',')
            const lat = parseFloat(cols[latIdx])
            const lon = parseFloat(cols[lonIdx])
            const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0
            if (!isNaN(lat) && !isNaN(lon)) pathPoints.push({ lat, lon, alt: isNaN(alt) ? 0 : alt })
          }
        } else {
          // Generic CSV — try to find lat/lon columns
          const latIdx = headers.findIndex(h => h.includes('lat'))
          const lonIdx = headers.findIndex(h => h.includes('lon') || h.includes('lng'))
          const altIdx = headers.findIndex(h => h.includes('alt') || h.includes('height'))
          if (latIdx < 0 || lonIdx < 0) {
            res.status(400).json({ error: 'UNSUPPORTED_CSV', detail: 'Could not find lat/lon columns' })
            return
          }
          format = 'GENERIC_CSV'
          for (let i = 1; i < lines.length; i += 10) {
            const cols = lines[i].split(',')
            const lat = parseFloat(cols[latIdx])
            const lon = parseFloat(cols[lonIdx])
            const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0
            if (!isNaN(lat) && !isNaN(lon)) pathPoints.push({ lat, lon, alt: isNaN(alt) ? 0 : alt })
          }
        }
      } else {
        res.status(400).json({ error: 'UNSUPPORTED_FILE_TYPE', detail: 'Supported: .csv, .txt, .json' })
        return
      }

      if (pathPoints.length === 0) {
        res.status(400).json({ error: 'NO_VALID_POINTS', detail: 'File contained no parseable GPS points' })
        return
      }

      // Compute summary
      takeoffLat = pathPoints[0].lat
      takeoffLon = pathPoints[0].lon
      landingLat = pathPoints[pathPoints.length - 1].lat
      landingLon = pathPoints[pathPoints.length - 1].lon
      maxAltitudeM = Math.max(0, ...pathPoints.map(p => p.alt ?? 0))

      if (pathPoints[0].timestampMs && pathPoints[pathPoints.length - 1].timestampMs) {
        durationSec = (pathPoints[pathPoints.length - 1].timestampMs! - pathPoints[0].timestampMs!) / 1000
      } else {
        durationSec = pathPoints.length // estimate: 1 point per second (subsampled at 10Hz→1Hz)
      }

      const trackLog = await prisma.trackLog.create({
        data: {
          operatorId:           userId,
          droneSerialNumber,
          format,
          takeoffLat,
          takeoffLon,
          landingLat,
          landingLon,
          pathPointsJson:       JSON.stringify(pathPoints),
          maxAltitudeM,
          durationSec,
          breachCount,
          violationsJson:       null,
          droneOperationPlanId,
        },
      })

      await prisma.auditLog.create({
        data: {
          actorType: 'USER', actorId: userId, actorRole: req.auth!.role,
          action: 'TRACK_LOG_UPLOADED', resourceType: 'track_log', resourceId: trackLog.id,
          detailJson: JSON.stringify({
            droneSerialNumber, format, filename: file.originalname,
            pointCount: pathPoints.length, source: 'FILE_UPLOAD',
          }),
        }
      })

      log.info('track_log_file_uploaded', {
        data: { trackLogId: trackLog.id, droneSerialNumber, format, points: pathPoints.length }
      })

      res.status(201).json(serializeForJson({
        success:     true,
        trackLogId:  trackLog.id,
        format,
        pointCount:  pathPoints.length,
        maxAltitudeM,
        durationSec: Math.round(durationSec),
        takeoff:     { lat: takeoffLat, lon: takeoffLon },
        landing:     { lat: landingLat, lon: landingLon },
      }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error('track_log_file_upload_error', { data: { error: msg } })
      res.status(500).json({ error: 'TRACK_LOG_FILE_UPLOAD_FAILED' })
    }
  }
)

// ── POST /api/drone/track-logs/gps-track ────────────────────────────────────
// Upload a GPS track recorded by the Capacitor app or browser GPS recorder.
// Body: { droneSerialNumber, points: [{lat, lon, alt, timestampMs}], droneOperationPlanId? }
router.post('/track-logs/gps-track', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const { userId } = req.auth!
    const { droneSerialNumber, points, droneOperationPlanId } = req.body

    if (!Array.isArray(points) || points.length === 0) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', detail: 'points must be a non-empty array' })
      return
    }
    if (points.length > 50_000) {
      res.status(400).json({ error: 'TOO_MANY_POINTS', limit: 50_000, received: points.length })
      return
    }

    const pathPoints = points.map((p: any) => ({
      lat: p.lat, lon: p.lon, alt: p.alt ?? 0, timestampMs: p.timestampMs ?? p.t ?? 0,
    }))

    const takeoffLat = pathPoints[0].lat
    const takeoffLon = pathPoints[0].lon
    const landingLat = pathPoints[pathPoints.length - 1].lat
    const landingLon = pathPoints[pathPoints.length - 1].lon
    const maxAltitudeM = Math.max(0, ...pathPoints.map(p => p.alt))
    const durationSec = pathPoints[0].timestampMs && pathPoints[pathPoints.length - 1].timestampMs
      ? (pathPoints[pathPoints.length - 1].timestampMs - pathPoints[0].timestampMs) / 1000
      : pathPoints.length

    const trackLog = await prisma.trackLog.create({
      data: {
        operatorId:           userId,
        droneSerialNumber:    droneSerialNumber || 'GPS_RECORDER',
        format:               'GPS_TRACK',
        takeoffLat,
        takeoffLon,
        landingLat,
        landingLon,
        pathPointsJson:       JSON.stringify(pathPoints),
        maxAltitudeM,
        durationSec,
        breachCount:          0,
        violationsJson:       null,
        droneOperationPlanId: droneOperationPlanId ?? null,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: userId, actorRole: req.auth!.role,
        action: 'TRACK_LOG_UPLOADED', resourceType: 'track_log', resourceId: trackLog.id,
        detailJson: JSON.stringify({
          droneSerialNumber: droneSerialNumber || 'GPS_RECORDER',
          format: 'GPS_TRACK', pointCount: pathPoints.length, source: 'GPS_RECORDER',
        }),
      }
    })

    log.info('gps_track_uploaded', {
      data: { trackLogId: trackLog.id, points: pathPoints.length, durationSec: Math.round(durationSec) }
    })

    res.status(201).json(serializeForJson({
      success:     true,
      trackLogId:  trackLog.id,
      pointCount:  pathPoints.length,
      maxAltitudeM,
      durationSec: Math.round(durationSec),
    }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('gps_track_upload_error', { data: { error: msg } })
    res.status(500).json({ error: 'GPS_TRACK_UPLOAD_FAILED' })
  }
})

// ── POST /api/drone/validate-pa — Validate a PA XML ─────────────────────────
// Accepts { paXml: string }, attempts to parse and verify, returns { valid, errors }
router.post('/validate-pa', requireAuth, async (req, res) => {
  try {
    const { paXml } = req.body
    if (!paXml || typeof paXml !== 'string') {
      res.status(400).json({ error: 'PA_XML_REQUIRED', detail: 'paXml string is required' })
      return
    }

    const errors: string[] = []

    // Basic XML well-formedness check
    if (!paXml.trim().startsWith('<?xml') && !paXml.trim().startsWith('<')) {
      errors.push('Not valid XML: does not start with XML declaration or root element')
    }

    // Check for required PA elements
    const requiredElements = ['PermissionArtefact', 'FlightDetails', 'UADetails', 'Pilot']
    for (const elem of requiredElements) {
      if (!paXml.includes(`<${elem}`) && !paXml.includes(`<${elem.toLowerCase()}`)) {
        errors.push(`Missing required element: ${elem}`)
      }
    }

    // Check for digital signature
    if (!paXml.includes('<Signature') && !paXml.includes('<ds:Signature')) {
      errors.push('Missing XML digital signature (W3C XMLDSig)')
    }

    const valid = errors.length === 0

    log.info('pa_xml_validated', { data: { valid, errorCount: errors.length, userId: req.auth!.userId } })
    res.json({ success: true, valid, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('pa_validate_error', { data: { error: msg } })
    res.status(500).json({ error: 'PA_VALIDATION_FAILED' })
  }
})

export default router

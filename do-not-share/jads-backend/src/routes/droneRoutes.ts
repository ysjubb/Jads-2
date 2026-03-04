// droneRoutes.ts — drone mission upload, query, and forensic endpoints.
//
// All field accesses here match the migration SQL schema exactly:
//   DroneMission.missionId is TEXT (not BigInt)
//   DroneTelemetryRecord.canonicalPayloadHex (not canonicalHex)
//   DroneTelemetryRecord.missionId is FK to DroneMission.id (TEXT)
//   DroneTelemetryRecord.sequence is INT (not BigInt)

import express                 from 'express'
import { PrismaClient }        from '@prisma/client'
import { MissionService, MissionSubmissionInput } from '../services/MissionService'
import { ForensicVerifier }    from '../services/ForensicVerifier'
import { requireAuth, requireRole, requireAuditAuth } from '../middleware/authMiddleware'
import { missionUploadRateLimit } from '../middleware/rateLimiter'
import { serializeForJson }    from '../utils/bigintSerializer'
import { decodeCanonical }     from '../telemetry/telemetryDecoder'
import { createServiceLogger } from '../logger'

const router   = express.Router()
const prisma   = new PrismaClient()
const service  = new MissionService(prisma)
const verifier = new ForensicVerifier(prisma)
const log      = createServiceLogger('DroneRoutes')

// ── POST /api/drone/missions ──────────────────────────────────────────────────
// Upload a completed mission from the Android device.
// Body: MissionSubmissionInput
// Response 201: mission accepted
// Response 202: duplicate (safe retry — same missionId already accepted)
// Response 409: replay attack (same missionId, different operator)
// Response 422: chain verification failed
router.post('/missions', requireAuth, missionUploadRateLimit, async (req, res) => {
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
router.get('/missions', requireAuth, async (req, res) => {
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

export default router

// droneRoutes.ts — drone mission upload, query, and forensic endpoints.
//
// All field accesses here match the migration SQL schema exactly:
//   DroneMission.missionId is TEXT (not BigInt)
//   DroneTelemetryRecord.canonicalPayloadHex (not canonicalHex)
//   DroneTelemetryRecord.missionId is FK to DroneMission.id (TEXT)
//   DroneTelemetryRecord.sequence is INT (not BigInt)

import express                 from 'express'
import multer                  from 'multer'
import { PrismaClient }        from '@prisma/client'
import { MissionService, MissionSubmissionInput } from '../services/MissionService'
import { ForensicVerifier }    from '../services/ForensicVerifier'
import { requireAuth, requireRole, requireAuditAuth, requireDomain } from '../middleware/authMiddleware'
import { missionUploadRateLimit } from '../middleware/rateLimiter'
import { serializeForJson }    from '../utils/bigintSerializer'
import { decodeCanonical }     from '../telemetry/telemetryDecoder'
import { createServiceLogger } from '../logger'

const router   = express.Router()
const prisma   = new PrismaClient()
const service  = new MissionService(prisma)
const verifier = new ForensicVerifier(prisma)
const log      = createServiceLogger('DroneRoutes')

// Multer for file uploads — 20MB limit, memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

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

// ── POST /api/drone/track-logs ────────────────────────────────────────────────
// Upload a track log for a completed drone flight.
// Violations are stored but NOT returned to the user.
router.post('/track-logs', requireAuth, requireDomain('DRONE'), async (req, res) => {
  try {
    const { userId } = req.auth!
    const {
      droneSerialNumber, format, takeoff, landing, pathPoints,
      maxAltitude, duration, breachCount, violations, droneOperationPlanId,
    } = req.body

    if (!droneSerialNumber || !format || !takeoff || !landing) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        required: ['droneSerialNumber', 'format', 'takeoff', 'landing'],
      })
      return
    }

    const trackLog = await prisma.trackLog.create({
      data: {
        operatorId:           userId,
        droneSerialNumber,
        format,
        takeoffLat:           takeoff.latDeg ?? null,
        takeoffLon:           takeoff.lonDeg ?? null,
        landingLat:           landing.latDeg ?? null,
        landingLon:           landing.lonDeg ?? null,
        pathPointsJson:       pathPoints ? JSON.stringify(pathPoints) : '[]',
        maxAltitudeM:         maxAltitude ?? 0,
        durationSec:          duration ?? 0,
        breachCount:          breachCount ?? 0,
        violationsJson:       violations ? JSON.stringify(violations) : null,
        droneOperationPlanId: droneOperationPlanId ?? null,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER', actorId: userId, actorRole: req.auth!.role,
        action: 'TRACK_LOG_UPLOADED', resourceType: 'track_log', resourceId: trackLog.id,
        detailJson: JSON.stringify({
          droneSerialNumber, format,
          droneOperationPlanId: droneOperationPlanId ?? null,
        }),
      }
    })

    log.info('track_log_uploaded', { data: { trackLogId: trackLog.id, droneSerialNumber } })
    // Do NOT include violation details in the response — violations are hidden from the user
    res.status(201).json(serializeForJson({ success: true, trackLogId: trackLog.id }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('track_log_upload_error', { data: { error: msg } })
    res.status(500).json({ error: 'TRACK_LOG_UPLOAD_FAILED' })
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

export default router

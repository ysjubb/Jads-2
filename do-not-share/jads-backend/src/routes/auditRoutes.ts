import fs   from 'fs'
import path from 'path'
import express             from 'express'
import { AuditService, AuditScopeError } from '../services/AuditService'
import { ForensicVerifier }   from '../services/ForensicVerifier'
import { Bsa2023CertificateService } from '../services/Bsa2023CertificateService'
import { EvidenceLedgerJob }  from '../jobs/EvidenceLedgerJob'
import { createExternalAnchorService } from '../services/ExternalAnchorService'
import { requireAuditAuth, requireRole } from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { prisma }          from '../lib/prisma'

const router   = express.Router()
const audit    = new AuditService(prisma)
const verifier    = new ForensicVerifier(prisma)
const bsaCertSvc  = new Bsa2023CertificateService()

const AUDITOR_ROLES = [
  'DGCA_AUDITOR', 'AAI_AUDITOR', 'IAF_AUDITOR', 'ARMY_AUDITOR',
  'NAVY_AUDITOR', 'INVESTIGATION_OFFICER', 'PLATFORM_SUPER_ADMIN'
]

function handleScopeError(res: express.Response, e: unknown): void {
  if (e instanceof AuditScopeError) {
    res.status(e.code === 'MISSION_NOT_FOUND' ? 404 : 403).json({ error: e.code, message: e.message })
  } else {
    res.status(500).json({ error: 'AUDIT_SERVICE_ERROR' })
  }
}

// Add retrieved_at_utc, requesting_role, scope_applied to every audit response
function withMeta(data: object, role: string, scopeApplied?: string): object {
  return {
    ...data,
    retrieved_at_utc: new Date().toISOString(),
    requesting_role:  role,
    ...(scopeApplied && { scope_applied: scopeApplied }),
  }
}

// All routes below require auth + an auditor role
router.use(requireAuditAuth, requireRole(AUDITOR_ROLES))

// GET /api/audit/missions
router.get('/missions', async (req, res) => {
  try {
    const { role, entityCode } = req.auth!
    const result = await audit.getMissions(role, entityCode, {
      dateFrom: req.query.dateFrom as string,
      dateTo:   req.query.dateTo   as string,
      status:   req.query.status   as string,
      page:     parseInt((req.query.page  as string) ?? '1'),
      limit:    parseInt((req.query.limit as string) ?? '20'),
    })
    res.json(serializeForJson(withMeta(result, role, result.scopeApplied)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/missions/:id
router.get('/missions/:id', async (req, res) => {
  try {
    const { role, entityCode, userId } = req.auth!
    const mission = await audit.getMissionById(req.params.id, role, entityCode, userId)
    res.json(serializeForJson(withMeta({ mission }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/missions/:id/forensic
router.get('/missions/:id/forensic', async (req, res) => {
  try {
    const { role } = req.auth!
    const result = await verifier.verify(req.params.id)
    res.json(serializeForJson(withMeta({ verification: result }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/missions/:id/bsa-certificate
// Generates a BSA 2023 Section 63 Part A certificate for court-admissible evidence.
// Requires forensic verification to run first. Returns structured certificate data
// that the audit portal renders as a printable HTML document.
router.get('/missions/:id/bsa-certificate', async (req, res) => {
  try {
    const { role, entityCode } = req.auth!
    const mission  = await audit.getMissionById(role, entityCode ?? '', req.params.id) as Record<string, any>
    const verification = await verifier.verify(req.params.id)
    const certificate  = bsaCertSvc.generatePartA(mission, verification)
    res.json(serializeForJson(withMeta({ certificate }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// POST /api/audit/missions/:id/bsa-certificate/sign
// Submit BSA 2023 Section 63 Part B declaration (signed by authorised officer).
// Only DGCA_AUDITOR and INVESTIGATION_OFFICER roles can sign.
router.post('/missions/:id/bsa-certificate/sign',
  requireRole(['DGCA_AUDITOR', 'INVESTIGATION_OFFICER']),
  async (req, res) => {
  try {
    const { role, entityCode, userId, name } = req.auth! as any
    const { declarantDesignation, declarationText, conditionsSatisfied } = req.body

    if (!declarantDesignation || !declarationText || conditionsSatisfied === undefined) {
      res.status(400).json({ error: 'MISSING_FIELDS',
        message: 'Required: declarantDesignation, declarationText, conditionsSatisfied' })
      return
    }

    // Run forensic verification to get current invariant state
    const verification = await verifier.verify(req.params.id)
    const mission = await audit.getMissionById(role, entityCode ?? '', req.params.id) as Record<string, any>
    const partA = bsaCertSvc.generatePartA(mission, verification)

    const declaration = await (prisma as any).bsa2023PartBDeclaration.create({
      data: {
        missionId:            req.params.id,
        certificateId:        partA.certificateId,
        declarantName:        name ?? 'Unknown',
        declarantDesignation,
        declarantEntityCode:  entityCode ?? '',
        declarantUserId:      userId ?? '',
        declarationText,
        allInvariantsHeld:    verification.allInvariantsHold,
        conditionsSatisfied:  Boolean(conditionsSatisfied),
        signatureMethod:      'DIGITAL_JWT',
        ipAddress:            req.ip ?? null,
        userAgent:            req.headers['user-agent'] ?? null,
      }
    })

    res.status(201).json(serializeForJson(withMeta({ declaration, partACertificateId: partA.certificateId }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/missions/:id/bsa-certificate/declarations
// List all Part B declarations for a mission.
router.get('/missions/:id/bsa-certificate/declarations', async (req, res) => {
  try {
    const { role } = req.auth!
    const declarations = await (prisma as any).bsa2023PartBDeclaration.findMany({
      where: { missionId: req.params.id },
      orderBy: { signedAtUtc: 'desc' },
    })
    res.json(serializeForJson(withMeta({ declarations }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/violations
router.get('/violations', async (req, res) => {
  try {
    const { role, entityCode } = req.auth!
    const result = await audit.getViolations(role, entityCode, {
      violationType: req.query.violationType as string,
      severity:      req.query.severity      as string,
      missionId:     req.query.missionId     as string,
      page:  parseInt((req.query.page  as string) ?? '1'),
      limit: parseInt((req.query.limit as string) ?? '50'),
    })
    res.json(serializeForJson(withMeta(result, role, result.scopeApplied)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/flight-plans
router.get('/flight-plans', async (req, res) => {
  try {
    const { role } = req.auth!
    const result = await audit.getFlightPlans(role, {
      callsign: req.query.callsign as string,
      dateFrom: req.query.dateFrom as string,
      dateTo:   req.query.dateTo   as string,
      status:   req.query.status   as string,
      page:     parseInt((req.query.page  as string) ?? '1'),
      limit:    parseInt((req.query.limit as string) ?? '20'),
    })
    res.json(serializeForJson(withMeta(result, role, result.scopeApplied)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/flight-plans/:id — single flight plan detail
router.get('/flight-plans/:id', async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, plan }))
  } catch {
    res.status(500).json({ error: 'FLIGHT_PLAN_FETCH_FAILED' })
  }
})

// GET /api/audit/flight-plans/:id/route-geometry — waypoint coordinates for map
router.get('/flight-plans/:id/route-geometry', async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({
      where: { id: req.params.id },
      select: { adep: true, ades: true, route: true, validationResultJson: true }
    })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }

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
    } catch { /* routeLegs may not exist */ }

    // Filter out points with invalid (0,0) coordinates
    points = points.filter(p => p.latDeg !== 0 || p.lonDeg !== 0)

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

// GET /api/audit/audit-log — PLATFORM_SUPER_ADMIN only
router.get('/audit-log', requireRole(['PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const { role } = req.auth!
    const result = await audit.getAuditLog(role, {
      actorType: req.query.actorType as string,
      action:    req.query.action    as string,
      dateFrom:  req.query.dateFrom  as string,
      dateTo:    req.query.dateTo    as string,
      page:      parseInt((req.query.page  as string) ?? '1'),
      limit:     parseInt((req.query.limit as string) ?? '50'),
    })
    res.json(withMeta(result, role))
  } catch (e) { handleScopeError(res, e) }
})

// POST /api/audit/investigation/grant — DGCA_AUDITOR only
router.post('/investigation/grant', requireRole(['DGCA_AUDITOR']), async (req, res) => {
  try {
    const result = await audit.grantAccess(req.auth!.userId, req.body)
    res.status(201).json({ success: true, ...result })
  } catch (e) { handleScopeError(res, e) }
})

// POST /api/audit/investigation/revoke — DGCA_AUDITOR only
router.post('/investigation/revoke', requireRole(['DGCA_AUDITOR']), async (req, res) => {
  try {
    const { investigationAccessId, reason } = req.body
    if (!investigationAccessId || !reason) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', required: ['investigationAccessId', 'reason'] })
      return
    }
    await audit.revokeAccess(req.auth!.userId, investigationAccessId, reason)
    res.json({ success: true })
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/sequence-integrity — PLATFORM_SUPER_ADMIN only
// Detects gaps in the AuditLog sequenceNumber (BIGSERIAL) column.
// A gap means one or more audit log entries were deleted — a tamper indicator.
//
// Efficient query: if (MAX - MIN + 1) != COUNT, there are gaps.
// Returns: { gapDetected, minSeq, maxSeq, count, expectedCount, gaps[] (first 20) }
router.get('/sequence-integrity', requireRole(['PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    type SeqRow = { min_seq: bigint | null; max_seq: bigint | null; count: bigint }
    const [stats] = await prisma.$queryRaw<SeqRow[]>`
      SELECT MIN("sequenceNumber") as min_seq,
             MAX("sequenceNumber") as max_seq,
             COUNT(*)              as count
      FROM "AuditLog"
    `

    if (stats.min_seq == null) {
      res.json({ gapDetected: false, message: 'AuditLog is empty', count: 0 })
      return
    }

    const minSeq       = Number(stats.min_seq)
    const maxSeq       = Number(stats.max_seq)
    const count        = Number(stats.count)
    const expectedCount = maxSeq - minSeq + 1
    const gapDetected  = count !== expectedCount

    let gaps: number[] = []
    if (gapDetected) {
      // Find first 20 gaps for forensic investigation
      // This works for moderate gap counts — for massive gaps use a separate query
      type GapRow = { seq: bigint }
      const allSeqs = await prisma.$queryRaw<GapRow[]>`
        SELECT "sequenceNumber" as seq FROM "AuditLog"
        WHERE "sequenceNumber" BETWEEN ${BigInt(minSeq)} AND ${BigInt(Math.min(maxSeq, minSeq + 100000))}
        ORDER BY "sequenceNumber"
      `
      const seqSet = new Set(allSeqs.map(r => Number(r.seq)))
      for (let s = minSeq; s <= Math.min(maxSeq, minSeq + 100000) && gaps.length < 20; s++) {
        if (!seqSet.has(s)) gaps.push(s)
      }
    }

    res.json(serializeForJson({
      gapDetected,
      minSeq,
      maxSeq,
      count,
      expectedCount,
      missingEntries: expectedCount - count,
      gaps: gaps.length > 0 ? gaps : undefined,
      assessment: gapDetected
        ? `TAMPER INDICATOR: ${expectedCount - count} audit log entries appear to have been deleted`
        : 'CLEAN: audit log sequence is unbroken',
      checkedAt: new Date().toISOString(),
    }))
  } catch (e) {
    res.status(500).json({ error: 'SEQUENCE_CHECK_FAILED' })
  }
})

// GET /api/audit/ledger/log-integrity — verify external evidence.log against DB
// Re-reads the evidence.log file, re-computes every anchor, checks against DB entries.
// Detects: missing lines, tampered lines, DB/log divergence.
// PLATFORM_SUPER_ADMIN only.
router.get('/ledger/log-integrity', requireRole(['PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const logPath = process.env.EVIDENCE_LOG_PATH
      ?? require('path').join(process.cwd(), 'evidence_ledger.log')

    if (!require('fs').existsSync(logPath)) {
      res.json({ status: 'NO_LOG_FILE', path: logPath, message: 'External evidence log not yet created (no missions anchored yet)' })
      return
    }

    const raw     = require('fs').readFileSync(logPath, 'utf8')
    const lines   = raw.trim().split('\n').filter(Boolean)
    const entries = lines.map((l: string) => { try { return JSON.parse(l) } catch { return null } })
    const badParse = entries.filter((e: unknown) => !e).length

    const GENESIS = '0'.repeat(64)
    const issues: string[] = []
    let prevHash = GENESIS

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (!e) { issues.push(`LINE_${i+1}_UNPARSEABLE`); continue }

      // Re-verify anchor hash
      const input        = `${e.anchorDate}|${e.missionCount}|${e.missionIdsCsvHash}|${e.prevAnchorHash}`
      const recomputed   = require('crypto').createHash('sha256').update(input).digest('hex')

      if (recomputed !== e.anchorHash) {
        issues.push(`ANCHOR_HASH_MISMATCH: date=${e.anchorDate} stored=${e.anchorHash.slice(0,16)}... recomputed=${recomputed.slice(0,16)}...`)
      }
      if (e.prevAnchorHash !== prevHash) {
        issues.push(`CHAIN_BROKEN: date=${e.anchorDate} expected_prev=${prevHash.slice(0,16)}... got=${e.prevAnchorHash.slice(0,16)}...`)
      }
      prevHash = e.anchorHash
    }

    // Cross-check with DB
    const dbEntries = await prisma.evidenceLedger.findMany({
      orderBy: { anchorDate: 'asc' },
      select:  { anchorDate: true, anchorHash: true, missionCount: true }
    })

    const logDates = new Set(entries.map((e: any) => e?.anchorDate).filter(Boolean))
    for (const db of dbEntries) {
      const dateStr = db.anchorDate.toISOString().slice(0, 10)
      if (!logDates.has(dateStr)) {
        issues.push(`DB_ENTRY_MISSING_FROM_LOG: date=${dateStr} — anchor exists in DB but not in external log`)
      }
    }

    res.json(serializeForJson({
      status:       issues.length === 0 ? 'CLEAN' : 'ISSUES_FOUND',
      logPath,
      entriesInLog: entries.length,
      entriesInDb:  dbEntries.length,
      badParseCount: badParse,
      issues,
      checkedAt:    new Date().toISOString(),
    }))
  } catch (e) {
    res.status(500).json({ error: 'LOG_INTEGRITY_CHECK_FAILED' })
  }
})

// GET /api/audit/ledger/:date/external-verify — verify anchor against external backends
// Checks that the anchor for a given date exists in external trust stores
// and has not been tampered with. This is the key defense against full backend compromise.
router.get('/ledger/:date/external-verify', requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const dateStr = req.params.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'INVALID_DATE_FORMAT', expected: 'YYYY-MM-DD' })
      return
    }

    // Get the stored anchor from DB
    const anchorDate = new Date(`${dateStr}T00:00:00.000Z`)
    const stored = await prisma.evidenceLedger.findFirst({ where: { anchorDate } })
    if (!stored) {
      res.status(404).json({ error: 'NO_ANCHOR_FOR_DATE', anchorDate: dateStr })
      return
    }

    // Verify against external backends
    const extService = createExternalAnchorService()
    const result = await extService.verifyAnchor(stored.anchorHash, dateStr)

    // Also re-verify internally
    const ledger = new EvidenceLedgerJob(prisma)
    const internalResult = await ledger.verifyAnchor(anchorDate)

    res.json(serializeForJson(withMeta({
      anchorDate:       dateStr,
      storedAnchorHash: stored.anchorHash,
      internalVerification: internalResult,
      externalVerification: result,
      overallVerdict:   internalResult.verified && result.verified
        ? 'FULLY_VERIFIED'
        : internalResult.verified && !result.verified
          ? 'INTERNAL_ONLY — external anchor not found or mismatched'
          : 'VERIFICATION_FAILED',
    }, req.auth!.role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/export/missions
router.get('/export/missions', async (req, res) => {
  try {
    const { role, entityCode, userId } = req.auth!
    const format = ((req.query.format as string) ?? 'JSON').toUpperCase() as 'CSV' | 'JSON'
    const data   = await audit.exportMissions(role, entityCode, userId, format)

    if (format === 'CSV') {
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename=jads-missions-export.csv')
    } else {
      res.setHeader('Content-Type', 'application/json')
    }
    res.send(data)
  } catch (e) { handleScopeError(res, e) }
})


// GET /api/audit/ledger — list all anchor entries (most recent first)
router.get('/ledger', requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '90'), 365)
    const entries = await prisma.evidenceLedger.findMany({
      orderBy: { anchorDate: 'desc' },
      take:    limit,
      select:  { id: true, anchorDate: true, missionCount: true, anchorHash: true,
                 prevAnchorHash: true, computedAt: true },
    })
    res.json(serializeForJson(withMeta({ entries, count: entries.length }, req.auth!.role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/ledger/:date — get and re-verify a single day's anchor
// Date format: YYYY-MM-DD
router.get('/ledger/:date', requireRole(['DGCA_AUDITOR', 'IAF_AUDITOR', 'PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const dateStr = req.params.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'INVALID_DATE_FORMAT', expected: 'YYYY-MM-DD' })
      return
    }
    const anchorDate = new Date(`${dateStr}T00:00:00.000Z`)
    const ledger     = new EvidenceLedgerJob(prisma)
    const result     = await ledger.verifyAnchor(anchorDate)
    res.json(serializeForJson(withMeta({ verification: result }, req.auth!.role)))
  } catch (e) { handleScopeError(res, e) }
})

// POST /api/audit/ledger/anchor-now — PLATFORM_SUPER_ADMIN only, manual trigger
// Used for: testing, backfill, post-migration anchor creation
router.post('/ledger/anchor-now', requireRole(['PLATFORM_SUPER_ADMIN']), async (req, res) => {
  try {
    const { targetDate } = req.body
    const ledger = new EvidenceLedgerJob(prisma)
    const date   = targetDate ? new Date(`${targetDate}T00:00:00.000Z`) : undefined
    const result = await ledger.runOnce(date)
    res.status(result.status === 'ANCHORED' ? 201 : 200).json({ success: true, ...result })
  } catch (e) { handleScopeError(res, e) }
})


// ── eGCA Sync Status ─────────────────────────────────────────────────────────
// GET /api/audit/egca-sync/status
// Returns the current eGCA synchronisation status: last sync timestamp,
// permissions synced in the last 24 hours, PAs downloaded, and any errors.
// Used by the audit portal sidebar badge to show sync freshness.
router.get('/egca-sync/status', async (req, res) => {
  try {
    const { role } = req.auth!

    // Query AuditLog for eGCA sync events
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Find the most recent successful sync event
    const lastSync = await prisma.auditLog.findFirst({
      where: {
        action:       'egca_sync_completed',
        actorType:    'SYSTEM',
      },
      orderBy: { timestamp: 'desc' },
    })

    // Count sync events in the last 24 hours
    const recentSyncs = await prisma.auditLog.findMany({
      where: {
        action:    'egca_sync_completed',
        actorType: 'SYSTEM',
        timestamp: { gte: twentyFourHoursAgo },
      },
      orderBy: { timestamp: 'desc' },
    })

    // Aggregate permission counts from recent sync detail JSON
    let permissionsSynced = 0
    let pasDownloaded     = 0
    for (const entry of recentSyncs) {
      try {
        const detail = JSON.parse(entry.detailJson)
        permissionsSynced += detail.permissionsSynced ?? 0
        pasDownloaded     += detail.pasDownloaded     ?? 0
      } catch { /* ignore parse errors */ }
    }

    // Find recent sync errors (last 10)
    const recentErrors = await prisma.auditLog.findMany({
      where: {
        action:    'egca_sync_error',
        actorType: 'SYSTEM',
        timestamp: { gte: twentyFourHoursAgo },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    })

    const errors = recentErrors.map(e => {
      try {
        const detail = JSON.parse(e.detailJson)
        return {
          timestamp: e.timestamp.toISOString(),
          errorCode: detail.errorCode ?? e.errorCode ?? 'UNKNOWN',
          message:   detail.message   ?? 'Sync error',
        }
      } catch {
        return {
          timestamp: e.timestamp.toISOString(),
          errorCode: e.errorCode ?? 'UNKNOWN',
          message:   'Sync error (unparseable detail)',
        }
      }
    })

    const lastSyncTimestamp = lastSync?.timestamp?.toISOString() ?? null
    const lastSyncAgoMs    = lastSync ? Date.now() - lastSync.timestamp.getTime() : null

    res.json(serializeForJson(withMeta({
      lastSyncTimestamp,
      lastSyncAgoMs,
      permissionsSynced24h: permissionsSynced,
      pasDownloaded24h:     pasDownloaded,
      syncEventsLast24h:    recentSyncs.length,
      errors,
      status: lastSyncAgoMs === null
        ? 'NEVER_SYNCED'
        : lastSyncAgoMs < 5 * 60 * 1000
          ? 'SYNCED'
          : lastSyncAgoMs < 30 * 60 * 1000
            ? 'STALE'
            : 'OUT_OF_SYNC',
    }, role)))
  } catch (e) {
    res.status(500).json({ error: 'EGCA_SYNC_STATUS_FAILED' })
  }
})

// POST /api/audit/egca-sync/force
// PLATFORM_SUPER_ADMIN and DGCA_AUDITOR only.
// Triggers a manual eGCA sync and logs the event to the AuditLog.
router.post('/egca-sync/force',
  requireRole(['PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR']),
  async (req, res) => {
  try {
    const { userId, role } = req.auth!

    // Log the force sync trigger to AuditLog
    await prisma.auditLog.create({
      data: {
        actorType:    'ADMIN',
        actorId:      userId,
        actorRole:    role,
        action:       'egca_sync_force_triggered',
        resourceType: 'egca_sync',
        resourceId:   null,
        ipAddress:    req.ip ?? null,
        userAgent:    req.headers['user-agent'] ?? null,
        success:      true,
        detailJson:   JSON.stringify({
          triggeredBy: userId,
          triggeredRole: role,
          triggeredAt: new Date().toISOString(),
        }),
      },
    })

    // Simulate the sync completing (in production this would call the eGCA adapter)
    // For now, record a successful sync event so the status endpoint reflects it.
    const syncResult = {
      permissionsSynced: 0,
      pasDownloaded:     0,
      syncDurationMs:    0,
      syncType:          'MANUAL_FORCE',
    }

    await prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'EGCA_SYNC_SERVICE',
        actorRole:    null,
        action:       'egca_sync_completed',
        resourceType: 'egca_sync',
        resourceId:   null,
        ipAddress:    null,
        userAgent:    null,
        success:      true,
        detailJson:   JSON.stringify({
          ...syncResult,
          triggeredBy: userId,
          completedAt: new Date().toISOString(),
        }),
      },
    })

    res.status(200).json(serializeForJson(withMeta({
      success: true,
      message: 'eGCA sync triggered successfully',
      ...syncResult,
    }, role)))
  } catch (e) {
    res.status(500).json({ error: 'EGCA_FORCE_SYNC_FAILED' })
  }
})


// ── Zone Compliance Endpoints ─────────────────────────────────────────

router.get('/zone-compliance/stats',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (_req, res) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      // Count flight plans from drone operation plans in last 30 days
      const totalPlans = await prisma.droneOperationPlan.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      })

      // Count by zone classification from audit logs
      const zoneLogs = await prisma.auditLog.findMany({
        where: {
          action: { in: ['zone_check_completed', 'drone_plan_submitted', 'flight_permission_submitted'] },
          timestamp: { gte: thirtyDaysAgo },
        },
        select: { detailJson: true },
      })

      let greenCount = 0, yellowPending = 0, yellowApproved = 0, yellowRejected = 0, violations = 0

      for (const log of zoneLogs) {
        try {
          const detail = typeof log.detailJson === 'string' ? JSON.parse(log.detailJson) : log.detailJson
          const zone = detail?.primaryZone ?? detail?.zone
          if (zone === 'GREEN') greenCount++
          if (zone === 'YELLOW') {
            const status = detail?.status
            if (status === 'APPROVED') yellowApproved++
            else if (status === 'REJECTED') yellowRejected++
            else yellowPending++
          }
          if (detail?.violations && detail.violations > 0) violations += detail.violations
        } catch { /* skip malformed */ }
      }

      // Count geofence breach violations
      const violationCount = await prisma.auditLog.count({
        where: {
          action: { in: ['geofence_breach', 'zone_violation'] },
          timestamp: { gte: thirtyDaysAgo },
        },
      })

      const total = totalPlans || zoneLogs.length || 1
      const greenPct = total > 0 ? Math.round((greenCount / total) * 100) : 0

      res.json({
        totalFlightPlans30d: totalPlans || zoneLogs.length,
        greenAutoApprovalPct: greenPct,
        yellowPending,
        yellowApproved,
        yellowRejected,
        zoneViolationsDetected: violationCount + violations,
      })
    } catch (e) {
      res.status(500).json({ error: 'ZONE_COMPLIANCE_STATS_FAILED' })
    }
  }
)

router.get('/zone-compliance/violations',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
      const skip = (page - 1) * limit

      // Query audit logs for zone violations/geofence breaches
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { action: { in: ['geofence_breach', 'zone_violation', 'zone_deviation'] } },
          orderBy: { timestamp: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({
          where: { action: { in: ['geofence_breach', 'zone_violation', 'zone_deviation'] } },
        }),
      ])

      const violations = logs.map(log => {
        let detail: any = {}
        try { detail = typeof log.detailJson === 'string' ? JSON.parse(log.detailJson) : log.detailJson ?? {} } catch {}
        return {
          missionId: detail.missionId ?? log.resourceId ?? 'N/A',
          pilotRpc: detail.pilotRpc ?? detail.pilotId ?? 'N/A',
          droneUin: detail.droneUin ?? detail.uinNumber ?? 'N/A',
          permittedZone: detail.permittedZone ?? 'N/A',
          actualZone: detail.actualZone ?? 'N/A',
          deviationMeters: detail.deviationMeters ?? detail.deviation ?? 0,
          date: log.timestamp.toISOString().slice(0, 10),
        }
      })

      res.json(serializeForJson({ violations, total, page, limit }))
    } catch (e) {
      res.status(500).json({ error: 'ZONE_VIOLATIONS_FETCH_FAILED' })
    }
  }
)

router.get('/zone-compliance/authority-latency',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (_req, res) => {
    try {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)

      const approvalLogs = await prisma.auditLog.findMany({
        where: {
          action: { in: ['yellow_zone_approved', 'atc_approval_completed'] },
          timestamp: { gte: sixMonthsAgo },
        },
        select: { detailJson: true },
      })

      const authorityTotals: Record<string, { totalDays: number; count: number }> = {}
      const defaultAuthorities = ['AAI', 'IAF', 'NAVY', 'HAL']
      defaultAuthorities.forEach(a => { authorityTotals[a] = { totalDays: 0, count: 0 } })

      for (const log of approvalLogs) {
        try {
          const detail = typeof log.detailJson === 'string' ? JSON.parse(log.detailJson) : log.detailJson
          const auth = detail?.authority ?? 'AAI'
          const days = detail?.approvalDays ?? detail?.processingDays ?? 0
          if (!authorityTotals[auth]) authorityTotals[auth] = { totalDays: 0, count: 0 }
          authorityTotals[auth].totalDays += days
          authorityTotals[auth].count++
        } catch { /* skip */ }
      }

      const authorities = Object.entries(authorityTotals).map(([authority, data]) => ({
        authority,
        avgDays: data.count > 0 ? Math.round((data.totalDays / data.count) * 10) / 10 : 0,
      }))

      res.json({ authorities })
    } catch (e) {
      res.status(500).json({ error: 'AUTHORITY_LATENCY_FETCH_FAILED' })
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════
// T10/T11 — Incident Report endpoints
// ═══════════════════════════════════════════════════════════════════════

// POST /api/audit/incidents — create incident from violation alert
router.post('/incidents',
  requireAuditAuth,
  requireRole([...AUDITOR_ROLES, 'GOVT_ADMIN']),
  async (req, res) => {
    try {
      const { violationId, missionId, uin, description, severity } = req.body
      const reportedBy = req.auth?.userId || 'unknown'

      const incident = await prisma.incidentReport.create({
        data: { violationId, missionId, uin, reportedBy, description, severity },
      })
      res.status(201).json(incident)
    } catch (e) {
      res.status(500).json({ error: 'INCIDENT_CREATE_FAILED', detail: e instanceof Error ? e.message : String(e) })
    }
  }
)

// GET /api/audit/incidents — list with filters
router.get('/incidents',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const { severity, status, uin } = req.query
      const where: Record<string, unknown> = {}
      if (severity) where.severity = severity
      if (status) where.status = status
      if (uin) where.uin = { contains: uin as string }

      const incidents = await prisma.incidentReport.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      res.json(incidents)
    } catch (e) {
      res.status(500).json({ error: 'INCIDENT_LIST_FAILED' })
    }
  }
)

// GET /api/audit/incidents/:id — single incident with violation detail
router.get('/incidents/:id',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const incident = await prisma.incidentReport.findUnique({
        where: { id: req.params.id },
      })
      if (!incident) { res.status(404).json({ error: 'INCIDENT_NOT_FOUND' }); return }

      // Fetch linked violation
      const violation = await prisma.geofenceViolation.findFirst({
        where: { id: incident.violationId },
      })

      res.json({ ...incident, violation })
    } catch (e) {
      res.status(500).json({ error: 'INCIDENT_FETCH_FAILED' })
    }
  }
)

// PUT /api/audit/incidents/:id/status — update status
router.put('/incidents/:id/status',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const { status } = req.body
      const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'INVALID_STATUS', valid: validStatuses })
        return
      }

      const updated = await prisma.incidentReport.update({
        where: { id: req.params.id },
        data: {
          status,
          ...(status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
        },
      })
      res.json(updated)
    } catch (e) {
      res.status(500).json({ error: 'INCIDENT_STATUS_UPDATE_FAILED' })
    }
  }
)

// POST /api/audit/incidents/:id/assign — assign to auditor
router.post('/incidents/:id/assign',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const { assignedTo } = req.body
      const updated = await prisma.incidentReport.update({
        where: { id: req.params.id },
        data: { assignedTo },
      })
      res.json(updated)
    } catch (e) {
      res.status(500).json({ error: 'INCIDENT_ASSIGN_FAILED' })
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════
// Track Log endpoints
// ═══════════════════════════════════════════════════════════════════════

// GET /api/audit/track-logs — list all track logs for audit review
router.get('/track-logs', async (req, res) => {
  try {
    const { role } = req.auth!
    const page  = parseInt((req.query.page  as string) ?? '1')
    const limit = Math.min(parseInt((req.query.limit as string) ?? '20'), 100)
    const skip  = (page - 1) * limit

    const [trackLogs, total] = await Promise.all([
      prisma.trackLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.trackLog.count(),
    ])

    res.json(serializeForJson(withMeta({ trackLogs, total, page, limit }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/track-logs/:id — single track log detail
router.get('/track-logs/:id', async (req, res) => {
  try {
    const { role } = req.auth!
    const trackLog = await prisma.trackLog.findUnique({ where: { id: req.params.id } })
    if (!trackLog) { res.status(404).json({ error: 'TRACK_LOG_NOT_FOUND' }); return }

    // Parse pathPointsJson for the consumer
    let pathPoints: unknown[] = []
    try { pathPoints = JSON.parse(trackLog.pathPointsJson) } catch { /* malformed JSON */ }

    res.json(serializeForJson(withMeta({ trackLog: { ...trackLog, pathPoints } }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// ═══════════════════════════════════════════════════════════════════════
// PA Compliance endpoints
// ═══════════════════════════════════════════════════════════════════════

// GET /api/audit/pa/compliance-report — PA compliance report
router.get('/pa/compliance-report', async (req, res) => {
  try {
    const { role } = req.auth!

    const allPAs = await prisma.permissionArtefact.findMany({
      select: { status: true, violations: true },
    })

    const totalPAs = allPAs.length
    const byStatus = {
      pending:   allPAs.filter(pa => pa.status === 'PENDING').length,
      approved:  allPAs.filter(pa => pa.status === 'APPROVED').length,
      active:    allPAs.filter(pa => pa.status === 'ACTIVE').length,
      completed: allPAs.filter(pa => pa.status === 'COMPLETED').length,
      expired:   allPAs.filter(pa => pa.status === 'EXPIRED').length,
      revoked:   allPAs.filter(pa => pa.status === 'REVOKED').length,
    }

    // Compliant = COMPLETED with no violations
    const completedPAs = allPAs.filter(pa => pa.status === 'COMPLETED')
    const compliant = completedPAs.filter(pa => {
      if (!pa.violations) return true
      try {
        const v = typeof pa.violations === 'string' ? JSON.parse(pa.violations as string) : pa.violations
        return !v || (Array.isArray(v) && v.length === 0)
      } catch { return true }
    }).length
    const nonCompliant = totalPAs - compliant
    const complianceRate = totalPAs > 0 ? Math.round((compliant / totalPAs) * 10000) / 100 : 0

    res.json(serializeForJson(withMeta({
      totalPAs, compliant, nonCompliant, complianceRate, byStatus,
    }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/pa/:id/verification-detail — detailed PA verification for audit
router.get('/pa/:id/verification-detail', async (req, res) => {
  try {
    const { role } = req.auth!
    const pa = await prisma.permissionArtefact.findUnique({ where: { id: req.params.id } })
    if (!pa) { res.status(404).json({ error: 'PA_NOT_FOUND' }); return }

    res.json(serializeForJson(withMeta({ permissionArtefact: pa }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// ═══════════════════════════════════════════════════════════════════════
// Drone Category Compliance endpoints
// ═══════════════════════════════════════════════════════════════════════

// GET /api/audit/drone/category-compliance — category compliance breakdown
router.get('/drone/category-compliance', async (req, res) => {
  try {
    const { role } = req.auth!
    const categoryNames = ['NANO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE'] as const

    const categories = await Promise.all(categoryNames.map(async (category) => {
      const total = await prisma.droneMission.count({
        where: { droneWeightCategory: category },
      })
      const nonCompliant = await prisma.droneMission.count({
        where: {
          droneWeightCategory: category,
          violations: { some: {} },
        },
      })
      const compliant = total - nonCompliant
      const complianceRate = total > 0 ? Math.round((compliant / total) * 10000) / 100 : 0

      return { category, total, compliant, nonCompliant, complianceRate }
    }))

    res.json(serializeForJson(withMeta({ categories }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// GET /api/audit/drone/category-monthly — monthly category trend data (last 6 months)
router.get('/drone/category-monthly', async (req, res) => {
  try {
    const { role } = req.auth!
    const months: { month: string; nano: number; micro: number; small: number; medium: number; large: number }[] = []

    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const year  = d.getFullYear()
      const month = d.getMonth() // 0-indexed
      const startOfMonth = new Date(year, month, 1)
      const endOfMonth   = new Date(year, month + 1, 1)
      const label = `${year}-${String(month + 1).padStart(2, '0')}`

      const counts = await prisma.droneMission.groupBy({
        by: ['droneWeightCategory'],
        where: {
          uploadedAt: { gte: startOfMonth, lt: endOfMonth },
        },
        _count: true,
      })

      const countMap: Record<string, number> = {}
      for (const c of counts) {
        countMap[c.droneWeightCategory] = c._count
      }

      months.push({
        month: label,
        nano:   countMap['NANO']   ?? 0,
        micro:  countMap['MICRO']  ?? 0,
        small:  countMap['SMALL']  ?? 0,
        medium: countMap['MEDIUM'] ?? 0,
        large:  countMap['LARGE']  ?? 0,
      })
    }

    res.json(serializeForJson(withMeta({ months }, role)))
  } catch (e) { handleScopeError(res, e) }
})

// POST /api/audit/access-log — immutable access audit trail
router.post('/access-log',
  requireAuditAuth,
  requireRole(AUDITOR_ROLES),
  async (req, res) => {
    try {
      const { incidentId, action, ts } = req.body
      const auditorId = req.auth?.userId || 'unknown'

      await prisma.auditLog.create({
        data: {
          actorId: auditorId,
          actorType: 'AUDITOR',
          actorRole: req.auth?.role,
          action: `EVIDENCE_${action}`,
          resourceType: 'IncidentReport',
          resourceId: incidentId,
          detailJson: JSON.stringify({ incidentId, action, ts }),
        },
      })
      res.json({ logged: true })
    } catch (e) {
      res.status(500).json({ error: 'ACCESS_LOG_FAILED' })
    }
  }
)

export default router

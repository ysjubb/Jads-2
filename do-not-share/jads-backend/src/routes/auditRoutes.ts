import fs   from 'fs'
import path from 'path'
import express             from 'express'
import { PrismaClient }   from '@prisma/client'
import { AuditService, AuditScopeError } from '../services/AuditService'
import { ForensicVerifier }   from '../services/ForensicVerifier'
import { Bsa2023CertificateService } from '../services/Bsa2023CertificateService'
import { EvidenceLedgerJob }  from '../jobs/EvidenceLedgerJob'
import { createExternalAnchorService } from '../services/ExternalAnchorService'
import { requireAuditAuth, requireRole } from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'

const router   = express.Router()
const prisma   = new PrismaClient()
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

// GET /api/audit/violations
router.get('/violations', async (req, res) => {
  try {
    const { role, entityCode } = req.auth!
    const result = await audit.getViolations(role, entityCode, {
      violationType: req.query.violationType as string,
      severity:      req.query.severity      as string,
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


export default router

// ─────────────────────────────────────────────────────────────────────────────
// EvidenceLedgerJob
//
// Runs daily at 00:05 UTC (5 minutes after midnight to allow last-second uploads
// from the previous day to complete their DB transactions).
//
// What it does:
//   1. Finds all DroneMissions uploaded YESTERDAY (00:00:00–23:59:59 UTC).
//   2. Sorts their missionIds lexicographically for determinism.
//   3. Computes missionIdsCsvHash = SHA-256 of the sorted CSV string.
//   4. Computes anchorHash = SHA-256(date || missionCount || missionIdsCsvHash || prevAnchorHash)
//   5. Writes one EvidenceLedger row — UNIQUE on anchorDate so re-runs are idempotent.
//   6. Writes to AuditLog with actorType=SYSTEM.
//
// Forensic use:
//   If a mission uploaded on date D later disappears from the DB, the ledger
//   entry for date D will not match when recomputed — deletion is detectable.
//   An auditor can call GET /api/audit/ledger/:date to get the anchor and
//   independently re-verify any date's chain.
//
// Limitations (known, documented):
//   - Anchors are stored in the same DB — a full DB wipe removes both.
//   - For production: export anchorHash to an external append-only log or
//     publish daily to a public ledger (e.g. a public GitHub commit, IPFS, or
//     registered with DGCA as a timestamping authority).
//   - This implementation provides tamper-DETECTION, not tamper-PROOF (the
//     latter requires an externally witnessed anchor).
// ─────────────────────────────────────────────────────────────────────────────

import crypto                  from 'crypto'
import cron                    from 'node-cron'
import fs                      from 'fs'
import path                    from 'path'
import { PrismaClient }        from '@prisma/client'
import { createServiceLogger } from '../logger'
import { ExternalAnchorService, createExternalAnchorService } from '../services/ExternalAnchorService'
import type { AnchorPayload, AnchorReceipt } from '../services/ExternalAnchorService'

const log = createServiceLogger('EvidenceLedgerJob')

const CRON_SCHEDULE    = '5 0 * * *'   // 00:05 UTC daily
const GENESIS_HASH     = '0'.repeat(64) // prevAnchorHash for first-ever entry

// External append-only evidence log — survives DB wipe if on a separate volume.
// In production: mount /var/log/jads on a separate read-once storage volume,
// or ship entries to a centralised syslog/SIEM that operators cannot modify.
// For iDEX demo: written to the app's log directory beside the DB.
const EVIDENCE_LOG_PATH = process.env.EVIDENCE_LOG_PATH
  ?? path.join(process.cwd(), 'evidence_ledger.log')

export class EvidenceLedgerJob {
  private task: ReturnType<typeof cron.schedule> | null = null
  private readonly externalAnchor: ExternalAnchorService

  constructor(private readonly prisma: PrismaClient, externalAnchor?: ExternalAnchorService) {
    this.externalAnchor = externalAnchor ?? createExternalAnchorService()
  }

  start(): void {
    log.info('evidence_ledger_job_started', { data: { schedule: CRON_SCHEDULE } })
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runOnce().catch(e =>
        log.error('evidence_ledger_job_failed', {
          data: { error: e instanceof Error ? e.message : String(e) }
        })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('evidence_ledger_job_stopped', {})
  }

  // ── Public so it can be called manually for backfill or testing ────────────
  async runOnce(targetDate?: Date): Promise<LedgerRunResult> {
    const jobRunId = crypto.randomUUID()
    const now      = new Date()

    // Default: compute anchor for yesterday
    const anchorDate = targetDate ?? this.yesterdayUtc(now)
    const dateStr    = this.formatDate(anchorDate)  // "YYYY-MM-DD"

    log.info('evidence_ledger_run_start', { data: { jobRunId, anchorDate: dateStr } })

    // ── 1. Idempotency: skip if already anchored for this date ─────────────
    const existing = await this.prisma.evidenceLedger.findFirst({
      where: { anchorDate }
    })
    if (existing) {
      log.info('evidence_ledger_already_anchored', { data: { anchorDate: dateStr, existingId: existing.id } })
      return { status: 'ALREADY_ANCHORED', anchorDate: dateStr, anchorHash: existing.anchorHash }
    }

    // ── 2. Collect all missions uploaded on anchorDate ─────────────────────
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`)

    const missions = await this.prisma.droneMission.findMany({
      where: { uploadedAt: { gte: dayStart, lte: dayEnd } },
      select: { missionId: true },
      orderBy: { missionId: 'asc' },  // lexicographic sort for determinism
    })

    const missionIds = missions.map(m => m.missionId)
    const missionCount = missionIds.length

    // ── 3. Compute missionIdsCsvHash ───────────────────────────────────────
    // CSV of sorted missionIds (already sorted by DB ORDER BY)
    // Empty day → hash of empty string → still deterministic
    const csv            = missionIds.join(',')
    const missionIdsCsvHash = crypto.createHash('sha256').update(csv, 'utf8').digest('hex')

    // ── 4. Find prevAnchorHash ─────────────────────────────────────────────
    const prevEntry = await this.prisma.evidenceLedger.findFirst({
      where:   { anchorDate: { lt: anchorDate } },
      orderBy: { anchorDate: 'desc' },
    })
    const prevAnchorHash = prevEntry?.anchorHash ?? GENESIS_HASH

    // ── 5. Compute anchorHash ──────────────────────────────────────────────
    // anchorHash = SHA-256( date || "|" || missionCount || "|" || missionIdsCsvHash || "|" || prevAnchorHash )
    const anchorInput = `${dateStr}|${missionCount}|${missionIdsCsvHash}|${prevAnchorHash}`
    const anchorHash  = crypto.createHash('sha256').update(anchorInput, 'utf8').digest('hex')

    // ── 6. Persist ────────────────────────────────────────────────────────
    const entry = await this.prisma.evidenceLedger.create({
      data: {
        anchorDate,
        missionCount,
        missionIdsCsvHash,
        anchorHash,
        prevAnchorHash,
        computedAt: now,
        jobRunId,
      }
    })

    // ── 7. Audit log ──────────────────────────────────────────────────────
    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'EVIDENCE_LEDGER_JOB',
        action:       'evidence_ledger_anchored',
        resourceType: 'evidence_ledger',
        resourceId:   entry.id,
        detailJson:   JSON.stringify({
          anchorDate:      dateStr,
          missionCount,
          anchorHash,
          prevAnchorHash,
          jobRunId,
          ranAt:           now.toISOString(),
        })
      }
    })

    log.info('evidence_ledger_anchored', {
      data: { jobRunId, anchorDate: dateStr, missionCount, anchorHash, prevAnchorHash }
    })

    // ── 8. Write to external append-only log ─────────────────────────────
    // Format: one JSON line per entry (NDJSON) — easy to parse, hard to forge without
    // breaking the hash chain. Each line contains the full anchor inputs so the chain
    // can be verified independently of the DB.
    //
    // A DGCA/IAF auditor can verify this file with a simple script:
    //   prevHash = GENESIS_HASH
    //   for each line:
    //     recompute = SHA256(date | missionCount | missionIdsCsvHash | prevHash)
    //     assert recompute === anchorHash
    //     prevHash = anchorHash
    const logLine = JSON.stringify({
      v:                  1,           // log format version
      anchorDate:         dateStr,
      missionCount,
      missionIdsCsvHash,
      anchorHash,
      prevAnchorHash,
      computedAtUtc:      now.toISOString(),
      jobRunId,
      dbEntryId:          entry.id,
    }) + '\n'

    try {
      fs.appendFileSync(EVIDENCE_LOG_PATH, logLine, { encoding: 'utf8', flag: 'a' })
      log.info('evidence_log_written', { data: { path: EVIDENCE_LOG_PATH, anchorDate: dateStr } })
    } catch (fsErr) {
      // Log file write failure is non-fatal — DB anchor is the primary record.
      // Alert: in production this should page on-call (evidence log is a secondary safety net).
      log.error('evidence_log_write_failed', {
        data: { path: EVIDENCE_LOG_PATH, error: fsErr instanceof Error ? fsErr.message : String(fsErr) }
      })
    }

    // ── 9. Publish to external trust anchors ──────────────────────────
    // Defense against Threat 2 (external trust anchoring absence) and
    // Threat 3 (long-term rewrite with total stack control).
    // External anchors cannot be rewritten by an attacker who controls this server.
    const anchorPayload: AnchorPayload = {
      anchorDate:        dateStr,
      missionCount,
      missionIdsCsvHash,
      anchorHash,
      prevAnchorHash,
      computedAtUtc:     now.toISOString(),
      jobRunId,
      platformVersion:   'JADS-4.0',
    }

    let externalReceipts: AnchorReceipt[] = []
    try {
      const result = await this.externalAnchor.publishAnchor(anchorPayload)
      externalReceipts = result.receipts
      if (result.published) {
        log.info('external_anchor_published', {
          data: { anchorDate: dateStr, backends: externalReceipts.filter(r => r.success).map(r => r.backend) }
        })
      }
    } catch (extErr) {
      log.error('external_anchor_error', {
        data: { error: extErr instanceof Error ? extErr.message : String(extErr) }
      })
    }

    return {
      status: 'ANCHORED', anchorDate: dateStr, missionCount, anchorHash, prevAnchorHash,
      externalReceipts,
    }
  }

  // ── Forensic verification: recompute and compare a stored anchor ──────────
  async verifyAnchor(anchorDate: Date): Promise<AnchorVerificationResult> {
    const dateStr = this.formatDate(anchorDate)

    const stored = await this.prisma.evidenceLedger.findFirst({ where: { anchorDate } })
    if (!stored) return { verified: false, reason: 'NO_ANCHOR_FOR_DATE', anchorDate: dateStr }

    // Re-fetch missions for that day
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`)
    const missions = await this.prisma.droneMission.findMany({
      where: { uploadedAt: { gte: dayStart, lte: dayEnd } },
      select: { missionId: true },
      orderBy: { missionId: 'asc' },
    })

    const currentIds      = missions.map(m => m.missionId)
    const csv             = currentIds.join(',')
    const recomputedCsvHash = crypto.createHash('sha256').update(csv, 'utf8').digest('hex')

    const anchorInput      = `${dateStr}|${currentIds.length}|${recomputedCsvHash}|${stored.prevAnchorHash}`
    const recomputedAnchor = crypto.createHash('sha256').update(anchorInput, 'utf8').digest('hex')

    const csvHashMatches    = recomputedCsvHash === stored.missionIdsCsvHash
    const anchorMatches     = recomputedAnchor  === stored.anchorHash
    const countMatches      = currentIds.length === stored.missionCount
    const verified          = csvHashMatches && anchorMatches && countMatches

    return {
      verified,
      anchorDate:          dateStr,
      storedAnchorHash:    stored.anchorHash,
      recomputedAnchorHash: recomputedAnchor,
      storedMissionCount:  stored.missionCount,
      currentMissionCount: currentIds.length,
      countMatches,
      csvHashMatches,
      anchorMatches,
      reason: verified ? 'OK' :
        !countMatches    ? `MISSION_COUNT_MISMATCH: stored=${stored.missionCount} current=${currentIds.length}` :
        !csvHashMatches  ? 'CSV_HASH_MISMATCH: mission list changed (insertion or deletion detected)' :
                           'ANCHOR_HASH_MISMATCH: anchor was tampered',
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private yesterdayUtc(now: Date): Date {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - 1)
    d.setUTCHours(0, 0, 0, 0)
    return d
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10)  // "YYYY-MM-DD"
  }
}

// ── Return types ──────────────────────────────────────────────────────────────

export interface LedgerRunResult {
  status:            'ANCHORED' | 'ALREADY_ANCHORED'
  anchorDate:        string
  missionCount?:     number
  anchorHash:        string
  prevAnchorHash?:   string
  externalReceipts?: AnchorReceipt[]
}

export interface AnchorVerificationResult {
  verified:              boolean
  anchorDate:            string
  reason:                string
  storedAnchorHash?:     string
  recomputedAnchorHash?: string
  storedMissionCount?:   number
  currentMissionCount?:  number
  countMatches?:         boolean
  csvHashMatches?:       boolean
  anchorMatches?:        boolean
}

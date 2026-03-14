import express from 'express'
import { PrismaClient } from '@prisma/client'
import { env } from '../env'
import { requireAdminAuth } from '../middleware/adminAuthMiddleware'
import { getActiveSseConnectionCount } from '../services/ClearanceService'

const router = express.Router()
const prisma = new PrismaClient()

// GET /api/system/health — public
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: env.JADS_VERSION, timestamp: new Date().toISOString() })
})

// GET /api/system/metrics — structured observability endpoint
// Returns platform operational metrics for monitoring dashboards.
// Admin auth required — not public.
router.get('/metrics', requireAdminAuth, async (_req, res) => {
  try {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // 1. Missions processed in last 24h
    const missionsProcessed24h = await prisma.droneMission.count({
      where: { uploadedAt: { gte: twentyFourHoursAgo } },
    })

    // 2. Average forensic verification time (ms) from audit log
    const verificationLogs = await prisma.auditLog.findMany({
      where: {
        action: { in: ['mission_uploaded', 'forensic_verification_complete'] },
        timestamp: { gte: twentyFourHoursAgo },
      },
      select: { detailJson: true },
      take: 500,
    })

    let totalVerifyMs = 0
    let verifyCount   = 0
    for (const entry of verificationLogs) {
      try {
        const detail = JSON.parse(entry.detailJson ?? '{}')
        if (typeof detail.verificationMs === 'number') {
          totalVerifyMs += detail.verificationMs
          verifyCount++
        }
      } catch { /* skip unparseable */ }
    }
    const avgForensicVerificationMs = verifyCount > 0
      ? Math.round(totalVerifyMs / verifyCount)
      : null

    // 3. Pending TSA timestamps — evidence ledger entries with no TSA response
    const pendingTsaStamps = await prisma.evidenceLedger.count({
      where: { rfc3161TimestampToken: null },
    })

    // 4. Failed uploads in last 24h (audit log entries for failed missions)
    const failedUploads24h = await prisma.auditLog.count({
      where: {
        action: { in: ['mission_upload_failed', 'mission_chain_invalid', 'mission_replay_attempt'] },
        timestamp: { gte: twentyFourHoursAgo },
      },
    })

    // 5. Active SSE connections
    const activeSseConnections = getActiveSseConnectionCount()

    res.json({
      timestamp:                new Date().toISOString(),
      missionsProcessed24h,
      avgForensicVerificationMs,
      pendingTsaStamps,
      failedUploads24h,
      activeSseConnections,
    })
  } catch (e) {
    res.status(500).json({ error: 'METRICS_FETCH_FAILED' })
  }
})

// GET /api/system/adapter-status — public (needed by audit portal too)
router.get('/adapter-status', (_req, res) => {
  const useLive = env.USE_LIVE_ADAPTERS === true || env.USE_LIVE_ADAPTERS === 'true'
  const extStatus = (hasUrl: boolean) => hasUrl && useLive ? 'LIVE' as const : 'STUB' as const

  res.json({
    useLiveAdapters: useLive,
    adapters: [
      { id: 'digital_sky',     name: 'Digital Sky / eGCA',        status: extStatus(!!env.DIGITAL_SKY_BASE_URL), reason: useLive ? null : 'DSP certification pending (6-12 months)' },
      { id: 'aftn_gateway',    name: 'AFTN Gateway (AAI AMHS)',   status: extStatus(!!env.AFTN_GATEWAY_HOST),    reason: useLive ? null : 'BEL partnership required' },
      { id: 'notam',           name: 'NOTAM Feed (AAI)',          status: extStatus(!!env.NOTAM_BASE_URL),       reason: useLive ? null : 'MoU with AAI not yet executed' },
      { id: 'metar',           name: 'METAR Feed (AAI)',          status: extStatus(!!env.METAR_BASE_URL),       reason: useLive ? null : 'MoU with AAI not yet executed' },
      { id: 'egca',            name: 'eGCA / Digital Sky API',    status: extStatus(!!env.DIGITAL_SKY_BASE_URL), reason: useLive ? null : 'eGCA API not yet publicly available' },
      { id: 'uidai',           name: 'UIDAI (Aadhaar KYC)',       status: extStatus(!!env.UIDAI_BASE_URL),       reason: useLive ? null : 'UIDAI license required' },
      { id: 'rfc3161_tsa',     name: 'RFC 3161 Timestamp Auth',   status: extStatus(!!process.env.RFC3161_TSA_URL), reason: useLive ? null : 'Using freetsa.org (dev). Production: eMudhra/CDAC' },
      { id: 'jeppesen',        name: 'Jeppesen Charts',           status: 'STUB' as const,                       reason: 'Jeppesen data agreement pending' },
      { id: 'hash_chain',      name: 'Hash Chain Engine',         status: 'LIVE' as const,  reason: null },
      { id: 'npnt_pa_builder', name: 'NPNT PA Builder',           status: 'LIVE' as const,  reason: null },
      { id: 'forensic_verify', name: 'Forensic Verifier',         status: 'LIVE' as const,  reason: null },
      { id: 'aftn_builder',    name: 'AFTN Message Builder',      status: 'LIVE' as const,  reason: null },
      { id: 'clearance_sse',   name: 'ADC/FIC Clearance SSE',     status: 'LIVE' as const,  reason: null },
    ]
  })
})

export default router

import express from 'express'
import { env } from '../env'
import { requireAdminAuth } from '../middleware/adminAuthMiddleware'

const router = express.Router()

// GET /api/system/health — public
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: env.JADS_VERSION, timestamp: new Date().toISOString() })
})

// GET /api/system/adapter-status — public (needed by audit portal too)
router.get('/adapter-status', (_req, res) => {
  const useLive = env.USE_LIVE_ADAPTERS === true
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
      { id: 'rfc3161_tsa',     name: 'RFC 3161 Timestamp Auth',   status: extStatus(!!env.RFC3161_TSA_URL), reason: useLive ? null : 'Using freetsa.org (dev). Production: eMudhra/CDAC' },
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

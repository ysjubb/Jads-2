import express from 'express'
import { env } from '../env'
import { requireAdminAuth } from '../middleware/adminAuthMiddleware'

const router = express.Router()

// GET /api/system/health — public
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: env.JADS_VERSION, timestamp: new Date().toISOString() })
})

// GET /api/system/adapter-status — admin only
router.get('/adapter-status', requireAdminAuth, (_req, res) => {
  const mode = (url: string) => url && env.USE_LIVE_ADAPTERS ? 'LIVE' : 'STUB'
  res.json({
    status:  'ok',
    version: env.JADS_VERSION,
    adapters: {
      digitalSky: { mode: mode(env.DIGITAL_SKY_BASE_URL) },
      uidai:      { mode: mode(env.UIDAI_BASE_URL) },
      afmlu:      { mode: mode(env.AFMLU_BASE_URL) },
      fir:        { mode: mode(env.FIR_BASE_URL) },
      aftn:       { mode: mode(env.AFTN_GATEWAY_HOST) },
      metar:      { mode: mode(env.METAR_BASE_URL) },
      notam:      { mode: mode(env.NOTAM_BASE_URL) },
    }
  })
})

export default router

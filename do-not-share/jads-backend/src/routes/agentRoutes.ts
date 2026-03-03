import express       from 'express'
import { requireAuth } from '../middleware/authMiddleware'
import { AgentService } from '../services/AgentService'
import { createServiceLogger } from '../logger'

const router      = express.Router()
const agentSvc    = new AgentService()
const log         = createServiceLogger('AgentRoutes')

// GET /api/agents/health — check all agent microservice connectivity
router.get('/health', requireAuth, async (_req, res) => {
  try {
    const status = await agentSvc.healthCheck()
    res.json({ success: true, agents: status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('agent_health_error', { data: { error: msg } })
    res.status(500).json({ error: 'AGENT_HEALTH_CHECK_FAILED' })
  }
})

// POST /api/agents/notam/interpret — interpret a raw NOTAM
router.post('/notam/interpret', requireAuth, async (req, res) => {
  try {
    const { notamRaw, icaoCode } = req.body
    if (!notamRaw) { res.status(400).json({ error: 'notamRaw is required' }); return }
    const result = await agentSvc.interpretNotam(notamRaw, icaoCode)
    res.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('notam_interpret_error', { data: { error: msg } })
    res.status(500).json({ error: 'NOTAM_INTERPRET_FAILED' })
  }
})

// POST /api/agents/forensic/narrate — generate forensic narrative
router.post('/forensic/narrate', requireAuth, async (req, res) => {
  try {
    const result = await agentSvc.narrateForensic(req.body)
    res.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('forensic_narrate_error', { data: { error: msg } })
    res.status(500).json({ error: 'FORENSIC_NARRATE_FAILED' })
  }
})

// POST /api/agents/aftn/draft — draft an AFTN message
router.post('/aftn/draft', requireAuth, async (req, res) => {
  try {
    const result = await agentSvc.draftAftnMessage(req.body)
    res.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('aftn_draft_error', { data: { error: msg } })
    res.status(500).json({ error: 'AFTN_DRAFT_FAILED' })
  }
})

// POST /api/agents/anomaly/analyze — analyze telemetry for anomalies
router.post('/anomaly/analyze', requireAuth, async (req, res) => {
  try {
    const result = await agentSvc.analyzeAnomalies(req.body)
    res.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('anomaly_analyze_error', { data: { error: msg } })
    res.status(500).json({ error: 'ANOMALY_ANALYZE_FAILED' })
  }
})

export default router

// ── Mission Operations Routes ───────────────────────────────────────────
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { OperatorService } from '../services/operatorService'
import { requireAuth, requireRole } from '../middleware/authMiddleware'

const router = express.Router()
const prisma = new PrismaClient()
const operatorService = new OperatorService(prisma)

const ADMIN_ROLES = [
  'GOVT_ADMIN',
  'PLATFORM_SUPER_ADMIN',
  'DGCA_AUDITOR',
  'BCAS_AUDITOR',
  'AAI_AUDITOR',
]

// POST /api/mission-ops/create
// Requires operator token
router.post('/create', async (req, res) => {
  try {
    const operator = await operatorService.verifyOperatorToken(req.headers.authorization)
    const result = await operatorService.createMission(operator.id, req.body)
    res.status(201).json({ success: true, data: result })
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Invalid or missing token' })
    if (err.status === 400) return res.status(400).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/mission-ops/:id/close
// Requires operator token — can only close own missions
router.put('/:id/close', async (req, res) => {
  try {
    const operator = await operatorService.verifyOperatorToken(req.headers.authorization)
    const result = await operatorService.closeMission(req.params.id, operator.id)
    res.json({ success: true, data: result })
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Invalid or missing token' })
    if (err.status === 404) return res.status(404).json({ error: 'Mission not found' })
    if (err.status === 403) return res.status(403).json({ error: 'Not your mission' })
    if (err.status === 400) return res.status(400).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// GET /api/mission-ops/active
// Requires JADS admin JWT — admin portal uses this to see all active missions
router.get('/active', requireAuth, requireRole(ADMIN_ROLES), async (_req, res) => {
  try {
    const missions = await operatorService.getActiveMissions()
    res.json({ success: true, count: missions.length, data: missions })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router

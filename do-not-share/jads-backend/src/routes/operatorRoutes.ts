// ── Operator Registration Routes ────────────────────────────────────────
import express from 'express'
import { OperatorService } from '../services/operatorService'
import { prisma } from '../lib/prisma'

const router = express.Router()
const operatorService = new OperatorService(prisma)

// POST /api/operators/register
// Public endpoint — anyone with a UIN + DGCA license can register
router.post('/register', async (req, res) => {
  try {
    const result = await operatorService.registerOperator(req.body)
    res.status(201).json({
      success: true,
      message: 'Operator registered. Save your token — it will not be shown again.',
      data: result,
    })
  } catch (err: any) {
    if (err.status === 409) return res.status(409).json({ error: 'UIN already registered' })
    if (err.status === 400) return res.status(400).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// GET /api/operators/:uin/status
// Public — check if a UIN is registered in JADS
router.get('/:uin/status', async (req, res) => {
  try {
    const result = await operatorService.getOperatorStatus(req.params.uin)
    res.json({ success: true, data: result })
  } catch (err: any) {
    if (err.status === 404) return res.status(404).json({ error: 'UIN not registered' })
    res.status(500).json({ error: err.message })
  }
})

// GET /api/operators/:uin/missions
// Requires operator token auth
router.get('/:uin/missions', async (req, res) => {
  try {
    const operator = await operatorService.verifyOperatorToken(req.headers.authorization)
    if (operator.uin !== req.params.uin) {
      return res.status(403).json({ error: 'Token does not match UIN' })
    }
    const missions = await operatorService.getOperatorMissions(req.params.uin)
    res.json({ success: true, data: missions })
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Invalid or missing token' })
    res.status(500).json({ error: err.message })
  }
})

export default router

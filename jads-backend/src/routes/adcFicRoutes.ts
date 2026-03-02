import express           from 'express'
import { requireAuth }   from '../middleware/authMiddleware'
import { AdcFicService } from '../services/AdcFicService'
import { serializeForJson } from '../utils/bigintSerializer'

const router  = express.Router()
const service = new AdcFicService()

// GET /api/adc/active — ADC records visible to the requesting user's role.
// FROZEN RULE (P6A): EXERCISE-type ADC records filtered out for civilian roles.
// Government roles (GOVT_PILOT, GOVT_DRONE_OPERATOR, auditors) see all types.
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { role, entityCode } = req.auth!
    const records = await service.getActiveAdcForRole(role, entityCode)
    res.json(serializeForJson({
      success:          true,
      records,
      count:            records.length,
      retrieved_at_utc: new Date().toISOString(),
      scope_applied:    role
    }))
  } catch {
    res.status(500).json({ success: false, error: 'ADC_FETCH_FAILED' })
  }
})

// GET /api/adc/afmlu/:afmluId — records from a specific AFMLU
// AFMLU ID must be 1-10. Any other value returns 400 (not empty list).
router.get('/afmlu/:afmluId', requireAuth, async (req, res) => {
  try {
    const afmluId = parseInt(req.params.afmluId)
    if (isNaN(afmluId) || afmluId < 1 || afmluId > 10) {
      res.status(400).json({ success: false, error: 'INVALID_AFMLU_ID', detail: 'AFMLU ID must be integer 1-10' })
      return
    }
    const { role } = req.auth!
    const records  = await service.getAdcByAfmlu(afmluId, role)
    res.json(serializeForJson({ success: true, records, afmluId, count: records.length }))
  } catch {
    res.status(500).json({ success: false, error: 'ADC_FETCH_FAILED' })
  }
})

// GET /api/fic/active — FIC records for pre-flight briefing.
// FICs are published documents — all authenticated users see all FICs.
// Optional ?fir=VIDF to filter by FIR code.
router.get('/fic/active', requireAuth, async (req, res) => {
  try {
    const firCode = req.query.fir as string | undefined
    const records = await service.getActiveFic(firCode)
    res.json(serializeForJson({
      success:          true,
      records,
      count:            records.length,
      retrieved_at_utc: new Date().toISOString()
    }))
  } catch {
    res.status(500).json({ success: false, error: 'FIC_FETCH_FAILED' })
  }
})

// GET /api/fic/:ficNumber — specific FIC by number
router.get('/fic/:ficNumber', requireAuth, async (req, res) => {
  try {
    const fic = await service.getFicByNumber(req.params.ficNumber)
    if (!fic) {
      res.status(404).json({ success: false, error: 'FIC_NOT_FOUND' })
      return
    }
    res.json(serializeForJson({ success: true, fic }))
  } catch {
    res.status(500).json({ success: false, error: 'FIC_FETCH_FAILED' })
  }
})

export default router

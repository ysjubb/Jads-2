// Inbound push webhook routes for AFMLU and FIR office integrations.
// Authentication: X-JADS-Adapter-Key (pre-shared key, not user JWT).
// These endpoints are called BY government systems, not by pilots.
//
// AFMLU accepts a flight plan → calls POST /api/adapter/adc/push
// FIR accepts a flight plan   → calls POST /api/adapter/fic/push
//
// Both endpoints are idempotent: pushing the same ADC/FIC number twice
// produces the same result as pushing it once.

import express           from 'express'
import { PrismaClient }  from '@prisma/client'
import { ClearanceService } from '../services/ClearanceService'
import { requireAdapterAuth } from '../middleware/adapterAuthMiddleware'
import { createServiceLogger } from '../logger'

const router  = express.Router()
const prisma  = new PrismaClient()
const service = new ClearanceService(prisma)
const log     = createServiceLogger('AdapterWebhookRoutes')

// All adapter routes require the shared adapter key
router.use(requireAdapterAuth)

// ── POST /api/adapter/adc/push ────────────────────────────────────────────
// Called by AFMLU systems when they accept a flight plan and issue an ADC number.
// The pilot's app receives the ADC number via SSE within ~1 second.
//
// Request body:
//   {
//     flightPlanId:     string  — JADS DB id of the flight plan
//     afmluId:          number  — AFMLU identifier (1–10)
//     adcNumber:        string  — e.g. "ADC-007-2024-00341"
//     adcType:          string  — RESTRICTED | PROHIBITED | DANGER | CONTROLLED
//     issuedAt:         string  — ISO 8601 from AFMLU system clock
//     afmluOfficerName: string  — for audit trail
//   }
router.post('/adc/push', async (req, res) => {
  try {
    const { flightPlanId, afmluId, adcNumber, adcType, issuedAt, afmluOfficerName } = req.body

    // Validate required fields
    if (!flightPlanId || !afmluId || !adcNumber || !adcType || !issuedAt || !afmluOfficerName) {
      res.status(400).json({
        error:    'MISSING_REQUIRED_FIELDS',
        required: ['flightPlanId', 'afmluId', 'adcNumber', 'adcType', 'issuedAt', 'afmluOfficerName']
      })
      return
    }

    if (typeof afmluId !== 'number' || afmluId < 1 || afmluId > 10) {
      res.status(400).json({ error: 'INVALID_AFMLU_ID', message: 'afmluId must be 1–10' })
      return
    }

    const result = await service.issueAdc({
      flightPlanId, afmluId, adcNumber, adcType, issuedAt, afmluOfficerName
    })

    log.info('adc_push_accepted', {
      data: { flightPlanId, afmluId, adcNumber, newStatus: result.status }
    })

    res.status(200).json({
      success:         true,
      clearanceStatus: result.status,
      message:         `ADC number ${adcNumber} recorded. Pilot app notified.`
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('not found')) {
      res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND', message: msg })
    } else {
      log.error('adc_push_failed', { data: { error: msg } })
      res.status(500).json({ error: 'ADC_PUSH_FAILED' })
    }
  }
})

// ── POST /api/adapter/fic/push ────────────────────────────────────────────
// Called by FIR office systems when they accept a flight plan and issue a FIC number.
// The pilot's app receives the FIC number via SSE within ~1 second.
//
// Request body:
//   {
//     flightPlanId:   string  — JADS DB id of the flight plan
//     firCode:        string  — VIDF | VABB | VECC | VOMF
//     ficNumber:      string  — e.g. "FIC/VIDF/042/2024"
//     subject:        string  — brief description
//     issuedAt:       string  — ISO 8601 from FIR system clock
//     firOfficerName: string  — for audit trail
//   }
router.post('/fic/push', async (req, res) => {
  try {
    const { flightPlanId, firCode, ficNumber, subject, issuedAt, firOfficerName } = req.body

    if (!flightPlanId || !firCode || !ficNumber || !subject || !issuedAt || !firOfficerName) {
      res.status(400).json({
        error:    'MISSING_REQUIRED_FIELDS',
        required: ['flightPlanId', 'firCode', 'ficNumber', 'subject', 'issuedAt', 'firOfficerName']
      })
      return
    }

    const VALID_FIRS = ['VIDF', 'VABB', 'VECC', 'VOMF']
    if (!VALID_FIRS.includes(firCode)) {
      res.status(400).json({ error: 'INVALID_FIR_CODE', valid: VALID_FIRS })
      return
    }

    const result = await service.issueFic({
      flightPlanId, firCode, ficNumber, subject, issuedAt, firOfficerName
    })

    log.info('fic_push_accepted', {
      data: { flightPlanId, firCode, ficNumber, newStatus: result.status }
    })

    res.status(200).json({
      success:         true,
      clearanceStatus: result.status,
      message:         `FIC number ${ficNumber} recorded. Pilot app notified.`
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('not found')) {
      res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND', message: msg })
    } else {
      log.error('fic_push_failed', { data: { error: msg } })
      res.status(500).json({ error: 'FIC_PUSH_FAILED' })
    }
  }
})

// ── POST /api/adapter/clearance/reject ───────────────────────────────────
// Called when AFMLU or FIR explicitly rejects a flight plan clearance.
router.post('/clearance/reject', async (req, res) => {
  try {
    const { flightPlanId, reason, rejectedBy } = req.body
    if (!flightPlanId || !reason || !rejectedBy) {
      res.status(400).json({
        error:    'MISSING_REQUIRED_FIELDS',
        required: ['flightPlanId', 'reason', 'rejectedBy']
      })
      return
    }

    await service.rejectClearance(flightPlanId, reason, rejectedBy)
    res.json({ success: true, message: 'Clearance rejection recorded. Pilot app notified.' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(msg.includes('not found') ? 404 : 500).json({ error: 'REJECT_FAILED', message: msg })
  }
})

export default router

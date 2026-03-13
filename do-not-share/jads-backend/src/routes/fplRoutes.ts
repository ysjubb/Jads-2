// FPL API Routes — AircraftFlightPlan CRUD + OFPL sync + deconfliction.
// Mounted at /api/fpl in server.ts.
// JADS is a compliance intermediary — AFTN messages are returned, never transmitted.

import { Router, Request, Response } from 'express'
import { PrismaClient }       from '@prisma/client'
import { requireAuth, requireRole } from '../middleware/authMiddleware'
import { AircraftFPLService }  from '../services/AircraftFPLService'
import { DeconflictionEngine } from '../services/DeconflictionEngine'
import { serializeForJson }    from '../utils/bigintSerializer'

const router = Router()
const prisma = new PrismaClient()
const fplService = new AircraftFPLService(prisma)
const deconfliction = new DeconflictionEngine(prisma)

// POST /api/fpl/file — File a new AircraftFlightPlan, fire-and-forget deconfliction
router.post('/file', requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await fplService.fileFromJADS(req.body, req.auth!.userId)

    // Fire-and-forget deconfliction — don't block the response
    deconfliction.checkConflicts('FPL', record.id).then(async advisories => {
      for (const advisory of advisories) {
        await fplService.attachConflictAdvisory(record.id, advisory)
      }
    }).catch(() => { /* logged inside engine */ })

    res.status(201).json(serializeForJson(record))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    res.status(400).json({ error: 'FPL_FILING_FAILED', message: msg })
  }
})

// GET /api/fpl/list — List FPLs with RBAC
router.get('/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'GOVT_ADMIN', 'DGCA_AUDITOR', 'AAI_AUDITOR'].includes(req.auth!.role)
    const filters: any = {}
    if (!isAdmin) filters.userId = req.auth!.userId
    if (req.query.departure) filters.departure = req.query.departure
    if (req.query.destination) filters.destination = req.query.destination
    if (req.query.status) filters.status = req.query.status

    const records = await fplService.list(filters)
    res.json(serializeForJson(records))
  } catch (e) {
    res.status(500).json({ error: 'LIST_FAILED' })
  }
})

// GET /api/fpl/:id — Single FPL with conflictFlags + notamBriefing
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await fplService.getWithConflicts(req.params.id)
    if (!record) { res.status(404).json({ error: 'NOT_FOUND' }); return }
    res.json(serializeForJson(record))
  } catch (e) {
    res.status(500).json({ error: 'GET_FAILED' })
  }
})

// GET /api/fpl/:id/aftn — Generate AFTN string (DO NOT auto-transmit)
router.get('/:id/aftn', requireAuth, async (req: Request, res: Response) => {
  try {
    const aftn = await fplService.buildAftnMessage(req.params.id)
    if (!aftn) { res.status(404).json({ error: 'NOT_FOUND' }); return }
    res.json({
      aftnMessage: aftn,
      warning: 'DO NOT AUTO-TRANSMIT — JADS is a compliance intermediary. Manual dispatch only.',
    })
  } catch (e) {
    res.status(500).json({ error: 'AFTN_BUILD_FAILED' })
  }
})

// POST /api/fpl/sync-ofpl — Sync from AAI OFPL portal (ATCO/ADMIN only)
router.post('/sync-ofpl',
  requireAuth,
  requireRole(['PLATFORM_SUPER_ADMIN', 'GOVT_ADMIN', 'AAI_AUDITOR']),
  async (req: Request, res: Response) => {
    try {
      const result = await fplService.syncFromOFPL(req.body)
      res.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      res.status(500).json({ error: 'SYNC_FAILED', message: msg })
    }
  }
)

// PATCH /api/fpl/:id/activate — Mark FPL as activated
router.patch('/:id/activate', requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await fplService.activate(req.params.id)
    res.json(serializeForJson(record))
  } catch (e) {
    res.status(400).json({ error: 'ACTIVATION_FAILED' })
  }
})

// PATCH /api/fpl/:id/close — Close FPL
router.patch('/:id/close', requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await fplService.close(req.params.id)
    res.json(serializeForJson(record))
  } catch (e) {
    res.status(400).json({ error: 'CLOSE_FAILED' })
  }
})

// PATCH /api/fpl/:id/cancel — Cancel FPL
router.patch('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const record = await fplService.cancel(req.params.id)
    res.json(serializeForJson(record))
  } catch (e) {
    res.status(400).json({ error: 'CANCEL_FAILED' })
  }
})

export default router

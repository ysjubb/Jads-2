import express from 'express'
import { requireAuth } from '../middleware/authMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { prisma } from '../lib/prisma'

const router = express.Router()

// GET /api/notams?fir=VIDF&active=true
router.get('/', requireAuth, async (req, res) => {
  try {
    const fir    = req.query.fir as string | undefined
    const active = req.query.active !== 'false'
    const now    = new Date()

    const notams = await prisma.notamRecord.findMany({
      where: {
        ...(fir && { firCode: fir }),
        ...(active && {
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        }),
      },
      orderBy: { effectiveFrom: 'desc' },
      take: 100,
    })
    res.json(serializeForJson({ success: true, notams, count: notams.length, retrievedAt: now.toISOString() }))
  } catch {
    res.status(500).json({ error: 'NOTAM_FETCH_FAILED' })
  }
})

// GET /api/notams/:notamNumber
router.get('/:notamNumber', requireAuth, async (req, res) => {
  try {
    const notam = await prisma.notamRecord.findFirst({ where: { notamNumber: req.params.notamNumber } })
    if (!notam) { res.status(404).json({ error: 'NOTAM_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, notam }))
  } catch {
    res.status(500).json({ error: 'NOTAM_FETCH_FAILED' })
  }
})

// GET /api/metars/:icao
router.get('/:icao', requireAuth, async (req, res) => {
  try {
    const icao = req.params.icao.toUpperCase()
    if (!/^[A-Z]{4}$/.test(icao)) { res.status(400).json({ error: 'INVALID_ICAO_FORMAT' }); return }

    const cutoff = new Date(Date.now() - 90 * 60000)
    const metar  = await prisma.metarRecord.findFirst({
      where: { icaoCode: icao, observationUtc: { gte: cutoff } },
      orderBy: { observationUtc: 'desc' },
    })

    if (!metar) {
      res.json({ success: true, metar: null, message: 'No recent METAR available.' })
      return
    }

    const ageMinutes = metar.observationUtc ? Math.round((Date.now() - metar.observationUtc.getTime()) / 60000) : null
    res.json(serializeForJson({ success: true, metar, ageMinutes, isStale: (ageMinutes ?? 0) > 60 }))
  } catch {
    res.status(500).json({ error: 'METAR_FETCH_FAILED' })
  }
})

export default router

/**
 * lookupRoutes.ts
 *
 * Reference data API endpoints for all clients (web, Android, iOS).
 * No auth required — these are read-only lookup endpoints.
 */

import { Router } from 'express'
import {
  searchAerodromes,
  validateAerodrome,
  searchAircraftTypes,
  validateCoordinates,
  checkFlightLevel,
} from '../services/lookupService'

const router = Router()

// ── GET /api/lookup/aerodromes/search?q=del ─────────────────────────────────
router.get('/aerodromes/search', (req, res) => {
  const q = (req.query.q as string) || ''
  if (q.length < 1) return res.json({ success: true, results: [] })
  res.json({ success: true, results: searchAerodromes(q) })
})

// ── GET /api/lookup/aerodromes/validate?icao=VIDP ───────────────────────────
router.get('/aerodromes/validate', (req, res) => {
  const icao = (req.query.icao as string) || ''
  if (!icao) return res.status(400).json({ success: false, error: 'Missing icao parameter' })
  res.json({ success: true, ...validateAerodrome(icao) })
})

// ── GET /api/lookup/aircraft-types/search?q=su ──────────────────────────────
router.get('/aircraft-types/search', (req, res) => {
  const q = (req.query.q as string) || ''
  if (q.length < 1) return res.json({ success: true, results: [] })
  res.json({ success: true, results: searchAircraftTypes(q) })
})

// ── POST /api/lookup/coordinates/validate ───────────────────────────────────
router.post('/coordinates/validate', (req, res) => {
  const { latDeg, latMin, latSec, latHemi, lonDeg, lonMin, lonSec, lonHemi } = req.body
  if ([latDeg, latMin, latSec, lonDeg, lonMin, lonSec].some((v) => v === undefined || v === null)) {
    return res.status(400).json({ success: false, error: 'Missing coordinate fields' })
  }
  const result = validateCoordinates(
    Number(latDeg), Number(latMin), Number(latSec), String(latHemi || 'N').toUpperCase(),
    Number(lonDeg), Number(lonMin), Number(lonSec), String(lonHemi || 'E').toUpperCase(),
  )
  res.json({ success: result.valid, ...result })
})

// ── GET /api/lookup/flight-level/check?level=F340&adep=VIDP&ades=VABB&rules=IFR&equipment=S ─
router.get('/flight-level/check', (req, res) => {
  const level = (req.query.level as string) || ''
  const adep = (req.query.adep as string) || ''
  const ades = (req.query.ades as string) || ''
  const rules = (req.query.rules as string) || 'IFR'
  const equipment = (req.query.equipment as string) || 'S'
  if (!level) return res.status(400).json({ success: false, error: 'Missing level parameter' })
  res.json({ success: true, advisory: checkFlightLevel(level, rules, adep, ades, equipment) })
})

export default router

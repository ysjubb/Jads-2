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
import { INDIA_AIP_AERODROMES } from '../services/indiaAIP'
import { prisma } from '../lib/prisma'

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

// ═══════════════════════════════════════════════════════════════════════════════
// Chart Data — Aviation reference data for map overlays (Jeppesen/AAI inflow)
// ═══════════════════════════════════════════════════════════════════════════════

// Derive FIR code from ICAO prefix
function firFromIcao(icao: string): string {
  if (icao.startsWith('VI')) return 'VIDF'
  if (icao.startsWith('VA')) return 'VABB'
  if (icao.startsWith('VO')) return 'VOMF'
  if (icao.startsWith('VE')) return 'VECC'
  return 'UNKNOWN'
}

// ── GET /api/lookup/chart/aerodromes ─────────────────────────────────────────
// Returns all 127 Indian civil aerodromes with coordinates, elevation, and
// transition altitude data from the authoritative India AIP database.
router.get('/chart/aerodromes', (_req, res) => {
  const aerodromes = Object.values(INDIA_AIP_AERODROMES).map((ad) => ({
    icao: ad.icao,
    name: ad.name,
    lat: ad.latDeg,
    lon: ad.lonDeg,
    elevation: ad.elevation,
    transitionAltitude: ad.transitionAltitude,
    transitionLevel: ad.transitionLevel,
    firCode: firFromIcao(ad.icao),
  }))
  res.json({ success: true, aerodromes })
})

// Helper: query ACTIVE AirspaceVersion records by dataType
async function getActiveVersionPayloads(dataType: string): Promise<unknown[]> {
  const now = new Date()
  const records = await prisma.airspaceVersion.findMany({
    where: {
      dataType,
      approvalStatus: 'ACTIVE',
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: now } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
  })
  return records.map((r) => {
    try { return JSON.parse(r.payloadJson) }
    catch { return null }
  }).filter(Boolean)
}

// ── GET /api/lookup/chart/navaids ────────────────────────────────────────────
// Returns ACTIVE navaids from AirspaceVersion (populated by Jeppesen AIRAC import).
// Empty until admin imports data.
router.get('/chart/navaids', async (_req, res) => {
  try {
    const navaids = await getActiveVersionPayloads('NAVAIDS')
    res.json({ success: true, navaids })
  } catch {
    res.json({ success: true, navaids: [] })
  }
})

// ── GET /api/lookup/chart/airways ────────────────────────────────────────────
// Returns ACTIVE airways/routes from AirspaceVersion (populated by Jeppesen AIRAC import).
router.get('/chart/airways', async (_req, res) => {
  try {
    const airways = await getActiveVersionPayloads('AIRWAYS')
    res.json({ success: true, airways })
  } catch {
    res.json({ success: true, airways: [] })
  }
})

// ── GET /api/lookup/chart/fixes ──────────────────────────────────────────────
// Returns ACTIVE waypoints/reporting points from AirspaceVersion (populated by AIRAC import).
router.get('/chart/fixes', async (_req, res) => {
  try {
    const fixes = await getActiveVersionPayloads('WAYPOINTS')
    res.json({ success: true, fixes })
  } catch {
    res.json({ success: true, fixes: [] })
  }
})

export default router

// T09 — Geofence violation detection engine

import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { TelemetryPoint, GeofenceStatus } from '../types/telemetry'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('GeofenceEngine')

// In-memory cache: missionId → last evidence hash
const evidenceChainCache = new Map<string, string>()

/**
 * Check if a telemetry point violates the geofence of its associated
 * Permission Artefact (PA). Runs three checks:
 *   1. Time window (PA validFrom/validTill)
 *   2. Altitude ceiling (altAGL vs PA maxAltitude)
 *   3. Boundary (ray-casting point-in-polygon)
 */
export async function checkGeofence(
  prisma: PrismaClient,
  point: TelemetryPoint,
): Promise<GeofenceStatus> {
  const defaultOk: GeofenceStatus = { inside: true, distanceToEdge: 0, violationType: null }

  // Find the mission's PA for geofence polygon + altitude
  const mission = await prisma.droneMission.findFirst({
    where: { missionId: point.missionId },
    select: { permissionArtefactId: true, missionStartUtcMs: true, missionEndUtcMs: true },
  })
  if (!mission?.permissionArtefactId) return defaultOk

  const pa = await prisma.permissionArtefact.findFirst({
    where: { applicationId: mission.permissionArtefactId },
    select: {
      geofencePolygon: true,
      maxAltitudeMeters: true,
      flightStartTime: true,
      flightEndTime: true,
    },
  })
  if (!pa) return defaultOk

  // ── Check 1: Time window ──
  const now = new Date(point.ts)
  if (now < pa.flightStartTime || now > pa.flightEndTime) {
    return { inside: false, distanceToEdge: 0, violationType: 'TIME' }
  }

  // ── Check 2: Altitude ceiling ──
  if (point.altAGL > pa.maxAltitudeMeters) {
    const excess = point.altAGL - pa.maxAltitudeMeters
    return { inside: false, distanceToEdge: -excess, violationType: 'ALTITUDE' }
  }

  // ── Check 3: Boundary (ray-casting point-in-polygon) ──
  const polygon = pa.geofencePolygon as { coordinates?: number[][][] }
  if (polygon?.coordinates?.[0]) {
    const ring = polygon.coordinates[0]
    if (!pointInPolygon(point.lat, point.lon, ring)) {
      const dist = distanceToPolygonEdge(point.lat, point.lon, ring)
      return { inside: false, distanceToEdge: -dist, violationType: 'BOUNDARY' }
    }
  }

  return defaultOk
}

/**
 * Record a geofence violation with SHA-256 evidence chain hash.
 */
export async function recordViolation(
  prisma: PrismaClient,
  point: TelemetryPoint,
  status: GeofenceStatus,
): Promise<void> {
  // Map local violation type to DB violation type
  const typeMap: Record<string, string> = {
    ALTITUDE: 'ALTITUDE_VIOLATION',
    BOUNDARY: 'GEOFENCE_BREACH',
    TIME:     'TIME_WINDOW_VIOLATION',
  }
  const violationType = typeMap[status.violationType!] || 'GEOFENCE_BREACH'

  // Compute severity based on distance/type
  const severity = computeSeverity(status)

  // Evidence chain hash
  const prevHash = evidenceChainCache.get(point.missionId) ||
    crypto.createHash('sha256').update(`MISSION_INIT:${point.missionId}`).digest('hex')

  const detail = {
    violationType: status.violationType,
    distanceToEdge: status.distanceToEdge,
    lat: point.lat,
    lon: point.lon,
    altAGL: point.altAGL,
    ts: point.ts,
  }
  const detailJson = JSON.stringify(detail)

  const evidencePayload = `${detailJson}|${prevHash}`
  const evidenceHash = crypto.createHash('sha256').update(evidencePayload).digest('hex')
  evidenceChainCache.set(point.missionId, evidenceHash)

  await prisma.geofenceViolation.create({
    data: {
      missionId:        point.missionId,
      uin:              point.uin,
      violationType,
      severity,
      lat:              point.lat,
      lon:              point.lon,
      altAGL:           point.altAGL,
      detailJson,
      evidenceHash,
      prevEvidenceHash: prevHash,
    },
  })

  log.info('violation_recorded', {
    data: { missionId: point.missionId, violationType, severity, evidenceHash },
  })
}

function computeSeverity(status: GeofenceStatus): string {
  if (status.violationType === 'TIME') return 'HIGH'
  if (status.violationType === 'BOUNDARY') {
    return Math.abs(status.distanceToEdge) > 500 ? 'CRITICAL' : 'HIGH'
  }
  if (status.violationType === 'ALTITUDE') {
    return Math.abs(status.distanceToEdge) > 50 ? 'CRITICAL' : 'MEDIUM'
  }
  return 'MEDIUM'
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0] // GeoJSON is [lon, lat]
    const xj = ring[j][1], yj = ring[j][0]
    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Approximate minimum distance from point to polygon edge in metres.
 */
function distanceToPolygonEdge(lat: number, lon: number, ring: number[][]): number {
  let minDist = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const d = distToSegment(
      lat, lon,
      ring[i][1], ring[i][0],     // GeoJSON [lon, lat]
      ring[i + 1][1], ring[i + 1][0],
    )
    if (d < minDist) minDist = d
  }
  return minDist
}

/**
 * Approximate distance from point to line segment in metres (Haversine-based).
 */
function distToSegment(
  plat: number, plon: number,
  alat: number, alon: number,
  blat: number, blon: number,
): number {
  // Project point onto segment and compute Haversine distance
  const dx = blat - alat
  const dy = blon - alon
  if (dx === 0 && dy === 0) return haversineM(plat, plon, alat, alon)

  let t = ((plat - alat) * dx + (plon - alon) * dy) / (dx * dx + dy * dy)
  t = Math.max(0, Math.min(1, t))
  return haversineM(plat, plon, alat + t * dx, alon + t * dy)
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

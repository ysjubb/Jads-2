/**
 * PALifecycleService.ts
 *
 * Permission Artefact lifecycle state machine for NPNT (No Permission No Takeoff)
 * compliance under DGCA UAS Rules 2021.
 *
 * State transitions:
 *   PENDING -> APPROVED -> DOWNLOADED -> LOADED -> ACTIVE -> COMPLETED -> LOG_UPLOADED -> AUDIT_COMPLETE
 *   PENDING -> REJECTED   (terminal)
 *   Any non-terminal -> EXPIRED   (via expireOldPAs cron)
 *   Any non-terminal -> REVOKED   (manual revocation)
 *
 * processFlightLog verifies:
 *   1. JWT signature on log bundle
 *   2. GPS track extraction from payload
 *   3. Geofence deviation check (> 50m from PA polygon boundary)
 *   4. Timestamp window compliance (flight times within PA window)
 *   5. Violation recording and AuditLog write
 */

import { PrismaClient, PAStatus } from '@prisma/client'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { createServiceLogger } from '../logger'
import { resolveEgcaAdapter } from '../adapters/egca'
import { env } from '../env'

const log = createServiceLogger('PALifecycleService')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PACreatePayload {
  planId:            string
  uinNumber:         string
  pilotId:           string
  operatorId:        string
  primaryZone:       string
  flightStartTime:   Date
  flightEndTime:     Date
  geofencePolygon:   GeoPoint[]
  /**
   * Max altitude in meters AGL (JADS internal convention).
   * Converted to feet at DS adapter boundary (1m ≈ 3.28084ft).
   * DS PA uses feet: maxAltitude attribute in FlightParameters.
   */
  maxAltitudeMeters: number
}

export interface GeoPoint {
  lat: number
  lng: number
}

export interface PAViolation {
  type:        'GEOFENCE_DEVIATION' | 'TIME_WINDOW_VIOLATION' | 'ALTITUDE_VIOLATION'
  severity:    'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  detail:      string
  timestamp?:  string
  deviationM?: number
  point?:      GeoPoint
}

export interface PAViolationReport {
  applicationId:  string
  totalViolations: number
  violations:     PAViolation[]
  compliant:      boolean
  processedAt:    string
}

export interface FlightLogEntry {
  lat:       number
  lng:       number
  altM:      number
  timestamp: string   // ISO 8601
}

// ── Valid State Transitions ───────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<PAStatus, PAStatus[]> = {
  PENDING:        ['APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED', 'CANCELLED'],
  APPROVED:       ['DOWNLOADED', 'EXPIRED', 'REVOKED'],
  DOWNLOADED:     ['LOADED', 'EXPIRED', 'REVOKED', 'CANCELLED'],
  LOADED:         ['ACTIVE', 'EXPIRED', 'REVOKED'],
  ACTIVE:         ['COMPLETED', 'EXPIRED', 'REVOKED'],
  COMPLETED:      ['LOG_UPLOADED', 'EXPIRED', 'REVOKED'],
  LOG_UPLOADED:   ['AUDIT_COMPLETE', 'REVOKED'],
  AUDIT_COMPLETE: [],               // terminal
  EXPIRED:        [],               // terminal
  REJECTED:       [],               // terminal
  REVOKED:        [],               // terminal
  CANCELLED:      [],               // terminal
}

// ── Geo Utility Functions ─────────────────────────────────────────────────────

/**
 * Haversine distance between two points in meters.
 */
function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000 // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Minimum distance from a point to a polygon boundary (all edges) in meters.
 * Uses point-to-segment distance for each edge of the polygon.
 */
function distanceToPolygonM(point: GeoPoint, polygon: GeoPoint[]): number {
  if (polygon.length < 3) return Infinity

  let minDist = Infinity

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const dist = pointToSegmentDistance(point, a, b)
    if (dist < minDist) minDist = dist
  }

  return minDist
}

/**
 * Simple point-in-polygon test using ray casting.
 */
function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
      (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Distance from a point to a line segment (in meters via haversine).
 * Projects the point onto the segment and returns the haversine distance
 * to the nearest point on the segment.
 */
function pointToSegmentDistance(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  // Use simple flat-earth approximation for projection, haversine for distance
  const dx = b.lat - a.lat
  const dy = b.lng - a.lng
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    return haversineMeters(p.lat, p.lng, a.lat, a.lng)
  }

  let t = ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const closestLat = a.lat + t * dx
  const closestLng = a.lng + t * dy

  return haversineMeters(p.lat, p.lng, closestLat, closestLng)
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PALifecycleService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── 1. Create Pending PA ──────────────────────────────────────────────────

  /**
   * Create a new PermissionArtefact in PENDING status.
   * Validates that the applicationId is unique and the DroneOperationPlan exists.
   */
  async createPendingPA(applicationId: string, payload: PACreatePayload) {
    log.info('create_pending_pa', { data: { applicationId, planId: payload.planId } })

    // Validate plan exists
    const plan = await this.prisma.droneOperationPlan.findUnique({
      where: { id: payload.planId },
    })
    if (!plan) {
      throw new Error(`DroneOperationPlan ${payload.planId} not found`)
    }

    const pa = await this.prisma.permissionArtefact.create({
      data: {
        applicationId,
        planId:            payload.planId,
        uinNumber:         payload.uinNumber,
        pilotId:           payload.pilotId,
        operatorId:        payload.operatorId,
        status:            'PENDING',
        primaryZone:       payload.primaryZone,
        flightStartTime:   payload.flightStartTime,
        flightEndTime:     payload.flightEndTime,
        geofencePolygon:   payload.geofencePolygon as unknown as any,
        maxAltitudeMeters: payload.maxAltitudeMeters,
        submittedAt:       new Date(),
      },
    })

    // Audit log
    await this.writeAuditLog('SYSTEM', 'PA_CREATED', 'permission_artefact', pa.id, {
      applicationId,
      planId: payload.planId,
      status: 'PENDING',
    })

    log.info('pa_created', { data: { id: pa.id, applicationId, status: 'PENDING' } })
    return pa
  }

  // ── 2. Poll and Update Status ─────────────────────────────────────────────

  /**
   * Polls eGCA for the current permission status and updates the local PA record.
   * Returns the new PAStatus after update.
   */
  async pollAndUpdateStatus(applicationId: string): Promise<PAStatus> {
    log.info('poll_status', { data: { applicationId } })

    const pa = await this.prisma.permissionArtefact.findUnique({
      where: { applicationId },
    })
    if (!pa) {
      throw new Error(`PermissionArtefact with applicationId ${applicationId} not found`)
    }

    // Only poll if in PENDING status
    if (pa.status !== 'PENDING') {
      log.info('poll_status_skipped', { data: { applicationId, currentStatus: pa.status } })
      return pa.status
    }

    const adapter = resolveEgcaAdapter()
    const egcaStatus = await adapter.getPermissionStatus(applicationId)

    let newStatus: PAStatus = pa.status
    const updateData: Record<string, unknown> = {}

    switch (egcaStatus.status) {
      case 'APPROVED':
        newStatus = 'APPROVED'
        updateData.approvedAt = new Date()
        updateData.permissionArtifactId = egcaStatus.permissionArtifactId ?? null
        break
      case 'REJECTED':
        newStatus = 'REJECTED'
        break
      case 'EXPIRED':
        newStatus = 'EXPIRED'
        break
      case 'PENDING':
        // No change
        break
    }

    if (newStatus !== pa.status) {
      this.validateTransition(pa.status, newStatus)

      await this.prisma.permissionArtefact.update({
        where: { applicationId },
        data:  { status: newStatus, ...updateData },
      })

      await this.writeAuditLog('SYSTEM', 'PA_STATUS_UPDATED', 'permission_artefact', pa.id, {
        applicationId,
        previousStatus: pa.status,
        newStatus,
        egcaRemarks: egcaStatus.remarks,
      })

      log.info('pa_status_updated', { data: { applicationId, from: pa.status, to: newStatus } })
    }

    return newStatus
  }

  // ── 3. Download and Store PA ──────────────────────────────────────────────

  /**
   * Downloads the PA ZIP from eGCA, verifies SHA-256 integrity, and stores
   * the encrypted bytes in rawPaXml.
   */
  async downloadAndStorePA(applicationId: string): Promise<void> {
    log.info('download_pa', { data: { applicationId } })

    const pa = await this.prisma.permissionArtefact.findUnique({
      where: { applicationId },
    })
    if (!pa) {
      throw new Error(`PermissionArtefact with applicationId ${applicationId} not found`)
    }

    if (pa.status !== 'APPROVED') {
      throw new Error(`Cannot download PA in status ${pa.status} — must be APPROVED`)
    }

    const adapter = resolveEgcaAdapter()
    const zipBuffer = await adapter.downloadPermissionArtefact(applicationId)

    // Compute SHA-256 hash
    const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex')

    // Verify hash consistency (if previously downloaded, must match)
    if (pa.paZipHash && pa.paZipHash !== hash) {
      log.error('pa_hash_mismatch', {
        data: { applicationId, expected: pa.paZipHash, actual: hash },
      })
      throw new Error(`PA ZIP hash mismatch for ${applicationId}: expected ${pa.paZipHash}, got ${hash}`)
    }

    this.validateTransition(pa.status, 'DOWNLOADED')

    await this.prisma.permissionArtefact.update({
      where: { applicationId },
      data: {
        status:       'DOWNLOADED',
        rawPaXml:     zipBuffer,
        paZipHash:    hash,
        downloadedAt: new Date(),
      },
    })

    await this.writeAuditLog('SYSTEM', 'PA_DOWNLOADED', 'permission_artefact', pa.id, {
      applicationId,
      zipSizeBytes: zipBuffer.length,
      sha256: hash,
    })

    log.info('pa_downloaded', { data: { applicationId, sha256: hash, sizeBytes: zipBuffer.length } })
  }

  // ── 4. Mark Loaded to Drone ───────────────────────────────────────────────

  /**
   * Records that the PA has been loaded onto a specific drone (identified by UIN).
   * Validates that the drone UIN matches the PA.
   */
  async markLoadedToDrone(applicationId: string, droneUin: string): Promise<void> {
    log.info('mark_loaded', { data: { applicationId, droneUin } })

    const pa = await this.prisma.permissionArtefact.findUnique({
      where: { applicationId },
    })
    if (!pa) {
      throw new Error(`PermissionArtefact with applicationId ${applicationId} not found`)
    }

    if (pa.status !== 'DOWNLOADED') {
      throw new Error(`Cannot mark loaded in status ${pa.status} — must be DOWNLOADED`)
    }

    // Verify drone UIN matches PA
    if (pa.uinNumber !== droneUin) {
      throw new Error(
        `UIN mismatch: PA is for drone ${pa.uinNumber} but loaded to ${droneUin}`
      )
    }

    this.validateTransition(pa.status, 'LOADED')

    await this.prisma.permissionArtefact.update({
      where: { applicationId },
      data: {
        status:          'LOADED',
        loadedToDroneAt: new Date(),
      },
    })

    await this.writeAuditLog('SYSTEM', 'PA_LOADED_TO_DRONE', 'permission_artefact', pa.id, {
      applicationId,
      droneUin,
    })

    log.info('pa_loaded', { data: { applicationId, droneUin } })
  }

  // ── 5. Process Flight Log ─────────────────────────────────────────────────

  /**
   * Processes a signed flight log bundle:
   *   1. Verify JWT signature on the log bundle
   *   2. Extract GPS track from decoded payload
   *   3. Compare GPS track against PA polygon (flag deviations > 50m)
   *   4. Flag timestamps outside the PA time window
   *   5. Store violations and write to AuditLog
   *
   * Returns a PAViolationReport.
   */
  async processFlightLog(
    applicationId: string,
    logBundle: Buffer,
  ): Promise<PAViolationReport> {
    log.info('process_flight_log', { data: { applicationId, bundleSizeBytes: logBundle.length } })

    const pa = await this.prisma.permissionArtefact.findUnique({
      where: { applicationId },
    })
    if (!pa) {
      throw new Error(`PermissionArtefact with applicationId ${applicationId} not found`)
    }

    // PA must be in LOADED or COMPLETED state for log processing
    const validStates: PAStatus[] = ['LOADED', 'ACTIVE', 'COMPLETED']
    if (!validStates.includes(pa.status)) {
      throw new Error(
        `Cannot process flight log in status ${pa.status} — must be LOADED, ACTIVE, or COMPLETED`
      )
    }

    // Step 1: Verify JWT signature on the log bundle
    let logPayload: { entries: FlightLogEntry[] }
    try {
      const decoded = jwt.verify(logBundle.toString('utf-8'), env.JWT_SECRET) as Record<string, unknown>
      logPayload = decoded as unknown as { entries: FlightLogEntry[] }
    } catch (err) {
      throw new Error(
        `Flight log JWT verification failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (!logPayload.entries || !Array.isArray(logPayload.entries)) {
      throw new Error('Flight log bundle missing entries array')
    }

    // Step 2-4: Extract GPS track and check against PA constraints
    const polygon = pa.geofencePolygon as unknown as GeoPoint[]
    const violations: PAViolation[] = []
    const GEOFENCE_THRESHOLD_M = 50

    for (const entry of logPayload.entries) {
      const point: GeoPoint = { lat: entry.lat, lng: entry.lng }

      // Check geofence compliance
      const isInside = pointInPolygon(point, polygon)
      if (!isInside) {
        const distToEdge = distanceToPolygonM(point, polygon)
        if (distToEdge > GEOFENCE_THRESHOLD_M) {
          violations.push({
            type:        'GEOFENCE_DEVIATION',
            severity:    distToEdge > 200 ? 'CRITICAL' : distToEdge > 100 ? 'HIGH' : 'MEDIUM',
            detail:      `GPS point (${entry.lat}, ${entry.lng}) is ${Math.round(distToEdge)}m outside PA polygon boundary`,
            timestamp:   entry.timestamp,
            deviationM:  Math.round(distToEdge),
            point,
          })
        }
      }

      // Check timestamp window
      const entryTime = new Date(entry.timestamp)
      if (entryTime < pa.flightStartTime || entryTime > pa.flightEndTime) {
        violations.push({
          type:      'TIME_WINDOW_VIOLATION',
          severity:  'HIGH',
          detail:    `Telemetry at ${entry.timestamp} is outside PA window [${pa.flightStartTime.toISOString()} - ${pa.flightEndTime.toISOString()}]`,
          timestamp: entry.timestamp,
        })
      }

      // Check altitude
      if (entry.altM > pa.maxAltitudeMeters) {
        violations.push({
          type:     'ALTITUDE_VIOLATION',
          severity: entry.altM > pa.maxAltitudeMeters * 1.5 ? 'CRITICAL' : 'HIGH',
          detail:   `Altitude ${entry.altM}m exceeds PA limit of ${pa.maxAltitudeMeters}m`,
          timestamp: entry.timestamp,
        })
      }
    }

    // Step 5: Compute flight log hash and store results
    const logHash = crypto.createHash('sha256').update(logBundle).digest('hex')
    const report: PAViolationReport = {
      applicationId,
      totalViolations: violations.length,
      violations,
      compliant:       violations.length === 0,
      processedAt:     new Date().toISOString(),
    }

    // Determine new status based on current state
    let newStatus: PAStatus = 'LOG_UPLOADED'
    if (pa.status === 'LOADED' || pa.status === 'ACTIVE') {
      // Transition through COMPLETED -> LOG_UPLOADED
      newStatus = 'LOG_UPLOADED'
    }

    await this.prisma.permissionArtefact.update({
      where: { applicationId },
      data: {
        status:              newStatus,
        flightLogUploadedAt: new Date(),
        flightLogHash:       logHash,
        violations:          report as any,
      },
    })

    // Write to AuditLog
    await this.writeAuditLog('SYSTEM', 'PA_FLIGHT_LOG_PROCESSED', 'permission_artefact', pa.id, {
      applicationId,
      logHash,
      totalViolations: violations.length,
      compliant:       violations.length === 0,
      violationTypes:  [...new Set(violations.map(v => v.type))],
    })

    // Upload log to eGCA as well
    try {
      const adapter = resolveEgcaAdapter()
      await adapter.uploadFlightLog(applicationId, logBundle)
      log.info('flight_log_uploaded_to_egca', { data: { applicationId } })
    } catch (err) {
      log.warn('flight_log_egca_upload_failed', {
        data: { applicationId, error: err instanceof Error ? err.message : String(err) },
      })
      // Do not fail the overall operation — local processing is complete
    }

    log.info('flight_log_processed', {
      data: {
        applicationId,
        totalViolations: violations.length,
        compliant: violations.length === 0,
      },
    })

    return report
  }

  // ── 6. Expire Old PAs ────────────────────────────────────────────────────

  /**
   * Expires all PAs whose flightEndTime has passed and are still in a
   * non-terminal status. Intended to be called by a cron job.
   * Returns the number of PAs expired.
   */
  async expireOldPAs(): Promise<number> {
    log.info('expire_old_pas_start', { data: {} })

    const now = new Date()
    const nonTerminalStatuses: PAStatus[] = [
      'PENDING', 'APPROVED', 'DOWNLOADED', 'LOADED', 'ACTIVE', 'COMPLETED',
    ]

    const expiredPAs = await this.prisma.permissionArtefact.findMany({
      where: {
        status:        { in: nonTerminalStatuses },
        flightEndTime: { lt: now },
      },
    })

    if (expiredPAs.length === 0) {
      log.info('expire_old_pas_none', { data: {} })
      return 0
    }

    await this.prisma.permissionArtefact.updateMany({
      where: {
        id: { in: expiredPAs.map(pa => pa.id) },
      },
      data: {
        status: 'EXPIRED',
      },
    })

    // Write audit log for each expired PA
    for (const pa of expiredPAs) {
      await this.writeAuditLog('SYSTEM', 'PA_EXPIRED', 'permission_artefact', pa.id, {
        applicationId:  pa.applicationId,
        previousStatus: pa.status,
        flightEndTime:  pa.flightEndTime.toISOString(),
        expiredAt:      now.toISOString(),
      })
    }

    log.info('expire_old_pas_complete', {
      data: { count: expiredPAs.length, ids: expiredPAs.map(pa => pa.applicationId) },
    })

    return expiredPAs.length
  }

  // ── 7. Revoke PA ─────────────────────────────────────────────────────────

  /**
   * Revoke a PA regardless of its current non-terminal status.
   * Records the reason and timestamp.
   */
  async revokePA(applicationId: string, reason: string): Promise<void> {
    log.info('revoke_pa', { data: { applicationId, reason } })

    const pa = await this.prisma.permissionArtefact.findUnique({
      where: { applicationId },
    })
    if (!pa) {
      throw new Error(`PermissionArtefact with applicationId ${applicationId} not found`)
    }

    const terminalStatuses: PAStatus[] = ['EXPIRED', 'REJECTED', 'REVOKED', 'AUDIT_COMPLETE']
    if (terminalStatuses.includes(pa.status)) {
      throw new Error(
        `Cannot revoke PA in terminal status ${pa.status}`
      )
    }

    this.validateTransition(pa.status, 'REVOKED')

    await this.prisma.permissionArtefact.update({
      where: { applicationId },
      data: {
        status:       'REVOKED',
        revokedAt:    new Date(),
        revokeReason: reason,
      },
    })

    await this.writeAuditLog('SYSTEM', 'PA_REVOKED', 'permission_artefact', pa.id, {
      applicationId,
      previousStatus: pa.status,
      reason,
    })

    log.info('pa_revoked', { data: { applicationId, previousStatus: pa.status } })
  }

  // ── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Validate that a state transition is allowed.
   * Throws if the transition is not in the VALID_TRANSITIONS map.
   */
  private validateTransition(from: PAStatus, to: PAStatus): void {
    const allowed = VALID_TRANSITIONS[from]
    if (!allowed || !allowed.includes(to)) {
      throw new Error(
        `Invalid PA state transition: ${from} -> ${to}. ` +
        `Allowed transitions from ${from}: [${(allowed ?? []).join(', ')}]`
      )
    }
  }

  /**
   * Write an audit log entry for PA lifecycle events.
   */
  private async writeAuditLog(
    actorId:      string,
    action:       string,
    resourceType: string,
    resourceId:   string,
    detail:       Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorType:    'SYSTEM',
          action,
          resourceType,
          resourceId,
          detailJson:   JSON.stringify(detail),
        },
      })
    } catch (err) {
      log.error('audit_log_write_failed', {
        data: { action, resourceId, error: err instanceof Error ? err.message : String(err) },
      })
    }
  }
}

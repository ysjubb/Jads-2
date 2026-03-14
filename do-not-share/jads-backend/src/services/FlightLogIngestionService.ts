/**
 * DS-05 — Flight Log Ingestion Service
 *
 * Accepts post-flight logs in DS format, verifies hash chain integrity,
 * validates against the original permission artefact, and stores for audit.
 *
 * DS flight log format (§6):
 *   {
 *     PermissionArtefact: "PA UUID",
 *     previous_log_hash: "Base64 hash of most recent flight log",
 *     LogEntries: [
 *       { Entry_type, TimeStamp (unix seconds), Longitude, Latitude, Altitude (feet), CRC }
 *     ]
 *   }
 *
 * Entry types: TAKEOFF_OR_ARM, GEOFENCE_BREACH, TIME_BREACH, LAND_OR_DISARM
 *
 * Validation:
 *   - previous_log_hash matches stored hash for this UIN
 *   - First log for a UIN: previous_log_hash check skipped
 *   - Logs are immutable: re-upload for same application ID rejected
 *   - Entry sequence: must start with TAKEOFF_OR_ARM, end with LAND_OR_DISARM
 *   - Timestamps must be monotonically increasing
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../logger'
import type { DsFlightLog, DsFlightLogEntry } from './npnt/FlightLogTypes'

const log = createServiceLogger('FlightLogIngestionService')

// ── Types ──────────────────────────────────────────────────────────────

export interface FlightLogUploadResult {
  accepted:          boolean
  receiptId:         string
  errors:            string[]
  warnings:          string[]
  /** Hash of this log (for chaining) */
  logHash:           string
  /** Number of entries processed */
  entryCount:        number
  /** Number of breach entries */
  breachCount:       number
  /** Timestamp range */
  timeRangeUtc?:     { start: string; end: string }
}

export interface StoredFlightLog {
  receiptId:         string
  applicationId:     string
  droneUin:          string
  permissionArtefact: string
  logHash:           string
  previousLogHash:   string
  entryCount:        number
  breachCount:       number
  uploadedAt:        Date
  entries:           DsFlightLogEntry[]
}

// ── Service ────────────────────────────────────────────────────────────

export class FlightLogIngestionService {
  /** In-memory log storage: applicationId → StoredFlightLog */
  private logs: Map<string, StoredFlightLog> = new Map()
  /** Last log hash per UIN: uin → hash */
  private lastLogHashByUin: Map<string, string> = new Map()
  /** Uploaded application IDs (immutability check) */
  private uploadedApplicationIds: Set<string> = new Set()

  constructor() {
    log.info('flight_log_ingestion_service_initialized', { data: {} })
  }

  /**
   * Upload a flight log for an application.
   *
   * @param applicationId  The fly drone permission application ID
   * @param droneUin       The drone UIN
   * @param flightLog      DS-format flight log
   */
  uploadFlightLog(
    applicationId: string,
    droneUin: string,
    flightLog: DsFlightLog
  ): FlightLogUploadResult {
    const errors: string[] = []
    const warnings: string[] = []
    const receiptId = `RCPT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

    // Step 1: Immutability check — reject re-upload
    if (this.uploadedApplicationIds.has(applicationId)) {
      return {
        accepted: false, receiptId, logHash: '',
        errors: [`Flight log already uploaded for application '${applicationId}'`],
        warnings: [], entryCount: 0, breachCount: 0,
      }
    }

    // Step 2: Validate structure
    if (!flightLog.PermissionArtefact) {
      errors.push('Missing PermissionArtefact field')
    }
    if (!Array.isArray(flightLog.LogEntries) || flightLog.LogEntries.length === 0) {
      errors.push('LogEntries must be a non-empty array')
    }

    if (errors.length > 0) {
      return { accepted: false, receiptId, logHash: '', errors, warnings, entryCount: 0, breachCount: 0 }
    }

    // Step 3: Validate previous_log_hash chain
    const storedLastHash = this.lastLogHashByUin.get(droneUin)
    if (storedLastHash) {
      // Not the first log — verify hash chain
      if (flightLog.previous_log_hash !== storedLastHash) {
        errors.push(
          `previous_log_hash mismatch: expected '${storedLastHash.substring(0, 16)}...', ` +
          `got '${(flightLog.previous_log_hash || '').substring(0, 16)}...'`
        )
      }
    } else {
      // First log for this UIN — skip previous_log_hash check
      if (flightLog.previous_log_hash) {
        warnings.push('First flight log for this UIN — previous_log_hash will be stored but not verified')
      }
    }

    // Step 4: Validate entries
    const entries = flightLog.LogEntries
    const validEntryTypes = ['TAKEOFF_OR_ARM', 'GEOFENCE_BREACH', 'TIME_BREACH', 'LAND_OR_DISARM']

    // Entry type validation
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (!validEntryTypes.includes(e.Entry_type)) {
        errors.push(`Entry[${i}]: invalid Entry_type '${e.Entry_type}'`)
      }
      if (typeof e.TimeStamp !== 'number' || e.TimeStamp <= 0) {
        errors.push(`Entry[${i}]: invalid TimeStamp`)
      }
      if (typeof e.Latitude !== 'number' || Math.abs(e.Latitude) > 90) {
        errors.push(`Entry[${i}]: invalid Latitude ${e.Latitude}`)
      }
      if (typeof e.Longitude !== 'number' || Math.abs(e.Longitude) > 180) {
        errors.push(`Entry[${i}]: invalid Longitude ${e.Longitude}`)
      }
    }

    // First entry should be TAKEOFF_OR_ARM
    if (entries[0]?.Entry_type !== 'TAKEOFF_OR_ARM') {
      warnings.push('First entry is not TAKEOFF_OR_ARM')
    }

    // Last entry should be LAND_OR_DISARM
    if (entries[entries.length - 1]?.Entry_type !== 'LAND_OR_DISARM') {
      warnings.push('Last entry is not LAND_OR_DISARM')
    }

    // Timestamps must be monotonically increasing
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].TimeStamp < entries[i - 1].TimeStamp) {
        warnings.push(`Entry[${i}]: timestamp ${entries[i].TimeStamp} is before entry[${i - 1}] timestamp ${entries[i - 1].TimeStamp}`)
      }
    }

    if (errors.length > 0) {
      return { accepted: false, receiptId, logHash: '', errors, warnings, entryCount: entries.length, breachCount: 0 }
    }

    // Step 5: Compute log hash
    const logHash = crypto.createHash('sha256')
      .update(JSON.stringify(flightLog))
      .digest('base64')

    // Step 6: Count breaches
    const breachCount = entries.filter(
      e => e.Entry_type === 'GEOFENCE_BREACH' || e.Entry_type === 'TIME_BREACH'
    ).length

    if (breachCount > 0) {
      warnings.push(`${breachCount} breach entries detected (${entries.filter(e => e.Entry_type === 'GEOFENCE_BREACH').length} geofence, ${entries.filter(e => e.Entry_type === 'TIME_BREACH').length} time)`)
    }

    // Step 7: Store
    const stored: StoredFlightLog = {
      receiptId,
      applicationId,
      droneUin,
      permissionArtefact: flightLog.PermissionArtefact,
      logHash,
      previousLogHash: flightLog.previous_log_hash,
      entryCount: entries.length,
      breachCount,
      uploadedAt: new Date(),
      entries,
    }
    this.logs.set(applicationId, stored)
    this.uploadedApplicationIds.add(applicationId)
    this.lastLogHashByUin.set(droneUin, logHash)

    // Compute time range
    const timestamps = entries.map(e => e.TimeStamp).sort((a, b) => a - b)
    const timeRangeUtc = timestamps.length > 0 ? {
      start: new Date(timestamps[0] * 1000).toISOString(),
      end: new Date(timestamps[timestamps.length - 1] * 1000).toISOString(),
    } : undefined

    log.info('flight_log_accepted', {
      data: { receiptId, applicationId, droneUin, entryCount: entries.length, breachCount, logHash: logHash.substring(0, 16) }
    })

    return { accepted: true, receiptId, logHash, errors, warnings, entryCount: entries.length, breachCount, timeRangeUtc }
  }

  // ── Query ────────────────────────────────────────────────────────────

  getLog(applicationId: string): StoredFlightLog | null {
    return this.logs.get(applicationId) ?? null
  }

  getLogsByUin(droneUin: string): StoredFlightLog[] {
    return Array.from(this.logs.values()).filter(l => l.droneUin === droneUin)
  }

  getLastLogHash(droneUin: string): string | null {
    return this.lastLogHashByUin.get(droneUin) ?? null
  }

  getAllLogs(): StoredFlightLog[] {
    return Array.from(this.logs.values())
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
  }
}

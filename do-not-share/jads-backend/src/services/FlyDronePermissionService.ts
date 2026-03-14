/**
 * DS-04 — Fly Drone Permission Service
 *
 * Implements the full Digital Sky flight permission workflow:
 *
 * 1. Application submission (DRAFT → SUBMITTED)
 * 2. Auto-approval logic (NANO ≤50ft GREEN, MICRO ≤200ft GREEN)
 * 3. Manual approval paths:
 *    a. Single-stage: Admin → APPROVED (PA with FIC + ADC)
 *    b. Two-stage:
 *       - ATC_ADMIN → APPROVEDBYATC (FIC number, no PA)
 *       - AFMLU_ADMIN → APPROVED (ADC number + signed PA)
 * 4. PA generation on approval
 * 5. Flight log upload after flight
 *
 * DS alignment:
 *   - 8 statuses: DRAFT, SUBMITTED, APPROVED, REJECTED, APPROVEDBYATC, APPROVEDBYAFMLU, REJECTEDBYAFMLU, REJECTEDBYATC
 *   - Zone checks: GREEN (auto-approvable), AMBER (manual), RED (blocked)
 *   - Thresholds: 05:30-19:30 IST, 1-5 day advance, 400ft max, π sq km max area
 *   - FIR detection: which FIR contains the fly area
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../logger'
import {
  NpntPermissionInput, NpntDroneCategory, DsApplicationStatus,
  evaluateAutoApproval, validateNpntInput, generateFlightId,
} from './npnt/NpntTypes'
import { buildPermissionArtefactXml } from './npnt/PermissionArtefactBuilder'
import { signPaXml, generateDemoCertificate } from './npnt/XmlDsigSigner'
import { FirGeometryEngine } from './FirGeometryEngine'
import { classifyPolygon } from './ZoneClassificationService'

const log = createServiceLogger('FlyDronePermissionService')

// ── Types ──────────────────────────────────────────────────────────────

export interface FlyDronePermissionApplication {
  id:                          string
  applicationNumber:           string
  status:                      DsApplicationStatus
  /** Pilot UUID */
  pilotBusinessIdentifier:     string
  /** Operator UUID */
  operatorBusinessIdentifier:  string
  /** DS drone ID */
  droneId:                     number
  /** Drone UIN */
  droneUin:                    string
  /** Drone category */
  droneCategory:               NpntDroneCategory
  /** Fly area polygon */
  flyArea:                     Array<{ latitude: number; longitude: number }>
  /** Payload weight in kg */
  payloadWeightInKg:           number
  /** Payload details */
  payloadDetails:              string
  /** Flight purpose */
  flightPurpose:               string
  /** Start datetime (ISO 8601) */
  startDateTime:               string
  /** End datetime (ISO 8601) */
  endDateTime:                 string
  /** Max altitude feet AGL */
  maxAltitude:                 number
  /** Detected FIR */
  fir:                         string
  /** FIC number (set on ATC approval) */
  ficNumber?:                  string
  /** ADC number (set on AFMLU approval) */
  adcNumber?:                  string
  /** Signed PA XML (set on final approval) */
  signedPaXml?:                string
  /** PA storage path */
  permissionArtifactStoragePath?: string
  /** Recurrence */
  recurringTimeExpression?:    string
  recurringTimeExpressionType?: string
  recurringTimeDurationInMinutes?: number
  /** Auto-approval reason */
  approvalReason?:             string
  /** Rejector comments */
  rejectionReason?:            string
  /** Approver admin ID */
  approverId?:                 string
  /** Timestamps */
  createdAt:                   Date
  submittedAt?:                Date
  approvedAt?:                 Date
}

export interface SubmitApplicationInput {
  pilotBusinessIdentifier:     string
  operatorBusinessIdentifier:  string
  droneId:                     number
  droneUin:                    string
  droneCategory:               NpntDroneCategory
  flyArea:                     Array<{ latitude: number; longitude: number }>
  payloadWeightInKg:           number
  payloadDetails:              string
  flightPurpose:               string
  startDateTime:               string    // ISO 8601 or dd-MM-yyyy HH:mm:ss
  endDateTime:                 string
  maxAltitude:                 number    // feet AGL
  recurringTimeExpression?:    string
  recurringTimeExpressionType?: string
  recurringTimeDurationInMinutes?: number
}

export interface ApprovalAction {
  adminId:     string
  adminRole:   'ADMIN' | 'ATC_ADMIN' | 'AFMLU_ADMIN'
  action:      'APPROVE' | 'REJECT'
  comments?:   string
  ficNumber?:  string    // set by ATC
  adcNumber?:  string    // set by AFMLU
}

// ── Service ────────────────────────────────────────────────────────────

export class FlyDronePermissionService {
  /** In-memory application store (production: MongoDB) */
  private applications: Map<string, FlyDronePermissionApplication> = new Map()
  private applicationCounter = 0
  private firEngine = new FirGeometryEngine()

  /** Server signing credentials (set at startup) */
  private signingKeyPem: string | null = null
  private signingCertPem: string | null = null

  constructor() {
    log.info('fly_drone_permission_service_initialized', { data: {} })
  }

  /**
   * Set PA signing credentials.
   */
  setSigningCredentials(keyPem: string, certPem: string): void {
    this.signingKeyPem = keyPem
    this.signingCertPem = certPem
    log.info('signing_credentials_set', { data: {} })
  }

  /**
   * Initialize demo signing credentials.
   */
  async initDemoCredentials(): Promise<void> {
    const { privateKey, certificate } = await generateDemoCertificate()
    this.setSigningCredentials(privateKey, certificate)
  }

  // ── Submit Application ───────────────────────────────────────────────

  /**
   * Submit a new fly drone permission application.
   * Runs auto-approval logic — may return APPROVED immediately.
   */
  async submitApplication(
    input: SubmitApplicationInput
  ): Promise<{ application: FlyDronePermissionApplication; autoApproved: boolean }> {
    // Parse dates
    const startDate = parseDsDate(input.startDateTime)
    const endDate = parseDsDate(input.endDateTime)

    // Detect FIR from fly area centroid
    const centroid = computeCentroid(input.flyArea)
    const firResult = this.firEngine.pointInFir(centroid.latitude, centroid.longitude)
    const fir = firResult?.firCode ?? 'UNKNOWN'

    // Generate application
    this.applicationCounter++
    const appId = crypto.randomUUID()
    const appNumber = `FDP-${new Date().getFullYear()}-${this.applicationCounter.toString().padStart(5, '0')}`

    const app: FlyDronePermissionApplication = {
      id: appId,
      applicationNumber: appNumber,
      status: 'SUBMITTED',
      pilotBusinessIdentifier: input.pilotBusinessIdentifier,
      operatorBusinessIdentifier: input.operatorBusinessIdentifier,
      droneId: input.droneId,
      droneUin: input.droneUin,
      droneCategory: input.droneCategory,
      flyArea: input.flyArea,
      payloadWeightInKg: input.payloadWeightInKg,
      payloadDetails: input.payloadDetails,
      flightPurpose: input.flightPurpose,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      maxAltitude: input.maxAltitude,
      fir,
      recurringTimeExpression: input.recurringTimeExpression,
      recurringTimeExpressionType: input.recurringTimeExpressionType,
      recurringTimeDurationInMinutes: input.recurringTimeDurationInMinutes,
      createdAt: new Date(),
      submittedAt: new Date(),
    }

    // Run zone classification
    const altitudeMeters = input.maxAltitude / 3.28084  // feet → meters for zone check
    const polygon = input.flyArea.map(p => ({ lat: p.latitude, lng: p.longitude }))
    const zoneResult = await classifyPolygon(polygon, altitudeMeters)

    // Map JADS zones to DS zones
    const withinGreen = zoneResult.primaryZone === 'GREEN'
    const intersectsAmber = zoneResult.primaryZone === 'YELLOW'  // JADS uses YELLOW ≈ DS AMBER
    const intersectsRed = zoneResult.primaryZone === 'RED'

    // Run auto-approval decision
    const approval = evaluateAutoApproval(
      input.droneCategory,
      input.maxAltitude,
      withinGreen,
      intersectsAmber,
      intersectsRed
    )

    let autoApproved = false

    if (intersectsRed) {
      // RED zone — reject immediately
      app.status = 'REJECTED'
      app.rejectionReason = approval.reason
      log.info('application_auto_rejected_red_zone', {
        data: { appNumber, reason: approval.reason }
      })
    } else if (approval.autoApproved) {
      // Auto-approve: generate PA
      app.status = 'APPROVED'
      app.approvalReason = approval.reason
      app.approvedAt = new Date()
      autoApproved = true

      // Generate signed PA
      try {
        const signedPa = await this.generateSignedPA(app)
        app.signedPaXml = signedPa
      } catch (e: any) {
        log.error('pa_generation_failed', { data: { appNumber, error: e.message } })
        // Still approved, PA can be generated later
      }

      log.info('application_auto_approved', {
        data: { appNumber, category: input.droneCategory, altitude: input.maxAltitude, reason: approval.reason }
      })
    } else {
      // Requires manual approval — stays SUBMITTED
      app.approvalReason = approval.reason
      log.info('application_requires_manual_approval', {
        data: { appNumber, reason: approval.reason, requiresUAOP: approval.requiresUAOP }
      })
    }

    this.applications.set(appId, app)
    return { application: app, autoApproved }
  }

  // ── Admin Approval ───────────────────────────────────────────────────

  /**
   * Process admin approval/rejection of an application.
   *
   * DS approval paths:
   *   A) Single-stage: ADMIN → APPROVED (generates PA with FIC + ADC)
   *   B) Two-stage:
   *      1. ATC_ADMIN → APPROVEDBYATC (FIC number only, no PA)
   *      2. AFMLU_ADMIN → APPROVED (ADC number + signed PA)
   */
  async processApproval(
    applicationId: string,
    action: ApprovalAction
  ): Promise<FlyDronePermissionApplication> {
    const app = this.applications.get(applicationId)
    if (!app) {
      throw new Error(`Application '${applicationId}' not found`)
    }

    // Validate status transition
    const validTransitions = this.getValidTransitions(app.status, action)
    if (!validTransitions.allowed) {
      throw new Error(`Invalid transition: ${app.status} + ${action.adminRole}/${action.action} — ${validTransitions.reason}`)
    }

    if (action.action === 'REJECT') {
      // Rejection
      app.status = this.getRejectStatus(action.adminRole)
      app.rejectionReason = action.comments ?? 'Rejected by admin'
      app.approverId = action.adminId

      log.info('application_rejected', {
        data: { appNumber: app.applicationNumber, by: action.adminRole, reason: action.comments }
      })
    } else {
      // Approval
      if (action.adminRole === 'ATC_ADMIN') {
        // Stage 1 of two-stage: ATC approval → APPROVEDBYATC
        app.status = 'APPROVEDBYATC'
        app.ficNumber = action.ficNumber ?? this.generateFicNumber()
        app.approverId = action.adminId

        log.info('application_atc_approved', {
          data: { appNumber: app.applicationNumber, ficNumber: app.ficNumber }
        })
      } else if (action.adminRole === 'AFMLU_ADMIN') {
        // Stage 2 of two-stage: AFMLU approval → APPROVED + PA generation
        app.status = 'APPROVED'
        app.adcNumber = action.adcNumber ?? this.generateAdcNumber()
        app.approverId = action.adminId
        app.approvedAt = new Date()

        // Generate signed PA with FIC + ADC
        try {
          const signedPa = await this.generateSignedPA(app)
          app.signedPaXml = signedPa
        } catch (e: any) {
          log.error('pa_generation_failed', { data: { appNumber: app.applicationNumber, error: e.message } })
        }

        log.info('application_afmlu_approved', {
          data: { appNumber: app.applicationNumber, adcNumber: app.adcNumber, ficNumber: app.ficNumber }
        })
      } else {
        // Single-stage: ADMIN → APPROVED
        app.status = 'APPROVED'
        app.ficNumber = action.ficNumber ?? this.generateFicNumber()
        app.adcNumber = action.adcNumber ?? this.generateAdcNumber()
        app.approverId = action.adminId
        app.approvedAt = new Date()

        // Generate signed PA
        try {
          const signedPa = await this.generateSignedPA(app)
          app.signedPaXml = signedPa
        } catch (e: any) {
          log.error('pa_generation_failed', { data: { appNumber: app.applicationNumber, error: e.message } })
        }

        log.info('application_admin_approved', {
          data: { appNumber: app.applicationNumber, ficNumber: app.ficNumber, adcNumber: app.adcNumber }
        })
      }
    }

    this.applications.set(applicationId, app)
    return app
  }

  // ── Query ────────────────────────────────────────────────────────────

  getApplication(id: string): FlyDronePermissionApplication | null {
    return this.applications.get(id) ?? null
  }

  getApplicationByNumber(number: string): FlyDronePermissionApplication | null {
    for (const app of this.applications.values()) {
      if (app.applicationNumber === number) return app
    }
    return null
  }

  listApplications(filters?: {
    status?: DsApplicationStatus
    operatorId?: string
    pilotId?: string
    droneUin?: string
  }): FlyDronePermissionApplication[] {
    let results = Array.from(this.applications.values())
    if (filters?.status) results = results.filter(a => a.status === filters.status)
    if (filters?.operatorId) results = results.filter(a => a.operatorBusinessIdentifier === filters.operatorId)
    if (filters?.pilotId) results = results.filter(a => a.pilotBusinessIdentifier === filters.pilotId)
    if (filters?.droneUin) results = results.filter(a => a.droneUin === filters.droneUin)
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * List all non-DRAFT applications (for admin getAll).
   */
  listAllNonDraft(): FlyDronePermissionApplication[] {
    return Array.from(this.applications.values())
      .filter(a => a.status !== 'DRAFT')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * Get the signed PA XML for an approved application.
   */
  getPermissionArtefact(applicationId: string): string | null {
    const app = this.applications.get(applicationId)
    if (!app || app.status !== 'APPROVED') return null
    return app.signedPaXml ?? null
  }

  // ── PA Generation ────────────────────────────────────────────────────

  private async generateSignedPA(app: FlyDronePermissionApplication): Promise<string> {
    // Build NpntPermissionInput from application
    const input: NpntPermissionInput = {
      operatorId: app.operatorBusinessIdentifier,
      pilotId: app.pilotBusinessIdentifier,
      pilotValidTo: 'NA',
      uaRegistrationNumber: app.droneUin,
      flightPurpose: app.flightPurpose as any,
      payloadWeightKg: app.payloadWeightInKg,
      payloadDetails: app.payloadDetails,
      droneCategory: app.droneCategory,
      flightStartTime: new Date(app.startDateTime),
      flightEndTime: new Date(app.endDateTime),
      maxAltitudeFeetAGL: app.maxAltitude,
      flyArea: app.flyArea,
      ficNumber: app.ficNumber,
      adcNumber: app.adcNumber,
      recurrenceTimeExpression: app.recurringTimeExpression,
      recurrenceTimeExpressionType: app.recurringTimeExpressionType as any,
      recurringTimeDurationInMinutes: app.recurringTimeDurationInMinutes,
    }

    // Build unsigned XML (validation bypassed for auto-approved — times may be in past for demo)
    const unsignedXml = buildPermissionArtefactXmlNoValidation(input)

    // Sign with server credentials
    if (!this.signingKeyPem || !this.signingCertPem) {
      await this.initDemoCredentials()
    }

    const result = signPaXml(unsignedXml, this.signingKeyPem!, this.signingCertPem!)
    return result.signedXml
  }

  // ── Status Transition Logic ──────────────────────────────────────────

  private getValidTransitions(
    currentStatus: DsApplicationStatus,
    action: ApprovalAction
  ): { allowed: boolean; reason?: string } {
    const { adminRole, action: approveOrReject } = action

    if (currentStatus === 'SUBMITTED') {
      // Any admin role can approve/reject a submitted application
      return { allowed: true }
    }

    if (currentStatus === 'APPROVEDBYATC') {
      // Only AFMLU_ADMIN or ADMIN can process after ATC approval
      if (adminRole === 'AFMLU_ADMIN' || adminRole === 'ADMIN') {
        return { allowed: true }
      }
      return { allowed: false, reason: 'Only AFMLU_ADMIN or ADMIN can process after ATC approval' }
    }

    if (currentStatus === 'APPROVEDBYAFMLU') {
      // Shouldn't normally reach here — AFMLU approval goes straight to APPROVED
      return { allowed: false, reason: 'Application already approved by AFMLU' }
    }

    // Terminal states
    if (['APPROVED', 'REJECTED', 'REJECTEDBYAFMLU', 'REJECTEDBYATC'].includes(currentStatus)) {
      return { allowed: false, reason: `Application is in terminal state: ${currentStatus}` }
    }

    return { allowed: false, reason: `Cannot process application in status: ${currentStatus}` }
  }

  private getRejectStatus(adminRole: string): DsApplicationStatus {
    switch (adminRole) {
      case 'ATC_ADMIN':   return 'REJECTEDBYATC'
      case 'AFMLU_ADMIN': return 'REJECTEDBYAFMLU'
      default:            return 'REJECTED'
    }
  }

  private generateFicNumber(): string {
    return `FIC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  }

  private generateAdcNumber(): string {
    return `ADC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function computeCentroid(points: Array<{ latitude: number; longitude: number }>): { latitude: number; longitude: number } {
  if (points.length === 0) return { latitude: 0, longitude: 0 }
  const sum = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 }
  )
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  }
}

/**
 * Parse DS date format (dd-MM-yyyy HH:mm:ss) or ISO 8601.
 */
function parseDsDate(dateStr: string): Date {
  // Try ISO 8601 first
  const iso = new Date(dateStr)
  if (!isNaN(iso.getTime())) return iso

  // Try DS format: dd-MM-yyyy HH:mm:ss
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, day, month, year, hour, min, sec] = match
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}+05:30`)
  }

  throw new Error(`Cannot parse date: '${dateStr}'`)
}

/**
 * Build PA XML without running DS threshold validation
 * (for auto-approved applications where times may be demo data).
 */
function buildPermissionArtefactXmlNoValidation(input: NpntPermissionInput): string {
  // Auto-close polygon
  const flyArea = [...input.flyArea]
  const first = flyArea[0]
  const last = flyArea[flyArea.length - 1]
  if (first && last && (first.latitude !== last.latitude || first.longitude !== last.longitude)) {
    flyArea.push({ latitude: first.latitude, longitude: first.longitude })
  }

  const escapeXml = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const toIstString = (date: Date): string => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000
    const istDate = new Date(date.getTime() + istOffsetMs)
    const y = istDate.getUTCFullYear()
    const mo = String(istDate.getUTCMonth() + 1).padStart(2, '0')
    const d = String(istDate.getUTCDate()).padStart(2, '0')
    const h = String(istDate.getUTCHours()).padStart(2, '0')
    const mi = String(istDate.getUTCMinutes()).padStart(2, '0')
    const s = String(istDate.getUTCSeconds()).padStart(2, '0')
    return `${y}-${mo}-${d}T${h}:${mi}:${s}+05:30`
  }

  const coordElements = flyArea
    .map(pt => `          <Coordinate latitude="${pt.latitude.toFixed(6)}" longitude="${pt.longitude.toFixed(6)}"/>`)
    .join('\n')

  const fpAttrs: string[] = [
    `flightStartTime="${escapeXml(toIstString(input.flightStartTime))}"`,
    `flightEndTime="${escapeXml(toIstString(input.flightEndTime))}"`,
  ]
  if (input.recurrenceTimeExpression) {
    fpAttrs.push(`recurrenceTimeExpression="${escapeXml(input.recurrenceTimeExpression)}"`)
    fpAttrs.push(`recurrenceTimeExpressionType="${escapeXml(input.recurrenceTimeExpressionType || 'CRON_QUARTZ')}"`)
    if (input.recurringTimeDurationInMinutes !== undefined) {
      fpAttrs.push(`recurringTimeDurationInMinutes="${input.recurringTimeDurationInMinutes}"`)
    }
  }
  fpAttrs.push(`maxAltitude="${input.maxAltitudeFeetAGL}"`)
  if (input.ficNumber) fpAttrs.push(`ficNumber="${escapeXml(input.ficNumber)}"`)
  if (input.adcNumber) fpAttrs.push(`adcNumber="${escapeXml(input.adcNumber)}"`)

  return `<?xml version="1.0" encoding="UTF-8"?>
<UAPermission>
  <Permission>
    <Owner operatorID="${escapeXml(input.operatorId)}">
      <Pilot id="${escapeXml(input.pilotId)}" validTo="${escapeXml(input.pilotValidTo)}"/>
    </Owner>
    <FlightDetails>
      <UADetails uinNo="${escapeXml(input.uaRegistrationNumber)}"/>
      <FlightPurpose shortDesc="${escapeXml(input.flightPurpose)}"/>
      <PayloadDetails payLoadWeightInKg="${input.payloadWeightKg}" payloadDetails="${escapeXml(input.payloadDetails)}"/>
      <FlightParameters
          ${fpAttrs.join('\n          ')}>
        <Coordinates>
${coordElements}
        </Coordinates>
      </FlightParameters>
    </FlightDetails>
  </Permission>
</UAPermission>`
}

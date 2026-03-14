/**
 * DS-06 — UIN (Unique Identification Number) Application Service
 *
 * Manages the UIN application workflow per DS §3.8:
 *   POST   /api/applicationForm/uinApplication       — Create (9 file uploads)
 *   PATCH  /api/applicationForm/uinApplication/{id}   — Update
 *   PATCH  /api/applicationForm/uinApplication/approve/{id} — Approve/reject
 *   GET    /api/applicationForm/uinApplication/getAll — Admin list
 *   GET    /api/applicationForm/uinApplication/list   — User's list
 *
 * UIN format: UA + 12 alphanumeric (e.g., UA123456789012)
 *
 * Required documents (9):
 *   importPermissionDoc, cinDoc, gstinDoc, panCardDoc,
 *   dotPermissionDoc, securityClearanceDoc, etaDoc,
 *   opManualDoc, maintenanceGuidelinesDoc
 *
 * Workflow: DRAFT → SUBMITTED → APPROVED/REJECTED
 * On approval: UIN is generated and assigned to the drone.
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('UinApplicationService')

// ── Types ──────────────────────────────────────────────────────────────

export interface UinApplication {
  id:                          string
  applicationNumber:           string
  status:                      'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  applicantId:                 string
  applicantName:               string
  applicantEmail:              string
  applicantPhone:              string
  applicantType:               'INDIVIDUAL' | 'ORGANISATION'
  /** Drone info */
  manufacturer:                string
  modelName:                   string
  modelNo:                     string
  serialNumber:                string
  droneCategory:               'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  maxTakeoffWeight:            number
  /** Document file paths (name → stored path) */
  documents:                   Record<string, string>
  /** Generated UIN (set on approval) */
  uin?:                        string
  /** Admin comments */
  approverComments?:           string
  approverId?:                 string
  /** Timestamps */
  createdAt:                   Date
  submittedAt?:                Date
  approvedAt?:                 Date
}

export interface UinApplicationInput {
  applicantId:     string
  applicantName:   string
  applicantEmail:  string
  applicantPhone:  string
  applicantType:   'INDIVIDUAL' | 'ORGANISATION'
  manufacturer:    string
  modelName:       string
  modelNo:         string
  serialNumber:    string
  droneCategory:   'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  maxTakeoffWeight: number
}

const REQUIRED_DOCUMENTS = [
  'importPermissionDoc', 'cinDoc', 'gstinDoc', 'panCardDoc',
  'dotPermissionDoc', 'securityClearanceDoc', 'etaDoc',
  'opManualDoc', 'maintenanceGuidelinesDoc',
] as const

// ── Service ────────────────────────────────────────────────────────────

export class UinApplicationService {
  /** In-memory store */
  private applications: Map<string, UinApplication> = new Map()
  private uinCounter = 0
  private appCounter = 0

  constructor() {
    log.info('uin_application_service_initialized', { data: {} })
  }

  // ── Create ───────────────────────────────────────────────────────────

  createApplication(input: UinApplicationInput): UinApplication {
    this.appCounter++
    const id = crypto.randomUUID()
    const year = new Date().getFullYear()
    const appNumber = `UIN-${year}-${this.appCounter.toString().padStart(5, '0')}`

    const app: UinApplication = {
      id,
      applicationNumber: appNumber,
      status: 'DRAFT',
      applicantId: input.applicantId,
      applicantName: input.applicantName,
      applicantEmail: input.applicantEmail,
      applicantPhone: input.applicantPhone,
      applicantType: input.applicantType,
      manufacturer: input.manufacturer,
      modelName: input.modelName,
      modelNo: input.modelNo,
      serialNumber: input.serialNumber,
      droneCategory: input.droneCategory,
      maxTakeoffWeight: input.maxTakeoffWeight,
      documents: {},
      createdAt: new Date(),
    }

    this.applications.set(id, app)
    log.info('uin_application_created', { data: { appNumber, applicantId: input.applicantId } })
    return app
  }

  // ── Update ───────────────────────────────────────────────────────────

  updateApplication(
    id: string,
    updates: Partial<UinApplicationInput>,
    documents?: Record<string, string>
  ): UinApplication {
    const app = this.applications.get(id)
    if (!app) throw new Error(`UIN application '${id}' not found`)
    if (app.status !== 'DRAFT' && app.status !== 'SUBMITTED') {
      throw new Error(`Cannot update application in status '${app.status}'`)
    }

    // Apply field updates
    if (updates.manufacturer !== undefined) app.manufacturer = updates.manufacturer
    if (updates.modelName !== undefined) app.modelName = updates.modelName
    if (updates.modelNo !== undefined) app.modelNo = updates.modelNo
    if (updates.serialNumber !== undefined) app.serialNumber = updates.serialNumber
    if (updates.droneCategory !== undefined) app.droneCategory = updates.droneCategory
    if (updates.maxTakeoffWeight !== undefined) app.maxTakeoffWeight = updates.maxTakeoffWeight

    // Merge documents
    if (documents) {
      app.documents = { ...app.documents, ...documents }
    }

    this.applications.set(id, app)
    return app
  }

  // ── Submit ───────────────────────────────────────────────────────────

  submitApplication(id: string): UinApplication {
    const app = this.applications.get(id)
    if (!app) throw new Error(`UIN application '${id}' not found`)
    if (app.status !== 'DRAFT') {
      throw new Error(`Cannot submit application in status '${app.status}'`)
    }

    // Validate required documents
    const missingDocs = REQUIRED_DOCUMENTS.filter(d => !app.documents[d])
    if (missingDocs.length > 0) {
      throw new Error(`Missing required documents: ${missingDocs.join(', ')}`)
    }

    app.status = 'SUBMITTED'
    app.submittedAt = new Date()
    this.applications.set(id, app)

    log.info('uin_application_submitted', { data: { appNumber: app.applicationNumber } })
    return app
  }

  // ── Approve / Reject ─────────────────────────────────────────────────

  approveApplication(
    id: string,
    adminId: string,
    comments?: string
  ): UinApplication {
    const app = this.applications.get(id)
    if (!app) throw new Error(`UIN application '${id}' not found`)
    if (app.status !== 'SUBMITTED') {
      throw new Error(`Cannot approve application in status '${app.status}'`)
    }

    app.status = 'APPROVED'
    app.approverId = adminId
    app.approverComments = comments
    app.approvedAt = new Date()
    app.uin = this.generateUin()
    this.applications.set(id, app)

    log.info('uin_application_approved', {
      data: { appNumber: app.applicationNumber, uin: app.uin, adminId }
    })
    return app
  }

  rejectApplication(
    id: string,
    adminId: string,
    comments: string
  ): UinApplication {
    const app = this.applications.get(id)
    if (!app) throw new Error(`UIN application '${id}' not found`)
    if (app.status !== 'SUBMITTED') {
      throw new Error(`Cannot reject application in status '${app.status}'`)
    }

    app.status = 'REJECTED'
    app.approverId = adminId
    app.approverComments = comments
    this.applications.set(id, app)

    log.info('uin_application_rejected', {
      data: { appNumber: app.applicationNumber, adminId, reason: comments }
    })
    return app
  }

  // ── Query ────────────────────────────────────────────────────────────

  getApplication(id: string): UinApplication | null {
    return this.applications.get(id) ?? null
  }

  listByApplicant(applicantId: string): UinApplication[] {
    return Array.from(this.applications.values())
      .filter(a => a.applicantId === applicantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  listAll(): UinApplication[] {
    return Array.from(this.applications.values())
      .filter(a => a.status !== 'DRAFT')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private generateUin(): string {
    this.uinCounter++
    const seq = this.uinCounter.toString().padStart(12, '0')
    return `UA${seq}`
  }
}

/**
 * DS-11 — Digital Sky Integration Routes
 *
 * Comprehensive API endpoints for all DS features, accessible by:
 *   - User app (React Native) — flight permissions, UIN applications
 *   - Admin portal (React) — approval workflows, zone management
 *   - Android app (Kotlin) — device registration, PA download, log upload
 *   - Audit portal (React) — NPNT compliance checks, forensic audit
 *
 * All endpoints use the same auth + domain middleware as existing JADS routes.
 * Backend supports all three client apps identically.
 *
 * Route groups:
 *   /api/ds/device          — Device registration (PKI M2M)
 *   /api/ds/permissions     — Fly drone permission workflow
 *   /api/ds/flight-logs     — Flight log upload
 *   /api/ds/uin             — UIN applications
 *   /api/ds/zones           — Airspace zones
 *   /api/ds/npnt            — NPNT compliance checks
 *   /api/ds/fir             — FIR detection
 *   /api/ds/pki             — PKI certificate management
 */

import express from 'express'
import { requireAuth, requireRole } from '../middleware/authMiddleware'
import { createServiceLogger } from '../logger'
import { serializeForJson } from '../utils/bigintSerializer'

// Services
import { PkiCertificateChainService, getPkiService } from '../services/pki/PkiCertificateChainService'
import { DeviceRegistrationService } from '../services/DeviceRegistrationService'
import { FlyDronePermissionService } from '../services/FlyDronePermissionService'
import { FlightLogIngestionService } from '../services/FlightLogIngestionService'
import { UinApplicationService } from '../services/UinApplicationService'
import { DroneFirDetectionService } from '../services/DroneFirDetectionService'
import { NpntComplianceEngine } from '../services/NpntComplianceEngine'
import { AirspaceZoneSyncService } from '../services/AirspaceZoneSyncService'

const router = express.Router()
const log = createServiceLogger('DigitalSkyRoutes')

// ── Service Instances (singleton for this module) ──────────────────────
const pkiService = getPkiService()
const deviceService = new DeviceRegistrationService(pkiService)
const permissionService = new FlyDronePermissionService()
const flightLogService = new FlightLogIngestionService()
const uinService = new UinApplicationService()
const firService = new DroneFirDetectionService()
const npntEngine = new NpntComplianceEngine()
const zoneSyncService = new AirspaceZoneSyncService()

// Initialize demo credentials on module load
permissionService.initDemoCredentials().catch(() => { /* ignore in dev */ })
pkiService.initDemoCredentials().catch(() => { /* ignore in dev */ })

// Auth helper
const requireAdminAuth = requireAuth
const ADMIN_ROLES = ['PLATFORM_SUPER_ADMIN', 'ADMIN', 'ATC_ADMIN', 'AFMLU_ADMIN']
const requireDsAdmin = requireRole(ADMIN_ROLES)

// ════════════════════════════════════════════════════════════════════════
// DEVICE REGISTRATION (DS §3.6 — PKI M2M, no JWT)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/device/register/:mbi
 * Register a drone device. PKI authentication (no JWT required in DS,
 * but JADS requires auth for all endpoints).
 */
router.post('/device/register/:mbi', requireAdminAuth, async (req, res) => {
  try {
    const result = await deviceService.register(req.params.mbi, req.body)
    const status = result.responseCode === 'REGISTERED' ? 201 : 400
    res.status(status).json({ success: result.responseCode === 'REGISTERED', ...result })
  } catch (e: any) {
    log.error('device_register_error', { data: { error: e.message } })
    res.status(500).json({ error: 'DEVICE_REGISTER_FAILED', detail: e.message })
  }
})

/**
 * PATCH /api/ds/device/deregister/:mbi
 * Deregister a drone device.
 */
router.patch('/device/deregister/:mbi', requireAdminAuth, async (req, res) => {
  try {
    const result = await deviceService.deregister(req.params.mbi, req.body)
    const status = result.responseCode === 'DEREGISTERED' ? 200 : 400
    res.status(status).json({ success: result.responseCode === 'DEREGISTERED', ...result })
  } catch (e: any) {
    log.error('device_deregister_error', { data: { error: e.message } })
    res.status(500).json({ error: 'DEVICE_DEREGISTER_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/device/register-demo
 * Quick demo device registration (bypasses PKI for dev).
 */
router.post('/device/register-demo', requireAdminAuth, async (req, res) => {
  try {
    const { deviceId, deviceModelId, operatorId, manufacturerId } = req.body
    if (!deviceId) { res.status(400).json({ error: 'deviceId required' }); return }
    const device = deviceService.registerDemoDevice(
      deviceId, deviceModelId ?? 'DEMO-MODEL', operatorId ?? 'DEMO-OP', manufacturerId ?? 'DEMO-MFR'
    )
    res.status(201).json({ success: true, device })
  } catch (e: any) {
    res.status(500).json({ error: 'DEMO_REGISTER_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/device/list
 * List all registered devices (admin).
 */
router.get('/device/list', requireAdminAuth, requireDsAdmin, async (_req, res) => {
  res.json({ success: true, devices: deviceService.getAllDevices() })
})

/**
 * GET /api/ds/device/uin/:uin
 * Look up device by UIN.
 */
router.get('/device/uin/:uin', requireAdminAuth, async (req, res) => {
  const device = deviceService.getDeviceByUin(req.params.uin)
  if (!device) { res.status(404).json({ error: 'DEVICE_NOT_FOUND' }); return }
  res.json({ success: true, device })
})

// ════════════════════════════════════════════════════════════════════════
// FLY DRONE PERMISSIONS (DS §3.7)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/permissions
 * Submit a fly drone permission application.
 */
router.post('/permissions', requireAdminAuth, async (req, res) => {
  try {
    const { application, autoApproved } = await permissionService.submitApplication(req.body)
    res.status(201).json({ success: true, application, autoApproved })
  } catch (e: any) {
    log.error('permission_submit_error', { data: { error: e.message } })
    res.status(400).json({ error: 'PERMISSION_SUBMIT_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/permissions
 * List user's permissions (or all for admin).
 */
router.get('/permissions', requireAdminAuth, async (req, res) => {
  const filters: any = {}
  if (req.query.status) filters.status = req.query.status
  if (req.query.operatorId) filters.operatorId = req.query.operatorId
  if (req.query.droneUin) filters.droneUin = req.query.droneUin
  const apps = permissionService.listApplications(filters)
  res.json({ success: true, applications: apps, count: apps.length })
})

/**
 * GET /api/ds/permissions/all
 * Admin: list all non-DRAFT applications.
 */
router.get('/permissions/all', requireAdminAuth, requireDsAdmin, async (_req, res) => {
  const apps = permissionService.listAllNonDraft()
  res.json({ success: true, applications: apps, count: apps.length })
})

/**
 * GET /api/ds/permissions/:id
 * Get single application detail.
 */
router.get('/permissions/:id', requireAdminAuth, async (req, res) => {
  const app = permissionService.getApplication(req.params.id)
  if (!app) { res.status(404).json({ error: 'APPLICATION_NOT_FOUND' }); return }
  res.json({ success: true, application: app })
})

/**
 * PATCH /api/ds/permissions/:id/approve
 * Admin: approve or reject an application.
 */
router.patch('/permissions/:id/approve', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { action, comments, ficNumber, adcNumber } = req.body
    const adminRole = req.body.adminRole ?? 'ADMIN'
    const result = await permissionService.processApproval(req.params.id, {
      adminId: req.auth!.userId,
      adminRole,
      action: action ?? 'APPROVE',
      comments,
      ficNumber,
      adcNumber,
    })
    res.json({ success: true, application: result })
  } catch (e: any) {
    log.error('permission_approve_error', { data: { error: e.message } })
    res.status(400).json({ error: 'APPROVAL_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/permissions/:id/pa
 * Download the signed Permission Artefact XML.
 */
router.get('/permissions/:id/pa', requireAdminAuth, async (req, res) => {
  const pa = permissionService.getPermissionArtefact(req.params.id)
  if (!pa) { res.status(404).json({ error: 'PA_NOT_AVAILABLE' }); return }
  res.set('Content-Type', 'application/xml')
  res.send(pa)
})

// ════════════════════════════════════════════════════════════════════════
// FLIGHT LOG UPLOAD (DS §3.7 — flightLog endpoint)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/flight-logs/:applicationId
 * Upload a flight log for a completed flight.
 */
router.post('/flight-logs/:applicationId', requireAdminAuth, async (req, res) => {
  try {
    const { droneUin } = req.body
    if (!droneUin) { res.status(400).json({ error: 'droneUin required' }); return }

    const result = flightLogService.uploadFlightLog(req.params.applicationId, droneUin, req.body)
    const status = result.accepted ? 201 : 400
    res.status(status).json({ success: result.accepted, ...result })
  } catch (e: any) {
    log.error('flight_log_upload_error', { data: { error: e.message } })
    res.status(500).json({ error: 'FLIGHT_LOG_UPLOAD_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/flight-logs/:applicationId
 * Get a stored flight log.
 */
router.get('/flight-logs/:applicationId', requireAdminAuth, async (req, res) => {
  const log = flightLogService.getLog(req.params.applicationId)
  if (!log) { res.status(404).json({ error: 'FLIGHT_LOG_NOT_FOUND' }); return }
  res.json({ success: true, flightLog: log })
})

/**
 * GET /api/ds/flight-logs
 * List all flight logs (admin).
 */
router.get('/flight-logs', requireAdminAuth, requireDsAdmin, async (_req, res) => {
  const logs = flightLogService.getAllLogs()
  res.json({ success: true, logs, count: logs.length })
})

// ════════════════════════════════════════════════════════════════════════
// UIN APPLICATIONS (DS §3.8)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/uin
 * Create a UIN application.
 */
router.post('/uin', requireAdminAuth, async (req, res) => {
  try {
    const app = uinService.createApplication(req.body)
    res.status(201).json({ success: true, application: app })
  } catch (e: any) {
    res.status(400).json({ error: 'UIN_CREATE_FAILED', detail: e.message })
  }
})

/**
 * PATCH /api/ds/uin/:id
 * Update a UIN application.
 */
router.patch('/uin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { documents, ...updates } = req.body
    const app = uinService.updateApplication(req.params.id, updates, documents)
    res.json({ success: true, application: app })
  } catch (e: any) {
    res.status(400).json({ error: 'UIN_UPDATE_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/uin/:id/submit
 * Submit a UIN application.
 */
router.post('/uin/:id/submit', requireAdminAuth, async (req, res) => {
  try {
    const app = uinService.submitApplication(req.params.id)
    res.json({ success: true, application: app })
  } catch (e: any) {
    res.status(400).json({ error: 'UIN_SUBMIT_FAILED', detail: e.message })
  }
})

/**
 * PATCH /api/ds/uin/:id/approve
 * Admin: approve or reject a UIN application.
 */
router.patch('/uin/:id/approve', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { action, comments } = req.body
    let app
    if (action === 'REJECT') {
      app = uinService.rejectApplication(req.params.id, req.auth!.userId, comments ?? 'Rejected')
    } else {
      app = uinService.approveApplication(req.params.id, req.auth!.userId, comments)
    }
    res.json({ success: true, application: app })
  } catch (e: any) {
    res.status(400).json({ error: 'UIN_APPROVAL_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/uin
 * List user's UIN applications.
 */
router.get('/uin', requireAdminAuth, async (req, res) => {
  const userId = req.query.applicantId as string ?? req.auth!.userId
  const apps = uinService.listByApplicant(userId)
  res.json({ success: true, applications: apps })
})

/**
 * GET /api/ds/uin/all
 * Admin: list all UIN applications.
 */
router.get('/uin/all', requireAdminAuth, requireDsAdmin, async (_req, res) => {
  const apps = uinService.listAll()
  res.json({ success: true, applications: apps, count: apps.length })
})

/**
 * GET /api/ds/uin/:id
 * Get single UIN application.
 */
router.get('/uin/:id', requireAdminAuth, async (req, res) => {
  const app = uinService.getApplication(req.params.id)
  if (!app) { res.status(404).json({ error: 'UIN_APPLICATION_NOT_FOUND' }); return }
  res.json({ success: true, application: app })
})

// ════════════════════════════════════════════════════════════════════════
// AIRSPACE ZONES (DS §3.12, §9)
// ════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ds/zones
 * List all airspace zones.
 */
router.get('/zones', requireAdminAuth, async (req, res) => {
  const type = req.query.type as string
  const zones = type
    ? zoneSyncService.getZonesByType(type as any)
    : zoneSyncService.getAllZones()
  res.json({ success: true, zones, count: zones.length, lastSyncAt: zoneSyncService.getLastSyncAt() })
})

/**
 * GET /api/ds/zones/:id
 * Get single zone.
 */
router.get('/zones/:id', requireAdminAuth, async (req, res) => {
  const zone = zoneSyncService.getZone(req.params.id)
  if (!zone) { res.status(404).json({ error: 'ZONE_NOT_FOUND' }); return }
  res.json({ success: true, zone })
})

/**
 * POST /api/ds/zones
 * Admin: create a zone.
 */
router.post('/zones', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const zone = zoneSyncService.createZone({
      name: req.body.name,
      type: req.body.type,
      geoJson: typeof req.body.geoJson === 'string' ? JSON.parse(req.body.geoJson) : req.body.geoJson,
      minAltitudeM: req.body.minAltitude ?? 0,
      tempStartTime: req.body.tempStartTime ? new Date(req.body.tempStartTime) : undefined,
      tempEndTime: req.body.tempEndTime ? new Date(req.body.tempEndTime) : undefined,
      source: 'MANUAL',
    })
    res.status(201).json({ success: true, zone })
  } catch (e: any) {
    res.status(400).json({ error: 'ZONE_CREATE_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/zones/check
 * Check a fly area against all zones.
 */
router.post('/zones/check', requireAdminAuth, async (req, res) => {
  try {
    const { flyArea, altitudeM } = req.body
    if (!flyArea || !Array.isArray(flyArea)) {
      res.status(400).json({ error: 'flyArea (array of {latitude, longitude}) required' }); return
    }
    const result = zoneSyncService.checkFlyArea(flyArea, altitudeM ?? 0)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'ZONE_CHECK_FAILED', detail: e.message })
  }
})

// ════════════════════════════════════════════════════════════════════════
// NPNT COMPLIANCE (DS-08)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/npnt/pre-flight
 * Pre-flight NPNT compliance check (Scenario 1).
 */
router.post('/npnt/pre-flight', requireAdminAuth, async (req, res) => {
  try {
    const result = npntEngine.checkPreFlight(req.body)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'NPNT_CHECK_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/npnt/in-flight
 * In-flight NPNT check (Scenario 2).
 */
router.post('/npnt/in-flight', requireAdminAuth, async (req, res) => {
  try {
    const result = npntEngine.checkInFlight(req.body)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'NPNT_CHECK_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/npnt/post-flight
 * Post-flight log validation (Scenario 3).
 */
router.post('/npnt/post-flight', requireAdminAuth, async (req, res) => {
  try {
    const result = npntEngine.checkPostFlight(req.body)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'NPNT_CHECK_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/npnt/forensic-audit
 * Forensic audit (Scenario 5).
 */
router.post('/npnt/forensic-audit', requireAdminAuth, async (req, res) => {
  try {
    const result = npntEngine.forensicAudit(req.body)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'NPNT_AUDIT_FAILED', detail: e.message })
  }
})

// ════════════════════════════════════════════════════════════════════════
// FIR DETECTION (DS-07)
// ════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ds/fir/detect
 * Detect FIR(s) for a fly area polygon.
 */
router.post('/fir/detect', requireAdminAuth, async (req, res) => {
  try {
    const { flyArea } = req.body
    if (!flyArea || !Array.isArray(flyArea)) {
      res.status(400).json({ error: 'flyArea (array of {latitude, longitude}) required' }); return
    }
    const result = firService.detectFir(flyArea)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'FIR_DETECT_FAILED', detail: e.message })
  }
})

/**
 * GET /api/ds/fir/point
 * FIR for a single point.
 */
router.get('/fir/point', requireAdminAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat as string)
  const lon = parseFloat(req.query.lon as string)
  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon query parameters required' }); return
  }
  const result = firService.detectFirForPoint(lat, lon)
  res.json({ success: true, fir: result })
})

/**
 * GET /api/ds/fir/list
 * List all FIR boundaries.
 */
router.get('/fir/list', requireAdminAuth, async (_req, res) => {
  res.json({ success: true, firs: firService.getAllFirs() })
})

// ════════════════════════════════════════════════════════════════════════
// PKI CERTIFICATE MANAGEMENT (DS-02)
// ════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ds/pki/status
 * Get PKI service status.
 */
router.get('/pki/status', requireAdminAuth, requireDsAdmin, async (_req, res) => {
  res.json({ success: true, pki: pkiService.getStatus() })
})

/**
 * POST /api/ds/pki/validate-chain
 * Validate a certificate chain.
 */
router.post('/pki/validate-chain', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { certificates } = req.body
    if (!certificates || !Array.isArray(certificates)) {
      res.status(400).json({ error: 'certificates (array of PEM strings) required' }); return
    }
    const result = pkiService.validateChain(certificates)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'CHAIN_VALIDATION_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/pki/verify-signature
 * Verify a digital signature.
 */
router.post('/pki/verify-signature', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { data, signature, certificate, algorithm } = req.body
    const result = pkiService.verifySignature(
      Buffer.from(data, 'utf8'), signature, certificate, algorithm
    )
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'SIGNATURE_VERIFY_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/pki/manufacturer-chain
 * Store a manufacturer's certificate chain.
 */
router.post('/pki/manufacturer-chain', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { manufacturerId, label, certificates } = req.body
    const result = pkiService.storeManufacturerChain(
      manufacturerId, label ?? manufacturerId, certificates, req.auth!.userId
    )
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'CHAIN_STORE_FAILED', detail: e.message })
  }
})

/**
 * POST /api/ds/pki/generate-demo-cert
 * Generate a demo certificate (dev only).
 */
router.post('/pki/generate-demo-cert', requireAdminAuth, requireDsAdmin, async (req, res) => {
  try {
    const { cn, org } = req.body
    const result = await pkiService.generateDemoCertificate(cn, org)
    res.json({ success: true, ...result })
  } catch (e: any) {
    res.status(400).json({ error: 'DEMO_CERT_FAILED', detail: e.message })
  }
})

export default router

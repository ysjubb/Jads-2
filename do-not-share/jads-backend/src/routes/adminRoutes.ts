import express           from 'express'
import bcrypt            from 'bcryptjs'
import jwt               from 'jsonwebtoken'
import { env }           from '../env'
import { requireAdminAuth, requireAdminRole } from '../middleware/adminAuthMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { createServiceLogger } from '../logger'
import { adminLoginRateLimit } from '../middleware/rateLimiter'
import { BCRYPT_ROUNDS, ADMIN_SESSION_HOURS } from '../constants'
import { SpecialUserAuthService } from '../services/SpecialUserAuthService'
import { ClearanceService } from '../services/ClearanceService'
import { decodeCanonical } from '../telemetry/telemetryDecoder'
import { resolveEgcaAdapter, EgcaAdapterMock, EgcaAdapterImpl } from '../adapters/egca'
import { DroneNotificationService } from '../services/DroneNotificationService'
import { prisma }        from '../lib/prisma'

const router                = express.Router()
const log                   = createServiceLogger('AdminRoutes')
const specialUserAuthService = new SpecialUserAuthService(prisma)
const clearanceService       = new ClearanceService(prisma)
const notifService           = new DroneNotificationService(prisma)

// ── ADMIN LOGIN (no auth required) ────────────────────────────────────────

// POST /api/admin/login — issues JWT signed with ADMIN_JWT_SECRET (not JWT_SECRET)
router.post('/login', adminLoginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) { res.status(400).json({ error: 'MISSING_CREDENTIALS' }); return }

    const admin = await prisma.adminUser.findUnique({ where: { username } })
    if (!admin) { res.status(401).json({ error: 'INVALID_CREDENTIALS' }); return }
    if (admin.accountStatus !== 'ACTIVE') {
      res.status(403).json({ error: `ACCOUNT_${admin.accountStatus}` }); return
    }

    const valid = await bcrypt.compare(password, admin.passwordHash)
    if (!valid) {
      await prisma.auditLog.create({ data: {
        actorType: 'ADMIN_USER', actorId: admin.id,
        action: 'admin_login_failed', resourceType: 'admin_user',
        resourceId: admin.id,
        detailJson: JSON.stringify({ username, ip: req.ip })
      }})
      res.status(401).json({ error: 'INVALID_CREDENTIALS' }); return
    }

    const token = jwt.sign(
      { adminUserId: admin.id, adminRole: admin.role },
      env.ADMIN_JWT_SECRET,
      { expiresIn: `${ADMIN_SESSION_HOURS}h` }
    )

    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: admin.id,
      action: 'admin_login', resourceType: 'admin_user',
      resourceId: admin.id,
      detailJson: JSON.stringify({ username, ip: req.ip })
    }})

    log.info('admin_login', { data: { username, adminRole: admin.role } })
    res.json({

      accessToken: token,
      expiresAt:   new Date(Date.now() + ADMIN_SESSION_HOURS * 3600000).toISOString(),
      adminRole:   admin.role,
    })
  } catch (e: unknown) {
    log.error('admin_login_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'LOGIN_FAILED' })
  }
})

// All routes below require admin auth token
router.use(requireAdminAuth)

// ── CIVILIAN USER MANAGEMENT ──────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { search, status, role, page = '1', limit = '50' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const where: Record<string, unknown> = {}
    if (status) where.accountStatus = status
    if (role)   where.role = role
    if (search) where.OR = [
      { email: { contains: search as string, mode: 'insensitive' } },
      { mobileNumber: { contains: search as string } },
    ]

    const [users, total] = await Promise.all([
      prisma.civilianUser.findMany({
        where, skip, take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, mobileNumber: true, role: true,
          accountStatus: true, verificationStatus: true,
          aadhaarLast4: true, aadhaarNextDueAt: true,
          lastLoginAt: true, createdAt: true,
        }
      }),
      prisma.civilianUser.count({ where }),
    ])

    res.json(serializeForJson({ success: true, users, total, page: parseInt(page as string), limit: parseInt(limit as string) }))
  } catch {
    res.status(500).json({ error: 'USERS_FETCH_FAILED' })
  }
})

// PATCH /api/admin/users/:id/status — only PATCH, never DELETE
router.patch('/users/:id/status', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, reason } = req.body
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'REVOKED']
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'INVALID_STATUS', valid: validStatuses }); return
    }

    const user = await prisma.civilianUser.update({
      where: { id: req.params.id },
      data:  { accountStatus: status },
    })

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: `user_status_changed_to_${status.toLowerCase()}`,
      resourceType: 'civilian_user', resourceId: user.id,

      detailJson: JSON.stringify({ newStatus: status, reason, changedBy: req.adminAuth!.adminUserId })
    }})

    res.json(serializeForJson({ success: true, user: { id: user.id, accountStatus: user.accountStatus } }))
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'USER_NOT_FOUND' }); return }
    res.status(500).json({ error: 'STATUS_UPDATE_FAILED' })
  }
})

// ── SPECIAL USER MANAGEMENT ───────────────────────────────────────────────

// GET /api/admin/special-users
router.get('/special-users', async (req, res) => {
  try {
    const { entityCode, status, page = '1', limit = '50' } = req.query
    const where: Record<string, unknown> = {}
    if (entityCode) where.entityCode    = entityCode
    if (status)     where.accountStatus = status

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const [users, total] = await Promise.all([
      prisma.specialUser.findMany({ where, skip, take: parseInt(limit as string), orderBy: { createdAt: 'desc' } }),
      prisma.specialUser.count({ where }),
    ])

    res.json(serializeForJson({ success: true, users, total }))
  } catch {
    res.status(500).json({ error: 'SPECIAL_USERS_FETCH_FAILED' })
  }
})

// POST /api/admin/special-users — provision a single unit account
// Unit accounts use username+password (no OTP, no Aadhaar)
router.post('/special-users', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await specialUserAuthService.provisionUnit(
      req.adminAuth!.adminUserId,
      req.body.username,
      req.body.unitName,
      req.body.entityCode,
      req.body.unitType     ?? 'UNIT',
      req.body.baseLocation,
      req.body.role         ?? 'GOVT_DRONE_OPERATOR',
    )

    await prisma.auditLog.create({ data: {
      actorType:    'ADMIN_USER',
      actorId:      req.adminAuth!.adminUserId,
      action:       'special_unit_provisioned',
      resourceType: 'special_user',
      resourceId:   result.userId,
      detailJson: JSON.stringify({ username: result.username, entityCode: req.body.entityCode }),
    }})

    log.info('special_unit_provisioned', { data: { username: result.username, entityCode: req.body.entityCode } })
    // initialPassword returned ONCE — never retrievable again
    res.status(201).json({ success: true, userId: result.userId, username: result.username, initialPassword: result.initialPassword })
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'USERNAME_ALREADY_EXISTS' }); return }
    res.status(500).json({ error: 'SPECIAL_USER_CREATE_FAILED' })
  }
})

// POST /api/admin/special-users/bulk — provision up to 1000 unit accounts in one request
// Body: { units: Array<{ username, unitName, entityCode, unitType, baseLocation, role }> }
// Returns: credential sheet (array of { username, initialPassword }) — returned ONCE
router.post('/special-users/bulk', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const units: any[] = req.body.units
    if (!Array.isArray(units) || units.length === 0) {
      res.status(400).json({ error: 'UNITS_ARRAY_REQUIRED' }); return
    }
    if (units.length > 1000) {
      res.status(400).json({ error: 'BULK_LIMIT_EXCEEDED', limit: 1000 }); return
    }

    const results: any[]  = []
    const failures: any[] = []

    for (const unit of units) {
      try {
        const result = await specialUserAuthService.provisionUnit(
          req.adminAuth!.adminUserId,
          unit.username,
          unit.unitName,
          unit.entityCode,
          unit.unitType,
          unit.baseLocation,
        )
        results.push({ username: result.username, initialPassword: result.initialPassword, userId: result.userId })
      } catch (err: unknown) {
        failures.push({ username: unit.username, error: err instanceof Error ? err.message : String(err) })
      }
    }

    await prisma.auditLog.create({ data: {
      actorType:    'ADMIN_USER',
      actorId:      req.adminAuth!.adminUserId,
      action:       'special_units_bulk_provisioned',
      resourceType: 'special_user',
      success:      failures.length === 0,
      detailJson: JSON.stringify({ total: units.length, success: results.length, failed: failures.length }),
    }})

    log.info('bulk_provision_complete', { data: { total: units.length, success: results.length, failed: failures.length } })

    // Credential sheet — returned ONCE. Admin must save this securely.
    res.status(207).json({
      success:         failures.length === 0,
      provisioned:     results.length,
      failed:          failures.length,
      credentialSheet: results,  // includes initialPassword — shown ONCE
      failures,
    })
  } catch {
    res.status(500).json({ error: 'BULK_PROVISION_FAILED' })
  }
})

// PATCH /api/admin/special-users/:id/reconfirm — annual reconfirmation
router.patch('/special-users/:id/reconfirm', async (req, res) => {
  try {
    const user = await prisma.specialUser.update({
      where: { id: req.params.id },
      data:  {
        lastAdminReconfirmAt:  new Date(),
        annualReconfirmDue: new Date(Date.now() + 365 * 24 * 3600000),
        accountStatus:         'ACTIVE',
      }
    })

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'special_user_reconfirmed', resourceType: 'special_user',
      resourceId: user.id,
      detailJson: JSON.stringify({ nextDue: user.annualReconfirmDue })
    }})

    res.json(serializeForJson({

      user: { id: user.id, lastAdminReconfirmAt: user.lastAdminReconfirmAt, annualReconfirmDue: user.annualReconfirmDue }
    }))
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'USER_NOT_FOUND' }); return }
    res.status(500).json({ error: 'RECONFIRM_FAILED' })
  }
})

// ── AIRSPACE MANAGEMENT ───────────────────────────────────────────────────

// GET /api/admin/airspace/versions
router.get('/airspace/versions', async (req, res) => {
  try {
    const { dataType, page = '1', limit = '30' } = req.query
    const skip  = (parseInt(page as string) - 1) * parseInt(limit as string)
    const where = dataType ? { dataType: dataType as string } : {}

    const [versions, total] = await Promise.all([
      prisma.airspaceVersion.findMany({
        where, skip, take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, dataType: true, approvalStatus: true, effectiveFrom: true,
          changeReason: true, airacCycle: true, createdBy: true, createdAt: true,
        }
      }),
      prisma.airspaceVersion.count({ where }),
    ])

    res.json(serializeForJson({ success: true, versions, total }))
  } catch {
    res.status(500).json({ error: 'VERSIONS_FETCH_FAILED' })
  }
})

// PATCH /api/admin/airspace/versions/:id/approve — PLATFORM_SUPER_ADMIN only
router.patch('/airspace/versions/:id/approve', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const version = await prisma.airspaceVersion.update({
      where: { id: req.params.id },
      data:  {
        approvalStatus:   'ACTIVE',
        approvedBy: req.adminAuth!.adminUserId,
        approvedAt:       new Date(),
      }
    })

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'airspace_version_approved', resourceType: 'airspace_version',
      resourceId: version.id,
      detailJson: JSON.stringify({ dataType: version.dataType, effectiveFrom: version.effectiveFrom })
    }})

    res.json(serializeForJson({ success: true, version: { id: version.id, approvalStatus: version.approvalStatus } }))
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'VERSION_NOT_FOUND' }); return }
    res.status(500).json({ error: 'APPROVE_FAILED' })
  }
})

// ── DRONE ZONE MANAGEMENT (Two-person rule) ────────────────────────────────

// POST /admin/airspace/drone-zone/draft — creates a PENDING_APPROVAL draft
router.post('/airspace/drone-zone/draft', async (req, res) => {
  try {
    const { zoneType, areaGeoJson, effectiveFrom, changeReason, lowerFt, upperFt } = req.body
    if (!zoneType || !areaGeoJson || !effectiveFrom || !changeReason) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return
    }
    const draft = await prisma.airspaceVersion.create({ data: {
      dataType:        'DRONE_ZONE',
      approvalStatus:  'PENDING',
      createdBy: req.adminAuth!.adminUserId,
      changeReason,
      effectiveFrom:   new Date(effectiveFrom),
      payloadJson:     JSON.stringify({ zoneType, areaGeoJson, lowerFt, upperFt }),
      airacCycle:      null,
      versionNumber:   1,
    }})
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'drone_zone_draft_created', resourceType: 'airspace_version',
      resourceId: draft.id,
      detailJson: JSON.stringify({ zoneType, effectiveFrom })
    }})
    res.status(201).json(serializeForJson({
      success: true, draftId: draft.id,
      message: 'This draft requires approval from a different admin',
      approvalStatus: 'PENDING'
    }))
  } catch { res.status(500).json({ error: 'DRAFT_CREATION_FAILED' }) }
})

// POST /admin/airspace/drone-zone/:draftId/approve — TWO-PERSON RULE enforced
// Approving admin MUST NOT be the creating admin. Returns 403 if same.
router.post('/airspace/drone-zone/:draftId/approve', async (req, res) => {
  try {
    const draft = await prisma.airspaceVersion.findUnique({ where: { id: req.params.draftId } })
    if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND' }); return }
    if (draft.approvalStatus !== 'PENDING') {
      res.status(409).json({ error: 'NOT_PENDING_APPROVAL', current: draft.approvalStatus }); return
    }
    // TWO-PERSON RULE: approving admin !== creating admin
    if (draft.createdBy === req.adminAuth!.adminUserId) {
      res.status(403).json({ error: 'TWO_PERSON_RULE_VIOLATION', message: 'You cannot approve your own draft' })
      return
    }
    const approved = await prisma.airspaceVersion.update({
      where: { id: req.params.draftId },
      data:  { approvalStatus: 'ACTIVE', approvedBy: req.adminAuth!.adminUserId, approvedAt: new Date() }
    })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'drone_zone_approved', resourceType: 'airspace_version',
      resourceId: approved.id,
      detailJson: JSON.stringify({ createdBy: draft.createdBy })
    }})
    res.json(serializeForJson({ success: true, version: { id: approved.id, approvalStatus: approved.approvalStatus } }))
  } catch { res.status(500).json({ error: 'APPROVE_FAILED' }) }
})

// POST /admin/airspace/drone-zone/:versionId/withdraw
router.post('/airspace/drone-zone/:versionId/withdraw', async (req, res) => {
  try {
    const { reason } = req.body
    if (!reason) { res.status(400).json({ error: 'REASON_REQUIRED' }); return }
    const withdrawn = await prisma.airspaceVersion.update({
      where: { id: req.params.versionId },
      data:  { approvalStatus: 'WITHDRAWN', changeReason: reason }
    })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'drone_zone_withdrawn', resourceType: 'airspace_version',
      resourceId: withdrawn.id,
      detailJson: JSON.stringify({ reason })
    }})
    res.json(serializeForJson({ success: true, version: { id: withdrawn.id, approvalStatus: withdrawn.approvalStatus } }))
  } catch { res.status(500).json({ error: 'WITHDRAW_FAILED' }) }
})

// GET /admin/airspace/drone-zones — all drone zones with status
router.get('/airspace/drone-zones', async (req, res) => {
  try {
    const { status } = req.query
    const where = { dataType: 'DRONE_ZONE', ...(status ? { approvalStatus: status as any } : {}) }
    const zones = await prisma.airspaceVersion.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json(serializeForJson({ success: true, zones, count: zones.length }))
  } catch { res.status(500).json({ error: 'FETCH_FAILED' }) }
})

// ── NOTAM MANAGEMENT ────────────────────────────────────────────────────────

// POST /admin/airspace/notam — publish a NOTAM
router.post('/airspace/notam', async (req, res) => {
  try {
    const { notamNumber, firCode, series, year, notamType, effectiveFrom, effectiveTo,
            lowerFt, upperFt, areaGeoJson, rawText, issuingAuthority } = req.body
    if (!notamNumber || !firCode || !rawText || !effectiveFrom) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', required: ['notamNumber','firCode','rawText','effectiveFrom'] }); return
    }
    const notam = await prisma.notamRecord.create({ data: {
      notamNumber, firCode, series: series ?? 'A', year: year ?? new Date().getFullYear(),
      notamType: notamType ?? 'N', effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      lowerFt: lowerFt ?? 0, upperFt: upperFt ?? 99999,
      areaGeoJson: areaGeoJson ? JSON.stringify(areaGeoJson) : '{}',
      rawText, issuingAuthority: issuingAuthority ?? 'AAI',
      isActive: true, pulledAtUtc: new Date()
    }})
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'notam_published', resourceType: 'notam', resourceId: notam.id, detailJson: JSON.stringify({ notamNumber, firCode })
    }})
    res.status(201).json(serializeForJson({ success: true, notam }))
  } catch { res.status(500).json({ error: 'NOTAM_PUBLISH_FAILED' }) }
})

// GET /admin/airspace/notams
router.get('/airspace/notams', async (req, res) => {
  try {
    const { fir, active } = req.query
    const where: Record<string, unknown> = {}
    if (fir)           where.firCode  = fir as string
    if (active === 'true') { where.isActive = true; where.effectiveFrom = { lte: new Date() } }
    const notams = await prisma.notamRecord.findMany({ where, orderBy: { effectiveFrom: 'desc' }, take: 200 })
    res.json(serializeForJson({ success: true, notams, count: notams.length }))
  } catch { res.status(500).json({ error: 'FETCH_FAILED' }) }
})

// DELETE /admin/airspace/notam/:id — NOT ALLOWED. Use PATCH /expire instead.
router.delete('/airspace/notam/:id', (_req, res) => {
  res.status(405).json({
    error:  'METHOD_NOT_ALLOWED',
    detail: 'NOTAMs cannot be deleted. To expire a NOTAM, use PATCH /admin/airspace/notam/:id/expire',
    allowed: ['PATCH /admin/airspace/notam/:id/expire']
  })
})

// PATCH /admin/airspace/notam/:id/expire — sets effectiveTo = now(), never deletes
router.patch('/airspace/notam/:id/expire', async (req, res) => {
  try {
    const notam = await prisma.notamRecord.update({
      where: { id: req.params.id },
      data:  { effectiveTo: new Date(), isActive: false }
    })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'notam_expired', resourceType: 'notam', resourceId: notam.id, detailJson: JSON.stringify({ notamNumber: notam.notamNumber })
    }})
    res.json({ success: true, message: 'NOTAM expired (not deleted)', notamId: notam.id })
  } catch { res.status(500).json({ error: 'EXPIRE_FAILED' }) }
})

// ── AIRAC IMPORT ─────────────────────────────────────────────────────────────

// POST /admin/airspace/airac-import — PLATFORM_SUPER_ADMIN only
// Validates file structure before processing. Per-record errors do NOT abort the import.
router.post('/airspace/airac-import', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const dataset = req.body
    // Validate required structure
    if (!dataset || typeof dataset !== 'object') {
      log.warn('airac_import_invalid', { data: { adminId: req.adminAuth!.adminUserId } })
      res.status(400).json({ error: 'INVALID_FILE_FORMAT', detail: 'Body must be JSON object' }); return
    }
    if (!dataset.airacCycle || !dataset.effectiveDate) {
      log.warn('airac_import_missing_fields', { data: { adminId: req.adminAuth!.adminUserId } })
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', required: ['airacCycle', 'effectiveDate'] }); return
    }
    const results = { imported: 0, skipped: 0, errors: [] as string[] }
    const effDate = new Date(dataset.effectiveDate)

    // Process waypoints — per-record errors do not abort import
    for (const wp of (dataset.waypoints ?? [])) {
      try {
        await prisma.airspaceVersion.create({ data: {
          dataType: 'WAYPOINT', approvalStatus: 'ACTIVE',
          createdBy: req.adminAuth!.adminUserId,
          changeReason: `AIRAC ${dataset.airacCycle} import`,
          effectiveFrom: effDate, airacCycle: dataset.airacCycle,
          versionNumber: 1,
          payloadJson: JSON.stringify(wp),
        }})
        results.imported++
      } catch (e) {
        results.errors.push(`WAYPOINT ${wp.designator ?? '?'}: ${(e as Error).message}`)
        results.skipped++
      }
    }

    // Process navaids (VOR/NDB/DME — Jeppesen one-way inflow)
    for (const nav of (dataset.navaids ?? [])) {
      try {
        await prisma.airspaceVersion.create({ data: {
          dataType: 'NAVAIDS', approvalStatus: 'ACTIVE',
          createdBy: req.adminAuth!.adminUserId,
          changeReason: `AIRAC ${dataset.airacCycle} navaid import`,
          effectiveFrom: effDate, airacCycle: dataset.airacCycle,
          versionNumber: 1,
          payloadJson: JSON.stringify(nav),
        }})
        results.imported++
      } catch (e) {
        results.errors.push(`NAVAID ${nav.ident ?? '?'}: ${(e as Error).message}`)
        results.skipped++
      }
    }

    // Process airways / IFR routes (Jeppesen one-way inflow)
    for (const aw of (dataset.airways ?? [])) {
      try {
        await prisma.airspaceVersion.create({ data: {
          dataType: 'AIRWAYS', approvalStatus: 'ACTIVE',
          createdBy: req.adminAuth!.adminUserId,
          changeReason: `AIRAC ${dataset.airacCycle} airway import`,
          effectiveFrom: effDate, airacCycle: dataset.airacCycle,
          versionNumber: 1,
          payloadJson: JSON.stringify(aw),
        }})
        results.imported++
      } catch (e) {
        results.errors.push(`AIRWAY ${aw.designator ?? '?'}: ${(e as Error).message}`)
        results.skipped++
      }
    }

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'airac_import', resourceType: 'airac', resourceId: dataset.airacCycle,

      detailJson: JSON.stringify({ airacCycle: dataset.airacCycle, ...results })
    }})
    res.json({ success: true, airacCycle: dataset.airacCycle, ...results })
  } catch { res.status(500).json({ error: 'IMPORT_FAILED' }) }
})

// ── SPECIAL USER MANAGEMENT ────────────────────────────────────────────────

// POST /admin/users/special — entity admin creates special user for own entity
router.post('/users/special', async (req, res) => {
  try {
    const { entityCode, serviceNumber, officialEmail, mobileNumber,
            unitDesignation, role, authorisedCallsigns,
            credentialDomain, issuingAuthority } = req.body
    if (!entityCode || !serviceNumber || !officialEmail || !role || !credentialDomain || !issuingAuthority) {
      res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return
    }
    // Entity scoping: non-superadmin can only create users in own entity
    const adminRole = req.adminAuth!.adminRole
    if (adminRole !== 'PLATFORM_SUPER_ADMIN') {
      // Check entity rights
      const rights = await prisma.govtAdminEntityRights.findFirst({
        where: { adminUserId: req.adminAuth!.adminUserId, entityCode, isActive: true }
      })
      if (!rights) {
        res.status(403).json({ error: 'ENTITY_ACCESS_DENIED', message: `Admin does not have rights for entity ${entityCode}` }); return
      }
    }
    const specialUser = await prisma.specialUser.create({ data: {
      username: `${entityCode.toLowerCase()}.${serviceNumber}`,
      passwordHash: '',  // Credentials issued separately via provisionUnit
      unitDesignator: unitDesignation ?? entityCode,
      provisionedBy: req.adminAuth!.adminUserId,
      entityCode, serviceNumber, officialEmail, mobileNumber: mobileNumber ?? '',
      unitDesignation: unitDesignation ?? '', role: role as any,
      credentialDomain: credentialDomain as any, issuingAuthority: issuingAuthority as any,
      authorisedCallsigns: authorisedCallsigns ?? [],
      accountStatus: 'ACTIVE', reconfirmationStatus: 'CURRENT',
      lastReconfirmedAt: new Date(), nextReconfirmDueAt: new Date(Date.now() + 365 * 86400000),
      createdByAdminId: req.adminAuth!.adminUserId
    }})
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'special_user_created', resourceType: 'special_user',
      resourceId: specialUser.id,
      detailJson: JSON.stringify({ entityCode, role, serviceNumber })
    }})
    res.status(201).json(serializeForJson({ success: true, specialUser }))
  } catch { res.status(500).json({ error: 'CREATE_FAILED' }) }
})

// GET /admin/users/special?entityCode=IAF
router.get('/users/special', async (req, res) => {
  try {
    const entityFilter = req.query.entityCode as string | undefined
    const adminRole    = req.adminAuth!.adminRole
    let where: Record<string, unknown> = {}
    if (adminRole !== 'PLATFORM_SUPER_ADMIN' && entityFilter) {
      // Verify admin has rights for this entity
      const rights = await prisma.govtAdminEntityRights.findFirst({
        where: { adminUserId: req.adminAuth!.adminUserId, entityCode: entityFilter, isActive: true }
      })
      if (!rights) { res.status(403).json({ error: 'ENTITY_ACCESS_DENIED' }); return }
      where.entityCode = entityFilter
    } else if (entityFilter) {
      where.entityCode = entityFilter
    }
    const users = await prisma.specialUser.findMany({ where, orderBy: { entityCode: 'asc' } })
    res.json(serializeForJson({ success: true, users, count: users.length }))
  } catch { res.status(500).json({ error: 'FETCH_FAILED' }) }
})

// POST /admin/users/special/:id/suspend
router.post('/users/special/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body
    if (!reason) { res.status(400).json({ error: 'REASON_REQUIRED' }); return }
    const user = await prisma.specialUser.update({ where: { id: req.params.id }, data: { accountStatus: 'SUSPENDED' } })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'special_user_suspended', resourceType: 'special_user',
      resourceId: user.id, detailJson: JSON.stringify({ reason })
    }})
    res.json({ success: true, userId: user.id, accountStatus: 'SUSPENDED' })
  } catch { res.status(500).json({ error: 'SUSPEND_FAILED' }) }
})

// POST /admin/users/special/:id/reconfirm
router.post('/users/special/:id/reconfirm', async (req, res) => {
  try {
    const user = await prisma.specialUser.update({
      where: { id: req.params.id },
      data:  {
        reconfirmationStatus: 'CURRENT',
        lastReconfirmedAt:    new Date(),
        nextReconfirmDueAt:   new Date(Date.now() + 365 * 86400000),
        accountStatus:        'ACTIVE'
      }
    })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'special_user_reconfirmed', resourceType: 'special_user',
      resourceId: user.id, detailJson: '{}'
    }})
    res.json({ success: true, userId: user.id, reconfirmationStatus: 'CURRENT' })
  } catch { res.status(500).json({ error: 'RECONFIRM_FAILED' }) }
})

// PATCH /admin/users/special/:id/callsigns
router.patch('/users/special/:id/callsigns', async (req, res) => {
  try {
    const { callsigns } = req.body
    if (!Array.isArray(callsigns)) { res.status(400).json({ error: 'CALLSIGNS_MUST_BE_ARRAY' }); return }
    const user = await prisma.specialUser.update({
      where: { id: req.params.id },
      data:  { authorisedCallsigns: callsigns }
    })
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'special_user_callsigns_updated', resourceType: 'special_user',
      resourceId: user.id, detailJson: JSON.stringify({ callsigns })
    }})
    res.json({ success: true, userId: user.id, authorisedCallsigns: user.authorisedCallsigns })
  } catch { res.status(500).json({ error: 'UPDATE_FAILED' }) }
})

// POST /admin/users/entity-admin/grant — PLATFORM_SUPER_ADMIN only
router.post('/users/entity-admin/grant', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const { adminUserId, entityCode } = req.body
    if (!adminUserId || !entityCode) { res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' }); return }
    const rights = await prisma.govtAdminEntityRights.create({ data: {
      specialUserId: adminUserId, adminUserId, entityCode,
      grantedBy: req.adminAuth!.adminUserId,
      grantedByAdminId: req.adminAuth!.adminUserId, isActive: true
    }})
    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'entity_admin_rights_granted', resourceType: 'entity_rights',
      resourceId: rights.id, detailJson: JSON.stringify({ adminUserId, entityCode })
    }})
    res.status(201).json({ success: true, rightsId: rights.id, entityCode, adminUserId })
  } catch { res.status(500).json({ error: 'GRANT_FAILED' }) }
})

// GET /admin/users/pending-reverification
router.get('/users/pending-reverification', async (req, res) => {
  try {
    const in7Days = new Date(Date.now() + 7 * 86400000)
    const users = await prisma.civilianUser.findMany({
      where: { nextReverificationDue: { lte: in7Days }, accountStatus: 'ACTIVE' },
      select: { id: true, maskedAadhaarNumber: true, email: true, nextReverificationDue: true },
      orderBy: { nextReverificationDue: 'asc' }
    })
    res.json(serializeForJson({ success: true, users, count: users.length }))
  } catch { res.status(500).json({ error: 'FETCH_FAILED' }) }
})

// GET /admin/users/suspended
router.get('/users/suspended', async (req, res) => {
  try {
    const civilians = await prisma.civilianUser.findMany({ where: { accountStatus: 'SUSPENDED' } })
    const specials  = await prisma.specialUser.findMany({ where: { accountStatus: 'SUSPENDED' } })
    res.json(serializeForJson({ success: true, civilians, specials,
      total: civilians.length + specials.length }))
  } catch { res.status(500).json({ error: 'FETCH_FAILED' }) }
})

// ── DRONE MISSIONS (admin read-only view) ───────────────────────────────────

// GET /api/admin/drone-missions — all drone missions
router.get('/drone-missions', async (req, res) => {
  try {
    const { page = '1', limit = '30', status, search } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const where: Record<string, unknown> = {}
    if (status) where.uploadStatus = status
    if (search) {
      where.OR = [
        { missionId:    { contains: search as string, mode: 'insensitive' } },
        { deviceId:     { contains: search as string, mode: 'insensitive' } },
        { operatorId:   { contains: search as string, mode: 'insensitive' } },
      ]
    }

    const [missions, total] = await Promise.all([
      prisma.droneMission.findMany({
        where, skip, take: parseInt(limit as string),
        orderBy: { uploadedAt: 'desc' },
        include: {
          _count: { select: { telemetryRecords: true, violations: true } },
        },
      }),
      prisma.droneMission.count({ where }),
    ])

    res.json(serializeForJson({
      success: true,
      missions: missions.map(m => ({
        id:                   m.id,
        missionId:            m.missionId,
        operatorId:           m.operatorId,
        operatorType:         m.operatorType,
        deviceId:             m.deviceId,
        deviceModel:          m.deviceModel,
        npntClassification:   m.npntClassification,
        uploadStatus:         m.uploadStatus,
        missionStartUtcMs:    m.missionStartUtcMs,
        missionEndUtcMs:      m.missionEndUtcMs,
        ntpSyncStatus:        m.ntpSyncStatus,
        chainVerifiedByServer: m.chainVerifiedByServer,
        certValidAtStart:     m.certValidAtStart,
        uploadedAt:           m.uploadedAt,
        droneWeightCategory:  m.droneWeightCategory,
        droneManufacturer:    m.droneManufacturer,
        droneSerialNumber:    m.droneSerialNumber,
        recordCount:          m._count.telemetryRecords,
        violationCount:       m._count.violations,
      })),
      total,
    }))
  } catch {
    res.status(500).json({ error: 'DRONE_MISSIONS_FETCH_FAILED' })
  }
})

// GET /api/admin/drone-missions/:id — full drone mission detail
router.get('/drone-missions/:id', async (req, res) => {
  try {
    const mission = await prisma.droneMission.findUnique({
      where: { id: req.params.id },
      include: {
        violations: { orderBy: { timestampUtcMs: 'asc' } },
        _count: { select: { telemetryRecords: true } },
      },
    })
    if (!mission) { res.status(404).json({ error: 'MISSION_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, mission }))
  } catch {
    res.status(500).json({ error: 'MISSION_FETCH_FAILED' })
  }
})

// GET /api/admin/drone-missions/:id/decoded-track — decoded GPS telemetry for map
router.get('/drone-missions/:id/decoded-track', async (req, res) => {
  try {
    const records = await prisma.droneTelemetryRecord.findMany({
      where:   { missionId: req.params.id },
      orderBy: { sequence: 'asc' },
      select:  {
        sequence: true, canonicalPayloadHex: true, signatureHex: true,
        chainHashHex: true, gnssStatus: true, sensorHealthFlags: true, recordedAtUtcMs: true,
      }
    })
    if (records.length === 0) {
      res.json(serializeForJson({ success: true, track: [], count: 0, bbox: null })); return
    }
    const track = records.map(r => {
      try {
        const decoded = decodeCanonical(r.canonicalPayloadHex)
        return { sequence: r.sequence, gnssStatus: r.gnssStatus, sensorHealthFlags: r.sensorHealthFlags,
          recordedAtUtcMs: r.recordedAtUtcMs, chainHashHex: r.chainHashHex, signatureHex: r.signatureHex, decoded }
      } catch (e: unknown) {
        return { sequence: r.sequence, gnssStatus: r.gnssStatus, decodeError: (e as Error).message }
      }
    })
    const valid = track.filter((t: any) => t.decoded?.latitudeDeg != null)
    const bbox = valid.length > 0 ? {
      minLat: Math.min(...valid.map((t: any) => t.decoded.latitudeDeg as number)),
      maxLat: Math.max(...valid.map((t: any) => t.decoded.latitudeDeg as number)),
      minLon: Math.min(...valid.map((t: any) => t.decoded.longitudeDeg as number)),
      maxLon: Math.max(...valid.map((t: any) => t.decoded.longitudeDeg as number)),
    } : null
    res.json(serializeForJson({ success: true, track, count: track.length, bbox }))
  } catch {
    res.status(500).json({ error: 'TRACK_DECODE_FAILED' })
  }
})

// ── FLIGHT PLANS (admin read-only view) ─────────────────────────────────────

// GET /api/admin/flight-plans — all manned flight plans, any status
// Admin portal FlightPlansPage uses this endpoint.
// Returns the same fields the page renders: aircraftId, status, adep, ades,
// eobt, flightRules, flightType, ficNumber, adcNumber, aftnMessage, aftnAddressees.
router.get('/flight-plans', async (req, res) => {
  try {
    const { page = '1', limit = '30', status, type, search } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const where: Record<string, unknown> = {}
    if (status) where.status     = status
    if (type)   where.flightType = type
    if (search) {
      where.OR = [
        { aircraftId: { contains: search as string, mode: 'insensitive' } },
      ]
    }

    const [plans, total] = await Promise.all([
      prisma.mannedFlightPlan.findMany({
        where, skip, take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, aircraftId: true, aircraftType: true,
          status: true, flightRules: true, flightType: true,
          adep: true, ades: true, eobt: true, eet: true,
          ficNumber: true, adcNumber: true, aftnMessage: true, aftnAddressees: true,
          filedAt: true, clearedAt: true, createdAt: true,
          filedByType: true, route: true, cruisingLevel: true, cruisingSpeed: true,
        }
      }),
      prisma.mannedFlightPlan.count({ where }),
    ])

    res.json(serializeForJson({
      success: true,
      flightPlans: plans.map(p => ({
        id:             p.id,
        aircraftId:     p.aircraftId,
        aircraftType:   p.aircraftType,
        status:         p.status,
        flightRules:    p.flightRules,
        flightType:     p.flightType,
        adep:           p.adep,
        ades:           p.ades,
        eobt:           p.eobt,
        eet:            p.eet,
        route:          p.route,
        cruisingLevel:  p.cruisingLevel,
        cruisingSpeed:  p.cruisingSpeed,
        ficNumber:      p.ficNumber,
        adcNumber:      p.adcNumber,
        aftnMessage:    p.aftnMessage,
        aftnAddressees: p.aftnAddressees,
        filedByType:    p.filedByType,
        filedAt:        p.filedAt,
        clearedAt:      p.clearedAt,
        createdAt:      p.createdAt,
      })),
      total,
    }))
  } catch {
    res.status(500).json({ error: 'FLIGHT_PLANS_FETCH_FAILED' })
  }
})

// GET /api/admin/flight-plans/:id — full flight plan detail
router.get('/flight-plans/:id', async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, plan }))
  } catch {
    res.status(500).json({ error: 'FLIGHT_PLAN_FETCH_FAILED' })
  }
})

// GET /api/admin/flight-plans/:id/route-geometry — waypoint coordinates for map
router.get('/flight-plans/:id/route-geometry', async (req, res) => {
  try {
    const plan = await prisma.mannedFlightPlan.findUnique({
      where: { id: req.params.id },
      select: { adep: true, ades: true, route: true, validationResultJson: true }
    })
    if (!plan) { res.status(404).json({ error: 'FLIGHT_PLAN_NOT_FOUND' }); return }

    let points: { identifier: string; type: string; latDeg: number; lonDeg: number }[] = []
    try {
      const vr = JSON.parse(plan.validationResultJson ?? '{}')
      if (vr.routeLegs && vr.routeLegs.length > 0) {
        const seen = new Set<string>()
        for (const leg of vr.routeLegs) {
          if (!seen.has(leg.from.identifier)) { seen.add(leg.from.identifier); points.push(leg.from) }
          if (!seen.has(leg.to.identifier))   { seen.add(leg.to.identifier);   points.push(leg.to) }
        }
      }
    } catch { /* validationResultJson may not have routeLegs */ }

    // Filter out points with invalid (0,0) coordinates
    points = points.filter(p => p.latDeg !== 0 || p.lonDeg !== 0)

    // Fallback: look up ADEP/ADES from AerodromeRecord
    if (points.length === 0) {
      const [dep, dest] = await Promise.all([
        prisma.aerodromeRecord.findFirst({ where: { OR: [{ icao: plan.adep }, { icaoCode: plan.adep }] } }),
        prisma.aerodromeRecord.findFirst({ where: { OR: [{ icao: plan.ades }, { icaoCode: plan.ades }] } }),
      ])
      const depLat = dep?.latDeg ?? dep?.latitudeDeg ?? 0
      const depLon = dep?.lonDeg ?? dep?.longitudeDeg ?? 0
      if (dep && (depLat !== 0 || depLon !== 0))  points.push({ identifier: plan.adep, type: 'AERODROME', latDeg: depLat, lonDeg: depLon })
      const destLat = dest?.latDeg ?? dest?.latitudeDeg ?? 0
      const destLon = dest?.lonDeg ?? dest?.longitudeDeg ?? 0
      if (dest && (destLat !== 0 || destLon !== 0)) points.push({ identifier: plan.ades, type: 'AERODROME', latDeg: destLat, lonDeg: destLon })
    }

    res.json({ success: true, adep: plan.adep, ades: plan.ades, route: plan.route, points })
  } catch {
    res.status(500).json({ error: 'ROUTE_GEOMETRY_FAILED' })
  }
})

// ── FLIGHT PLAN CLEARANCE (admin simulates AFMLU / FIR issuance) ─────────
// These let an admin issue ADC and FIC numbers on a filed flight plan.
// The pilot's app receives the numbers via SSE in real time.

// POST /api/admin/flight-plans/:id/issue-adc
router.post('/flight-plans/:id/issue-adc', async (req, res) => {
  try {
    const { adcNumber, adcType = 'RESTRICTED', afmluId = 1 } = req.body
    if (!adcNumber || typeof adcNumber !== 'string' || adcNumber.trim().length === 0) {
      res.status(400).json({ error: 'ADC_NUMBER_REQUIRED' }); return
    }

    const result = await clearanceService.issueAdc({
      flightPlanId:    req.params.id,
      afmluId:         typeof afmluId === 'number' ? afmluId : 1,
      adcNumber:       adcNumber.trim(),
      adcType,
      issuedAt:        new Date().toISOString(),
      afmluOfficerName: `Admin ${req.adminAuth!.adminUserId}`,
    })

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'admin_issued_adc', resourceType: 'manned_flight_plan',
      resourceId: req.params.id,
      detailJson: JSON.stringify({ adcNumber, adcType, afmluId })
    }})

    log.info('admin_issued_adc', { data: { flightPlanId: req.params.id, adcNumber } })
    res.json({ success: true, clearanceStatus: result.status, adcNumber })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(msg.includes('not found') ? 404 : 500).json({ error: 'ADC_ISSUE_FAILED', detail: msg })
  }
})

// POST /api/admin/flight-plans/:id/issue-fic
router.post('/flight-plans/:id/issue-fic', async (req, res) => {
  try {
    const { ficNumber, firCode = 'VIDF', subject = 'Clearance issued' } = req.body
    if (!ficNumber || typeof ficNumber !== 'string' || ficNumber.trim().length === 0) {
      res.status(400).json({ error: 'FIC_NUMBER_REQUIRED' }); return
    }

    const VALID_FIRS = ['VIDF', 'VABB', 'VECC', 'VOMF']
    if (!VALID_FIRS.includes(firCode)) {
      res.status(400).json({ error: 'INVALID_FIR_CODE', valid: VALID_FIRS }); return
    }

    const result = await clearanceService.issueFic({
      flightPlanId:   req.params.id,
      firCode,
      ficNumber:      ficNumber.trim(),
      subject,
      issuedAt:       new Date().toISOString(),
      firOfficerName: `Admin ${req.adminAuth!.adminUserId}`,
    })

    await prisma.auditLog.create({ data: {
      actorType: 'ADMIN_USER', actorId: req.adminAuth!.adminUserId,
      action: 'admin_issued_fic', resourceType: 'manned_flight_plan',
      resourceId: req.params.id,
      detailJson: JSON.stringify({ ficNumber, firCode, subject })
    }})

    log.info('admin_issued_fic', { data: { flightPlanId: req.params.id, ficNumber, firCode } })
    res.json({ success: true, clearanceStatus: result.status, ficNumber })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(msg.includes('not found') ? 404 : 500).json({ error: 'FIC_ISSUE_FAILED', detail: msg })
  }
})

// ── SYSTEM ──────────────────────────────────────────────────────────────────

// GET /admin/system/health
router.get('/system/health', async (req, res) => {
  let dbConnected = false
  try { await prisma.$queryRaw`SELECT 1`; dbConnected = true } catch { /* intentional */ }
  res.json({ status: 'ok', version: '4.0', dbConnected,
    timestamp: new Date().toISOString() })
})

// GET /admin/system/adapter-status — pings all adapters and returns stub vs live
router.get('/system/adapter-status', async (req, res) => {
  // All adapters are currently STUB — live integration pending
  res.json({

    adapters: {
      digitalSky:   { mode: 'STUB', live: false, latencyMs: null },
      uidai:        { mode: 'STUB', live: false, latencyMs: null },
      afmlu:        { mode: 'STUB', live: false, latencyMs: null },
      aftn:         { mode: 'STUB', live: false, latencyMs: null },
      ntpAuthority: { mode: 'STUB', live: false, latencyMs: null },
      crl:          { mode: 'STUB', live: false, latencyMs: null },
      notamFeed:    { mode: 'STUB', live: false, latencyMs: null },
    },
    retrievedAt: new Date().toISOString()
  })
})

// ── DRONE OPERATION PLANS (admin review) ────────────────────────────────────

// GET /api/admin/drone-plans — List all submitted drone operation plans
router.get('/drone-plans', requireAdminAuth, async (_req, res) => {
  try {
    const plans = await prisma.droneOperationPlan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json(serializeForJson({ success: true, plans }))
  } catch {
    res.status(500).json({ error: 'DRONE_PLAN_LIST_FAILED' })
  }
})

// GET /api/admin/drone-plans/:id — Detail with map data
router.get('/drone-plans/:id', requireAdminAuth, async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    res.json(serializeForJson({ success: true, plan }))
  } catch {
    res.status(500).json({ error: 'DRONE_PLAN_FETCH_FAILED' })
  }
})

// POST /api/admin/drone-plans/:id/approve — Approve a submitted plan
router.post('/drone-plans/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.status !== 'SUBMITTED') {
      res.status(409).json({ error: 'CANNOT_APPROVE', detail: `Plan is ${plan.status}, not SUBMITTED` }); return
    }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: {
        status:     'APPROVED',
        approvedAt: new Date(),
        approvedBy: req.adminAuth!.adminUserId,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'ADMIN', actorId: req.adminAuth!.adminUserId, actorRole: req.adminAuth!.adminRole,
        action: 'DRONE_PLAN_APPROVED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId: plan.planId }),
      }
    })

    log.info('drone_plan_approved', { data: { planId: plan.planId, approvedBy: req.adminAuth!.adminUserId } })

    // Run fresh conflict check after approval so admin sees latest state
    let conflictCheck = null
    try {
      conflictCheck = await conflictService.checkDronePlanConflicts(updated)
    } catch (err) {
      log.error('conflict_check_after_approve_failed', { data: { error: err instanceof Error ? err.message : String(err) } })
    }

    res.json(serializeForJson({ success: true, plan: updated, conflicts: conflictCheck }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_approve_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_APPROVE_FAILED' })
  }
})

// POST /api/admin/drone-plans/:id/reject — Reject a submitted plan
router.post('/drone-plans/:id/reject', requireAdminAuth, async (req, res) => {
  try {
    const { reason } = req.body
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'REASON_REQUIRED' }); return
    }

    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'DRONE_PLAN_NOT_FOUND' }); return }
    if (plan.status !== 'SUBMITTED') {
      res.status(409).json({ error: 'CANNOT_REJECT', detail: `Plan is ${plan.status}, not SUBMITTED` }); return
    }

    const updated = await prisma.droneOperationPlan.update({
      where: { id: req.params.id },
      data: {
        status:          'REJECTED',
        rejectionReason: reason.trim(),
      },
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'ADMIN', actorId: req.adminAuth!.adminUserId, actorRole: req.adminAuth!.adminRole,
        action: 'DRONE_PLAN_REJECTED', resourceType: 'drone_operation_plan', resourceId: plan.id,
        detailJson: JSON.stringify({ planId: plan.planId, reason: reason.trim() }),
      }
    })

    log.warn('drone_plan_rejected', { data: { planId: plan.planId, reason: reason.trim() } })
    res.json(serializeForJson({ success: true, plan: updated }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('drone_plan_reject_error', { data: { error: msg } })
    res.status(500).json({ error: 'DRONE_PLAN_REJECT_FAILED' })
  }
})

// ── eGCA ADAPTER STATUS ─────────────────────────────────────────────────────

// In-memory ring buffer for recent eGCA API calls (admin-only diagnostic)
interface EgcaCallLogEntry {
  timestamp: string
  method:    string
  path:      string
  status:    number
  latencyMs: number
  error?:    string
}

const EGCA_CALL_LOG_MAX = 50
const egcaCallLog: EgcaCallLogEntry[] = []

/** Push a call log entry, evicting oldest if over capacity. */
export function recordEgcaCall(entry: EgcaCallLogEntry): void {
  egcaCallLog.push(entry)
  if (egcaCallLog.length > EGCA_CALL_LOG_MAX) egcaCallLog.shift()
}

// GET /api/admin/egca-status — eGCA adapter integration diagnostics
router.get('/egca-status', requireAdminAuth, async (req, res) => {
  try {
    const adapter = resolveEgcaAdapter()
    const isMock  = adapter instanceof EgcaAdapterMock
    const isLive  = adapter instanceof EgcaAdapterImpl

    // ── Health ping ─────────────────────────────────────────────────────
    let healthStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'OFFLINE'
    let healthLatencyMs = 0
    let healthError: string | undefined

    const healthStart = Date.now()
    try {
      // For mock adapter, simulate a fast health check
      if (isMock) {
        healthLatencyMs = 12
        healthStatus    = 'ONLINE'
      } else {
        // Live adapter: attempt auth check as health ping
        // We use a lightweight approach — try to call the eGCA base URL /health
        const https = await import('https')
        const http  = await import('http')
        const baseUrl = env.EGCA_API_BASE_URL

        healthLatencyMs = await new Promise<number>((resolve, reject) => {
          const start = Date.now()
          const parsed = new URL(baseUrl + '/health')
          const transport = parsed.protocol === 'https:' ? https : http

          const req = transport.request({
            method:   'GET',
            hostname: parsed.hostname,
            port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path:     parsed.pathname,
            timeout:  10_000,
            headers:  { 'User-Agent': 'JADS-Platform/4.0', 'Accept': 'application/json' },
          }, (res) => {
            res.on('data', () => {})
            res.on('end', () => resolve(Date.now() - start))
          })

          req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')) })
          req.on('error', (err) => reject(err))
          req.end()
        })

        if (healthLatencyMs < 2_000) {
          healthStatus = 'ONLINE'
        } else {
          healthStatus = 'DEGRADED'
        }
      }
    } catch (err) {
      healthLatencyMs = Date.now() - healthStart
      healthStatus    = 'OFFLINE'
      healthError     = err instanceof Error ? err.message : String(err)
    }

    // ── JWT token status ────────────────────────────────────────────────
    let tokenStatus: {
      hasToken:    boolean
      expiresAt:   string | null
      secondsLeft: number | null
    } = { hasToken: false, expiresAt: null, secondsLeft: null }

    if (isMock) {
      // Mock adapter always has a "valid" token
      const mockExpiry = new Date(Date.now() + 3600 * 1_000)
      tokenStatus = {
        hasToken:    true,
        expiresAt:   mockExpiry.toISOString(),
        secondsLeft: 3600,
      }
    } else if (isLive) {
      // Access private fields via adapter state (safe cast for admin diagnostics)
      const liveAdapter = adapter as any
      if (liveAdapter.token && liveAdapter.expiresAt) {
        const expiresAt   = liveAdapter.expiresAt as Date
        const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000))
        tokenStatus = {
          hasToken:    true,
          expiresAt:   expiresAt.toISOString(),
          secondsLeft,
        }
      }
    }

    // ── Recent call log ─────────────────────────────────────────────────
    const recentCalls = egcaCallLog.slice(-5).reverse()

    // ── Adapter version ─────────────────────────────────────────────────
    const adapterMode = isMock ? 'MOCK' : isLive ? 'LIVE' : 'UNKNOWN'
    const adapterVersion = `${env.JADS_VERSION}-${adapterMode}`

    res.json({
      health: {
        status:    healthStatus,
        latencyMs: healthLatencyMs,
        error:     healthError ?? null,
      },
      token: tokenStatus,
      recentCalls,
      adapter: {
        mode:    adapterMode,
        version: adapterVersion,
        baseUrl: isMock ? '(mock — no external calls)' : env.EGCA_API_BASE_URL,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('egca_status_error', { data: { error: msg } })
    res.status(500).json({ error: 'EGCA_STATUS_FAILED' })
  }
})

// POST /api/admin/egca-reconnect — Force re-authentication with eGCA
router.post('/egca-reconnect', requireAdminAuth, async (req, res) => {
  try {
    const adapter = resolveEgcaAdapter()
    const isMock  = adapter instanceof EgcaAdapterMock

    const email    = env.EGCA_API_EMAIL
    const password = env.EGCA_API_PASSWORD

    const startMs = Date.now()
    try {
      const result = await adapter.authenticate(
        email || 'admin@jads.gov.in',
        password || 'mock-password',
      )

      const latencyMs = Date.now() - startMs

      recordEgcaCall({
        timestamp: new Date().toISOString(),
        method:    'POST',
        path:      '/auth/login',
        status:    200,
        latencyMs,
      })

      await prisma.auditLog.create({
        data: {
          actorType:    'ADMIN_USER',
          actorId:      req.adminAuth!.adminUserId,
          actorRole:    req.adminAuth!.adminRole,
          action:       'egca_force_reconnect',
          resourceType: 'egca_adapter',
          resourceId:   'singleton',
          detailJson:   JSON.stringify({ mode: isMock ? 'MOCK' : 'LIVE', latencyMs }),
        },
      })

      log.info('egca_force_reconnect', {
        data: { adminId: req.adminAuth!.adminUserId, mode: isMock ? 'MOCK' : 'LIVE', latencyMs },
      })

      res.json({
        success:   true,
        expiresAt: result.expiresAt.toISOString(),
        latencyMs,
      })
    } catch (err) {
      const latencyMs = Date.now() - startMs
      const errMsg    = err instanceof Error ? err.message : String(err)

      recordEgcaCall({
        timestamp: new Date().toISOString(),
        method:    'POST',
        path:      '/auth/login',
        status:    401,
        latencyMs,
        error:     errMsg,
      })

      res.status(502).json({ error: 'EGCA_RECONNECT_FAILED', detail: errMsg })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('egca_reconnect_error', { data: { error: msg } })
    res.status(500).json({ error: 'EGCA_RECONNECT_FAILED' })
  }
})

// ── ZONE CONFLICT MONITOR (dashboard panel) ────────────────────────────────

// GET /api/admin/zone-conflict-monitor — Aggregated data for the dashboard
// Zone Conflict Monitor panel (PLATFORM_SUPER_ADMIN only).
// Returns:
//   - plans24h: drone operation plans from the last 24 hours with zone classification
//   - conflictAlerts: plans in YELLOW/RED zones that were submitted without proper permissions
//   - pendingYellowCount: count of SUBMITTED plans awaiting ATC approval in yellow zones
router.get('/zone-conflict-monitor', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (_req, res) => {
  try {
    const now          = new Date()
    const twentyFourAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // ── 1. All plans submitted/created in last 24 hours ──────────────────
    const recentPlans = await prisma.droneOperationPlan.findMany({
      where: {
        createdAt: { gte: twentyFourAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // ── 2. Classify each plan's zone ─────────────────────────────────────
    const egca = resolveEgcaAdapter()

    const plans24h = await Promise.all(recentPlans.map(async (plan) => {
      // Build polygon for zone check
      let polygon: { latitude: number; longitude: number }[] = []
      if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
        try {
          const geo = JSON.parse(plan.areaGeoJson)
          if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
            polygon = geo.coordinates[0].map((c: number[]) => ({
              latitude: c[1], longitude: c[0],
            }))
          }
        } catch { /* skip bad GeoJSON */ }
      } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
        // Approximate circle as 8-point polygon for zone check
        const r = (plan.radiusM ?? 500) / 111000 // approx deg
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI * 2) / 8
          polygon.push({
            latitude:  plan.centerLatDeg + r * Math.sin(angle),
            longitude: plan.centerLonDeg + r * Math.cos(angle),
          })
        }
      }

      let zoneClassification: { zone: string; reasons: string[]; atcAuthority?: string } = {
        zone: 'GREEN', reasons: ['No restricted zones detected'],
      }
      if (polygon.length >= 3) {
        try {
          zoneClassification = await egca.checkAirspaceZone(polygon)
        } catch { /* default to GREEN on error */ }
      }

      return serializeForJson({
        id:                plan.id,
        planId:            plan.planId,
        operatorId:        plan.operatorId,
        droneSerialNumber: plan.droneSerialNumber,
        uinNumber:         plan.uinNumber,
        areaType:          plan.areaType,
        areaGeoJson:       plan.areaGeoJson,
        centerLatDeg:      plan.centerLatDeg,
        centerLonDeg:      plan.centerLonDeg,
        radiusM:           plan.radiusM,
        maxAltitudeAglM:   plan.maxAltitudeAglM,
        status:            plan.status,
        purpose:           plan.purpose,
        remarks:           plan.remarks,
        rejectionReason:   plan.rejectionReason,
        plannedStartUtc:   plan.plannedStartUtc,
        plannedEndUtc:     plan.plannedEndUtc,
        createdAt:         plan.createdAt,
        submittedAt:       plan.submittedAt,
        approvedAt:        plan.approvedAt,
        approvedBy:        plan.approvedBy,
        zoneClassification,
      })
    }))

    // ── 3. Conflict alerts: YELLOW/RED plans that were SUBMITTED ─────────
    const conflictAlerts = plans24h.filter((p: any) =>
      p.zoneClassification.zone !== 'GREEN' && p.status === 'SUBMITTED'
    )

    // ── 4. Pending yellow zone count ─────────────────────────────────────
    const pendingYellowCount = plans24h.filter((p: any) =>
      p.zoneClassification.zone === 'YELLOW' && p.status === 'SUBMITTED'
    ).length

    res.json({
      success: true,
      plans24h,
      conflictAlerts,
      pendingYellowCount,
      generatedAt: now.toISOString(),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('zone_conflict_monitor_error', { data: { error: msg } })
    res.status(500).json({ error: 'ZONE_CONFLICT_MONITOR_FAILED' })
  }
})

// ── ATC QUEUE — Yellow-zone applications awaiting ATC approval ───────────

// GET /api/admin/atc-queue — Filterable list of yellow-zone SUBMITTED plans + performance stats
router.get('/atc-queue', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const {
      authority,       // filter by ATC authority string
      expedited,       // 'true' or 'false'
      overdue,         // 'true' — only past-due items
      dateFrom,        // ISO date string
      dateTo,          // ISO date string
      page = '1',
      limit = '50',
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const take = parseInt(limit as string)

    // ── 1. Fetch all SUBMITTED drone operation plans ─────────────────────
    const where: Record<string, unknown> = { status: 'SUBMITTED' }
    if (dateFrom || dateTo) {
      where.submittedAt = {}
      if (dateFrom) (where.submittedAt as any).gte = new Date(dateFrom as string)
      if (dateTo)   (where.submittedAt as any).lte = new Date(dateTo as string)
    }

    const allSubmitted = await prisma.droneOperationPlan.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      take: 500, // cap for zone classification
    })

    // ── 2. Classify zones via eGCA adapter ───────────────────────────────
    const egca = resolveEgcaAdapter()
    const now = new Date()
    const SLA_DAYS = 7 // default SLA for ATC approval

    const classifiedPlans = await Promise.all(allSubmitted.map(async (plan) => {
      let polygon: { latitude: number; longitude: number }[] = []
      if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
        try {
          const geo = JSON.parse(plan.areaGeoJson)
          if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
            polygon = geo.coordinates[0].map((c: number[]) => ({
              latitude: c[1], longitude: c[0],
            }))
          }
        } catch { /* skip bad GeoJSON */ }
      } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
        const r = (plan.radiusM ?? 500) / 111000
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI * 2) / 8
          polygon.push({
            latitude:  plan.centerLatDeg + r * Math.sin(angle),
            longitude: plan.centerLonDeg + r * Math.cos(angle),
          })
        }
      }

      let zoneClassification: { zone: string; reasons: string[]; atcAuthority?: string } = {
        zone: 'GREEN', reasons: ['No restricted zones detected'],
      }
      if (polygon.length >= 3) {
        try {
          zoneClassification = await egca.checkAirspaceZone(polygon)
        } catch { /* default to GREEN on error */ }
      }

      // Compute SLA due date (7 days from submission)
      const submittedDate = plan.submittedAt ? new Date(plan.submittedAt) : new Date(plan.createdAt)
      const dueDate = new Date(submittedDate.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000)
      const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

      let slaStatus: 'ON_TIME' | 'DUE_SOON' | 'OVERDUE'
      if (daysRemaining < 0) slaStatus = 'OVERDUE'
      else if (daysRemaining <= 2) slaStatus = 'DUE_SOON'
      else slaStatus = 'ON_TIME'

      // Fetch pilot info
      let pilotName = plan.operatorId.slice(0, 16)
      try {
        const user = await prisma.civilianUser.findUnique({
          where: { id: plan.operatorId },
          select: { email: true, mobileNumber: true },
        })
        if (user) pilotName = user.email ?? user.mobileNumber ?? plan.operatorId.slice(0, 16)
      } catch { /* non-critical */ }

      return {
        id:                plan.id,
        planId:            plan.planId,
        operatorId:        plan.operatorId,
        pilotName,
        droneSerialNumber: plan.droneSerialNumber,
        uinNumber:         plan.uinNumber,
        areaType:          plan.areaType,
        areaGeoJson:       plan.areaGeoJson,
        centerLatDeg:      plan.centerLatDeg,
        centerLonDeg:      plan.centerLonDeg,
        radiusM:           plan.radiusM,
        maxAltitudeAglM:   plan.maxAltitudeAglM,
        minAltitudeAglM:   plan.minAltitudeAglM,
        status:            plan.status,
        purpose:           plan.purpose,
        remarks:           plan.remarks,
        rejectionReason:   plan.rejectionReason,
        plannedStartUtc:   plan.plannedStartUtc,
        plannedEndUtc:     plan.plannedEndUtc,
        createdAt:         plan.createdAt,
        submittedAt:       plan.submittedAt,
        approvedAt:        plan.approvedAt,
        approvedBy:        plan.approvedBy,
        notifyEmail:       plan.notifyEmail,
        notifyMobile:      plan.notifyMobile,
        zoneClassification,
        dueDate:           dueDate.toISOString(),
        daysRemaining,
        slaStatus,
        expedited:         plan.purpose === 'EMERGENCY' || plan.purpose === 'SEARCH_AND_RESCUE',
      }
    }))

    // ── 3. Filter to YELLOW zone only ─────────────────────────────────────
    let yellowPlans = classifiedPlans.filter(p => p.zoneClassification.zone === 'YELLOW')

    // Apply client-side filters
    if (authority) {
      yellowPlans = yellowPlans.filter(p =>
        p.zoneClassification.atcAuthority?.toLowerCase().includes((authority as string).toLowerCase())
      )
    }
    if (expedited === 'true') {
      yellowPlans = yellowPlans.filter(p => p.expedited)
    } else if (expedited === 'false') {
      yellowPlans = yellowPlans.filter(p => !p.expedited)
    }
    if (overdue === 'true') {
      yellowPlans = yellowPlans.filter(p => p.slaStatus === 'OVERDUE')
    }

    const total = yellowPlans.length
    const overdueCount = yellowPlans.filter(p => p.slaStatus === 'OVERDUE').length
    const dueSoonCount = yellowPlans.filter(p => p.slaStatus === 'DUE_SOON').length

    // Paginate
    const paginatedPlans = yellowPlans.slice(skip, skip + take)

    // ── 4. Authority performance stats (last 90 days) ─────────────────────
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const recentlyProcessed = await prisma.droneOperationPlan.findMany({
      where: {
        status: { in: ['APPROVED', 'REJECTED'] },
        approvedAt: { gte: ninetyDaysAgo },
      },
      select: {
        submittedAt: true,
        approvedAt: true,
        areaType: true,
        areaGeoJson: true,
        centerLatDeg: true,
        centerLonDeg: true,
        radiusM: true,
      },
      take: 500,
    })

    // Classify processed plans and compute avg days by authority
    const authorityStats: Record<string, { totalDays: number; count: number }> = {}
    for (const plan of recentlyProcessed) {
      if (!plan.submittedAt || !plan.approvedAt) continue

      let polygon: { latitude: number; longitude: number }[] = []
      if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
        try {
          const geo = JSON.parse(plan.areaGeoJson)
          if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
            polygon = geo.coordinates[0].map((c: number[]) => ({
              latitude: c[1], longitude: c[0],
            }))
          }
        } catch { /* skip */ }
      } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
        const r = (plan.radiusM ?? 500) / 111000
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI * 2) / 8
          polygon.push({
            latitude:  plan.centerLatDeg + r * Math.sin(angle),
            longitude: plan.centerLonDeg + r * Math.cos(angle),
          })
        }
      }

      let auth = 'Unknown'
      if (polygon.length >= 3) {
        try {
          const zc = await egca.checkAirspaceZone(polygon)
          if (zc.zone === 'YELLOW' && zc.atcAuthority) auth = zc.atcAuthority
          else continue // not yellow zone — skip
        } catch { continue }
      } else { continue }

      const days = (plan.approvedAt.getTime() - plan.submittedAt.getTime()) / (24 * 60 * 60 * 1000)
      if (!authorityStats[auth]) authorityStats[auth] = { totalDays: 0, count: 0 }
      authorityStats[auth].totalDays += days
      authorityStats[auth].count += 1
    }

    const authorityPerformance = Object.entries(authorityStats).map(([authority, stats]) => ({
      authority,
      avgDays: Math.round((stats.totalDays / stats.count) * 10) / 10,
      count: stats.count,
    }))

    // ── 5. Collect unique authorities for filter dropdown ─────────────────
    const authorities = [...new Set(
      classifiedPlans
        .filter(p => p.zoneClassification.zone === 'YELLOW' && p.zoneClassification.atcAuthority)
        .map(p => p.zoneClassification.atcAuthority!)
    )]

    res.json(serializeForJson({
      success: true,
      plans: paginatedPlans,
      total,
      overdueCount,
      dueSoonCount,
      authorities,
      authorityPerformance,
      generatedAt: now.toISOString(),
    }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('atc_queue_error', { data: { error: msg } })
    res.status(500).json({ error: 'ATC_QUEUE_FETCH_FAILED' })
  }
})

// POST /api/admin/atc-queue/send-reminder — Bulk send reminders for overdue items
router.post('/atc-queue/send-reminder', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const { planIds } = req.body
    if (!Array.isArray(planIds) || planIds.length === 0) {
      res.status(400).json({ error: 'PLAN_IDS_REQUIRED' }); return
    }

    // Log the reminder action (actual email/notification is a future integration)
    const plans = await prisma.droneOperationPlan.findMany({
      where: { id: { in: planIds }, status: 'SUBMITTED' },
      select: { id: true, planId: true },
    })

    for (const plan of plans) {
      await prisma.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: req.adminAuth!.adminUserId,
          actorRole: req.adminAuth!.adminRole,
          action: 'ATC_REMINDER_SENT',
          resourceType: 'drone_operation_plan',
          resourceId: plan.id,
          detailJson: JSON.stringify({
            planId: plan.planId,
            reminderType: 'OVERDUE_ATC_APPROVAL',
            sentAt: new Date().toISOString(),
          }),
        },
      })
    }

    log.info('atc_reminders_sent', {
      data: {
        planCount: plans.length,
        planIds: plans.map(p => p.planId),
        sentBy: req.adminAuth!.adminUserId,
      },
    })

    res.json({
      success: true,
      remindersQueued: plans.length,
      planIds: plans.map(p => p.planId),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('atc_reminder_error', { data: { error: msg } })
    res.status(500).json({ error: 'ATC_REMINDER_FAILED' })
  }
})

// GET /api/admin/atc-queue/:id — Detailed view of a single ATC queue item with timeline
router.get('/atc-queue/:id', requireAdminRole('PLATFORM_SUPER_ADMIN'), async (req, res) => {
  try {
    const plan = await prisma.droneOperationPlan.findUnique({ where: { id: req.params.id } })
    if (!plan) { res.status(404).json({ error: 'PLAN_NOT_FOUND' }); return }

    // Fetch pilot info
    let pilotInfo: Record<string, unknown> = {}
    try {
      const user = await prisma.civilianUser.findUnique({
        where: { id: plan.operatorId },
        select: { id: true, email: true, mobileNumber: true, role: true, accountStatus: true },
      })
      if (user) pilotInfo = user
    } catch { /* non-critical */ }

    // Classify zone
    const egca = resolveEgcaAdapter()
    let polygon: { latitude: number; longitude: number }[] = []
    if (plan.areaType === 'POLYGON' && plan.areaGeoJson) {
      try {
        const geo = JSON.parse(plan.areaGeoJson)
        if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
          polygon = geo.coordinates[0].map((c: number[]) => ({
            latitude: c[1], longitude: c[0],
          }))
        }
      } catch { /* skip */ }
    } else if (plan.areaType === 'CIRCLE' && plan.centerLatDeg != null && plan.centerLonDeg != null) {
      const r = (plan.radiusM ?? 500) / 111000
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8
        polygon.push({
          latitude:  plan.centerLatDeg + r * Math.sin(angle),
          longitude: plan.centerLonDeg + r * Math.cos(angle),
        })
      }
    }

    let zoneClassification: { zone: string; reasons: string[]; atcAuthority?: string } = {
      zone: 'GREEN', reasons: ['No restricted zones detected'],
    }
    if (polygon.length >= 3) {
      try {
        zoneClassification = await egca.checkAirspaceZone(polygon)
      } catch { /* default to GREEN */ }
    }

    // Build timeline from audit logs
    const auditEvents = await prisma.auditLog.findMany({
      where: {
        resourceType: 'drone_operation_plan',
        resourceId: plan.id,
      },
      orderBy: { timestamp: 'asc' },
      select: {
        action: true,
        timestamp: true,
        actorId: true,
        actorType: true,
        detailJson: true,
      },
    })

    const timeline = [
      { event: 'CREATED', timestamp: plan.createdAt.toISOString(), actor: plan.operatorId },
      ...(plan.submittedAt ? [{ event: 'SUBMITTED', timestamp: plan.submittedAt.toISOString(), actor: plan.operatorId }] : []),
      ...(plan.approvedAt ? [{ event: 'APPROVED', timestamp: plan.approvedAt.toISOString(), actor: plan.approvedBy ?? 'Unknown' }] : []),
      ...auditEvents.map(e => ({
        event: e.action,
        timestamp: e.timestamp.toISOString(),
        actor: e.actorId,
        detail: e.detailJson,
      })),
    ]

    // SLA computation
    const now = new Date()
    const SLA_DAYS = 7
    const submittedDate = plan.submittedAt ? new Date(plan.submittedAt) : new Date(plan.createdAt)
    const dueDate = new Date(submittedDate.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000)
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    let slaStatus: 'ON_TIME' | 'DUE_SOON' | 'OVERDUE'
    if (daysRemaining < 0) slaStatus = 'OVERDUE'
    else if (daysRemaining <= 2) slaStatus = 'DUE_SOON'
    else slaStatus = 'ON_TIME'

    res.json(serializeForJson({
      success: true,
      plan: {
        ...plan,
        zoneClassification,
        pilotInfo,
        dueDate: dueDate.toISOString(),
        daysRemaining,
        slaStatus,
        expedited: plan.purpose === 'EMERGENCY' || plan.purpose === 'SEARCH_AND_RESCUE',
      },
      timeline,
    }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('atc_queue_detail_error', { data: { error: msg } })
    res.status(500).json({ error: 'ATC_QUEUE_DETAIL_FAILED' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION / ALERT MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/alert-configs ─────────────────────────────────────────────
// Get all 13 alert type configurations.
router.get('/alert-configs', requireAdminAuth, async (_req, res) => {
  res.json({ success: true, configs: notifService.getAlertConfigs() })
})

// ── PUT /api/admin/alert-configs/:type ──────────────────────────────────────
// Update an alert type's enabled/email/threshold settings.
router.put('/alert-configs/:type', requireAdminAuth, async (req, res) => {
  try {
    const { enabled, emailEnabled, thresholdDays } = req.body
    const updated = notifService.updateAlertConfig(
      req.params.type as any,
      { enabled, emailEnabled, thresholdDays }
    )
    if (!updated) {
      res.status(404).json({ error: 'ALERT_TYPE_NOT_FOUND' })
      return
    }
    res.json({ success: true, config: updated })
  } catch (e: unknown) {
    res.status(500).json({ error: 'ALERT_CONFIG_UPDATE_FAILED' })
  }
})

// ── POST /api/admin/broadcast ───────────────────────────────────────────────
// Send a broadcast notification to multiple users.
router.post('/broadcast', requireAdminAuth, async (req, res) => {
  try {
    const { title, body, recipients, category, region } = req.body
    if (!title || !body) {
      res.status(400).json({ error: 'MISSING_FIELDS', detail: 'title and body are required' })
      return
    }

    let userIds: string[] = []

    if (recipients === 'all') {
      // Broadcast to all civilian users
      const users = await prisma.civilianUser.findMany({ select: { id: true } })
      userIds = users.map(u => u.id)
    } else if (Array.isArray(recipients)) {
      userIds = recipients
    } else {
      // Filter by role/category
      const where: Record<string, unknown> = {}
      if (category) where.role = category
      const users = await prisma.civilianUser.findMany({ where, select: { id: true } })
      userIds = users.map(u => u.id)
    }

    if (userIds.length === 0) {
      res.json({ success: true, count: 0, message: 'No recipients matched' })
      return
    }

    const result = await notifService.broadcast({ userIds, title, body })

    await prisma.auditLog.create({
      data: {
        actorType:    'ADMIN_USER',
        actorId:      req.adminAuth!.adminId,
        action:       'BROADCAST_NOTIFICATION',
        resourceType: 'notification',
        detailJson:   JSON.stringify({ title, recipientCount: userIds.length }),
      },
    })

    res.json({ success: true, ...result })
  } catch (e: unknown) {
    log.error('broadcast_error', { data: { error: e instanceof Error ? e.message : String(e) } })
    res.status(500).json({ error: 'BROADCAST_FAILED' })
  }
})

// ── GET /api/admin/delivery-stats ───────────────────────────────────────────
// Get notification delivery statistics.
router.get('/delivery-stats', requireAdminAuth, async (_req, res) => {
  try {
    const stats = await notifService.getDeliveryStats()
    res.json({ success: true, stats })
  } catch (e: unknown) {
    res.status(500).json({ error: 'DELIVERY_STATS_FAILED' })
  }
})

// ── GET /api/admin/upcoming-expiries ────────────────────────────────────────
// Get upcoming licence/UIN expiries for CSV export.
router.get('/upcoming-expiries', requireAdminAuth, async (req, res) => {
  try {
    const withinDays = parseInt((req.query.days as string) ?? '90')
    const expiries   = await notifService.getUpcomingExpiries(withinDays)

    // If CSV format requested, generate and return CSV
    if (req.query.format === 'csv') {
      const header = 'User ID,Email,Phone,License Number,Expiry Date,Days Remaining,Role,Account Status'
      const rows = expiries.map(e =>
        [e.userId, e.email ?? '', e.phone ?? '', e.licenseNumber ?? '',
         e.expiryDate ?? '', e.daysRemaining ?? '', e.role, e.accountStatus].join(',')
      )
      const csv = [header, ...rows].join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="expiries-${withinDays}d.csv"`)
      res.send(csv)
      return
    }

    res.json({ success: true, expiries, count: expiries.length })
  } catch (e: unknown) {
    res.status(500).json({ error: 'UPCOMING_EXPIRIES_FAILED' })
  }
})

export default router

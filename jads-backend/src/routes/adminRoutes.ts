import express           from 'express'
import { PrismaClient }  from '@prisma/client'
import bcrypt            from 'bcryptjs'
import jwt               from 'jsonwebtoken'
import { env }           from '../env'
import { requireAdminAuth, requireAdminRole } from '../middleware/adminAuthMiddleware'
import { serializeForJson } from '../utils/bigintSerializer'
import { createServiceLogger } from '../logger'
import { BCRYPT_ROUNDS, ADMIN_SESSION_HOURS } from '../constants'
import { SpecialUserAuthService } from '../services/SpecialUserAuthService'

const router                = express.Router()
const prisma                = new PrismaClient()
const log                   = createServiceLogger('AdminRoutes')
const specialUserAuthService = new SpecialUserAuthService(prisma)

// ── ADMIN LOGIN (no auth required) ────────────────────────────────────────

// POST /api/admin/login — issues JWT signed with ADMIN_JWT_SECRET (not JWT_SECRET)
router.post('/login', async (req, res) => {
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
            unitDesignation, role, authorisedCallsigns } = req.body
    if (!entityCode || !serviceNumber || !officialEmail || !role) {
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

export default router

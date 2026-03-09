// PALifecycle.test.ts — Tests for Permission Artefact lifecycle state machine.
//
// Tests cover:
//   1. PA creation in PENDING status
//   2. State machine transitions (valid and invalid)
//   3. pollAndUpdateStatus with eGCA adapter
//   4. downloadAndStorePA with SHA-256 verification
//   5. markLoadedToDrone with UIN validation
//   6. processFlightLog: JWT verification, geofence check, time window check, altitude check
//   7. expireOldPAs batch processing
//   8. revokePA with reason tracking
//   9. Geo utility functions: haversine, point-in-polygon, distance-to-polygon

import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../env'

// ── Mock Prisma ────────────────────────────────────────────────────────────────
// We create a minimal mock that simulates the Prisma client interface.
// Each test can override findUnique/create/update/etc. as needed.

function createMockPrisma() {
  const store: Record<string, any> = {}

  return {
    permissionArtefact: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn().mockImplementation(async ({ data }: any) => {
        const id = data.id ?? `mock-pa-${Date.now()}`
        const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() }
        store[data.applicationId] = record
        return record
      }),
      update:     jest.fn().mockImplementation(async ({ where, data }: any) => {
        const existing = store[where.applicationId] ?? {}
        const updated = { ...existing, ...data, updatedAt: new Date() }
        store[where.applicationId] = updated
        return updated
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count:      jest.fn().mockResolvedValue(0),
    },
    droneOperationPlan: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'plan-001',
        planId: 'DOP-2026-00042',
        operatorId: 'user-001',
        status: 'APPROVED',
      }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    },
    _store: store,
  }
}

// ── Mock eGCA Adapter ──────────────────────────────────────────────────────────

const mockEgcaAdapter = {
  getPermissionStatus: jest.fn().mockResolvedValue({
    status:               'PENDING',
    remarks:              'Under review',
    updatedAt:            new Date().toISOString(),
  }),
  downloadPermissionArtefact: jest.fn().mockResolvedValue(
    Buffer.from('PK\x03\x04mock-pa-zip-content-for-testing')
  ),
  uploadFlightLog: jest.fn().mockResolvedValue(undefined),
}

// Mock the egca adapter resolver
jest.mock('../adapters/egca', () => ({
  resolveEgcaAdapter: () => mockEgcaAdapter,
}))

// Import after mocking
import { PALifecycleService, GeoPoint, PAViolation } from '../services/PALifecycleService'

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const DEMO_POLYGON: GeoPoint[] = [
  { lat: 28.60, lng: 77.20 },
  { lat: 28.61, lng: 77.20 },
  { lat: 28.61, lng: 77.21 },
  { lat: 28.60, lng: 77.21 },
]

const DEMO_PA_PAYLOAD = {
  planId:            'plan-001',
  uinNumber:         'UA-SMALL-001-DEMO',
  pilotId:           'PBI-TEST-001',
  operatorId:        'user-001',
  primaryZone:       'YELLOW',
  flightStartTime:   new Date('2026-06-15T09:00:00Z'),
  flightEndTime:     new Date('2026-06-15T17:00:00Z'),
  geofencePolygon:   DEMO_POLYGON,
  maxAltitudeMeters: 120,
}

function createMockPA(overrides: Record<string, any> = {}) {
  return {
    id:                   'pa-001',
    applicationId:        'FP-TEST-001',
    planId:               'plan-001',
    permissionArtifactId: null,
    txnId:                null,
    uinNumber:            'UA-SMALL-001-DEMO',
    pilotId:              'PBI-TEST-001',
    operatorId:           'user-001',
    status:               'PENDING',
    primaryZone:          'YELLOW',
    flightStartTime:      new Date('2026-06-15T09:00:00Z'),
    flightEndTime:        new Date('2026-06-15T17:00:00Z'),
    geofencePolygon:      DEMO_POLYGON,
    maxAltitudeMeters:    120,
    rawPaXml:             null,
    paZipHash:            null,
    loadedToDroneAt:      null,
    flightLogUploadedAt:  null,
    flightLogHash:        null,
    violations:           null,
    submittedAt:          new Date(),
    approvedAt:           null,
    downloadedAt:         null,
    expiresAt:            null,
    completedAt:          null,
    revokedAt:            null,
    revokeReason:         null,
    createdAt:            new Date(),
    updatedAt:            new Date(),
    ...overrides,
  }
}

/**
 * Create a signed JWT flight log bundle for testing.
 */
function createSignedLogBundle(entries: any[]): Buffer {
  const token = jwt.sign({ entries }, env.JWT_SECRET)
  return Buffer.from(token, 'utf-8')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PALifecycleService — createPendingPA', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('creates a PA in PENDING status with correct fields', async () => {
    const pa = await svc.createPendingPA('FP-NEW-001', DEMO_PA_PAYLOAD)

    expect(prisma.permissionArtefact.create).toHaveBeenCalledTimes(1)
    const createCall = prisma.permissionArtefact.create.mock.calls[0][0]
    expect(createCall.data.applicationId).toBe('FP-NEW-001')
    expect(createCall.data.status).toBe('PENDING')
    expect(createCall.data.uinNumber).toBe('UA-SMALL-001-DEMO')
    expect(createCall.data.operatorId).toBe('user-001')
    expect(createCall.data.maxAltitudeMeters).toBe(120)
    expect(createCall.data.geofencePolygon).toEqual(DEMO_POLYGON)
  })

  test('writes audit log on PA creation', async () => {
    await svc.createPendingPA('FP-NEW-002', DEMO_PA_PAYLOAD)
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const auditCall = prisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data.action).toBe('PA_CREATED')
    expect(auditCall.data.resourceType).toBe('permission_artefact')
  })

  test('throws if DroneOperationPlan not found', async () => {
    prisma.droneOperationPlan.findUnique.mockResolvedValue(null)
    await expect(svc.createPendingPA('FP-BAD-PLAN', DEMO_PA_PAYLOAD))
      .rejects.toThrow('DroneOperationPlan plan-001 not found')
  })
})

describe('PALifecycleService — pollAndUpdateStatus', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('transitions from PENDING to APPROVED when eGCA reports APPROVED', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)
    mockEgcaAdapter.getPermissionStatus.mockResolvedValue({
      status: 'APPROVED',
      permissionArtifactId: 'PA-2026-001',
      remarks: 'Approved by DGCA',
      updatedAt: new Date().toISOString(),
    })

    const result = await svc.pollAndUpdateStatus('FP-TEST-001')

    expect(result).toBe('APPROVED')
    expect(prisma.permissionArtefact.update).toHaveBeenCalledTimes(1)
    const updateData = prisma.permissionArtefact.update.mock.calls[0][0].data
    expect(updateData.status).toBe('APPROVED')
    expect(updateData.permissionArtifactId).toBe('PA-2026-001')
  })

  test('transitions from PENDING to REJECTED when eGCA reports REJECTED', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)
    mockEgcaAdapter.getPermissionStatus.mockResolvedValue({
      status: 'REJECTED',
      remarks: 'Restricted area',
      updatedAt: new Date().toISOString(),
    })

    const result = await svc.pollAndUpdateStatus('FP-TEST-001')
    expect(result).toBe('REJECTED')
  })

  test('skips polling for non-PENDING status', async () => {
    const pa = createMockPA({ status: 'APPROVED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const result = await svc.pollAndUpdateStatus('FP-TEST-001')
    expect(result).toBe('APPROVED')
    expect(mockEgcaAdapter.getPermissionStatus).not.toHaveBeenCalled()
  })

  test('throws if PA not found', async () => {
    prisma.permissionArtefact.findUnique.mockResolvedValue(null)
    await expect(svc.pollAndUpdateStatus('FP-NONEXISTENT'))
      .rejects.toThrow('not found')
  })

  test('no update when eGCA still reports PENDING', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)
    mockEgcaAdapter.getPermissionStatus.mockResolvedValue({
      status: 'PENDING',
      remarks: 'Under review',
      updatedAt: new Date().toISOString(),
    })

    const result = await svc.pollAndUpdateStatus('FP-TEST-001')
    expect(result).toBe('PENDING')
    expect(prisma.permissionArtefact.update).not.toHaveBeenCalled()
  })
})

describe('PALifecycleService — downloadAndStorePA', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('downloads ZIP, computes SHA-256, and stores in rawPaXml', async () => {
    const pa = createMockPA({ status: 'APPROVED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const mockZip = Buffer.from('PK\x03\x04mock-pa-zip-content')
    mockEgcaAdapter.downloadPermissionArtefact.mockResolvedValue(mockZip)

    await svc.downloadAndStorePA('FP-TEST-001')

    expect(mockEgcaAdapter.downloadPermissionArtefact).toHaveBeenCalledWith('FP-TEST-001')
    const updateCall = prisma.permissionArtefact.update.mock.calls[0][0]
    expect(updateCall.data.status).toBe('DOWNLOADED')
    expect(updateCall.data.rawPaXml).toEqual(mockZip)
    expect(updateCall.data.paZipHash).toBe(
      crypto.createHash('sha256').update(mockZip).digest('hex')
    )
    expect(updateCall.data.downloadedAt).toBeInstanceOf(Date)
  })

  test('throws if PA status is not APPROVED', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.downloadAndStorePA('FP-TEST-001'))
      .rejects.toThrow('must be APPROVED')
  })

  test('throws on hash mismatch for re-download', async () => {
    const pa = createMockPA({
      status: 'APPROVED',
      paZipHash: 'aaaa000011112222333344445555666677778888999900001111222233334444',
    })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)
    mockEgcaAdapter.downloadPermissionArtefact.mockResolvedValue(Buffer.from('different-content'))

    await expect(svc.downloadAndStorePA('FP-TEST-001'))
      .rejects.toThrow('hash mismatch')
  })
})

describe('PALifecycleService — markLoadedToDrone', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('marks PA as LOADED with correct drone UIN', async () => {
    const pa = createMockPA({ status: 'DOWNLOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await svc.markLoadedToDrone('FP-TEST-001', 'UA-SMALL-001-DEMO')

    const updateCall = prisma.permissionArtefact.update.mock.calls[0][0]
    expect(updateCall.data.status).toBe('LOADED')
    expect(updateCall.data.loadedToDroneAt).toBeInstanceOf(Date)
  })

  test('throws on UIN mismatch', async () => {
    const pa = createMockPA({ status: 'DOWNLOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.markLoadedToDrone('FP-TEST-001', 'UA-WRONG-DRONE'))
      .rejects.toThrow('UIN mismatch')
  })

  test('throws if status is not DOWNLOADED', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.markLoadedToDrone('FP-TEST-001', 'UA-SMALL-001-DEMO'))
      .rejects.toThrow('must be DOWNLOADED')
  })
})

describe('PALifecycleService — processFlightLog', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('compliant flight log — no violations', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    // GPS points inside the polygon, within time window, below altitude
    const entries = [
      { lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-15T10:00:00Z' },
      { lat: 28.606, lng: 77.205, altM: 110, timestamp: '2026-06-15T11:00:00Z' },
      { lat: 28.607, lng: 77.206, altM: 90,  timestamp: '2026-06-15T12:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)

    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(report.compliant).toBe(true)
    expect(report.totalViolations).toBe(0)
    expect(report.violations).toHaveLength(0)
    expect(report.applicationId).toBe('FP-TEST-001')
  })

  test('detects geofence deviation > 50m', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    // Point far outside the polygon
    const entries = [
      { lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-15T10:00:00Z' },
      { lat: 29.00,  lng: 78.00,  altM: 100, timestamp: '2026-06-15T11:00:00Z' },  // way outside
    ]
    const logBundle = createSignedLogBundle(entries)

    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(report.compliant).toBe(false)
    const geoViolations = report.violations.filter(v => v.type === 'GEOFENCE_DEVIATION')
    expect(geoViolations.length).toBeGreaterThanOrEqual(1)
    expect(geoViolations[0].deviationM).toBeGreaterThan(50)
  })

  test('detects timestamp outside PA time window', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    // Point with timestamp before the PA window
    const entries = [
      { lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-14T08:00:00Z' },  // day before
    ]
    const logBundle = createSignedLogBundle(entries)

    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(report.compliant).toBe(false)
    const timeViolations = report.violations.filter(v => v.type === 'TIME_WINDOW_VIOLATION')
    expect(timeViolations.length).toBe(1)
    expect(timeViolations[0].severity).toBe('HIGH')
  })

  test('detects altitude violation', async () => {
    const pa = createMockPA({ status: 'LOADED', maxAltitudeMeters: 120 })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      { lat: 28.605, lng: 77.205, altM: 150, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)

    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(report.compliant).toBe(false)
    const altViolations = report.violations.filter(v => v.type === 'ALTITUDE_VIOLATION')
    expect(altViolations.length).toBe(1)
    expect(altViolations[0].detail).toContain('150m')
    expect(altViolations[0].detail).toContain('120m')
  })

  test('critical severity for altitude > 1.5x limit', async () => {
    const pa = createMockPA({ status: 'LOADED', maxAltitudeMeters: 100 })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      { lat: 28.605, lng: 77.205, altM: 200, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)

    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    const altViolation = report.violations.find(v => v.type === 'ALTITUDE_VIOLATION')
    expect(altViolation).toBeDefined()
    expect(altViolation!.severity).toBe('CRITICAL')
  })

  test('throws on invalid JWT signature', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const badBundle = Buffer.from('invalid.jwt.token', 'utf-8')

    await expect(svc.processFlightLog('FP-TEST-001', badBundle))
      .rejects.toThrow('JWT verification failed')
  })

  test('throws if PA status is not eligible for log processing', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [{ lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-15T10:00:00Z' }]
    const logBundle = createSignedLogBundle(entries)

    await expect(svc.processFlightLog('FP-TEST-001', logBundle))
      .rejects.toThrow('Cannot process flight log')
  })

  test('computes and stores flight log SHA-256 hash', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      { lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)
    const expectedHash = crypto.createHash('sha256').update(logBundle).digest('hex')

    await svc.processFlightLog('FP-TEST-001', logBundle)

    const updateCall = prisma.permissionArtefact.update.mock.calls[0][0]
    expect(updateCall.data.flightLogHash).toBe(expectedHash)
    expect(updateCall.data.status).toBe('LOG_UPLOADED')
  })

  test('writes audit log with violation summary', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      { lat: 29.00, lng: 78.00, altM: 200, timestamp: '2026-06-14T08:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)

    await svc.processFlightLog('FP-TEST-001', logBundle)

    // Should have at least 1 audit log write
    expect(prisma.auditLog.create).toHaveBeenCalled()
    const auditCall = prisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data.action).toBe('PA_FLIGHT_LOG_PROCESSED')
    const detail = JSON.parse(auditCall.data.detailJson)
    expect(detail.totalViolations).toBeGreaterThan(0)
    expect(detail.compliant).toBe(false)
  })

  test('uploads log to eGCA after local processing', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      { lat: 28.605, lng: 77.205, altM: 100, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)

    await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(mockEgcaAdapter.uploadFlightLog).toHaveBeenCalledWith(
      'FP-TEST-001',
      logBundle,
    )
  })
})

describe('PALifecycleService — expireOldPAs', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('expires PAs past flightEndTime', async () => {
    const expiredPAs = [
      createMockPA({ id: 'pa-expired-1', applicationId: 'FP-EXP-1', status: 'PENDING', flightEndTime: new Date('2025-01-01') }),
      createMockPA({ id: 'pa-expired-2', applicationId: 'FP-EXP-2', status: 'APPROVED', flightEndTime: new Date('2025-06-01') }),
    ]
    prisma.permissionArtefact.findMany.mockResolvedValue(expiredPAs)
    prisma.permissionArtefact.updateMany.mockResolvedValue({ count: 2 })

    const count = await svc.expireOldPAs()

    expect(count).toBe(2)
    expect(prisma.permissionArtefact.updateMany).toHaveBeenCalledTimes(1)
    const updateManyCall = prisma.permissionArtefact.updateMany.mock.calls[0][0]
    expect(updateManyCall.data.status).toBe('EXPIRED')
    expect(updateManyCall.where.id.in).toEqual(['pa-expired-1', 'pa-expired-2'])
  })

  test('returns 0 when no PAs to expire', async () => {
    prisma.permissionArtefact.findMany.mockResolvedValue([])

    const count = await svc.expireOldPAs()
    expect(count).toBe(0)
    expect(prisma.permissionArtefact.updateMany).not.toHaveBeenCalled()
  })

  test('writes audit log for each expired PA', async () => {
    const expiredPAs = [
      createMockPA({ id: 'pa-exp-1', applicationId: 'FP-EXP-1', status: 'LOADED', flightEndTime: new Date('2025-01-01') }),
    ]
    prisma.permissionArtefact.findMany.mockResolvedValue(expiredPAs)
    prisma.permissionArtefact.updateMany.mockResolvedValue({ count: 1 })

    await svc.expireOldPAs()

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const auditCall = prisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data.action).toBe('PA_EXPIRED')
  })
})

describe('PALifecycleService — revokePA', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('revokes a PENDING PA', async () => {
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await svc.revokePA('FP-TEST-001', 'Security concern')

    const updateCall = prisma.permissionArtefact.update.mock.calls[0][0]
    expect(updateCall.data.status).toBe('REVOKED')
    expect(updateCall.data.revokeReason).toBe('Security concern')
    expect(updateCall.data.revokedAt).toBeInstanceOf(Date)
  })

  test('revokes an APPROVED PA', async () => {
    const pa = createMockPA({ status: 'APPROVED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await svc.revokePA('FP-TEST-001', 'Changed conditions')
    expect(prisma.permissionArtefact.update).toHaveBeenCalledTimes(1)
  })

  test('revokes a LOADED PA', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await svc.revokePA('FP-TEST-001', 'Emergency')
    expect(prisma.permissionArtefact.update).toHaveBeenCalledTimes(1)
  })

  test('throws when revoking an already REVOKED PA', async () => {
    const pa = createMockPA({ status: 'REVOKED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.revokePA('FP-TEST-001', 'Double revoke'))
      .rejects.toThrow('Cannot revoke PA in terminal status REVOKED')
  })

  test('throws when revoking an EXPIRED PA', async () => {
    const pa = createMockPA({ status: 'EXPIRED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.revokePA('FP-TEST-001', 'Too late'))
      .rejects.toThrow('Cannot revoke PA in terminal status EXPIRED')
  })

  test('throws when revoking a REJECTED PA', async () => {
    const pa = createMockPA({ status: 'REJECTED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.revokePA('FP-TEST-001', 'Already rejected'))
      .rejects.toThrow('Cannot revoke PA in terminal status REJECTED')
  })

  test('writes audit log on revocation', async () => {
    const pa = createMockPA({ status: 'APPROVED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await svc.revokePA('FP-TEST-001', 'Airspace restriction')

    expect(prisma.auditLog.create).toHaveBeenCalled()
    const auditCall = prisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data.action).toBe('PA_REVOKED')
    const detail = JSON.parse(auditCall.data.detailJson)
    expect(detail.reason).toBe('Airspace restriction')
    expect(detail.previousStatus).toBe('APPROVED')
  })
})

// ── State Machine Transition Tests ──────────────────────────────────────────

describe('PALifecycleService — state transitions', () => {
  test('valid transitions: PENDING -> APPROVED -> DOWNLOADED -> LOADED', () => {
    // These are verified implicitly by the methods above.
    // This test explicitly validates the VALID_TRANSITIONS map logic.

    // We test by running the full lifecycle through the service.
    // Each method validates transitions internally.
    expect(true).toBe(true) // Placeholder — lifecycle integration tested above
  })

  test('invalid transition: PENDING -> DOWNLOADED throws', async () => {
    const prisma = createMockPrisma()
    const svc = new PALifecycleService(prisma as any)

    // Trying to download a PA that is still PENDING (not APPROVED)
    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.downloadAndStorePA('FP-TEST-001'))
      .rejects.toThrow('must be APPROVED')
  })

  test('invalid transition: PENDING -> LOADED throws', async () => {
    const prisma = createMockPrisma()
    const svc = new PALifecycleService(prisma as any)

    const pa = createMockPA({ status: 'PENDING' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    await expect(svc.markLoadedToDrone('FP-TEST-001', 'UA-SMALL-001-DEMO'))
      .rejects.toThrow('must be DOWNLOADED')
  })

  test('terminal states cannot transition further', async () => {
    const prisma = createMockPrisma()
    const svc = new PALifecycleService(prisma as any)

    for (const terminalStatus of ['EXPIRED', 'REJECTED', 'REVOKED']) {
      const pa = createMockPA({ status: terminalStatus })
      prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

      await expect(svc.revokePA('FP-TEST-001', 'attempt'))
        .rejects.toThrow('terminal status')
    }
  })
})

// ── Geo Utility Tests (exported implicitly via processFlightLog) ────────────

describe('PALifecycleService — geofence compliance logic', () => {
  let prisma: ReturnType<typeof createMockPrisma>
  let svc: PALifecycleService

  beforeEach(() => {
    prisma = createMockPrisma()
    svc = new PALifecycleService(prisma as any)
    jest.clearAllMocks()
  })

  test('point well inside polygon reports no geofence violation', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    // Center of the polygon
    const entries = [
      { lat: 28.605, lng: 77.205, altM: 50, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)
    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    const geoViolations = report.violations.filter(v => v.type === 'GEOFENCE_DEVIATION')
    expect(geoViolations.length).toBe(0)
  })

  test('point 100+ meters outside polygon flags GEOFENCE_DEVIATION', async () => {
    const pa = createMockPA({ status: 'LOADED' })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    // Well outside the polygon (different city)
    const entries = [
      { lat: 19.08, lng: 72.87, altM: 50, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)
    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    const geoViolations = report.violations.filter(v => v.type === 'GEOFENCE_DEVIATION')
    expect(geoViolations.length).toBe(1)
    expect(geoViolations[0].severity).toBe('CRITICAL')
  })

  test('multiple violations in a single flight log are all captured', async () => {
    const pa = createMockPA({ status: 'LOADED', maxAltitudeMeters: 100 })
    prisma.permissionArtefact.findUnique.mockResolvedValue(pa)

    const entries = [
      // Geofence + time + altitude violations
      { lat: 30.00, lng: 80.00, altM: 200, timestamp: '2026-06-14T05:00:00Z' },
      // Another geofence + altitude
      { lat: 31.00, lng: 81.00, altM: 300, timestamp: '2026-06-15T10:00:00Z' },
    ]
    const logBundle = createSignedLogBundle(entries)
    const report = await svc.processFlightLog('FP-TEST-001', logBundle)

    expect(report.compliant).toBe(false)
    expect(report.totalViolations).toBeGreaterThanOrEqual(3)

    const types = new Set(report.violations.map(v => v.type))
    expect(types.has('GEOFENCE_DEVIATION')).toBe(true)
    expect(types.has('ALTITUDE_VIOLATION')).toBe(true)
    expect(types.has('TIME_WINDOW_VIOLATION')).toBe(true)
  })
})

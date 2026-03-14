/**
 * DS-12 — UIN Verification Service Tests
 *
 * Tests the UINVerificationService which verifies drone UINs against Digital Sky.
 */

import { UINVerificationService, UINVerificationResult } from '../services/UINVerificationService'
import type { IDigitalSkyAdapter, DroneRegistration } from '../adapters/interfaces/IDigitalSkyAdapter'

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockCache = new Map<string, any>()

const mockPrisma = {
  uINVerificationCache: {
    findUnique: jest.fn(async ({ where }: any) => mockCache.get(where.uinNumber) ?? null),
    upsert: jest.fn(async ({ where, create }: any) => {
      mockCache.set(where.uinNumber, create)
      return create
    }),
    delete: jest.fn(async ({ where }: any) => {
      mockCache.delete(where.uinNumber)
      return {}
    }),
  },
} as any

// ── Mock Adapter ─────────────────────────────────────────────────────────────

const DEMO_REGISTRATION: DroneRegistration = {
  uin:              'UIN-DEMO-001',
  manufacturerName: 'JADS Test Manufacturer',
  modelName:        'JADS-Phantom-T1',
  weightCategory:   'SMALL',
  registrationDate: '2024-01-15T00:00:00Z',
  ownerName:        'JADS Demo Operator',
  ownerEntityType:  'ORGANIZATION',
  status:           'REGISTERED',
}

function createMockAdapter(overrides: Partial<IDigitalSkyAdapter> = {}): IDigitalSkyAdapter {
  return {
    validatePermissionArtefact: jest.fn().mockResolvedValue(null),
    getDroneRegistration: jest.fn().mockImplementation(async (uin: string) => {
      if (uin === 'UIN-DEMO-001') return DEMO_REGISTRATION
      return null
    }),
    verifyPilotLicense: jest.fn().mockResolvedValue(null),
    submitFlightLog: jest.fn().mockResolvedValue({ receiptId: 'r1', submittedAt: new Date().toISOString(), accepted: true }),
    validateNpntToken: jest.fn().mockResolvedValue({ valid: false, droneUin: null, paId: null }),
    ping: jest.fn().mockResolvedValue({ reachable: true, latencyMs: 1 }),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UINVerificationService', () => {
  let service: UINVerificationService
  let adapter: IDigitalSkyAdapter

  beforeEach(() => {
    mockCache.clear()
    jest.clearAllMocks()
    adapter = createMockAdapter()
    service = new UINVerificationService(mockPrisma, adapter)
  })

  test('valid UIN returns verification result with correct fields', async () => {
    const result = await service.verifyUIN('UIN-DEMO-001')

    expect(result.valid).toBe(true)
    expect(result.uinNumber).toBe('UIN-DEMO-001')
    expect(result.droneCategory).toBe('SMALL')
    expect(result.manufacturerName).toBe('JADS Test Manufacturer')
    expect(result.modelName).toBe('JADS-Phantom-T1')
    expect(result.operatorId).toBe('JADS Demo Operator')
    expect(result.uaopValid).toBe(true)
    expect(result.verifiedAt).toBeTruthy()
    expect(result.source).toBe('DIGITAL_SKY_MOCK') // stub returns latencyMs < 2
    expect(result.advisory).toBeNull()
  })

  test('result is cached on second call (verifiedAt matches first call)', async () => {
    const first = await service.verifyUIN('UIN-DEMO-001')
    expect(first.valid).toBe(true)
    expect(first.source).toBe('DIGITAL_SKY_MOCK')

    // Second call should hit cache
    const second = await service.verifyUIN('UIN-DEMO-001')
    expect(second.valid).toBe(true)
    expect(second.source).toBe('CACHE')
    expect(second.verifiedAt).toBe(first.verifiedAt)

    // Adapter should only be called once
    expect(adapter.getDroneRegistration).toHaveBeenCalledTimes(1)
  })

  test('forceRefresh=true bypasses cache', async () => {
    // First call — populates cache
    await service.verifyUIN('UIN-DEMO-001')

    // Second call with forceRefresh — should call adapter again
    const result = await service.verifyUIN('UIN-DEMO-001', { forceRefresh: true })
    expect(result.source).toBe('DIGITAL_SKY_MOCK')
    expect(adapter.getDroneRegistration).toHaveBeenCalledTimes(2)
  })

  test('Digital Sky unavailable with cache returns UNAVAILABLE source with cached data', async () => {
    // Populate cache first
    await service.verifyUIN('UIN-DEMO-001')

    // Create new service with failing adapter
    const failAdapter = createMockAdapter({
      getDroneRegistration: jest.fn().mockRejectedValue(new Error('Connection refused')),
      ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
    })
    const failService = new UINVerificationService(mockPrisma, failAdapter)

    // Force refresh to skip cache initially but fall back to it
    const result = await failService.verifyUIN('UIN-DEMO-001', { forceRefresh: true })
    expect(result.valid).toBe(true)
    expect(result.source).toBe('UNAVAILABLE')
    expect(result.advisory).toContain('unavailable')
  })

  test('Digital Sky unavailable without cache returns valid=false', async () => {
    const failAdapter = createMockAdapter({
      getDroneRegistration: jest.fn().mockRejectedValue(new Error('Connection refused')),
      ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
    })
    const failService = new UINVerificationService(mockPrisma, failAdapter)

    const result = await failService.verifyUIN('UIN-NONEXISTENT')
    expect(result.valid).toBe(false)
    expect(result.source).toBe('UNAVAILABLE')
    expect(result.advisory).toContain('unreachable')
  })

  test('unknown UIN returns valid=false', async () => {
    const result = await service.verifyUIN('UIN-UNKNOWN-999')
    expect(result.valid).toBe(false)
    expect(result.uinNumber).toBe('UIN-UNKNOWN-999')
    expect(result.advisory).toContain('not found')
  })

  test('invalidateCache removes cached entry', async () => {
    // Populate cache
    await service.verifyUIN('UIN-DEMO-001')
    expect(mockCache.has('UIN-DEMO-001')).toBe(true)

    // Invalidate
    await service.invalidateCache('UIN-DEMO-001')
    expect(mockPrisma.uINVerificationCache.delete).toHaveBeenCalledWith({
      where: { uinNumber: 'UIN-DEMO-001' },
    })
  })

  test('getCachedVerification returns null for expired cache', async () => {
    // Set a cache entry that's already expired
    mockCache.set('UIN-EXPIRED', {
      uinNumber: 'UIN-EXPIRED',
      droneCategory: 'MICRO',
      manufacturerName: 'Test',
      modelName: 'Test',
      operatorId: 'Test',
      uaopValid: true,
      verifiedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),  // expired 24h ago
      sourceMode: 'MOCK',
    })

    const result = await service.getCachedVerification('UIN-EXPIRED')
    expect(result).toBeNull()
  })

  test('deregistered UIN returns valid=false', async () => {
    const deregAdapter = createMockAdapter({
      getDroneRegistration: jest.fn().mockResolvedValue({
        ...DEMO_REGISTRATION,
        uin: 'UIN-DEREG-001',
        status: 'DEREGISTERED',
      }),
    })
    const deregService = new UINVerificationService(mockPrisma, deregAdapter)

    const result = await deregService.verifyUIN('UIN-DEREG-001')
    expect(result.valid).toBe(false)
    expect(result.advisory).toContain('DEREGISTERED')
  })
})

/**
 * DS-12 — UIN Verification Service
 *
 * JADS does NOT register pilots or issue UINs. Digital Sky does that.
 * An operator already has a UIN from DGCA/Digital Sky. They come to JADS
 * with that UIN. JADS verifies the UIN is real and active by querying
 * Digital Sky. Once verified, the operator can file flight plans and
 * record missions in JADS.
 *
 * This service is the ONLY integration point between an operator's
 * Digital Sky identity and their JADS session.
 */

import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'
import type { IDigitalSkyAdapter, DroneRegistration } from '../adapters/interfaces/IDigitalSkyAdapter'

const log = createServiceLogger('UINVerificationService')

// ── Types ──────────────────────────────────────────────────────────────────

export type UINDroneCategory = 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'

export type UINVerificationSource =
  | 'DIGITAL_SKY_LIVE'
  | 'DIGITAL_SKY_MOCK'
  | 'CACHE'
  | 'UNAVAILABLE'

export interface UINVerificationResult {
  valid:            boolean
  uinNumber:        string
  droneCategory:    UINDroneCategory
  manufacturerName: string
  modelName:        string
  operatorId:       string
  uaopValid:        boolean
  verifiedAt:       string      // ISO timestamp
  source:           UINVerificationSource
  advisory:         string | null
}

export interface VerifyUINOptions {
  forceRefresh?: boolean
}

// ── Cache TTL ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── Service ────────────────────────────────────────────────────────────────

export class UINVerificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dsAdapter: IDigitalSkyAdapter
  ) {
    log.info('uin_verification_service_initialized', { data: {} })
  }

  /**
   * Verify a UIN against Digital Sky.
   *
   * i.   Check local cache — if cached and < 24h old and !forceRefresh, return cache
   * ii.  Call IDigitalSkyAdapter.getDroneRegistration()
   * iii. If adapter is stub, mark source=DIGITAL_SKY_MOCK
   * iv.  Cache the result for 24h
   * v.   If Digital Sky unavailable: return cached result with source=UNAVAILABLE
   *      If no cache and DS unavailable: return valid=false
   */
  async verifyUIN(
    uinNumber: string,
    options: VerifyUINOptions = {}
  ): Promise<UINVerificationResult> {
    const { forceRefresh = false } = options

    // Step i: Check local cache
    if (!forceRefresh) {
      const cached = await this.getCachedVerification(uinNumber)
      if (cached) {
        log.info('uin_verification_cache_hit', { data: { uinNumber } })
        return cached
      }
    }

    // Step ii–iv: Query Digital Sky via adapter
    let registration: DroneRegistration | null = null
    let isStubMode = false
    let dsUnavailable = false

    try {
      registration = await this.dsAdapter.getDroneRegistration(uinNumber)

      // Detect stub mode — if ping returns and adapter has no live URL, it's a stub
      // We check by seeing if the adapter has a ping method and use its response
      if (this.dsAdapter.ping) {
        try {
          const pingResult = await this.dsAdapter.ping()
          // Stub adapters return near-zero latency
          isStubMode = pingResult.latencyMs < 2
        } catch {
          isStubMode = true
        }
      }
    } catch (err) {
      dsUnavailable = true
      log.warn('uin_verification_ds_unavailable', {
        data: { uinNumber, error: err instanceof Error ? err.message : String(err) },
      })
    }

    // Step v: If DS unavailable, try cache fallback
    if (dsUnavailable) {
      const fallback = await this.getCachedVerification(uinNumber)
      if (fallback) {
        log.info('uin_verification_ds_unavailable_cache_fallback', { data: { uinNumber } })
        return {
          ...fallback,
          source: 'UNAVAILABLE',
          advisory: 'Digital Sky unavailable \u2014 using cached verification',
        }
      }

      // No cache, DS unavailable — fail
      log.warn('uin_verification_ds_unavailable_no_cache', { data: { uinNumber } })
      return {
        valid: false,
        uinNumber,
        droneCategory: 'MICRO',
        manufacturerName: '',
        modelName: '',
        operatorId: '',
        uaopValid: false,
        verifiedAt: new Date().toISOString(),
        source: 'UNAVAILABLE',
        advisory: 'Digital Sky unreachable and no cached verification exists',
      }
    }

    // DS returned null — UIN not found
    if (!registration) {
      log.info('uin_verification_not_found', { data: { uinNumber } })
      return {
        valid: false,
        uinNumber,
        droneCategory: 'MICRO',
        manufacturerName: '',
        modelName: '',
        operatorId: '',
        uaopValid: false,
        verifiedAt: new Date().toISOString(),
        source: isStubMode ? 'DIGITAL_SKY_MOCK' : 'DIGITAL_SKY_LIVE',
        advisory: `UIN '${uinNumber}' not found on Digital Sky`,
      }
    }

    // DS returned a registration — check if active
    const isActive = registration.status === 'REGISTERED'
    const now = new Date()
    const source: UINVerificationSource = isStubMode ? 'DIGITAL_SKY_MOCK' : 'DIGITAL_SKY_LIVE'

    const result: UINVerificationResult = {
      valid: isActive,
      uinNumber: registration.uin,
      droneCategory: registration.weightCategory as UINDroneCategory,
      manufacturerName: registration.manufacturerName,
      modelName: registration.modelName,
      operatorId: registration.ownerName,
      uaopValid: true, // Default true for stub; real DS would have UAOP check
      verifiedAt: now.toISOString(),
      source,
      advisory: isActive ? null : `UIN status is '${registration.status}' — not active`,
    }

    // Step iv: Cache the result for 24h
    if (isActive) {
      try {
        await this.prisma.uINVerificationCache.upsert({
          where: { uinNumber: registration.uin },
          create: {
            uinNumber: registration.uin,
            droneCategory: registration.weightCategory,
            manufacturerName: registration.manufacturerName,
            modelName: registration.modelName,
            operatorId: registration.ownerName,
            uaopValid: true,
            verifiedAt: now,
            expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
            sourceMode: isStubMode ? 'MOCK' : 'LIVE',
          },
          update: {
            droneCategory: registration.weightCategory,
            manufacturerName: registration.manufacturerName,
            modelName: registration.modelName,
            operatorId: registration.ownerName,
            uaopValid: true,
            verifiedAt: now,
            expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
            sourceMode: isStubMode ? 'MOCK' : 'LIVE',
          },
        })
      } catch (cacheErr) {
        log.warn('uin_verification_cache_write_failed', {
          data: { uinNumber, error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr) },
        })
      }
    }

    log.info('uin_verified', {
      data: { uinNumber, valid: result.valid, source, category: result.droneCategory },
    })

    return result
  }

  /**
   * Get cached verification result for a UIN.
   * Returns null if no cache entry or if expired.
   */
  async getCachedVerification(uinNumber: string): Promise<UINVerificationResult | null> {
    try {
      const cached = await this.prisma.uINVerificationCache.findUnique({
        where: { uinNumber },
      })

      if (!cached) return null

      // Check expiry
      if (cached.expiresAt < new Date()) {
        // Expired — delete and return null
        await this.prisma.uINVerificationCache.delete({
          where: { uinNumber },
        }).catch(() => { /* ignore delete failures */ })
        return null
      }

      return {
        valid: true,
        uinNumber: cached.uinNumber,
        droneCategory: cached.droneCategory as UINDroneCategory,
        manufacturerName: cached.manufacturerName,
        modelName: cached.modelName,
        operatorId: cached.operatorId,
        uaopValid: cached.uaopValid,
        verifiedAt: cached.verifiedAt.toISOString(),
        source: 'CACHE',
        advisory: null,
      }
    } catch {
      return null
    }
  }

  /**
   * Invalidate cache for a UIN.
   * Called when a mission upload detects a UIN mismatch.
   */
  async invalidateCache(uinNumber: string): Promise<void> {
    try {
      await this.prisma.uINVerificationCache.delete({
        where: { uinNumber },
      })
      log.info('uin_cache_invalidated', { data: { uinNumber } })
    } catch {
      // Ignore if not found
    }
  }
}

// Digital Sky API stub adapter — LEGACY SIMPLIFIED INTERFACE.
//
// This file originally had a separate IDigitalSkyAdapter interface.
// Now consolidated: re-exports the canonical interface from interfaces/
// and provides a simplified stub with three methods used by older code paths.
//
// For the full DS integration stub, use DigitalSkyAdapterStub.ts instead.
//
// PRODUCTION: Replace with HTTP client calling Digital Sky API.
// Base URL: https://digitalsky.dgca.gov.in/api/
// Authentication: Client certificate issued after DSP certification.

import { createServiceLogger } from '../../logger'

const log = createServiceLogger('DigitalSkyStub')

// Re-export the canonical interface for backward compatibility
export type { IDigitalSkyAdapter } from '../interfaces/IDigitalSkyAdapter'

/**
 * Simplified DS stub for basic operations.
 * For full IDigitalSkyAdapter compliance, use DigitalSkyAdapterStub instead.
 */
export class DigitalSkyStub {

  async submitFlightLog(missionId: string, recordCount: number): Promise<{
    submitted:      boolean
    stubMode?:      boolean
    digitalSkyRef?: string
    reason?:        string
  }> {
    log.info('stub_submit_flight_log', {
      data: { missionId, recordCount, stubMode: true }
    })

    return {
      submitted:     false,
      stubMode:      true,
      digitalSkyRef: `STUB-REF-${missionId}`,
      reason:        'STUB_MODE: Digital Sky integration requires DSP certification',
    }
  }

  async fetchPermissionArtefact(artefactId: string): Promise<{
    found:    boolean
    stubMode?: boolean
    paXml?:   string
    reason?:  string
  }> {
    log.info('stub_fetch_permission_artefact', {
      data: { artefactId, stubMode: true }
    })

    return {
      found:    false,
      stubMode: true,
      reason:   'STUB_MODE: Digital Sky integration requires DSP certification',
    }
  }

  async registerUas(uasId: string, _publicKeyHex: string): Promise<{
    registered: boolean
    stubMode?:  boolean
    reason?:    string
  }> {
    log.info('stub_register_uas', {
      data: { uasId, stubMode: true }
    })

    return {
      registered: false,
      stubMode:   true,
      reason:     'STUB_MODE: Digital Sky integration requires DSP certification',
    }
  }
}

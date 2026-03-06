// Digital Sky API stub adapter.
//
// PRODUCTION: Replace with HTTP client calling Digital Sky API.
// Base URL: https://digitalsky.dgca.gov.in/api/
// Authentication: Client certificate issued after DSP certification.
// DSP certification is a prerequisite — cannot call live API without it.
// Estimated timeline: 6-12 months from application to approval.

import { createServiceLogger } from '../../logger'

const log = createServiceLogger('DigitalSkyStub')

export interface IDigitalSkyAdapter {
  submitFlightLog(missionId: string, recordCount: number): Promise<{
    submitted:      boolean
    digitalSkyRef?: string
    reason?:        string
  }>
  fetchPermissionArtefact(artefactId: string): Promise<{
    found:  boolean
    paXml?: string
  }>
  registerUas(uasId: string, publicKeyHex: string): Promise<{
    registered: boolean
    reason?:    string
  }>
}

export class DigitalSkyStub implements IDigitalSkyAdapter {

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

  async registerUas(uasId: string, publicKeyHex: string): Promise<{
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

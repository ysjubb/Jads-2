// Mock implementation of IEgcaAdapter.
// Returns deterministic test data seeded from fixtures.
// This mock must never make network calls.
//
// Used in development, CI, and integration tests.
// Government replaces this with EgcaAdapterImpl when eGCA credentials are provisioned.

import { createServiceLogger } from '../../logger'
import type { IEgcaAdapter }   from './EgcaAdapter'
import { EgcaError }           from './EgcaError'
import type {
  UINValidationResult,
  RPCValidationResult,
  UAOPValidationResult,
  FlightPermissionPayload,
  FlightPermissionResult,
  PermissionStatus,
  FlightPermission,
  PaginatedResult,
  ZoneClassification,
  LatLng,
  EgcaAuthResult,
} from './types'

import { UIN_FIXTURES }                   from './fixtures/uinFixtures'
import { RPC_FIXTURES }                   from './fixtures/rpcFixtures'
import { UAOP_FIXTURES }                  from './fixtures/uaopFixtures'
import {
  PERMISSION_STATUS_FIXTURES,
  FLIGHT_PERMISSION_FIXTURES,
}                                          from './fixtures/flightPermissionFixtures'
import { classifyZoneFromFixtures }        from './fixtures/zoneFixtures'

const log = createServiceLogger('EgcaAdapterMock')

// ── Fake PA ZIP (minimal valid ZIP with placeholder XML) ────────────────────
// Real eGCA returns a ZIP containing a signed XML permission artefact.
// This stub returns a minimal buffer that tests can verify is non-empty.
const STUB_PA_ZIP = Buffer.from(
  'PK\x03\x04\x14\x00\x00\x00\x00\x00' +  // ZIP local file header
  '<?xml version="1.0"?><PermissionArtefact id="PA-MOCK" status="ACTIVE"/>',
  'utf-8'
)

export class EgcaAdapterMock implements IEgcaAdapter {
  private callLog: Array<{ method: string; args: unknown[]; timestamp: string }> = []

  // ── Auth ────────────────────────────────────────────────────────────────

  async authenticate(_email: string, _password: string): Promise<EgcaAuthResult> {
    this.logCall('authenticate')
    log.info('mock_egca_authenticate', { data: { stubMode: true } })

    return {
      token:     'mock-egca-jwt-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600 * 1_000),
    }
  }

  // ── UIN Validation ──────────────────────────────────────────────────────

  async validateUIN(uin: string): Promise<UINValidationResult> {
    this.logCall('validateUIN', uin)
    log.info('mock_egca_validate_uin', { data: { uin, stubMode: true } })

    const fixture = UIN_FIXTURES[uin]
    if (fixture) return fixture

    return {
      valid:        false,
      uin,
      errorMessage: `MOCK: UIN ${uin} not found in eGCA registry`,
    }
  }

  // ── RPC Validation ──────────────────────────────────────────────────────

  async validateRPC(rpcId: string): Promise<RPCValidationResult> {
    this.logCall('validateRPC', rpcId)
    log.info('mock_egca_validate_rpc', { data: { rpcId, stubMode: true } })

    const fixture = RPC_FIXTURES[rpcId]
    if (fixture) return fixture

    return {
      valid:        false,
      rpcId,
      errorMessage: `MOCK: RPC ${rpcId} not found in eGCA registry`,
    }
  }

  // ── UAOP Validation ────────────────────────────────────────────────────

  async validateUAOP(uaopNumber: string): Promise<UAOPValidationResult> {
    this.logCall('validateUAOP', uaopNumber)
    log.info('mock_egca_validate_uaop', { data: { uaopNumber, stubMode: true } })

    const fixture = UAOP_FIXTURES[uaopNumber]
    if (fixture) return fixture

    return {
      valid:        false,
      uaopNumber,
      errorMessage: `MOCK: UAOP ${uaopNumber} not found in eGCA registry`,
    }
  }

  // ── Flight Permission Submission ────────────────────────────────────────

  async submitFlightPermission(payload: FlightPermissionPayload): Promise<FlightPermissionResult> {
    this.logCall('submitFlightPermission', payload.uinNumber)
    log.info('mock_egca_submit_flight_permission', {
      data: { uinNumber: payload.uinNumber, purpose: payload.flightPurpose, stubMode: true },
    })

    const applicationId = `FP-MOCK-${Date.now()}`
    return {
      applicationId,
      status:          'SUBMITTED',
      submittedAt:     new Date().toISOString(),
      referenceNumber: `REF-${applicationId}`,
    }
  }

  // ── Permission Status ──────────────────────────────────────────────────

  async getPermissionStatus(applicationId: string): Promise<PermissionStatus> {
    this.logCall('getPermissionStatus', applicationId)
    log.info('mock_egca_get_permission_status', { data: { applicationId, stubMode: true } })

    const fixture = PERMISSION_STATUS_FIXTURES[applicationId]
    if (fixture) return fixture

    // Unknown applications default to PENDING
    return {
      status:    'PENDING',
      remarks:   'MOCK: Application under review',
      updatedAt: new Date().toISOString(),
    }
  }

  // ── Download Permission Artefact ────────────────────────────────────────

  async downloadPermissionArtefact(applicationId: string): Promise<Buffer> {
    this.logCall('downloadPermissionArtefact', applicationId)
    log.info('mock_egca_download_artefact', { data: { applicationId, stubMode: true } })

    // Only approved applications have artefacts
    const status = PERMISSION_STATUS_FIXTURES[applicationId]
    if (status && status.status !== 'APPROVED') {
      throw new EgcaError(
        'EGCA_NOT_FOUND',
        `Permission artefact not available — application ${applicationId} status is ${status.status}`,
        false,
        404,
      )
    }

    return Buffer.from(STUB_PA_ZIP)
  }

  // ── Upload Flight Log ──────────────────────────────────────────────────

  async uploadFlightLog(applicationId: string, logBundle: Buffer): Promise<void> {
    this.logCall('uploadFlightLog', applicationId)
    log.info('mock_egca_upload_flight_log', {
      data: { applicationId, bundleSizeBytes: logBundle.length, stubMode: true },
    })
    // Mock: no-op — accept all log uploads
  }

  // ── List Flight Permissions ─────────────────────────────────────────────

  async listFlightPermissions(
    operatorId: string, page: number, pageSize: number,
  ): Promise<PaginatedResult<FlightPermission>> {
    this.logCall('listFlightPermissions', operatorId, page, pageSize)
    log.info('mock_egca_list_permissions', { data: { operatorId, page, pageSize, stubMode: true } })

    const allItems = FLIGHT_PERMISSION_FIXTURES
    const start    = (page - 1) * pageSize
    const items    = allItems.slice(start, start + pageSize)

    return {
      items,
      total:      allItems.length,
      page,
      pageSize,
      totalPages: Math.ceil(allItems.length / pageSize),
    }
  }

  // ── Airspace Zone Check ─────────────────────────────────────────────────

  async checkAirspaceZone(polygon: LatLng[]): Promise<ZoneClassification> {
    this.logCall('checkAirspaceZone', polygon.length)
    log.info('mock_egca_check_zone', { data: { vertexCount: polygon.length, stubMode: true } })

    return classifyZoneFromFixtures(polygon)
  }

  // ── Test Utility ──────────────────────────────────────────────────────

  /** Returns the log of all method calls — useful for test assertions. */
  getCallLog(): ReadonlyArray<{ method: string; args: unknown[]; timestamp: string }> {
    return this.callLog
  }

  /** Reset the call log. */
  resetCallLog(): void {
    this.callLog = []
  }

  private logCall(method: string, ...args: unknown[]): void {
    this.callLog.push({ method, args, timestamp: new Date().toISOString() })
  }
}

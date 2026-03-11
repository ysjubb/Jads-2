// Adapter interface for DGCA eGCA (Electronic Governance of Civil Aviation) API.
// Government replaces EgcaAdapterMock with EgcaAdapterImpl when eGCA API
// credentials are provisioned. No service code changes required.
//
// eGCA handles:
//   1. Authentication — JWT Bearer token from eGCA identity provider
//   2. UIN validation — confirm drone registration on Digital Sky
//   3. RPC validation — confirm Remote Pilot Certificate
//   4. UAOP validation — confirm Unmanned Aircraft Operator Permit
//   5. Flight permission submission — apply for drone flight clearance
//   6. Permission status polling — check approval/rejection status
//   7. Permission artefact download — get signed XML ZIP for NPNT compliance
//   8. Flight log upload — post-flight telemetry submission to eGCA
//   9. Flight permission listing — paginated query of operator permissions
//  10. Airspace zone classification — check polygon against zone map

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

export interface IEgcaAdapter {
  /** Authenticate with eGCA identity provider. Returns JWT + expiry. */
  authenticate(email: string, password: string): Promise<EgcaAuthResult>

  /** Validate a drone's UIN (Unique Identification Number) against eGCA registry. */
  validateUIN(uin: string): Promise<UINValidationResult>

  /** Validate a Remote Pilot Certificate by RPC ID. */
  validateRPC(rpcId: string): Promise<RPCValidationResult>

  /** Validate an Unmanned Aircraft Operator Permit by UAOP number. */
  validateUAOP(uaopNumber: string): Promise<UAOPValidationResult>

  /** Submit a new flight permission application to eGCA. */
  submitFlightPermission(payload: FlightPermissionPayload): Promise<FlightPermissionResult>

  /** Poll the status of a submitted flight permission application. */
  getPermissionStatus(applicationId: string): Promise<PermissionStatus>

  /** Download the Permission Artefact ZIP (signed XML) for an approved application. */
  downloadPermissionArtefact(applicationId: string): Promise<Buffer>

  /** Upload post-flight log bundle to eGCA for the given application. */
  uploadFlightLog(applicationId: string, logBundle: Buffer): Promise<void>

  /** List flight permissions for an operator with pagination. */
  listFlightPermissions(
    operatorId: string, page: number, pageSize: number
  ): Promise<PaginatedResult<FlightPermission>>

  /** Check airspace zone classification for a given polygon. */
  checkAirspaceZone(polygon: LatLng[]): Promise<ZoneClassification>
}

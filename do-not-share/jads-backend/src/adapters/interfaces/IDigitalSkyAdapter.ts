// Adapter interface for DGCA Digital Sky integration.
// Government replaces DigitalSkyAdapterStub with their live Digital Sky
// implementation without changing any service code.
//
// Digital Sky is the DGCA's national UAS management platform.
// JADS must integrate with it for sovereign deployment (iDEX/MoD requirement).
//
// This interface covers:
//   1. Permission Artefact (PA) validation — verify drone has valid flight permission
//   2. UIN (Unique Identification Number) lookup — confirm drone registration
//   3. Pilot license verification — confirm Remote Pilot License (RPL)
//   4. Flight log submission — submit post-flight forensic data to Digital Sky
//   5. NPNT token validation — verify No-Permission-No-Takeoff compliance token
//   6. Flight permission application — submit to DS approval pipeline
//   7. Airspace zone sync — fetch GREEN/AMBER/RED zones from DS
//
// Aligned with Digital Sky API contract (DIGITAL_SKY_API_CONTRACT.md):
//   - DS statuses: DRAFT, SUBMITTED, APPROVED, REJECTED, APPROVEDBYATC, APPROVEDBYAFMLU
//   - DS zones: GREEN, AMBER, RED (not YELLOW)
//   - DS altitude: feet AGL
//   - DS payload: kg (not grams)

import type { DsApplicationStatus, DsZoneColor } from '../../services/npnt/NpntTypes'
import type { DsFlightLog } from '../../services/npnt/FlightLogTypes'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PermissionArtefact {
  paId:            string        // Digital Sky PA identifier
  droneUin:        string        // UIN of the drone
  pilotId:         string        // Remote Pilot License number
  validFrom:       string        // ISO 8601
  validTo:         string        // ISO 8601
  operatingArea:   GeoZone       // Approved geofence
  maxAltitudeM:    number        // Max altitude in meters AGL (JADS internal; DS uses feet)
  flightPurpose:   string        // e.g. 'SURVEY', 'DELIVERY', 'AGRICULTURE'
  status:          'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED'
  /** Signed PA XML string (DS returns this on approval) */
  signedPaXml?:    string
  /** FIC number (set by ATC approval) */
  ficNumber?:      string
  /** ADC number (set by AFMLU approval) */
  adcNumber?:      string
}

export interface GeoZone {
  type:        'Polygon'
  coordinates: number[][][]     // GeoJSON polygon coordinates
}

export interface DroneRegistration {
  uin:               string      // Unique Identification Number
  manufacturerName:  string
  modelName:         string
  weightCategory:    'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  registrationDate:  string      // ISO 8601
  ownerName:         string
  ownerEntityType:   'INDIVIDUAL' | 'ORGANIZATION' | 'GOVERNMENT'
  status:            'REGISTERED' | 'DEREGISTERED' | 'SUSPENDED'
}

export interface PilotLicense {
  rplNumber:         string      // Remote Pilot License number
  pilotName:         string
  licenseClass:      'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  validFrom:         string
  validTo:           string
  status:            'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
}

export interface FlightLogSubmission {
  missionId:         string      // JADS internal mission ID (bigint as string)
  droneUin:          string
  pilotRplNumber:    string
  departurePoint:    { lat: number; lon: number }
  landingPoint:      { lat: number; lon: number }
  takeoffUtc:        string      // ISO 8601
  landingUtc:        string      // ISO 8601
  maxAltitudeM:      number
  totalDistanceKm:   number
  telemetryRecordCount: number
  forensicVerdict:   'ALL_PASS' | 'CRITICAL_FAILURE' | 'ADVISORY_ONLY'
  hashChainRootHex:  string      // HASH_0 for independent verification
  /** DS-format flight log (for submission to Digital Sky API) */
  dsFlightLog?:      DsFlightLog
}

export interface FlightLogReceipt {
  receiptId:         string      // Digital Sky's acknowledgement ID
  submittedAt:       string      // ISO 8601
  accepted:          boolean
  rejectionReason?:  string
}

/** DS fly drone permission application input */
export interface FlyDronePermissionInput {
  pilotBusinessIdentifier: string
  flyArea:            Array<{ latitude: number; longitude: number }>
  droneId:            number
  operatorId:         number
  payloadWeightInKg:  number
  payloadDetails:     string
  flightPurpose:      string
  startDateTime:      string    // dd-MM-yyyy HH:mm:ss
  endDateTime:        string    // dd-MM-yyyy HH:mm:ss
  maxAltitude:        number    // feet AGL
  /** Optional recurrence */
  recurringTimeExpression?:        string
  recurringTimeExpressionType?:    string
  recurringTimeDurationInMinutes?: number
}

/** DS fly drone permission application response */
export interface FlyDronePermissionResult {
  applicationId:  string
  status:         DsApplicationStatus
  /** Signed PA XML (only present when status = APPROVED) */
  signedPaXml?:   string
  ficNumber?:     string
  adcNumber?:     string
  fir?:           string
  rejectionReason?: string
}

/** DS airspace zone */
export interface DsAirspaceZone {
  id:              number
  name:            string
  type:            DsZoneColor
  geoJson:         string       // GeoJSON FeatureCollection
  minAltitude:     number       // meters AGL
  tempStartTime?:  string       // ISO 8601 (optional time restriction)
  tempEndTime?:    string       // ISO 8601
}

// ── Interface ──────────────────────────────────────────────────────────────

export interface IDigitalSkyAdapter {
  /** Validate a Permission Artefact by its ID. Returns null if not found. */
  validatePermissionArtefact(paId: string): Promise<PermissionArtefact | null>

  /** Look up drone registration by UIN. Returns null if not found. */
  getDroneRegistration(uin: string): Promise<DroneRegistration | null>

  /** Verify pilot license by RPL number. Returns null if not found. */
  verifyPilotLicense(rplNumber: string): Promise<PilotLicense | null>

  /** Submit post-flight log to Digital Sky after forensic verification. */
  submitFlightLog(submission: FlightLogSubmission): Promise<FlightLogReceipt>

  /** Validate an NPNT compliance token (signed by Digital Sky). */
  validateNpntToken(tokenBase64: string): Promise<{
    valid:    boolean
    droneUin: string | null
    paId:     string | null
    error?:   string
  }>

  // ── DS-specific operations (aligned with DS API contract) ──

  /**
   * Submit a fly drone permission application to Digital Sky.
   * DS handles auto-approval logic and returns status.
   */
  submitFlyDronePermission?(input: FlyDronePermissionInput): Promise<FlyDronePermissionResult>

  /**
   * Fetch all airspace zones from Digital Sky.
   * Returns GREEN, AMBER, RED zones with GeoJSON geometries.
   */
  getAirspaceZones?(): Promise<DsAirspaceZone[]>

  /**
   * Register a drone device via PKI (M2M authentication).
   * DS uses X.509 cert chain + SHA256withRSA signature.
   */
  registerDroneDevice?(payload: {
    drone: { version: string; txn: string; deviceId: string; deviceModelId: string; operatorBusinessIdentifier: string }
    signature: string      // Base64(SHA256withRSA(drone_json))
    digitalCertificate: string  // Base64(X.509)
  }): Promise<{
    responseCode: string   // REGISTERED, INVALID_SIGNATURE, etc.
    uin?: string
  }>

  /** Health / connectivity check */
  ping?(): Promise<{ reachable: boolean; latencyMs: number }>
}

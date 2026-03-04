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

// ── Types ──────────────────────────────────────────────────────────────────

export interface PermissionArtefact {
  paId:            string        // Digital Sky PA identifier
  droneUin:        string        // UIN of the drone
  pilotId:         string        // Remote Pilot License number
  validFrom:       string        // ISO 8601
  validTo:         string        // ISO 8601
  operatingArea:   GeoZone       // Approved geofence
  maxAltitudeM:    number        // Max altitude in meters AGL
  flightPurpose:   string        // e.g. 'SURVEY', 'DELIVERY', 'AGRICULTURE'
  status:          'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED'
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
}

export interface FlightLogReceipt {
  receiptId:         string      // Digital Sky's acknowledgement ID
  submittedAt:       string      // ISO 8601
  accepted:          boolean
  rejectionReason?:  string
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
}

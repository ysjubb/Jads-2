export type MissionPurpose = 'SURVEY' | 'DELIVERY' | 'AGRICULTURE' | 'MEDIA' | 'INSPECTION' | 'BVLOS_SPECIAL' | 'OTHER'

export type PAStatusType = 'PENDING' | 'APPROVED' | 'REJECTED'

export type DroneCategory = 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'

export interface PermissionArtefact {
  id: string
  xml: string
  status: PAStatusType
  uin: string
  pilotId: string
  validFrom: string
  validTo: string
  geoFencePolygon: GeoJSON.Polygon
  issuedAt: string
  rejectionReason?: string
}

export interface PAResponse {
  requestId: string
  status: PAStatusType
  artefact?: PermissionArtefact
  rejectionReason?: string
}

export interface PAStatus {
  requestId: string
  status: PAStatusType
  updatedAt: string
}

export interface FlightLogEntry {
  entryType: 'TAKEOFF' | 'ARM' | 'LAND' | 'DISARM' | 'GEOFENCE_BREACH' | 'TIME_BREACH'
  timeStamp: number
  longitude: number
  latitude: number
  altitude: number
  crc: number
}

export interface FlightLogFile {
  signature: string
  flightLog: {
    permissionArtefact: string
    previousLogHash: string
    logEntries: FlightLogEntry[]
  }
}

export interface LogUploadResult {
  success: boolean
  logId: string
  entryCount: number
  breachCount: number
  evidenceRecordId?: string
}

export interface BVLOSParameters {
  corridorPath: [number, number][]
  corridorWidth: number
  minAlt: number
  maxAlt: number
  flightCategory: 'BVLOS-A' | 'BVLOS-B'
  soraGroundRiskClass: number
  soraAirRiskClass: string
  c2LinkPrimary: string
  c2LinkBackup: string
  emergencyLandingZones: [number, number][]
}

export interface DroneSubmissionForm {
  // Step 1 — Drone
  droneUin: string
  droneCategory: DroneCategory
  npntComplianceLevel: number
  uaopExpiry: string
  // Step 2 — Pilot
  pilotId: string
  rplNumber: string
  rplValidTo: string
  // Step 3 — Mission Area
  missionArea: GeoJSON.Polygon | null
  // Step 4 — Schedule
  scheduledDate: string
  scheduledTime: string
  durationMinutes: number
  isRecurring: boolean
  // Step 5 — Mission Parameters
  purpose: MissionPurpose
  maxAltitudeAGL: number
  payloadWeight: number | null
  bvlosEnabled: boolean
  // Step 6 — Compliance (computed)
  complianceStatus?: 'PASS' | 'FAIL' | 'WARN'
  // Step 7 — Submission mode
  submissionMode: 'AUTO' | 'MANUAL'
  // Step 8 — Post-flight log
  flightLog?: FlightLogFile
}

// DTOs for DGCA eGCA (Electronic Governance of Civil Aviation) API integration.
// eGCA is the DGCA's electronic governance platform for drone flight permissions.
// All types mirror the eGCA API v2 schema — see https://eservices.dgca.gov.in/egca/api/docs
//
// Date format convention: eGCA uses dd-MM-yyyy HH:mm:ss IST for all datetime fields.

// ── Coordinate ──────────────────────────────────────────────────────────────

export interface LatLng {
  latitude:  number
  longitude: number
}

// ── UIN (Unique Identification Number) Validation ───────────────────────────

export interface UINValidationResult {
  valid:            boolean
  uin:              string
  ownerName?:       string
  manufacturerName?: string
  modelName?:       string
  weightCategory?:  'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  registrationDate?: string  // dd-MM-yyyy
  status?:          'ACTIVE' | 'SUSPENDED' | 'DEREGISTERED'
  errorMessage?:    string
}

// ── RPC (Remote Pilot Certificate) Validation ───────────────────────────────

export interface RPCValidationResult {
  valid:          boolean
  rpcId:          string
  pilotName?:     string
  licenseClass?:  'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  validFrom?:     string  // dd-MM-yyyy
  validTo?:       string  // dd-MM-yyyy
  status?:        'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
  errorMessage?:  string
}

// ── UAOP (Unmanned Aircraft Operator Permit) Validation ─────────────────────

export interface UAOPValidationResult {
  valid:          boolean
  uaopNumber:     string
  operatorName?:  string
  permitType?:    'COMMERCIAL' | 'R_AND_D' | 'TRAINING' | 'GOVERNMENT'
  validFrom?:     string  // dd-MM-yyyy
  validTo?:       string  // dd-MM-yyyy
  status?:        'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
  errorMessage?:  string
}

// ── Flight Permission Payload ───────────────────────────────────────────────

export interface FlightPermissionPayload {
  pilotBusinessIdentifier:               string
  droneId:                               number    // eGCA internal integer, NOT UIN string
  uinNumber:                             string    // for display/logging only
  flyArea:                               LatLng[]
  payloadWeightInKg:                     number
  payloadDetails:                        string
  flightPurpose:                         string
  startDateTime:                         string    // format: dd-MM-yyyy HH:mm:ss IST
  endDateTime:                           string    // format: dd-MM-yyyy HH:mm:ss IST
  maxAltitudeInMeters:                   number
  typeOfOperation:                       'VLOS' | 'BVLOS' | 'NIGHT' | 'AGRICULTURAL'
  flightTerminationOrReturnHomeCapability: boolean
  geoFencingCapability:                  boolean
  detectAndAvoidCapability:              boolean
  selfDeclaration:                       boolean
  recurringTimeExpression?:              string    // CRON_QUARTZ format
  recurringTimeDurationInMinutes?:       number
}

// ── Flight Permission Result ────────────────────────────────────────────────

export interface FlightPermissionResult {
  applicationId:  string
  status:         'SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedAt:    string    // ISO 8601
  referenceNumber?: string  // eGCA tracking number
}

// ── Permission Status ───────────────────────────────────────────────────────

export interface PermissionStatus {
  status:               'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  permissionArtifactId?: string
  remarks?:             string
  updatedAt?:           string  // ISO 8601
}

// ── Zone Classification ─────────────────────────────────────────────────────

export interface ZoneClassification {
  zone:          'GREEN' | 'YELLOW' | 'RED'
  reasons:       string[]
  atcAuthority?: string
}

// ── Flight Permission (list item) ───────────────────────────────────────────

export interface FlightPermission {
  applicationId:      string
  uinNumber:          string
  pilotBusinessId:    string
  flightPurpose:      string
  status:             'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  startDateTime:      string
  endDateTime:        string
  maxAltitudeInMeters: number
  typeOfOperation:    'VLOS' | 'BVLOS' | 'NIGHT' | 'AGRICULTURAL'
  submittedAt:        string  // ISO 8601
  updatedAt:          string  // ISO 8601
}

// ── Paginated Result ────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items:      T[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

// ── Authentication ──────────────────────────────────────────────────────────

export interface EgcaAuthResult {
  token:     string
  expiresAt: Date
}

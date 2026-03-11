// T09 — Geofence violation type definitions

export interface GeofenceViolationRecord {
  id:              string
  missionId:       string
  uin:             string
  violationType:   'GEOFENCE_BREACH' | 'ALTITUDE_VIOLATION' | 'TIME_WINDOW_VIOLATION'
  severity:        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  lat:             number
  lon:             number
  altAGL:          number
  detailJson:      string
  evidenceHash:    string
  prevEvidenceHash: string
  detectedAt:      Date
}

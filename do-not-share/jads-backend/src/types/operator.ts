// ── Operator Registration + Mission Management types ────────────────────

export interface RegisterOperatorBody {
  uin:           string   // format: UA-YYYY-IN-XX-NNNNN
  dgcaLicenseNo: string
  operatorName:  string
  contactEmail:  string
}

export interface CreateMissionBody {
  uin:          string
  paReference:  string
  plannedStart: string   // ISO 8601
  plannedEnd:   string
  polygon:      [number, number][]   // array of [lat, lon] pairs
  maxAltitude:  number               // metres AGL
}

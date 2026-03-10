// UP25: Audit handoff service — exports evidence chain for regulatory audit

export interface AuditExportRecord {
  id: string
  type: 'NPNT_PA' | 'FLIGHT_LOG' | 'ICAO_FPL' | 'COMPLIANCE_CHECK' | 'CLEARANCE' | 'NOTAM_ACK'
  missionType: 'DRONE' | 'AIRCRAFT'
  referenceId: string
  timestamp: string
  hash: string
  verified: boolean
  metadata: Record<string, string>
}

export interface AuditPackage {
  packageId: string
  generatedAt: string
  generatedBy: string
  auditPeriod: { from: string; to: string }
  records: AuditExportRecord[]
  integrityHash: string
  format: 'JSON' | 'CSV' | 'PDF'
}

// Mock audit records
const MOCK_AUDIT_RECORDS: AuditExportRecord[] = [
  {
    id: 'aud-001', type: 'NPNT_PA', missionType: 'DRONE',
    referenceId: 'PA-2026-0001', timestamp: '2026-03-01T10:00:00Z',
    hash: 'sha256:a1b2c3d4e5f6...', verified: true,
    metadata: { droneSerial: 'DJI-M300-001', zone: 'GREEN', paId: 'PA-DS-2026-0001' },
  },
  {
    id: 'aud-002', type: 'FLIGHT_LOG', missionType: 'DRONE',
    referenceId: 'LOG-2026-0001', timestamp: '2026-03-01T14:30:00Z',
    hash: 'sha256:f6e5d4c3b2a1...', verified: true,
    metadata: { droneSerial: 'DJI-M300-001', format: 'DJI AirData CSV', points: '1247' },
  },
  {
    id: 'aud-003', type: 'ICAO_FPL', missionType: 'AIRCRAFT',
    referenceId: 'FPL-2026-0042', timestamp: '2026-03-05T06:00:00Z',
    hash: 'sha256:1a2b3c4d5e6f...', verified: true,
    metadata: { callsign: 'AKJ101', route: 'VIDP-VABB', aircraftType: 'B738' },
  },
  {
    id: 'aud-004', type: 'COMPLIANCE_CHECK', missionType: 'AIRCRAFT',
    referenceId: 'CC-2026-0042', timestamp: '2026-03-05T05:45:00Z',
    hash: 'sha256:6f5e4d3c2b1a...', verified: true,
    metadata: { result: 'PASS', rules: '8/8', dgcaRef: 'CAR Section 8' },
  },
  {
    id: 'aud-005', type: 'CLEARANCE', missionType: 'AIRCRAFT',
    referenceId: 'CLR-2026-0042', timestamp: '2026-03-05T06:10:00Z',
    hash: 'sha256:abcdef123456...', verified: true,
    metadata: { authority: 'AAI Delhi ATC', type: 'ADC', squawk: '4521' },
  },
  {
    id: 'aud-006', type: 'NOTAM_ACK', missionType: 'AIRCRAFT',
    referenceId: 'NOTAM-VIDP-2026-A001', timestamp: '2026-03-05T05:30:00Z',
    hash: 'sha256:123456abcdef...', verified: true,
    metadata: { notamId: 'A0042/26', qCode: 'QNIAS', acknowledged: 'true' },
  },
]

export async function fetchAuditRecords(
  period?: { from: string; to: string },
  missionType?: 'DRONE' | 'AIRCRAFT',
): Promise<AuditExportRecord[]> {
  await new Promise(r => setTimeout(r, 400))
  let records = MOCK_AUDIT_RECORDS
  if (missionType) records = records.filter(r => r.missionType === missionType)
  if (period) {
    records = records.filter(r => r.timestamp >= period.from && r.timestamp <= period.to)
  }
  return records
}

export async function generateAuditPackage(
  records: AuditExportRecord[],
  format: 'JSON' | 'CSV' = 'JSON',
): Promise<AuditPackage> {
  await new Promise(r => setTimeout(r, 300))

  const timestamps = records.map(r => r.timestamp).sort()

  return {
    packageId: `AUDIT-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    generatedBy: 'JADS User Portal v5.0',
    auditPeriod: {
      from: timestamps[0] ?? new Date().toISOString(),
      to: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
    },
    records,
    integrityHash: `sha256:pkg-${Math.random().toString(36).slice(2)}`,
    format,
  }
}

export function exportToJSON(pkg: AuditPackage): string {
  return JSON.stringify(pkg, null, 2)
}

export function exportToCSV(records: AuditExportRecord[]): string {
  const headers = ['ID', 'Type', 'Mission Type', 'Reference ID', 'Timestamp', 'Hash', 'Verified']
  const rows = records.map(r => [
    r.id, r.type, r.missionType, r.referenceId,
    r.timestamp, r.hash, String(r.verified),
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

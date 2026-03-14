export interface ParsedNOTAM {
  id: string
  type: string
  airport: string
  fir?: string
  qCode: string
  subject: string
  condition: string
  validFrom: string
  validTo: string
  text: string
  severity: 'INFO' | 'ADVISORY' | 'RESTRICTIVE'
  lowerAlt?: number
  upperAlt?: number
  center?: { lat: number; lon: number }
  radius?: number
}

export function parseQCode(q: string): { subject: string; condition: string } {
  const subjects: Record<string, string> = {
    'FA': 'Aerodrome', 'MX': 'Taxiway', 'IL': 'Instrument Landing System',
    'RT': 'Restricted/Temporary Area', 'NA': 'Navigation Aid', 'CK': 'Communications',
    'WA': 'Warning Area', 'OB': 'Obstacle', 'AP': 'Approach', 'LC': 'Lighting',
  }
  const conditions: Record<string, string> = {
    'AS': 'Unserviceable', 'LC': 'Closed', 'CA': 'Activated', 'XX': 'Various',
    'CH': 'Changed', 'HX': 'Hours changed',
  }
  const subCode = q.slice(1, 3)
  const condCode = q.slice(3, 5)
  return {
    subject: subjects[subCode] ?? subCode,
    condition: conditions[condCode] ?? condCode,
  }
}

export function isNOTAMActiveNow(notam: ParsedNOTAM): boolean {
  const now = new Date()
  return new Date(notam.validFrom) <= now && new Date(notam.validTo) >= now
}

export function notamSeverity(qCode: string): 'INFO' | 'ADVISORY' | 'RESTRICTIVE' {
  if (qCode.startsWith('QRT') || qCode.startsWith('QRD') || qCode.startsWith('QMX')) return 'RESTRICTIVE'
  if (qCode.startsWith('QIL') || qCode.startsWith('QFA') || qCode.startsWith('QNA')) return 'ADVISORY'
  return 'INFO'
}

export function doesNOTAMAffectRoute(notam: ParsedNOTAM, route: [number, number][]): boolean {
  if (!notam.center || !notam.radius) return false
  const bufferNM = 50
  const totalRadius = notam.radius + bufferNM
  for (const [lat, lon] of route) {
    const dist = haversineNM(lat, lon, notam.center.lat, notam.center.lon)
    if (dist <= totalRadius) return true
  }
  return false
}

function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

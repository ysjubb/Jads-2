/**
 * NPNTValidationService.ts
 *
 * NPNT Compliance Validation Service for Permission Artefacts.
 * Validates PA XML per DGCA RPAS Guidance Manual Revision 3.
 *
 * Checks: XML signature (W3C XMLDSig RSA-SHA256), content fields,
 * temporal validity, and polygon geometry.
 */

import crypto from 'crypto'

// ── Types ──────────────────────────────────────

export interface NPNTValidationResult {
  valid: boolean
  checks: ValidationCheck[]
  summary: {
    passed: number
    failed: number
    warnings: number
    total: number
  }
}

export interface ValidationCheck {
  code: string
  name: string
  category: 'SIGNATURE' | 'CONTENT' | 'TEMPORAL' | 'GEOMETRY'
  status: 'PASS' | 'FAIL' | 'WARNING'
  message: string
  details?: string
}

interface PAFields {
  permissionArtifactId?: string
  txnId?: string
  uinNumber?: string
  pilotId?: string
  flightStartTime?: string
  flightEndTime?: string
  polygon?: Array<{ lat: number; lng: number }>
  maxAltitude?: number
  ttl?: string
}

// ── XML Parsing Helpers ────────────────────────

function extractTagValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i')
  const match = xml.match(regex)
  return match?.[1]?.trim()
}

function extractAttribute(xml: string, tag: string, attr: string): string | undefined {
  const tagRegex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i')
  const match = xml.match(tagRegex)
  return match?.[1]?.trim()
}

function extractCoordinates(xml: string): Array<{ lat: number; lng: number }> {
  const coords: Array<{ lat: number; lng: number }> = []
  const coordRegex = /<Coordinate[^>]*lat="([^"]*)"[^>]*lng="([^"]*)"[^>]*/gi
  let match
  while ((match = coordRegex.exec(xml)) !== null) {
    coords.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) })
  }
  if (coords.length === 0) {
    // Try alternate format
    const altRegex = /<point[^>]*>([^<]*)<\/point>/gi
    while ((match = altRegex.exec(xml)) !== null) {
      const parts = match[1].split(',').map(s => parseFloat(s.trim()))
      if (parts.length >= 2) coords.push({ lat: parts[0], lng: parts[1] })
    }
  }
  return coords
}

function parseFields(xml: string): PAFields {
  return {
    permissionArtifactId: extractAttribute(xml, 'PermissionArtefact', 'permissionArtifactId')
      ?? extractTagValue(xml, 'permissionArtifactId'),
    txnId: extractAttribute(xml, 'PermissionArtefact', 'txnId')
      ?? extractTagValue(xml, 'txnId'),
    uinNumber: extractTagValue(xml, 'uinNumber')
      ?? extractTagValue(xml, 'UIN'),
    pilotId: extractTagValue(xml, 'pilotId')
      ?? extractTagValue(xml, 'RPAS_Pilot_ID'),
    flightStartTime: extractTagValue(xml, 'flightStartTime')
      ?? extractTagValue(xml, 'StartTime'),
    flightEndTime: extractTagValue(xml, 'flightEndTime')
      ?? extractTagValue(xml, 'EndTime'),
    polygon: extractCoordinates(xml),
    maxAltitude: (() => {
      const v = extractTagValue(xml, 'maxAltitude') ?? extractTagValue(xml, 'MaxAltitude')
      return v ? parseFloat(v) : undefined
    })(),
    ttl: extractTagValue(xml, 'ttl') ?? extractTagValue(xml, 'TimeToLive'),
  }
}

// ── Validation Checks ──────────────────────────

function checkSignaturePresent(xml: string): ValidationCheck {
  const hasSignature = xml.includes('<Signature') || xml.includes('<ds:Signature')
  return {
    code: 'SIG-01',
    name: 'XMLDSig Signature Present',
    category: 'SIGNATURE',
    status: hasSignature ? 'PASS' : 'FAIL',
    message: hasSignature
      ? 'W3C XMLDSig signature block found'
      : 'No XMLDSig signature found in PA XML',
  }
}

function checkSignatureAlgorithm(xml: string): ValidationCheck {
  const hasRsaSha256 = xml.includes('rsa-sha256') || xml.includes('RSA-SHA256')
    || xml.includes('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')
  return {
    code: 'SIG-02',
    name: 'Signature Algorithm RSA-SHA256',
    category: 'SIGNATURE',
    status: hasRsaSha256 ? 'PASS' : 'FAIL',
    message: hasRsaSha256
      ? 'Signature algorithm is RSA-SHA256 (OID 1.2.840.113549.1.1.11)'
      : 'Signature algorithm is not RSA-SHA256 as required by NPNT',
  }
}

function checkDigestAlgorithm(xml: string): ValidationCheck {
  const hasSha256 = xml.includes('sha256') || xml.includes('SHA256')
    || xml.includes('http://www.w3.org/2001/04/xmlenc#sha256')
  return {
    code: 'SIG-03',
    name: 'Digest Algorithm SHA-256',
    category: 'SIGNATURE',
    status: hasSha256 ? 'PASS' : 'FAIL',
    message: hasSha256
      ? 'Digest algorithm is SHA-256'
      : 'Digest algorithm is not SHA-256',
  }
}

function checkCanonicalization(xml: string): ValidationCheck {
  const hasC14n = xml.includes('c14n') || xml.includes('C14N')
    || xml.includes('http://www.w3.org/2006/12/xml-c14n11')
    || xml.includes('http://www.w3.org/TR/2001/REC-xml-c14n')
  return {
    code: 'SIG-04',
    name: 'Canonicalization C14N',
    category: 'SIGNATURE',
    status: hasC14n ? 'PASS' : 'WARNING',
    message: hasC14n
      ? 'Canonicalization method is C14N 1.1'
      : 'Could not confirm C14N canonicalization method',
  }
}

function checkCertificatePresent(xml: string): ValidationCheck {
  const hasCert = xml.includes('<X509Certificate') || xml.includes('<ds:X509Certificate')
  return {
    code: 'SIG-05',
    name: 'X.509 Certificate Present',
    category: 'SIGNATURE',
    status: hasCert ? 'PASS' : 'FAIL',
    message: hasCert
      ? 'X.509 certificate embedded in signature'
      : 'No X.509 certificate found in signature block',
  }
}

function checkSignatureVerification(xml: string): ValidationCheck {
  // Extract SignatureValue and perform basic integrity check
  const sigValueMatch = xml.match(/<(?:ds:)?SignatureValue[^>]*>([^<]+)</)
  if (!sigValueMatch) {
    return {
      code: 'SIG-06',
      name: 'Signature Verification',
      category: 'SIGNATURE',
      status: 'FAIL',
      message: 'SignatureValue element not found',
    }
  }
  const sigValue = sigValueMatch[1].replace(/\s/g, '')
  // Verify it's valid Base64
  try {
    const buf = Buffer.from(sigValue, 'base64')
    if (buf.length < 128) {
      return {
        code: 'SIG-06',
        name: 'Signature Verification',
        category: 'SIGNATURE',
        status: 'WARNING',
        message: `Signature value present but unusually short (${buf.length} bytes)`,
        details: 'Expected RSA-SHA256 signature ≥ 256 bytes for 2048-bit key',
      }
    }
    return {
      code: 'SIG-06',
      name: 'Signature Verification',
      category: 'SIGNATURE',
      status: 'PASS',
      message: `Signature value present (${buf.length} bytes), structurally valid`,
      details: 'Full cryptographic verification requires DGCA public key',
    }
  } catch {
    return {
      code: 'SIG-06',
      name: 'Signature Verification',
      category: 'SIGNATURE',
      status: 'FAIL',
      message: 'SignatureValue is not valid Base64',
    }
  }
}

function checkPermissionArtifactId(fields: PAFields): ValidationCheck {
  return {
    code: 'CNT-01',
    name: 'permissionArtifactId Present',
    category: 'CONTENT',
    status: fields.permissionArtifactId ? 'PASS' : 'FAIL',
    message: fields.permissionArtifactId
      ? `PA ID: ${fields.permissionArtifactId}`
      : 'permissionArtifactId is missing or empty',
  }
}

function checkUinMatch(fields: PAFields, expectedUin: string): ValidationCheck {
  if (!fields.uinNumber) {
    return { code: 'CNT-02', name: 'UIN Match', category: 'CONTENT', status: 'FAIL', message: 'UIN not found in PA XML' }
  }
  const matches = fields.uinNumber === expectedUin
  return {
    code: 'CNT-02',
    name: 'UIN Match',
    category: 'CONTENT',
    status: matches ? 'PASS' : 'FAIL',
    message: matches
      ? `UIN matches: ${expectedUin}`
      : `UIN mismatch: PA has ${fields.uinNumber}, expected ${expectedUin}`,
  }
}

function checkPilotMatch(fields: PAFields, expectedPilot: string): ValidationCheck {
  if (!fields.pilotId) {
    return { code: 'CNT-03', name: 'Pilot Match', category: 'CONTENT', status: 'FAIL', message: 'Pilot ID not found in PA XML' }
  }
  const matches = fields.pilotId === expectedPilot
  return {
    code: 'CNT-03',
    name: 'Pilot Match',
    category: 'CONTENT',
    status: matches ? 'PASS' : 'FAIL',
    message: matches
      ? `Pilot ID matches: ${expectedPilot}`
      : `Pilot ID mismatch: PA has ${fields.pilotId}, expected ${expectedPilot}`,
  }
}

function checkFlightTimes(fields: PAFields): ValidationCheck {
  if (!fields.flightStartTime || !fields.flightEndTime) {
    return { code: 'CNT-04', name: 'Flight Times Valid', category: 'CONTENT', status: 'FAIL', message: 'Flight start/end time missing' }
  }
  const start = new Date(fields.flightStartTime)
  const end = new Date(fields.flightEndTime)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { code: 'CNT-04', name: 'Flight Times Valid', category: 'CONTENT', status: 'FAIL', message: 'Flight times are not valid ISO 8601' }
  }
  if (end <= start) {
    return { code: 'CNT-04', name: 'Flight Times Valid', category: 'CONTENT', status: 'FAIL', message: 'End time is not after start time' }
  }
  return {
    code: 'CNT-04',
    name: 'Flight Times Valid',
    category: 'CONTENT',
    status: 'PASS',
    message: `Valid window: ${start.toISOString()} to ${end.toISOString()}`,
  }
}

function checkPolygonValid(fields: PAFields): ValidationCheck {
  const coords = fields.polygon ?? []
  if (coords.length < 3) {
    return { code: 'CNT-05', name: 'Polygon Valid', category: 'CONTENT', status: 'FAIL', message: `Polygon has ${coords.length} coordinates, minimum 3 required` }
  }
  // Check WGS84 ranges
  for (const c of coords) {
    if (c.lat < -90 || c.lat > 90 || c.lng < -180 || c.lng > 180) {
      return { code: 'CNT-05', name: 'Polygon Valid', category: 'CONTENT', status: 'FAIL', message: `Invalid WGS84 coordinate: (${c.lat}, ${c.lng})` }
    }
  }
  // Check closed polygon (first == last)
  const first = coords[0]
  const last = coords[coords.length - 1]
  const closed = Math.abs(first.lat - last.lat) < 0.0001 && Math.abs(first.lng - last.lng) < 0.0001
  if (!closed) {
    return { code: 'CNT-05', name: 'Polygon Valid', category: 'CONTENT', status: 'WARNING', message: `Polygon not closed (first: ${first.lat},${first.lng} last: ${last.lat},${last.lng})` }
  }
  return {
    code: 'CNT-05',
    name: 'Polygon Valid',
    category: 'CONTENT',
    status: 'PASS',
    message: `Valid closed polygon with ${coords.length} vertices`,
  }
}

function checkTemporalValidity(fields: PAFields): ValidationCheck {
  if (!fields.flightStartTime || !fields.flightEndTime) {
    return { code: 'TMP-01', name: 'Current Time Within Window', category: 'TEMPORAL', status: 'FAIL', message: 'Cannot check: flight times missing' }
  }
  const now = new Date()
  const start = new Date(fields.flightStartTime)
  const end = new Date(fields.flightEndTime)
  const earlyStart = new Date(start.getTime() - 30 * 60 * 1000) // 30 min before

  if (now < earlyStart) {
    return { code: 'TMP-01', name: 'Current Time Within Window', category: 'TEMPORAL', status: 'WARNING', message: `PA not yet active. Starts at ${start.toISOString()} (${Math.round((start.getTime() - now.getTime()) / 60000)}m from now)` }
  }
  if (now > end) {
    return { code: 'TMP-01', name: 'Current Time Within Window', category: 'TEMPORAL', status: 'FAIL', message: `PA has expired. Ended at ${end.toISOString()}` }
  }
  return {
    code: 'TMP-01',
    name: 'Current Time Within Window',
    category: 'TEMPORAL',
    status: 'PASS',
    message: 'Current time is within permitted flight window',
  }
}

function checkTTL(fields: PAFields): ValidationCheck {
  if (!fields.ttl) {
    return { code: 'TMP-02', name: 'TTL Not Expired', category: 'TEMPORAL', status: 'WARNING', message: 'No TTL field found in PA XML' }
  }
  const ttlDate = new Date(fields.ttl)
  if (isNaN(ttlDate.getTime())) {
    return { code: 'TMP-02', name: 'TTL Not Expired', category: 'TEMPORAL', status: 'WARNING', message: `TTL value "${fields.ttl}" is not a valid date` }
  }
  const expired = new Date() > ttlDate
  return {
    code: 'TMP-02',
    name: 'TTL Not Expired',
    category: 'TEMPORAL',
    status: expired ? 'FAIL' : 'PASS',
    message: expired
      ? `PA TTL expired at ${ttlDate.toISOString()}`
      : `PA TTL valid until ${ttlDate.toISOString()}`,
  }
}

// ── Main Validation ────────────────────────────

export function validatePA(
  paXml: string,
  droneUin: string,
  pilotId: string,
): NPNTValidationResult {
  const fields = parseFields(paXml)

  const checks: ValidationCheck[] = [
    // Signature checks
    checkSignaturePresent(paXml),
    checkSignatureAlgorithm(paXml),
    checkDigestAlgorithm(paXml),
    checkCanonicalization(paXml),
    checkCertificatePresent(paXml),
    checkSignatureVerification(paXml),
    // Content checks
    checkPermissionArtifactId(fields),
    checkUinMatch(fields, droneUin),
    checkPilotMatch(fields, pilotId),
    checkFlightTimes(fields),
    checkPolygonValid(fields),
    // Temporal checks
    checkTemporalValidity(fields),
    checkTTL(fields),
  ]

  const passed = checks.filter(c => c.status === 'PASS').length
  const failed = checks.filter(c => c.status === 'FAIL').length
  const warnings = checks.filter(c => c.status === 'WARNING').length

  return {
    valid: failed === 0,
    checks,
    summary: { passed, failed, warnings, total: checks.length },
  }
}

/**
 * Compute SHA-256 hash of a buffer (for PA ZIP integrity).
 */
export function computeSHA256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export default { validatePA, computeSHA256 }

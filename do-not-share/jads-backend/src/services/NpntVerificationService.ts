// NpntVerificationService — NPNT (No Permission No Takeoff) compliance.
// Parses and verifies DGCA Permission Artefacts (PA) — XML documents
// signed by DGCA's PKI. Validates flight parameters against the PA
// before and during drone missions.

import { PrismaClient }        from '@prisma/client'
import { env }                 from '../env'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('NpntVerificationService')

export interface PermissionArtefact {
  artefactId:    string
  uasId:         string    // drone UIN from DGCA
  pilotId:       string    // pilot business identifier
  flightParams: {
    maxAltitudeAgl: number  // metres
    startTime:      Date
    endTime:        Date
    area: {
      type:        'Polygon'
      coordinates: number[][][]
    }
  }
  dgcaSignature: string    // base64 DER ECDSA signature from DGCA
  issuedAt:      Date
  expiresAt:     Date
}

export interface VerificationResult {
  valid:      boolean
  artefactId: string
  reason?:    string    // why invalid, if not valid
  warnings:   string[]
}

export class NpntVerificationService {

  constructor(private readonly prisma: PrismaClient) {}

  async parseAndVerify(paXml: string): Promise<VerificationResult> {
    let pa: PermissionArtefact
    try {
      pa = this.parseXml(paXml)
    } catch (e) {
      return {
        valid: false,
        artefactId: '',
        reason: 'XML_PARSE_FAILED',
        warnings: [e instanceof Error ? e.message : String(e)],
      }
    }

    const sigValid = this.verifyDgcaSignature(paXml, pa.dgcaSignature)
    if (!sigValid) {
      return {
        valid: false,
        artefactId: pa.artefactId,
        reason: 'DGCA_SIGNATURE_INVALID',
        warnings: [],
      }
    }

    if (pa.expiresAt <= new Date()) {
      return {
        valid: false,
        artefactId: pa.artefactId,
        reason: 'ARTEFACT_EXPIRED',
        warnings: [],
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'NpntVerificationService',
        action:       'npnt_artefact_verified',
        resourceType: 'permission_artefact',
        resourceId:   pa.artefactId,
        detailJson:   JSON.stringify({
          artefactId: pa.artefactId,
          uasId:      pa.uasId,
          pilotId:    pa.pilotId,
          valid:      true,
        }),
      }
    })

    log.info('npnt_artefact_verified', {
      data: { artefactId: pa.artefactId, uasId: pa.uasId }
    })

    return { valid: true, artefactId: pa.artefactId, warnings: [] }
  }

  async checkMissionCompliance(
    artefactId:    string,
    actualLatDeg:  number,
    actualLonDeg:  number,
    actualAltAglM: number,
    atTime:        Date
  ): Promise<{ compliant: boolean; reason?: string }> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        action:     'npnt_artefact_verified',
        resourceId: artefactId,
      },
      orderBy: { timestamp: 'desc' },
    })

    if (!row) {
      return { compliant: false, reason: 'ARTEFACT_NOT_FOUND' }
    }

    let detail: any
    try {
      detail = JSON.parse(row.detailJson)
    } catch {
      return { compliant: false, reason: 'ARTEFACT_DATA_CORRUPT' }
    }

    // Use stub PA data for compliance check until real PA storage is in place
    const pa = this.parseXml('')

    // Time window check
    if (atTime < pa.flightParams.startTime || atTime > pa.flightParams.endTime) {
      return {
        compliant: false,
        reason: `TIME_WINDOW_VIOLATION: Flight at ${atTime.toISOString()} ` +
                `is outside permitted window ${pa.flightParams.startTime.toISOString()} – ` +
                `${pa.flightParams.endTime.toISOString()}`,
      }
    }

    // Altitude check
    if (actualAltAglM > pa.flightParams.maxAltitudeAgl) {
      return {
        compliant: false,
        reason: `ALTITUDE_VIOLATION: ${actualAltAglM}m AGL exceeds ` +
                `max permitted ${pa.flightParams.maxAltitudeAgl}m AGL`,
      }
    }

    // Geofence check — ray casting algorithm
    if (!this.pointInPolygon(actualLatDeg, actualLonDeg, pa.flightParams.area.coordinates[0])) {
      return {
        compliant: false,
        reason: `GEOFENCE_VIOLATION: Position (${actualLatDeg}, ${actualLonDeg}) ` +
                `is outside permitted area polygon`,
      }
    }

    return { compliant: true }
  }

  // PRODUCTION: Parse DGCA Permission Artefact XML per DigitalSky schema.
  // Schema reference: https://digitalsky.dgca.gov.in/
  // Required fields: FlightPermissionArtifact/UASRegistrationNumber,
  // PilotBusinessIdentifier, FlightParameters, Validity, Signature.
  private parseXml(xml: string): PermissionArtefact {
    if (env.NODE_ENV === 'production') {
      throw new Error('NPNT_STUB_IN_PRODUCTION: parseXml stub must be replaced with real DGCA PA parser before production deployment')
    }
    const now = new Date()
    const oneHourLater = new Date(now.getTime() + 3600000)
    return {
      artefactId:    'STUB-PA-001',
      uasId:         'UA-STUB-001',
      pilotId:       'PILOT-STUB-001',
      flightParams: {
        maxAltitudeAgl: 120,
        startTime:      now,
        endTime:        oneHourLater,
        area: {
          type: 'Polygon',
          coordinates: [[[77.0, 28.5], [77.2, 28.5], [77.2, 28.7], [77.0, 28.7], [77.0, 28.5]]],
        },
      },
      dgcaSignature: 'STUB_SIGNATURE',
      issuedAt:       now,
      expiresAt:      oneHourLater,
    }
  }

  // PRODUCTION: Verify XML signature against DGCA root CA certificate.
  // DGCA uses XML-DSig (W3C) with ECDSA P-256 or RSA-2048.
  // Obtain DGCA root CA from: https://digitalsky.dgca.gov.in/
  // Use xmldsigjs or similar W3C XML-DSig library.
  // This is a HARD REQUIREMENT for DSP certification.
  private verifyDgcaSignature(xml: string, signatureB64: string): boolean {
    if (env.NODE_ENV === 'production') {
      throw new Error('NPNT_STUB_IN_PRODUCTION: verifyDgcaSignature stub must be replaced with real DGCA signature verification before production deployment')
    }
    return true
  }

  // Ray casting point-in-polygon (same logic as FirGeometryEngine)
  private pointInPolygon(lat: number, lon: number, ring: number[][]): boolean {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][1], yi = ring[i][0]  // [lon, lat] → lat, lon
      const xj = ring[j][1], yj = ring[j][0]

      if (((yi > lon) !== (yj > lon)) &&
          (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    return inside
  }
}

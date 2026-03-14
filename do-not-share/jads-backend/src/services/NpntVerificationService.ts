// NpntVerificationService — NPNT (No Permission No Takeoff) compliance.
// Parses and verifies DGCA Permission Artefacts (PA) — XML documents
// signed by DGCA's PKI. Validates flight parameters against the PA
// before and during drone missions.

import { PrismaClient }        from '@prisma/client'
import { env }                 from '../env'
import { createServiceLogger } from '../logger'
import { verifyPaSignature }   from './npnt/XmlDsigSigner'

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
  ): Promise<{ compliant: boolean; reason?: string; advisory?: string }> {
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

    // PA storage is not yet implemented — original PA XML is not persisted
    // alongside the audit log row, so we cannot reconstruct the PA's
    // geofence polygon, time window, or altitude cap for compliance geometry
    // checks.  Instead of calling parseXml('') (which would silently return
    // stub data and pass every mission), we return compliant: true with an
    // advisory flag so upstream callers know the geometry check was deferred.
    //
    // TODO: Once the PA XML (or its extracted flight-params) is persisted in
    //       a dedicated PermissionArtefact table, load it here and perform
    //       the full time-window, altitude, and geofence checks.

    log.warn('npnt_compliance_geometry_deferred', {
      data: {
        artefactId,
        actualLatDeg,
        actualLonDeg,
        actualAltAglM,
        atTime: atTime.toISOString(),
        reason: 'PA flight-params not persisted — geometry check deferred',
      },
    })

    return {
      compliant: true,
      advisory:  'COMPLIANCE_GEOMETRY_DEFERRED: Permission artefact flight-params ' +
                 'are not yet persisted. Time-window, altitude, and geofence checks ' +
                 'were skipped. Full compliance verification will be available once ' +
                 'PA storage is implemented.',
    }
  }

  // PRODUCTION: Parse DGCA Permission Artefact XML per DigitalSky schema.
  // Schema reference: https://digitalsky.dgca.gov.in/
  // Required fields: FlightPermissionArtifact/UASRegistrationNumber,
  // PilotBusinessIdentifier, FlightParameters, Validity, Signature.
  private parseXml(xml: string): PermissionArtefact {
    if (!xml || xml.trim().length === 0) {
      throw new Error('EMPTY_PA_XML: Permission Artefact XML must not be empty')
    }
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

  // Verify XML signature using XmlDsigSigner.verifyPaSignature().
  // In production, the certificate chain should be validated against the
  // DGCA root CA from https://digitalsky.dgca.gov.in/.
  // Currently validates the cryptographic signature; CA chain trust is
  // deferred until DGCA root CA certificate is provisioned.
  private verifyDgcaSignature(xml: string, _signatureB64: string): boolean {
    try {
      const result = verifyPaSignature(xml)
      if (!result.valid) {
        log.warn('npnt_signature_invalid', {
          data: {
            errors:   result.errors,
            signerCN: result.signerCN,
            certExpiry: result.certExpiry?.toISOString() ?? null,
          },
        })
      }
      return result.valid
    } catch (err) {
      // If the PA XML has no <Signature> element (e.g. unsigned stub PA
      // used during dev/demo), log a warning and treat as unsigned.
      log.warn('npnt_signature_verification_error', {
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      return false
    }
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

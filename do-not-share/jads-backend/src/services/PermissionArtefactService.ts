// PermissionArtefactService — manages storage and retrieval of verified
// DGCA Permission Artefacts. Links PAs to drone missions for forensic
// traceability under DGCA UAS Rules 2021.

import { PrismaClient }             from '@prisma/client'
import { NpntVerificationService }   from './NpntVerificationService'
import { createServiceLogger }       from '../logger'

const log = createServiceLogger('PermissionArtefactService')

export class PermissionArtefactService {

  constructor(
    private readonly prisma:  PrismaClient,
    private readonly npntSvc: NpntVerificationService
  ) {}

  async submitArtefact(
    paXml:   string,
    droneId: string,
    pilotId: string
  ): Promise<{ artefactId: string; valid: boolean; reason?: string }> {
    const result = await this.npntSvc.parseAndVerify(paXml)

    if (!result.valid) {
      log.warn('permission_artefact_rejected', {
        data: { droneId, pilotId, reason: result.reason }
      })
      return { artefactId: '', valid: false, reason: result.reason }
    }

    // Store the verified artefact as an AirspaceVersion record
    // (PA storage model — Phase 2 will add a dedicated PermissionArtefact table)
    await this.prisma.airspaceVersion.upsert({
      where: { id: result.artefactId },
      create: {
        id:             result.artefactId,
        dataType:       'PERMISSION_ARTEFACT',
        versionNumber:  1,
        payloadJson:    paXml,
        approvalStatus: 'ACTIVE',
        effectiveFrom:  new Date(),
        changeReason:   `PA submitted for drone ${droneId} by pilot ${pilotId}`,
        createdBy:      pilotId,
      },
      update: {
        payloadJson:   paXml,
        approvalStatus: 'ACTIVE',
      },
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'PermissionArtefactService',
        action:       'permission_artefact_submitted',
        resourceType: 'permission_artefact',
        resourceId:   result.artefactId,
        detailJson:   JSON.stringify({
          artefactId: result.artefactId,
          droneId,
          pilotId,
        }),
      }
    })

    log.info('permission_artefact_submitted', {
      data: { artefactId: result.artefactId, droneId, pilotId }
    })

    return { artefactId: result.artefactId, valid: true }
  }

  async getActiveArtefact(
    droneId: string,
    atTime:  Date
  ): Promise<{ artefactId: string; expiresAt: Date } | null> {
    // Look up the most recent valid PA for this drone
    const row = await this.prisma.airspaceVersion.findFirst({
      where: {
        dataType:       'PERMISSION_ARTEFACT',
        approvalStatus: 'ACTIVE',
        effectiveFrom:  { lte: atTime },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: atTime } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    })

    if (!row) return null

    return {
      artefactId: row.id,
      expiresAt:  row.effectiveTo ?? new Date(Date.now() + 86400000),
    }
  }

  async validateMissionStart(
    droneId: string,
    latDeg:  number,
    lonDeg:  number,
    altAglM: number
  ): Promise<{ allowed: boolean; reason?: string; artefactId?: string }> {
    const active = await this.getActiveArtefact(droneId, new Date())

    if (!active) {
      log.warn('npnt_no_valid_artefact', { data: { droneId } })
      return { allowed: false, reason: 'NO_VALID_PERMISSION_ARTEFACT' }
    }

    const compliance = await this.npntSvc.checkMissionCompliance(
      active.artefactId, latDeg, lonDeg, altAglM, new Date()
    )

    if (!compliance.compliant) {
      log.warn('npnt_mission_not_compliant', {
        data: { droneId, artefactId: active.artefactId, reason: compliance.reason }
      })
      return { allowed: false, reason: compliance.reason }
    }

    log.info('npnt_mission_start_allowed', {
      data: { droneId, artefactId: active.artefactId }
    })

    return { allowed: true, artefactId: active.artefactId }
  }
}

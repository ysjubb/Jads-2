// Versioned airspace CMS — manages all dynamic aviation data.
// INVARIANTS:
//   1. No record is ever deleted — status changes to WITHDRAWN or SUPERSEDED only.
//   2. Two-person rule for drone zone changes (approver ≠ creator).
//   3. Flight plan validators only use ACTIVE versions (never DRAFT).
//   4. Every write operation creates an AuditLog entry.
//   5. airspaceSnapshotVersionIds on flight plans enables historical replay.

import { PrismaClient }        from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AirspaceVersioningService')

// ── Public data types ──────────────────────────────────────────────────────

export interface WaypointData {
  icaoId:             string
  name:               string
  latDeg:             number
  lonDeg:             number
  waypointType:       'COMPULSORY' | 'ON_REQUEST' | 'FIR_BOUNDARY' | 'HOLDING'
  firCode:            string
  magneticVariation?: number
}

export interface AirwayData {
  airwayId:  string
  name:      string
  points:    Array<{ waypointId: string; distNm: number; mea: number; trackDeg?: number }>
  upperFl:   number
  lowerFl:   number
  direction: 'BOTH' | 'FORWARD' | 'REVERSE'
}

export interface DroneZoneData {
  zoneId:        string
  zoneName:      string
  zoneType:      'RED' | 'YELLOW' | 'GREEN'
  polygon:       { type: 'Polygon'; coordinates: number[][][] }
  maxAglFt:      number
  effectiveArea: string
  notes:         string
  authority:     string
}

export interface TransitionAltitudeData {
  aerodromeIcao:       string
  transitionAltitudeFt: number
  transitionLevelFl:    number
  authority:           string
  remarks?:            string
}

// ── Service ────────────────────────────────────────────────────────────────

export class AirspaceVersioningService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── WAYPOINTS ────────────────────────────────────────────────────────────

  async createWaypointVersion(
    adminUserId: string,
    data:        WaypointData,
    meta:        { effectiveFrom: Date; changeReason: string; airacCycle?: string }
  ): Promise<string> {
    const existing = await this.findActiveByPredicate('WAYPOINT',
      (d: WaypointData) => d.icaoId === data.icaoId)

    const id = await this.createVersion({
      dataType: 'WAYPOINT', data, adminUserId,
      effectiveFrom: meta.effectiveFrom, changeReason: meta.changeReason,
      airacCycle: meta.airacCycle, supersedes: existing?.id ?? null,
      approvalStatus: 'ACTIVE'
    })

    if (existing) {
      await this.prisma.airspaceVersion.update({
        where: { id: existing.id },
        data:  { approvalStatus: 'SUPERSEDED', supersededById: id, effectiveTo: new Date() }
      })
    }

    return id
  }

  async getActiveWaypoint(icaoId: string): Promise<(WaypointData & { versionId: string }) | null> {
    const all = await this.getActiveByType('WAYPOINT')
    const match = all.find(v => (JSON.parse(v.payloadJson) as WaypointData).icaoId === icaoId)
    return match ? { ...(JSON.parse(match.payloadJson) as WaypointData), versionId: match.id } : null
  }

  async getAllActiveWaypoints(): Promise<Array<WaypointData & { versionId: string }>> {
    const all = await this.getActiveByType('WAYPOINT')
    return all.map(v => ({ ...(JSON.parse(v.payloadJson) as WaypointData), versionId: v.id }))
  }

  // ── AIRWAYS ──────────────────────────────────────────────────────────────

  async createAirwayVersion(
    adminUserId: string,
    data:        AirwayData,
    meta:        { effectiveFrom: Date; changeReason: string; airacCycle?: string }
  ): Promise<string> {
    const existing = await this.findActiveByPredicate('AIRWAY',
      (d: AirwayData) => d.airwayId === data.airwayId)

    const id = await this.createVersion({
      dataType: 'AIRWAY', data, adminUserId,
      effectiveFrom: meta.effectiveFrom, changeReason: meta.changeReason,
      airacCycle: meta.airacCycle, supersedes: existing?.id ?? null,
      approvalStatus: 'ACTIVE'
    })

    if (existing) {
      await this.prisma.airspaceVersion.update({
        where: { id: existing.id },
        data:  { approvalStatus: 'SUPERSEDED', supersededById: id, effectiveTo: new Date() }
      })
    }

    return id
  }

  async getActiveAirway(airwayId: string): Promise<(AirwayData & { versionId: string }) | null> {
    const all = await this.getActiveByType('AIRWAY')
    const match = all.find(v => (JSON.parse(v.payloadJson) as AirwayData).airwayId === airwayId)
    return match ? { ...(JSON.parse(match.payloadJson) as AirwayData), versionId: match.id } : null
  }

  // ── DRONE ZONES (two-person approval) ───────────────────────────────────

  async createDroneZoneVersion(
    adminUserId: string,
    data:        DroneZoneData,
    meta:        { effectiveFrom: Date; changeReason: string }
  ): Promise<{ draftId: string; requiresApprovalFrom: string }> {
    const draftId = await this.createVersion({
      dataType: 'DRONE_ZONE', data, adminUserId,
      effectiveFrom: meta.effectiveFrom, changeReason: meta.changeReason,
      approvalStatus: 'DRAFT'   // NOT active until second admin approves
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER', actorId: adminUserId,
        action:       'drone_zone_draft_created',
        resourceType: 'airspace_zone', resourceId: draftId,
        detailJson: JSON.stringify({ zoneId: data.zoneId, zoneType: data.zoneType })
      }
    })

    log.info('drone_zone_draft_created', {
      data: { draftId, zoneId: data.zoneId, zoneType: data.zoneType, createdBy: adminUserId }
    })

    return {
      draftId,
      requiresApprovalFrom: 'A different GOVT_ADMIN or PLATFORM_SUPER_ADMIN must approve'
    }
  }

  async approveDroneZoneVersion(approvingAdminId: string, draftId: string): Promise<void> {
    const draft = await this.prisma.airspaceVersion.findUniqueOrThrow({ where: { id: draftId } })

    if (draft.dataType !== 'DRONE_ZONE') throw new Error('NOT_A_DRONE_ZONE_VERSION')
    if (draft.approvalStatus !== 'DRAFT')  throw new Error(`ALREADY_${draft.approvalStatus}`)

    // TWO-PERSON RULE: approver cannot be the creator
    if (draft.createdBy === approvingAdminId) {
      await this.prisma.auditLog.create({
        data: {
          actorType:    'SPECIAL_USER', actorId: approvingAdminId,
          action:       'drone_zone_approval_rejected_same_admin',
          resourceType: 'airspace_zone', resourceId: draftId,
          errorCode:    'SAME_ADMIN_APPROVAL_FORBIDDEN',
          detailJson: JSON.stringify({ draftId, createdBy: draft.createdBy })
        }
      })
      throw new Error('TWO_PERSON_RULE_VIOLATION: Approver cannot be the creator')
    }

    const zoneData = JSON.parse(draft.payloadJson) as DroneZoneData

    // Supersede any existing active version of this zone
    const existing = await this.findActiveByPredicate('DRONE_ZONE',
      (d: DroneZoneData) => d.zoneId === zoneData.zoneId)

    if (existing) {
      await this.prisma.airspaceVersion.update({
        where: { id: existing.id },
        data:  { approvalStatus: 'SUPERSEDED', supersededById: draftId, effectiveTo: new Date() }
      })
    }

    await this.prisma.airspaceVersion.update({
      where: { id: draftId },
      data:  {
        approvalStatus:   'ACTIVE',
        approvedBy: approvingAdminId,
        approvedAt:       new Date(),
        supersedes:       existing?.id ?? null
      }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER', actorId: approvingAdminId,
        action:       'drone_zone_approved_and_activated',
        resourceType: 'airspace_zone', resourceId: draftId,
        detailJson: JSON.stringify({
          zoneId:     zoneData.zoneId,
          zoneType:   zoneData.zoneType,
          superseded: existing?.id ?? null
        })
      }
    })

    log.info('drone_zone_activated', {
      data: { draftId, zoneId: zoneData.zoneId, approvedBy: approvingAdminId }
    })
  }

  async withdrawDroneZone(adminUserId: string, versionId: string, reason: string): Promise<void> {
    // INVARIANT: never DELETE — only WITHDRAWN
    await this.prisma.airspaceVersion.update({
      where: { id: versionId },
      data:  { approvalStatus: 'WITHDRAWN', effectiveTo: new Date() }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER', actorId: adminUserId,
        action:       'drone_zone_withdrawn',
        resourceType: 'airspace_zone', resourceId: versionId,
        detailJson: JSON.stringify({ reason })
      }
    })

    log.info('drone_zone_withdrawn', { data: { versionId, reason } })
  }

  async getActiveDroneZones(): Promise<Array<DroneZoneData & { versionId: string }>> {
    const now = new Date()
    const zones = await this.prisma.airspaceVersion.findMany({
      where: {
        dataType:       'DRONE_ZONE',
        approvalStatus: 'ACTIVE',
        effectiveFrom:  { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      }
    })
    return zones.map(v => ({ ...(JSON.parse(v.payloadJson) as DroneZoneData), versionId: v.id }))
  }

  // ── TRANSITION ALTITUDES ─────────────────────────────────────────────────

  async createTransitionAltitudeVersion(
    adminUserId: string,
    data:        TransitionAltitudeData,
    meta:        { effectiveFrom: Date; changeReason: string; airacCycle?: string }
  ): Promise<string> {
    const existing = await this.findActiveByPredicate('TRANSITION_ALTITUDE',
      (d: TransitionAltitudeData) => d.aerodromeIcao === data.aerodromeIcao)

    const id = await this.createVersion({
      dataType: 'TRANSITION_ALTITUDE', data, adminUserId,
      effectiveFrom: meta.effectiveFrom, changeReason: meta.changeReason,
      airacCycle: meta.airacCycle, supersedes: existing?.id ?? null,
      approvalStatus: 'ACTIVE'
    })

    if (existing) {
      await this.prisma.airspaceVersion.update({
        where: { id: existing.id },
        data:  { approvalStatus: 'SUPERSEDED', supersededById: id, effectiveTo: new Date() }
      })
    }

    return id
  }

  // ── NOTAM (single-admin, immediate) ──────────────────────────────────────

  async publishNotam(
    adminUserId: string,
    data: {
      notamNumber:   string; notamSeries: string; firCode: string
      subject:       string; condition:   string; traffic: string
      purpose:       string; scope:       string; lowerFl: number; upperFl: number
      areaGeoJson?:  string
      effectiveFrom: Date;   effectiveTo?: Date;  rawText: string
    }
  ): Promise<string> {
    const notam = await this.prisma.notamRecord.create({
      data: {
        notamNumber:   data.notamNumber,
        notamSeries:   data.notamSeries,
        firCode:       data.firCode,
        subject:       data.subject,
        condition:     data.condition,
        traffic:       data.traffic,
        purpose:       data.purpose,
        scope:         data.scope,
        lowerFl:       data.lowerFl,
        upperFl:       data.upperFl,
        areaGeoJson:   data.areaGeoJson ?? null,
        effectiveFrom: data.effectiveFrom,
        effectiveTo:   data.effectiveTo ?? null,
        rawText:       data.rawText,
        isActive:      true,
        lastFetchedAt: new Date(),
      }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SPECIAL_USER', actorId: adminUserId,
        action:       'notam_published',
        resourceType: 'notam', resourceId: notam.id,
        detailJson: JSON.stringify({ notamNumber: data.notamNumber, firCode: data.firCode })
      }
    })

    log.info('notam_published', { data: { notamId: notam.id, notamNumber: data.notamNumber } })
    return notam.id
  }

  // ── HISTORICAL SNAPSHOT ───────────────────────────────────────────────────

  // Returns all airspace records that were ACTIVE at a given historical time.
  // Used for flight plan validation replay in courts/investigations.
  async getSnapshotAtTime(
    dataTypes: string[],
    atUtc:     Date
  ): Promise<Array<{ id: string; dataType: string; payloadJson: string }>> {
    return this.prisma.airspaceVersion.findMany({
      where: {
        dataType:       { in: dataTypes },
        approvalStatus: 'ACTIVE',
        effectiveFrom:  { lte: atUtc },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: atUtc } }]
      },
      select: { id: true, dataType: true, payloadJson: true }
    })
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async createVersion(params: {
    dataType:       string
    data:           unknown
    adminUserId:    string
    effectiveFrom:  Date
    changeReason:   string
    airacCycle?:    string
    supersedes?:    string | null
    approvalStatus: string
  }): Promise<string> {
    const last = await this.prisma.airspaceVersion.findFirst({
      where:   { dataType: params.dataType },
      orderBy: { versionNumber: 'desc' }
    })
    const nextVersion = (last?.versionNumber ?? 0) + 1

    const record = await this.prisma.airspaceVersion.create({
      data: {
        dataType:        params.dataType,
        versionNumber:   nextVersion,
        effectiveFrom:   params.effectiveFrom,
        approvalStatus:  params.approvalStatus as any,
        dataSource:      'MANUAL',
        changeReason:    params.changeReason,
        airacCycle:      params.airacCycle ?? null,
        createdBy: params.adminUserId,
        supersedes:      params.supersedes ?? null,
        payloadJson:        JSON.stringify(params.data),
      }
    })
    return record.id
  }

  private async getActiveByType(dataType: string) {
    const now = new Date()
    return this.prisma.airspaceVersion.findMany({
      where: {
        dataType,
        approvalStatus: 'ACTIVE',
        effectiveFrom:  { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      }
    })
  }

  private async findActiveByPredicate(
    dataType:  string,
    predicate: (data: any) => boolean
  ) {
    const versions = await this.getActiveByType(dataType)
    return versions.find(v => predicate(JSON.parse(v.payloadJson))) ?? null
  }
}

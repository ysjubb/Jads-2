// AircraftFPLService — manages AircraftFlightPlan records (OFPL-sourced + JADS-filed).
// Handles filing, OFPL sync, conflict advisory attachment, and AFTN message generation.
// JADS is a compliance intermediary: AFTN strings are returned, never transmitted.

import { PrismaClient } from '@prisma/client'
import { createHash }   from 'crypto'
import type { IOFPLAdapter, FPLSearchParams } from '../adapters/interfaces/IOFPLAdapter'
import type { INotamAdapter }  from '../adapters/interfaces/INotamAdapter'
import type { IMetarAdapter }  from '../adapters/interfaces/IMetarAdapter'
import { OFPLAdapterStub }    from '../adapters/stubs/OFPLAdapterStub'
import { NotamAdapterStub }   from '../adapters/stubs/NotamAdapterStub'
import { MetarAdapterStub }   from '../adapters/stubs/MetarAdapterStub'
import { AftnMessageBuilder } from './AftnMessageBuilder'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AircraftFPLService')

export interface ConflictAdvisory {
  type:          'FPL_VS_DRONE'
  severity:      'ADVISORY'
  fplId:         string
  droneRecordId: string
  description:   string
  raisedAt:      string
}

export class AircraftFPLService {
  private msgBuilder = new AftnMessageBuilder()

  constructor(
    private readonly prisma:        PrismaClient,
    private readonly ofplAdapter:   IOFPLAdapter   = new OFPLAdapterStub(),
    private readonly notamAdapter:  INotamAdapter  = new NotamAdapterStub(),
    private readonly metarAdapter:  IMetarAdapter  = new MetarAdapterStub(),
  ) {}

  /** File a new AircraftFlightPlan from JADS. Attaches NOTAM + METAR snapshots. */
  async fileFromJADS(data: {
    callsign: string; aircraftType: string; departure: string; destination: string;
    eobt: string; eet: number; route: string; cruisingLevel: string;
    flightRules?: string; altDest?: string; picName: string; remarks?: string;
  }, userId: string) {
    // Validate ICAO fields
    if (!data.callsign || !data.departure || !data.destination || !data.route) {
      throw new Error('Missing required ICAO fields: callsign, departure, destination, route')
    }

    // Fetch NOTAM + METAR snapshots
    const [notams, metar] = await Promise.all([
      this.notamAdapter.getActiveNotams(data.departure).catch(() => []),
      this.metarAdapter.getLatestMetar(data.departure).catch(() => null),
    ])

    // Compute SHA-256 hash
    const hashInput = `${data.callsign}|${data.departure}|${data.destination}|${data.eobt}|${data.route}`
    const hashChainEntry = createHash('sha256').update(hashInput).digest('hex')

    const record = await this.prisma.aircraftFlightPlan.create({
      data: {
        callsign:        data.callsign,
        aircraftType:    data.aircraftType,
        departure:       data.departure,
        destination:     data.destination,
        eobt:            new Date(data.eobt),
        eet:             data.eet,
        route:           data.route,
        cruisingLevel:   data.cruisingLevel,
        flightRules:     data.flightRules ?? 'IFR',
        altDest:         data.altDest ?? null,
        picName:         data.picName,
        remarks:         data.remarks ?? null,
        status:          'FILED',
        sourceType:      'JADS',
        notamBriefingJson: notams.length > 0 ? JSON.parse(JSON.stringify(notams)) : undefined,
        metarAtFiling:     metar ? JSON.parse(JSON.stringify(metar)) : undefined,
        hashChainEntry,
        filedByUserId:   userId,
        filedAt:         new Date(),
      },
    })

    await this.writeAuditLog(userId, 'aircraft_fpl_filed', record.id, true, {
      callsign: data.callsign, departure: data.departure, destination: data.destination,
    })

    log.info('fpl_filed', { data: { id: record.id, callsign: data.callsign } })
    return record
  }

  /** Sync flight plans from AAI OFPL portal. Upserts by externalFplId. */
  async syncFromOFPL(params: FPLSearchParams) {
    const fpls = await this.ofplAdapter.searchFlightPlans(params)
    const results: string[] = []

    for (const fpl of fpls) {
      const existing = await this.prisma.aircraftFlightPlan.findUnique({
        where: { externalFplId: fpl.externalFplId },
      })

      if (existing) {
        await this.prisma.aircraftFlightPlan.update({
          where: { externalFplId: fpl.externalFplId },
          data: { status: fpl.status as any },
        })
        results.push(`updated:${fpl.externalFplId}`)
      } else {
        const hashInput = `${fpl.callsign}|${fpl.departure}|${fpl.destination}|${fpl.eobt}|${fpl.route}`
        const hashChainEntry = createHash('sha256').update(hashInput).digest('hex')

        await this.prisma.aircraftFlightPlan.create({
          data: {
            externalFplId:  fpl.externalFplId,
            callsign:       fpl.callsign,
            aircraftType:   fpl.aircraftType,
            departure:      fpl.departure,
            destination:    fpl.destination,
            eobt:           new Date(fpl.eobt),
            eet:            fpl.eet,
            route:          fpl.route,
            cruisingLevel:  fpl.cruisingLevel,
            flightRules:    fpl.flightRules,
            altDest:        fpl.altDest,
            picName:        fpl.picName,
            remarks:        fpl.remarks,
            status:         fpl.status as any,
            sourceType:     'OFPL_SYNC',
            hashChainEntry,
            filedAt:        new Date(fpl.eobt),
          },
        })
        results.push(`created:${fpl.externalFplId}`)
      }
    }

    log.info('ofpl_sync_complete', { data: { count: fpls.length, results } })
    return { synced: fpls.length, results }
  }

  /** Get a single record with parsed conflict flags. */
  async getWithConflicts(fplId: string) {
    const record = await this.prisma.aircraftFlightPlan.findUnique({ where: { id: fplId } })
    if (!record) return null
    return {
      ...record,
      parsedConflicts: (record.conflictFlags as ConflictAdvisory[] | null) ?? [],
    }
  }

  /** Attach a conflict advisory and rehash. */
  async attachConflictAdvisory(fplId: string, advisory: ConflictAdvisory) {
    const record = await this.prisma.aircraftFlightPlan.findUnique({ where: { id: fplId } })
    if (!record) throw new Error(`AircraftFlightPlan not found: ${fplId}`)

    const existing = (record.conflictFlags as ConflictAdvisory[] | null) ?? []
    const updated = [...existing, advisory]

    const hashInput = `${record.hashChainEntry}|conflict:${advisory.droneRecordId}|${advisory.raisedAt}`
    const newHash = createHash('sha256').update(hashInput).digest('hex')

    await this.prisma.aircraftFlightPlan.update({
      where: { id: fplId },
      data: { conflictFlags: updated as any, hashChainEntry: newHash },
    })

    log.info('conflict_advisory_attached', { data: { fplId, droneRecordId: advisory.droneRecordId } })
  }

  /** Build an AFTN message string (JADS returns string only, never transmits). */
  async buildAftnMessage(fplId: string): Promise<string | null> {
    const record = await this.prisma.aircraftFlightPlan.findUnique({ where: { id: fplId } })
    if (!record) return null

    // Use existing AftnMessageBuilder with the record data
    // Format EOBT as DDHHmm and EET as HHmm for AFTN
    const eobtDate = record.eobt
    const ddHHmm = `${String(eobtDate.getUTCDate()).padStart(2, '0')}${String(eobtDate.getUTCHours()).padStart(2, '0')}${String(eobtDate.getUTCMinutes()).padStart(2, '0')}`
    const eetHH = String(Math.floor(record.eet / 60)).padStart(2, '0')
    const eetMM = String(record.eet % 60).padStart(2, '0')

    const aftn = this.msgBuilder.build({
      callsign:       record.callsign,
      flightRules:    record.flightRules,
      flightType:     'S',
      aircraftType:   record.aircraftType,
      wakeTurbulence: 'M',
      equipment:      'S',
      surveillance:   'N',
      departureIcao:  record.departure,
      eobt:           ddHHmm,
      speed:          'N0450',
      level:          record.cruisingLevel.replace('FL', 'F'),
      route:          record.route,
      destination:    record.destination,
      eet:            `${eetHH}${eetMM}`,
      alternate1:     record.altDest ?? undefined,
      item18Parsed:   { DOF: eobtDate.toISOString().slice(0, 10).replace(/-/g, '') } as any,
    })

    return aftn
  }

  /** Activate a flight plan. */
  async activate(fplId: string) {
    return this.prisma.aircraftFlightPlan.update({
      where: { id: fplId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    })
  }

  /** Close a flight plan. */
  async close(fplId: string) {
    return this.prisma.aircraftFlightPlan.update({
      where: { id: fplId },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
  }

  /** Cancel a flight plan. */
  async cancel(fplId: string) {
    return this.prisma.aircraftFlightPlan.update({
      where: { id: fplId },
      data: { status: 'CANCELLED' },
    })
  }

  /** List with optional filters. */
  async list(filters?: { departure?: string; destination?: string; status?: string; userId?: string }) {
    const where: any = {}
    if (filters?.departure) where.departure = filters.departure
    if (filters?.destination) where.destination = filters.destination
    if (filters?.status) where.status = filters.status
    if (filters?.userId) where.filedByUserId = filters.userId
    return this.prisma.aircraftFlightPlan.findMany({
      where,
      orderBy: { eobt: 'desc' },
      take: 100,
    })
  }

  private async writeAuditLog(actorId: string, action: string, resourceId: string | null, success: boolean, meta: Record<string, any>) {
    try {
      const sequenceResult = await this.prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('audit_log_sequence')`
      const seq = sequenceResult[0]?.nextval ?? BigInt(0)
      const rowHash = createHash('sha256')
        .update(`${seq}|${actorId}|${action}|${resourceId}|${JSON.stringify(meta)}`)
        .digest('hex')

      await this.prisma.auditLog.create({
        data: {
          sequenceNumber: seq,
          actorId,
          actorType: 'USER',
          action,
          resourceType: 'AircraftFlightPlan',
          resourceId,
          detailJson: JSON.stringify({ success, ...meta }),
          rowHash,
        },
      })
    } catch (e) {
      log.error('audit_log_write_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    }
  }
}

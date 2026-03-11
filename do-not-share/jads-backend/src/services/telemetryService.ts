// T01 — Live telemetry ingestion service

import { PrismaClient } from '@prisma/client'
import { TelemetryPoint, TelemetryBatch, GeofenceStatus } from '../types/telemetry'
import { broadcastTelemetry, broadcastViolation, broadcastBatteryCritical } from '../ws/missionBroadcast'
import { checkGeofence, recordViolation } from './geofenceEngine'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('TelemetryService')

export class TelemetryService {
  constructor(private prisma: PrismaClient) {}

  async ingestPoint(point: TelemetryPoint): Promise<void> {
    // Save to DB
    await this.prisma.telemetryPoint.create({
      data: {
        missionId:      point.missionId,
        uin:            point.uin,
        lat:            point.lat,
        lon:            point.lon,
        altAGL:         point.altAGL,
        altMSL:         point.altMSL,
        speedKmh:       point.speedKmh,
        headingDeg:     point.headingDeg,
        batteryPct:     point.batteryPct,
        satelliteCount: point.satelliteCount,
        source:         point.source,
        ts:             BigInt(point.ts),
      },
    })

    // Broadcast to WebSocket subscribers
    broadcastTelemetry(point)

    // Battery critical alert
    if (point.batteryPct < 20) {
      broadcastBatteryCritical(point)
    }

    // Geofence check
    const geoStatus = await checkGeofence(this.prisma, point)
    if (geoStatus.violationType) {
      await recordViolation(this.prisma, point, geoStatus)
      broadcastViolation(point, geoStatus)
      log.warn('geofence_violation', {
        data: {
          missionId: point.missionId,
          type: geoStatus.violationType,
          distanceToEdge: geoStatus.distanceToEdge,
        },
      })
    }
  }

  async ingestBatch(batch: TelemetryBatch): Promise<void> {
    for (const point of batch.points) {
      await this.ingestPoint(point)
    }
  }

  async getMissionTrack(
    missionId: string,
    since?: number,
    limit: number = 500,
  ): Promise<TelemetryPoint[]> {
    const where = since
      ? { missionId, ts: { gte: BigInt(since) } }
      : { missionId }

    const rows = await this.prisma.telemetryPoint.findMany({
      where: where as any,
      orderBy: { ts: 'asc' },
      take: Math.min(limit, 5000),
    })

    return rows.map((r) => ({
      missionId:      r.missionId,
      uin:            r.uin,
      lat:            r.lat,
      lon:            r.lon,
      altAGL:         r.altAGL,
      altMSL:         r.altMSL,
      speedKmh:       r.speedKmh,
      headingDeg:     r.headingDeg,
      batteryPct:     r.batteryPct,
      satelliteCount: r.satelliteCount,
      source:         r.source as TelemetryPoint['source'],
      ts:             Number(r.ts),
    }))
  }

  async getLatestPoint(missionId: string): Promise<TelemetryPoint | null> {
    const row = await this.prisma.telemetryPoint.findFirst({
      where: { missionId },
      orderBy: { ts: 'desc' },
    })
    if (!row) return null

    return {
      missionId:      row.missionId,
      uin:            row.uin,
      lat:            row.lat,
      lon:            row.lon,
      altAGL:         row.altAGL,
      altMSL:         row.altMSL,
      speedKmh:       row.speedKmh,
      headingDeg:     row.headingDeg,
      batteryPct:     row.batteryPct,
      satelliteCount: row.satelliteCount,
      source:         row.source as TelemetryPoint['source'],
      ts:             Number(row.ts),
    }
  }
}

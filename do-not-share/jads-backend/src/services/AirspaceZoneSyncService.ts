/**
 * DS-09/13 — Airspace Zone Sync Service
 *
 * Manages synchronization of airspace zones from Digital Sky.
 * DS zones: GREEN, AMBER, RED (each with GeoJSON, altitude, optional time window).
 *
 * DS contract (§9, §3.12):
 *   GET /api/airspaceCategory/getAll — List all zones
 *   GET /api/airspaceCategory/{id}   — Single zone
 *   POST /api/airspaceCategory       — Create (admin)
 *   PUT /api/airspaceCategory/{id}   — Update (admin)
 *
 * Zone properties:
 *   - GeoJSON FeatureCollection (Polygons only)
 *   - minAltitude (meters AGL) — zone applies above this
 *   - tempStartTime/tempEndTime (optional temporal restriction)
 *
 * Geometry operations (DS uses JTS):
 *   - Intersection: does fly area touch any zone?
 *   - Containment: is fly area entirely within a green zone?
 *   - Area computation: fly area ≤ π sq km
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../logger'
import type { DsAirspaceZone } from '../adapters/interfaces/IDigitalSkyAdapter'
import type { DsZoneColor } from './npnt/NpntTypes'

const log = createServiceLogger('AirspaceZoneSyncService')

// ── Types ──────────────────────────────────────────────────────────────

export interface AirspaceZone {
  id:              string
  name:            string
  type:            DsZoneColor
  geoJson:         object    // Parsed GeoJSON
  minAltitudeM:    number
  tempStartTime?:  Date
  tempEndTime?:    Date
  lastSyncedAt:    Date
  source:          'DIGITAL_SKY' | 'JADS_LOCAL' | 'MANUAL'
}

export interface ZoneCheckResult {
  withinGreen:       boolean
  intersectsAmber:   boolean
  intersectsRed:     boolean
  affectedZones:     Array<{ id: string; name: string; type: DsZoneColor }>
  flyAreaSqKm:       number
  areaExceedsLimit:  boolean
}

// ── Service ────────────────────────────────────────────────────────────

export class AirspaceZoneSyncService {
  /** In-memory zone store */
  private zones: Map<string, AirspaceZone> = new Map()
  private lastSyncAt: Date | null = null

  constructor() {
    // Initialize with default GREEN zone covering India
    this.initDefaultZones()
    log.info('airspace_zone_sync_service_initialized', { data: { zoneCount: this.zones.size } })
  }

  // ── Sync from Digital Sky ────────────────────────────────────────────

  /**
   * Sync zones from Digital Sky adapter response.
   */
  syncFromDigitalSky(dsZones: DsAirspaceZone[]): {
    added: number; updated: number; total: number
  } {
    let added = 0
    let updated = 0

    for (const dsZone of dsZones) {
      const id = `DS-${dsZone.id}`
      let geoJson: object
      try {
        geoJson = typeof dsZone.geoJson === 'string' ? JSON.parse(dsZone.geoJson) : dsZone.geoJson
      } catch {
        log.warn('invalid_geojson', { data: { zoneId: dsZone.id, name: dsZone.name } })
        continue
      }

      const zone: AirspaceZone = {
        id,
        name: dsZone.name,
        type: dsZone.type,
        geoJson,
        minAltitudeM: dsZone.minAltitude,
        tempStartTime: dsZone.tempStartTime ? new Date(dsZone.tempStartTime) : undefined,
        tempEndTime: dsZone.tempEndTime ? new Date(dsZone.tempEndTime) : undefined,
        lastSyncedAt: new Date(),
        source: 'DIGITAL_SKY',
      }

      if (this.zones.has(id)) {
        updated++
      } else {
        added++
      }
      this.zones.set(id, zone)
    }

    this.lastSyncAt = new Date()
    log.info('zone_sync_complete', { data: { added, updated, total: this.zones.size } })
    return { added, updated, total: this.zones.size }
  }

  // ── Zone Queries ─────────────────────────────────────────────────────

  /**
   * Check a fly area polygon against all zones.
   * Returns DS-style zone classification.
   */
  checkFlyArea(
    flyArea: Array<{ latitude: number; longitude: number }>,
    altitudeM: number,
    currentTime?: Date
  ): ZoneCheckResult {
    const now = currentTime ?? new Date()
    const activeZones = this.getActiveZones(altitudeM, now)
    const affected: Array<{ id: string; name: string; type: DsZoneColor }> = []

    let withinGreen = false
    let intersectsAmber = false
    let intersectsRed = false

    for (const zone of activeZones) {
      const intersects = this.polygonIntersectsZone(flyArea, zone)
      if (intersects) {
        affected.push({ id: zone.id, name: zone.name, type: zone.type })
        if (zone.type === 'GREEN') withinGreen = true
        if (zone.type === 'AMBER') intersectsAmber = true
        if (zone.type === 'RED') intersectsRed = true
      }
    }

    // If no zone intersection found, treat as outside all zones
    if (affected.length === 0) {
      // Default: assume green if no zones configured
      withinGreen = this.zones.size === 0
    }

    // Compute fly area in sq km (approximate)
    const flyAreaSqKm = this.computePolygonAreaSqKm(flyArea)
    const maxAreaSqKm = Math.PI  // DS threshold

    return {
      withinGreen,
      intersectsAmber,
      intersectsRed,
      affectedZones: affected,
      flyAreaSqKm,
      areaExceedsLimit: flyAreaSqKm > maxAreaSqKm,
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  getZone(id: string): AirspaceZone | null {
    return this.zones.get(id) ?? null
  }

  getAllZones(): AirspaceZone[] {
    return Array.from(this.zones.values())
  }

  getZonesByType(type: DsZoneColor): AirspaceZone[] {
    return Array.from(this.zones.values()).filter(z => z.type === type)
  }

  createZone(zone: Omit<AirspaceZone, 'id' | 'lastSyncedAt'>): AirspaceZone {
    const id = `LOCAL-${crypto.randomUUID().substring(0, 8)}`
    const full: AirspaceZone = {
      ...zone,
      id,
      lastSyncedAt: new Date(),
    }
    this.zones.set(id, full)
    log.info('zone_created', { data: { id, name: zone.name, type: zone.type } })
    return full
  }

  updateZone(id: string, updates: Partial<AirspaceZone>): AirspaceZone | null {
    const zone = this.zones.get(id)
    if (!zone) return null
    const updated = { ...zone, ...updates, id, lastSyncedAt: new Date() }
    this.zones.set(id, updated)
    return updated
  }

  getLastSyncAt(): Date | null {
    return this.lastSyncAt
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getActiveZones(altitudeM: number, now: Date): AirspaceZone[] {
    return Array.from(this.zones.values()).filter(zone => {
      // Altitude filter: zone applies above minAltitude
      if (altitudeM < zone.minAltitudeM) return false
      // Time filter: if temporal restriction set, must be within
      if (zone.tempStartTime && now < zone.tempStartTime) return false
      if (zone.tempEndTime && now > zone.tempEndTime) return false
      return true
    })
  }

  /**
   * Simple check: does any vertex of flyArea fall within the zone's GeoJSON polygon?
   */
  private polygonIntersectsZone(
    flyArea: Array<{ latitude: number; longitude: number }>,
    zone: AirspaceZone
  ): boolean {
    // Extract polygon coordinates from GeoJSON
    const geoJson = zone.geoJson as any
    if (!geoJson) return false

    let polygons: number[][][] = []
    if (geoJson.type === 'Polygon') {
      polygons = [geoJson.coordinates[0]]
    } else if (geoJson.type === 'FeatureCollection') {
      for (const feature of (geoJson.features ?? [])) {
        if (feature.geometry?.type === 'Polygon') {
          polygons.push(feature.geometry.coordinates[0])
        }
      }
    }

    for (const poly of polygons) {
      const polyPoints = poly.map(([lon, lat]: number[]) => ({ lat, lng: lon }))
      for (const vertex of flyArea) {
        if (this.pointInPolygonSimple(vertex.latitude, vertex.longitude, polyPoints)) {
          return true
        }
      }
    }
    return false
  }

  private pointInPolygonSimple(
    lat: number, lng: number,
    polygon: Array<{ lat: number; lng: number }>
  ): boolean {
    let inside = false
    const n = polygon.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (((polygon[i].lat > lat) !== (polygon[j].lat > lat)) &&
          (lng < (polygon[j].lng - polygon[i].lng) * (lat - polygon[i].lat) /
            (polygon[j].lat - polygon[i].lat) + polygon[i].lng)) {
        inside = !inside
      }
    }
    return inside
  }

  /**
   * Approximate polygon area using shoelace formula (in sq km).
   * Uses the equirectangular approximation for small areas.
   */
  private computePolygonAreaSqKm(
    points: Array<{ latitude: number; longitude: number }>
  ): number {
    if (points.length < 3) return 0
    const DEG_TO_RAD = Math.PI / 180
    const R = 6371 // Earth radius km

    // Average latitude for longitude scaling
    const avgLat = points.reduce((s, p) => s + p.latitude, 0) / points.length
    const cosLat = Math.cos(avgLat * DEG_TO_RAD)

    // Convert to km-space
    const xKm = points.map(p => p.longitude * DEG_TO_RAD * R * cosLat)
    const yKm = points.map(p => p.latitude * DEG_TO_RAD * R)

    // Shoelace formula
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += xKm[i] * yKm[j] - xKm[j] * yKm[i]
    }
    return Math.abs(area) / 2
  }

  private initDefaultZones(): void {
    // No default zones — zones come from DS sync or manual creation
    // In demo mode, the FlyDronePermissionService handles zone-less cases
  }
}

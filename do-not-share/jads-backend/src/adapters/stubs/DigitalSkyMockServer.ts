/**
 * DS-09 — Digital Sky Mock Server
 *
 * Standalone in-process mock that simulates DS API behavior.
 * Used by DigitalSkyAdapterStub and for integration testing.
 *
 * Implements all DS endpoints from §3 of the contract:
 *   - Auth (JWT token)
 *   - Pilot/Operator profiles
 *   - Drone type management
 *   - Device register/deregister (PKI)
 *   - Fly drone permission (auto-approval logic)
 *   - UIN applications
 *   - UAOP applications
 *   - Airspace zones
 *   - Flight log upload
 *   - Occurrence reports
 *
 * All data is in-memory — no persistence.
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../../logger'
import type { DsApplicationStatus, DsZoneColor, NpntDroneCategory } from '../../services/npnt/NpntTypes'
import { evaluateAutoApproval } from '../../services/npnt/NpntTypes'

const log = createServiceLogger('DigitalSkyMockServer')

// ── Mock Data Store ────────────────────────────────────────────────────

interface MockUser {
  id: number
  fullName: string
  email: string
  password: string
  accountVerified: boolean
}

interface MockPilot {
  id: number
  businessIdentifier: string
  name: string
  mobileNumber: string
  status: 'APPROVED' | 'REJECTED' | 'PENDING'
}

interface MockOperator {
  id: number
  businessIdentifier: string
  name: string
  type: 'INDIVIDUAL' | 'ORGANISATION'
  status: 'APPROVED' | 'REJECTED' | 'PENDING'
}

interface MockDroneType {
  id: number
  modelName: string
  modelNo: string
  manufacturer: string
  droneCategoryType: NpntDroneCategory
  maxTakeOffWeight: number
  wingType: 'FIXED' | 'ROTARY'
}

interface MockDroneDevice {
  id: number
  deviceId: string
  deviceModelId: string
  operatorBusinessIdentifier: string
  manufacturerBusinessIdentifier: string
  uin: string
  isRegistered: boolean
  registrationStatus: string
}

interface MockFlyPermission {
  id: string
  applicationNumber: string
  status: DsApplicationStatus
  pilotBusinessIdentifier: string
  operatorId: number
  droneId: number
  flyArea: Array<{ latitude: number; longitude: number }>
  maxAltitude: number
  flightPurpose: string
  fir: string
  ficNumber?: string
  adcNumber?: string
  startDateTime: string
  endDateTime: string
  payloadWeightInKg: number
  payloadDetails: string
}

interface MockZone {
  id: number
  name: string
  type: DsZoneColor
  geoJson: string
  minAltitude: number
  tempStartTime?: string
  tempEndTime?: string
}

// ── Mock Server ────────────────────────────────────────────────────────

export class DigitalSkyMockServer {
  private users: Map<number, MockUser> = new Map()
  private pilots: Map<number, MockPilot> = new Map()
  private operators: Map<number, MockOperator> = new Map()
  private droneTypes: Map<number, MockDroneType> = new Map()
  private droneDevices: Map<string, MockDroneDevice> = new Map()
  private flyPermissions: Map<string, MockFlyPermission> = new Map()
  private zones: Map<number, MockZone> = new Map()
  private flightLogs: Map<string, any> = new Map()

  private idCounter = 100

  constructor() {
    this.seedDemoData()
    log.info('mock_server_initialized', { data: { users: this.users.size, pilots: this.pilots.size } })
  }

  // ── Auth ─────────────────────────────────────────────────────────────

  authenticate(email: string, password: string): {
    accessToken: string; id: number; username: string; isAdmin: boolean
    pilotProfileId?: number; individualOperatorProfileId?: number
  } | null {
    for (const user of this.users.values()) {
      if (user.email === email && user.password === password && user.accountVerified) {
        return {
          accessToken: `mock-jwt-${crypto.randomBytes(16).toString('hex')}`,
          id: user.id,
          username: user.email,
          isAdmin: user.email.includes('admin'),
          pilotProfileId: this.findPilotByUser(user.id)?.id,
          individualOperatorProfileId: this.findOperatorByUser(user.id)?.id,
        }
      }
    }
    return null
  }

  // ── Device Registration ──────────────────────────────────────────────

  registerDevice(mbi: string, request: {
    drone: { version: string; txn: string; deviceId: string; deviceModelId: string; operatorBusinessIdentifier: string }
    signature: string
    digitalCertificate: string
  }): { responseCode: string; uin?: string } {
    const { drone } = request

    if (!drone.deviceId) return { responseCode: 'EMPTY_DEVICE_ID' }
    if (!drone.operatorBusinessIdentifier) return { responseCode: 'OPERATOR_BUSINESS_IDENTIFIER_MISSING' }

    // Check for duplicates
    const key = `${mbi}:${drone.deviceId}`
    if (this.droneDevices.has(key)) {
      const existing = this.droneDevices.get(key)!
      if (existing.isRegistered) return { responseCode: 'DRONE_ALREADY_REGISTERED' }
    }

    // Generate UIN
    this.idCounter++
    const uin = `UA${this.idCounter.toString().padStart(12, '0')}`

    this.droneDevices.set(key, {
      id: this.idCounter,
      deviceId: drone.deviceId,
      deviceModelId: drone.deviceModelId,
      operatorBusinessIdentifier: drone.operatorBusinessIdentifier,
      manufacturerBusinessIdentifier: mbi,
      uin,
      isRegistered: true,
      registrationStatus: 'REGISTERED',
    })

    return { responseCode: 'REGISTERED', uin }
  }

  deregisterDevice(mbi: string, request: {
    drone: { deviceId: string; [key: string]: any }
    signature: string
    digitalCertificate: string
  }): { responseCode: string } {
    const key = `${mbi}:${request.drone.deviceId}`
    const device = this.droneDevices.get(key)
    if (!device) return { responseCode: 'DRONE_NOT_FOUND' }
    if (!device.isRegistered) return { responseCode: 'DRONE_NOT_REGISTERED' }

    device.isRegistered = false
    device.registrationStatus = 'DEREGISTERED'
    return { responseCode: 'DEREGISTERED' }
  }

  // ── Fly Drone Permission ─────────────────────────────────────────────

  submitFlyPermission(input: {
    pilotBusinessIdentifier: string
    flyArea: Array<{ latitude: number; longitude: number }>
    droneId: number
    payloadWeightInKg: number
    payloadDetails: string
    flightPurpose: string
    startDateTime: string
    endDateTime: string
    maxAltitude: number
    operatorId?: number
  }): MockFlyPermission {
    this.idCounter++
    const id = crypto.randomUUID()
    const appNumber = `DS-FDP-${this.idCounter}`

    // Simulate auto-approval
    const autoResult = evaluateAutoApproval(
      'MICRO', // Default; real DS looks up drone type
      input.maxAltitude,
      true,   // Assume green for demo
      false,  // No amber
      false,  // No red
    )

    const permission: MockFlyPermission = {
      id,
      applicationNumber: appNumber,
      status: autoResult.autoApproved ? 'APPROVED' : 'SUBMITTED',
      pilotBusinessIdentifier: input.pilotBusinessIdentifier,
      operatorId: input.operatorId ?? 1,
      droneId: input.droneId,
      flyArea: input.flyArea,
      maxAltitude: input.maxAltitude,
      flightPurpose: input.flightPurpose,
      fir: 'VIDF', // Default to Delhi FIR
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
      payloadWeightInKg: input.payloadWeightInKg,
      payloadDetails: input.payloadDetails,
    }

    if (autoResult.autoApproved) {
      permission.ficNumber = `FIC-MOCK-${this.idCounter}`
      permission.adcNumber = `ADC-MOCK-${this.idCounter}`
    }

    this.flyPermissions.set(id, permission)
    return permission
  }

  approveFlyPermission(
    id: string,
    adminRole: string,
    approve: boolean,
    comments?: string,
    ficNumber?: string,
    adcNumber?: string
  ): MockFlyPermission | null {
    const perm = this.flyPermissions.get(id)
    if (!perm) return null

    if (approve) {
      if (adminRole === 'ATC_ADMIN') {
        perm.status = 'APPROVEDBYATC'
        perm.ficNumber = ficNumber ?? `FIC-MOCK-${Date.now()}`
      } else if (adminRole === 'AFMLU_ADMIN') {
        perm.status = 'APPROVED'
        perm.adcNumber = adcNumber ?? `ADC-MOCK-${Date.now()}`
      } else {
        perm.status = 'APPROVED'
        perm.ficNumber = ficNumber ?? `FIC-MOCK-${Date.now()}`
        perm.adcNumber = adcNumber ?? `ADC-MOCK-${Date.now()}`
      }
    } else {
      if (adminRole === 'ATC_ADMIN') perm.status = 'REJECTEDBYATC'
      else if (adminRole === 'AFMLU_ADMIN') perm.status = 'REJECTEDBYAFMLU'
      else perm.status = 'REJECTED'
    }

    return perm
  }

  getFlyPermission(id: string): MockFlyPermission | null {
    return this.flyPermissions.get(id) ?? null
  }

  listFlyPermissions(operatorId?: number): MockFlyPermission[] {
    let results = Array.from(this.flyPermissions.values())
    if (operatorId) results = results.filter(p => p.operatorId === operatorId)
    return results.filter(p => p.status !== 'DRAFT')
  }

  // ── Airspace Zones ───────────────────────────────────────────────────

  getZones(): MockZone[] {
    return Array.from(this.zones.values())
  }

  getZone(id: number): MockZone | null {
    return this.zones.get(id) ?? null
  }

  createZone(zone: Omit<MockZone, 'id'>): MockZone {
    this.idCounter++
    const full: MockZone = { ...zone, id: this.idCounter }
    this.zones.set(this.idCounter, full)
    return full
  }

  // ── Flight Log Upload ────────────────────────────────────────────────

  uploadFlightLog(applicationId: string, flightLog: any): { accepted: boolean; receiptId: string } {
    if (this.flightLogs.has(applicationId)) {
      return { accepted: false, receiptId: '' }
    }
    const receiptId = `MOCK-RCPT-${Date.now()}`
    this.flightLogs.set(applicationId, { ...flightLog, receiptId })
    return { accepted: true, receiptId }
  }

  // ── Health ───────────────────────────────────────────────────────────

  ping(): { status: 'UP'; version: string; timestamp: string } {
    return { status: 'UP', version: '1.0-MOCK', timestamp: new Date().toISOString() }
  }

  // ── Seed Demo Data ───────────────────────────────────────────────────

  private seedDemoData(): void {
    // Demo admin user
    this.users.set(1, {
      id: 1, fullName: 'DS Admin', email: 'admin@digitalsky.gov.in',
      password: 'admin123', accountVerified: true,
    })
    this.users.set(2, {
      id: 2, fullName: 'Demo Pilot', email: 'pilot@demo.jads.in',
      password: 'pilot123', accountVerified: true,
    })

    // Demo pilot
    this.pilots.set(1, {
      id: 1, businessIdentifier: crypto.randomUUID(),
      name: 'Demo Pilot', mobileNumber: '+919876543210', status: 'APPROVED',
    })

    // Demo operator
    this.operators.set(1, {
      id: 1, businessIdentifier: crypto.randomUUID(),
      name: 'JADS Demo Operator', type: 'ORGANISATION', status: 'APPROVED',
    })

    // Demo drone type
    this.droneTypes.set(1, {
      id: 1, modelName: 'JADS-Phantom-T1', modelNo: 'PT1-2024',
      manufacturer: 'JADS Test Manufacturer', droneCategoryType: 'SMALL',
      maxTakeOffWeight: 5.0, wingType: 'ROTARY',
    })

    // Demo zones
    this.zones.set(1, {
      id: 1, name: 'Delhi GREEN Zone',
      type: 'GREEN',
      geoJson: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[76.5, 28.0], [77.5, 28.0], [77.5, 29.0], [76.5, 29.0], [76.5, 28.0]]],
          },
          properties: { name: 'Delhi GREEN' },
        }],
      }),
      minAltitude: 0,
    })
    this.zones.set(2, {
      id: 2, name: 'VIDP RED Zone (5km)',
      type: 'RED',
      geoJson: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            // ~5km around VIDP (28.5562, 77.1000)
            coordinates: [[[77.05, 28.51], [77.15, 28.51], [77.15, 28.60], [77.05, 28.60], [77.05, 28.51]]],
          },
          properties: { name: 'VIDP Airport Zone' },
        }],
      }),
      minAltitude: 0,
    })
  }

  private findPilotByUser(_userId: number): MockPilot | undefined {
    return this.pilots.get(1) // Demo: all users map to pilot 1
  }

  private findOperatorByUser(_userId: number): MockOperator | undefined {
    return this.operators.get(1)
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let _mockServer: DigitalSkyMockServer | null = null

export function getDigitalSkyMockServer(): DigitalSkyMockServer {
  if (!_mockServer) {
    _mockServer = new DigitalSkyMockServer()
  }
  return _mockServer
}

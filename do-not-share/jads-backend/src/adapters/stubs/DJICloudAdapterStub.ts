// DJI Cloud API stub — returns simulated device and telemetry data for testing.
// Enterprise models only: Matrice 30/30T, Matrice 350 RTK, Mavic 3E/3T/3M.
// Consumer drones (Mini, Air, Avata) are NOT available via Cloud API.

import type {
  IDJICloudAdapter,
  DJIDevice,
  DJITelemetryPoint,
  DJIFlightRecord,
  DJIFlightArea,
  DJIFlightAreaResult,
} from '../interfaces/IDJICloudAdapter'

const STUB_WORKSPACE = 'WS-JADS-DEMO-001'

const STUB_DEVICES: DJIDevice[] = [
  {
    deviceSn: '1ZNBJ9D00B00FK', deviceName: 'JADS-M30T-01',
    deviceModel: 'Matrice 30T', firmwareVersion: 'v08.01.01.06',
    workspaceSn: STUB_WORKSPACE, onlineStatus: 'ONLINE', boundStatus: 'BOUND',
    lastSeenUtc: new Date().toISOString(), controllerSn: 'RC-PLUS-001',
  },
  {
    deviceSn: '1ZNBJ9D00B00GL', deviceName: 'JADS-M350-01',
    deviceModel: 'Matrice 350 RTK', firmwareVersion: 'v09.01.02.01',
    workspaceSn: STUB_WORKSPACE, onlineStatus: 'ONLINE', boundStatus: 'BOUND',
    lastSeenUtc: new Date().toISOString(), controllerSn: 'RC-PLUS-002',
  },
  {
    deviceSn: '1ZNBJ9D00C00EM', deviceName: 'JADS-M3E-01',
    deviceModel: 'Mavic 3 Enterprise', firmwareVersion: 'v08.00.02.09',
    workspaceSn: STUB_WORKSPACE, onlineStatus: 'OFFLINE', boundStatus: 'BOUND',
    lastSeenUtc: new Date(Date.now() - 3600_000).toISOString(), controllerSn: 'RC-PRO-ENT-001',
  },
  {
    deviceSn: '1ZNBJ9D00C00TH', deviceName: 'JADS-M3T-01',
    deviceModel: 'Mavic 3 Thermal', firmwareVersion: 'v08.00.02.09',
    workspaceSn: STUB_WORKSPACE, onlineStatus: 'OFFLINE', boundStatus: 'BOUND',
    lastSeenUtc: new Date(Date.now() - 7200_000).toISOString(), controllerSn: null,
  },
]

function generateTelemetryTrack(
  deviceSn: string,
  baseLat: number,
  baseLon: number,
  points: number,
  baseTimeMs: number,
): DJITelemetryPoint[] {
  const track: DJITelemetryPoint[] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const r = 0.002 // ~200m radius
    track.push({
      deviceSn,
      timestampUtcMs: baseTimeMs + i * 1000,
      latitudeDeg:    baseLat + Math.sin(angle) * r,
      longitudeDeg:   baseLon + Math.cos(angle) * r,
      altitudeM:      30 + Math.sin(angle * 2) * 10,
      altitudeMslM:   250 + 30 + Math.sin(angle * 2) * 10,
      speedMs:        5 + Math.random() * 3,
      headingDeg:     (angle * 180 / Math.PI + 90) % 360,
      batteryPercent: Math.max(20, 95 - Math.floor(i * 0.3)),
      satelliteCount: 14 + Math.floor(Math.random() * 6),
      flightMode:     'GPS',
      isFlying:       true,
    })
  }
  return track
}

export class DJICloudAdapterStub implements IDJICloudAdapter {
  private connected = false

  async connect() {
    this.connected = true
    return { connected: true, brokerId: 'stub-emqx-broker-001' }
  }

  async disconnect() {
    this.connected = false
  }

  async getDevices(_workspaceSn: string): Promise<DJIDevice[]> {
    return STUB_DEVICES
  }

  async getDeviceTelemetry(deviceSn: string, sinceUtcMs: number): Promise<DJITelemetryPoint[]> {
    // Return simulated circular flight over Delhi
    const baseTime = Math.max(sinceUtcMs, Date.now() - 600_000)
    return generateTelemetryTrack(deviceSn, 28.6139, 77.2090, 120, baseTime)
  }

  async getFlightRecords(deviceSn: string, _sinceUtc: string): Promise<DJIFlightRecord[]> {
    const now = Date.now()
    const flight1Start = now - 3600_000 * 2
    const flight1End   = now - 3600_000
    const track1 = generateTelemetryTrack(deviceSn, 28.6139, 77.2090, 180, flight1Start)

    return [
      {
        flightId:        `FLT-${deviceSn}-${flight1Start}`,
        deviceSn,
        startTimeUtc:    new Date(flight1Start).toISOString(),
        endTimeUtc:      new Date(flight1End).toISOString(),
        durationSec:     180,
        maxAltitudeM:    45,
        maxSpeedMs:      12,
        distanceM:       2400,
        takeoff:         { lat: track1[0].latitudeDeg, lon: track1[0].longitudeDeg },
        landing:         { lat: track1[track1.length - 1].latitudeDeg, lon: track1[track1.length - 1].longitudeDeg },
        telemetryPoints: track1,
      },
    ]
  }

  async getLatestFirmwareVersion(deviceModel: string): Promise<string | null> {
    const versions: Record<string, string> = {
      'Matrice 30T':         'v08.01.01.06',
      'Matrice 30':          'v08.01.01.06',
      'Matrice 350 RTK':     'v09.01.02.01',
      'Mavic 3 Enterprise':  'v08.00.02.09',
      'Mavic 3 Thermal':     'v08.00.02.09',
      'Mavic 3 Multispectral': 'v08.00.02.09',
    }
    return versions[deviceModel] ?? null
  }

  async pushFlightAreas(areas: DJIFlightArea[]): Promise<DJIFlightAreaResult[]> {
    return areas.map(a => ({
      areaId:   a.areaId,
      synced:   true,
      errorMsg: null,
    }))
  }

  async ping() {
    return { connected: this.connected, latencyMs: 15 + Math.floor(Math.random() * 30) }
  }
}

import { userApi } from '../api/client'
import type { PAResponse, PAStatus, FlightLogFile, LogUploadResult, PermissionArtefact } from '../types/npnt'

export async function submitPermissionRequest(payload: {
  uin: string
  pilotId: string
  missionArea: GeoJSON.Polygon
  scheduledDate: string
  scheduledTime: string
  durationMinutes: number
  purpose: string
  maxAltitudeAGL: number
  payloadWeight: number | null
  bvlosEnabled: boolean
}): Promise<PAResponse> {
  try {
    const { data } = await userApi().post('/dgca/npnt/request', payload)
    return data
  } catch {
    // Mock response for development
    return {
      requestId: `PA-${Date.now()}`,
      status: 'PENDING',
    }
  }
}

export async function pollPermissionStatus(requestId: string): Promise<PAStatus> {
  try {
    const { data } = await userApi().get(`/dgca/npnt/${requestId}/status`)
    return data
  } catch {
    // Mock: randomly resolve after a few polls
    const rand = Math.random()
    return {
      requestId,
      status: rand > 0.7 ? 'APPROVED' : rand > 0.4 ? 'REJECTED' : 'PENDING',
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function uploadFlightLog(log: FlightLogFile): Promise<LogUploadResult> {
  try {
    const { data } = await userApi().post('/flightlogs/upload', log)
    return data
  } catch {
    return {
      success: true,
      logId: `LOG-${Date.now()}`,
      entryCount: log.flightLog.logEntries.length,
      breachCount: log.flightLog.logEntries.filter(e =>
        e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH'
      ).length,
    }
  }
}

export function parsePermissionArtefact(xml: string): Partial<PermissionArtefact> {
  // Simplified XML parsing — in production use DOMParser
  const getId = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))
    return m ? m[1] : ''
  }
  return {
    id: getId('artefactId') || `PA-${Date.now()}`,
    uin: getId('uin'),
    pilotId: getId('pilotId'),
    validFrom: getId('validFrom'),
    validTo: getId('validTo'),
    status: 'APPROVED',
  }
}

export function generateManualRequestXML(formData: {
  uin: string
  pilotId: string
  missionArea: GeoJSON.Polygon
  scheduledDate: string
  scheduledTime: string
  durationMinutes: number
  purpose: string
  maxAltitudeAGL: number
}): string {
  const coords = formData.missionArea.coordinates[0]
    .map(c => `        <coordinate lat="${c[1]}" lon="${c[0]}" />`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<DigitalSkyPermissionRequest xmlns="urn:dgca:npnt:permission:1.0">
  <droneUIN>${formData.uin}</droneUIN>
  <pilotId>${formData.pilotId}</pilotId>
  <missionDetails>
    <purpose>${formData.purpose}</purpose>
    <scheduledDate>${formData.scheduledDate}</scheduledDate>
    <scheduledTime>${formData.scheduledTime}</scheduledTime>
    <durationMinutes>${formData.durationMinutes}</durationMinutes>
    <maxAltitudeAGL>${formData.maxAltitudeAGL}</maxAltitudeAGL>
  </missionDetails>
  <geofence>
${coords}
  </geofence>
</DigitalSkyPermissionRequest>`
}

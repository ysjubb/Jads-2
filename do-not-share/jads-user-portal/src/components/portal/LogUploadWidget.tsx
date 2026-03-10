import React, { useState, useCallback } from 'react'
import { T } from '../../theme'
import { userApi } from '../../api/client'

interface ParsedLog {
  format: 'DJI_AIRDATA' | 'DJI_PHANTOMHELP' | 'NPNT_JSON' | 'UNKNOWN'
  takeoff?: { lat: number; lon: number }
  landing?: { lat: number; lon: number }
  pathPoints: number
  maxAltitude: number
  duration: number
  minBattery?: number
  breachCount: number
}

function detectFormat(text: string, filename: string): ParsedLog['format'] {
  if (filename.endsWith('.json')) return 'NPNT_JSON'
  if (text.includes('datetime(utc)') && text.includes('latitude')) return 'DJI_AIRDATA'
  if (text.includes('OSD.latitude')) return 'DJI_PHANTOMHELP'
  return 'UNKNOWN'
}

function parseDJIAirData(csv: string): Partial<ParsedLog> {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return { pathPoints: 0, maxAltitude: 0, duration: 0, breachCount: 0 }
  const headers = lines[0].split(',').map(h => h.trim())
  const latIdx = headers.indexOf('latitude')
  const lonIdx = headers.indexOf('longitude')
  const altIdx = headers.indexOf('height_above_takeoff')
  const batIdx = headers.indexOf('battery_percent')

  const rows = lines.slice(1).map(l => l.split(','))
  const lats = rows.map(r => parseFloat(r[latIdx])).filter(v => !isNaN(v))
  const lons = rows.map(r => parseFloat(r[lonIdx])).filter(v => !isNaN(v))
  const alts = rows.map(r => parseFloat(r[altIdx])).filter(v => !isNaN(v))
  const bats = rows.map(r => parseFloat(r[batIdx])).filter(v => !isNaN(v))

  return {
    takeoff: lats.length > 0 ? { lat: lats[0], lon: lons[0] } : undefined,
    landing: lats.length > 0 ? { lat: lats[lats.length - 1], lon: lons[lons.length - 1] } : undefined,
    pathPoints: Math.floor(lats.length / 10), // subsample to 1Hz
    maxAltitude: Math.max(0, ...alts),
    duration: rows.length / 10, // 10Hz data
    minBattery: bats.length > 0 ? Math.min(...bats) : undefined,
    breachCount: 0,
  }
}

function parseNPNTLog(json: any): Partial<ParsedLog> {
  const entries = json?.flightLog?.logEntries ?? []
  const takeoffEntry = entries.find((e: any) => e.entryType === 'TAKEOFF' || e.entryType === 'ARM')
  const landEntry = entries.find((e: any) => e.entryType === 'LAND' || e.entryType === 'DISARM')
  const breaches = entries.filter((e: any) => e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH')

  return {
    takeoff: takeoffEntry ? { lat: takeoffEntry.latitude, lon: takeoffEntry.longitude } : undefined,
    landing: landEntry ? { lat: landEntry.latitude, lon: landEntry.longitude } : undefined,
    pathPoints: entries.length,
    maxAltitude: Math.max(0, ...entries.map((e: any) => e.altitude ?? 0)),
    duration: entries.length > 1 ? (entries[entries.length - 1].timeStamp - entries[0].timeStamp) / 1000 : 0,
    breachCount: breaches.length,
  }
}

interface LogUploadWidgetProps {
  onLogParsed?: (log: ParsedLog) => void
  onUploaded?: (trackLogId: string) => void
  droneSerialNumber?: string
  droneOperationPlanId?: string
}

export function LogUploadWidget({ onLogParsed, onUploaded, droneSerialNumber, droneOperationPlanId }: LogUploadWidgetProps) {
  const [parsed, setParsed] = useState<ParsedLog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [trackLogId, setTrackLogId] = useState<string | null>(null)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setUploaded(false)
    setUploadError(null)
    setTrackLogId(null)
    try {
      const text = await file.text()
      const format = detectFormat(text, file.name)
      let result: Partial<ParsedLog> = {}

      if (format === 'NPNT_JSON') {
        result = parseNPNTLog(JSON.parse(text))
      } else if (format === 'DJI_AIRDATA') {
        result = parseDJIAirData(text)
      } else if (format === 'DJI_PHANTOMHELP') {
        result = parseDJIAirData(text) // Similar CSV parsing
      } else {
        setError('Unrecognized file format. Supported: DJI CSV, NPNT JSON')
        return
      }

      const log: ParsedLog = {
        format,
        pathPoints: result.pathPoints ?? 0,
        maxAltitude: result.maxAltitude ?? 0,
        duration: result.duration ?? 0,
        breachCount: result.breachCount ?? 0,
        ...result,
      }
      setParsed(log)
      onLogParsed?.(log)

      // Upload to backend
      try {
        const { data } = await userApi().post('/drone/track-logs', {
          droneSerialNumber: droneSerialNumber || 'UNKNOWN',
          format: log.format,
          takeoff: log.takeoff,
          landing: log.landing,
          pathPoints: [],
          maxAltitude: log.maxAltitude,
          duration: log.duration,
          breachCount: log.breachCount,
          violations: [],
          droneOperationPlanId,
        })
        setUploaded(true)
        const id = data.trackLog?.id ?? data.id
        setTrackLogId(id)
        if (id) onUploaded?.(id)
      } catch (uploadErr: any) {
        setUploadError(uploadErr.response?.data?.error ?? uploadErr.message ?? 'Upload failed')
      }
    } catch (e) {
      setError('Failed to parse file')
    }
  }, [onLogParsed, onUploaded, droneSerialNumber, droneOperationPlanId])

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
        style={{
          padding: '1.5rem', border: `2px dashed ${dragOver ? T.primary : T.border}`,
          borderRadius: '6px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? T.primary + '10' : 'transparent',
        }}
        onClick={() => document.getElementById('log-upload-input')?.click()}
      >
        <p style={{ color: T.muted, fontSize: '0.7rem' }}>Drop CSV / JSON file here or click to browse</p>
        <p style={{ color: T.muted, fontSize: '0.55rem' }}>Supports: DJI AirData CSV, DJI PhantomHelp CSV, NPNT signed JSON</p>
        <input id="log-upload-input" type="file" accept=".csv,.json,.txt" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
      </div>

      {error && <p style={{ color: T.red, fontSize: '0.65rem', marginTop: '0.5rem' }}>{error}</p>}

      {parsed && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: T.primary, fontWeight: 700 }}>Format: {parsed.format}</span>
            {uploaded ? (
              <span style={{ color: '#00C864', fontWeight: 700 }}>Uploaded</span>
            ) : uploadError ? (
              <span style={{ color: T.red }}>{uploadError}</span>
            ) : (
              <span style={{ color: T.muted }}>Uploading...</span>
            )}
          </div>
          {parsed.takeoff && <p style={{ color: T.textBright }}>Takeoff: {parsed.takeoff.lat.toFixed(4)}, {parsed.takeoff.lon.toFixed(4)}</p>}
          {parsed.landing && <p style={{ color: T.textBright }}>Landing: {parsed.landing.lat.toFixed(4)}, {parsed.landing.lon.toFixed(4)}</p>}
          <p style={{ color: T.textBright }}>Points: {parsed.pathPoints} | Max Alt: {parsed.maxAltitude.toFixed(0)}m | Duration: {Math.floor(parsed.duration / 60)}m {Math.round(parsed.duration % 60)}s</p>
        </div>
      )}
    </div>
  )
}

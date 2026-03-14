import React, { useState } from 'react'
import { T } from '../theme'
import { LogUploadWidget } from '../components/portal/LogUploadWidget'
import { userApi } from '../api/client'

export function LogUploadPage() {
  const [tab, setTab] = useState<'parse' | 'file'>('parse')
  const [fileUploading, setFileUploading] = useState(false)
  const [fileResult, setFileResult] = useState<any>(null)
  const [fileError, setFileError]   = useState<string | null>(null)
  const [droneSerial, setDroneSerial] = useState('')

  const handleFileUpload = async (file: File) => {
    setFileUploading(true)
    setFileResult(null)
    setFileError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (droneSerial) form.append('droneSerialNumber', droneSerial)

      const { data } = await userApi().post('/drone/track-logs/upload-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setFileResult(data)
    } catch (e: any) {
      setFileError(e.response?.data?.error ?? e.message ?? 'Upload failed')
    } finally {
      setFileUploading(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '0.75rem', textAlign: 'center', cursor: 'pointer',
    background: active ? T.primary + '15' : 'transparent',
    color: active ? T.primary : T.muted,
    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    borderBottom: active ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
    fontSize: '0.75rem', fontWeight: 700, borderRadius: 0,
  })

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Flight Log Upload</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Upload DJI AirData CSV, PhantomHelp CSV, NPNT JSON, or any GPS track file
      </p>

      {/* Tab selector */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: '1rem' }}>
        <button onClick={() => setTab('parse')} style={tabStyle(tab === 'parse')}>
          QUICK PARSE
        </button>
        <button onClick={() => setTab('file')} style={tabStyle(tab === 'file')}>
          FILE UPLOAD
        </button>
      </div>

      {tab === 'parse' && (
        <div>
          <p style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.5rem' }}>
            Parses CSV/JSON in browser and uploads summary data
          </p>
          <LogUploadWidget />
        </div>
      )}

      {tab === 'file' && (
        <div>
          <p style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.75rem' }}>
            Uploads the raw file to the server for parsing. Supports larger files and more formats.
          </p>

          {/* Drone serial input */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '0.3rem' }}>
              Drone Serial (optional)
            </label>
            <input
              type="text" value={droneSerial} onChange={e => setDroneSerial(e.target.value)}
              placeholder="e.g. 1ZNBJ9D00B00FK"
              style={{
                width: '100%', padding: '0.6rem', background: T.bg, color: T.textBright,
                border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '0.8rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Drop zone — large touch target for mobile */}
          <div
            onClick={() => document.getElementById('file-upload-input')?.click()}
            style={{
              padding: '2rem 1rem', border: `2px dashed ${T.border}`,
              borderRadius: '8px', textAlign: 'center', cursor: 'pointer',
              minHeight: '120px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleFileUpload(f)
            }}
          >
            <p style={{ color: T.textBright, fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.3rem' }}>
              Tap to select file or drop here
            </p>
            <p style={{ color: T.muted, fontSize: '0.55rem', margin: 0 }}>
              .csv, .txt, .json — up to 20MB
            </p>
            <input
              id="file-upload-input" type="file" accept=".csv,.json,.txt"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
            />
          </div>

          {fileUploading && (
            <p style={{ color: T.primary, fontSize: '0.7rem', marginTop: '0.75rem', textAlign: 'center' }}>
              Uploading and parsing...
            </p>
          )}

          {fileResult && (
            <div style={{
              marginTop: '0.75rem', padding: '0.75rem', background: T.surface,
              border: `1px solid #00AA44`, borderRadius: '6px', fontSize: '0.65rem',
            }}>
              <p style={{ color: '#00AA44', fontWeight: 700, margin: '0 0 0.3rem' }}>Uploaded</p>
              <p style={{ color: T.textBright, margin: '0.15rem 0' }}>Format: {fileResult.format}</p>
              <p style={{ color: T.textBright, margin: '0.15rem 0' }}>Points: {fileResult.pointCount}</p>
              <p style={{ color: T.textBright, margin: '0.15rem 0' }}>Max Altitude: {fileResult.maxAltitudeM?.toFixed(1)}m</p>
              <p style={{ color: T.textBright, margin: '0.15rem 0' }}>
                Duration: {Math.floor((fileResult.durationSec ?? 0) / 60)}m {Math.round((fileResult.durationSec ?? 0) % 60)}s
              </p>
              <p style={{ color: T.muted, margin: '0.15rem 0', fontSize: '0.55rem' }}>
                Track Log ID: {fileResult.trackLogId}
              </p>
            </div>
          )}

          {fileError && (
            <p style={{ color: T.red, fontSize: '0.7rem', marginTop: '0.5rem' }}>{fileError}</p>
          )}
        </div>
      )}
    </div>
  )
}

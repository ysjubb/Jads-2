import React from 'react'
import { T } from '../theme'
import { LogUploadWidget } from '../components/portal/LogUploadWidget'

export function LogUploadPage() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Flight Log Upload</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Upload and validate DJI AirData, PhantomHelp CSV, or NPNT signed JSON flight logs
      </p>
      <LogUploadWidget />
    </div>
  )
}

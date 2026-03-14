import React from 'react'
import { T } from '../theme'
import { ChartViewer } from '../components/portal/ChartViewer'

export function ChartsPage() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Charts & eAIP</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Jeppesen & AAI eAIP chart viewer with AIRAC cycle tracking
      </p>
      <ChartViewer />
    </div>
  )
}

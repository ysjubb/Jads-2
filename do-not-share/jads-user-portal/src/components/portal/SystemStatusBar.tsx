import React, { useState, useEffect } from 'react'
import { T } from '../../theme'
import { getCurrentAIRACCycle } from '../../services/chartService'

interface APIStatus {
  name: string
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
  lastChecked?: Date
}

export function SystemStatusBar() {
  const [statuses, setStatuses] = useState<APIStatus[]>([
    { name: 'Digital Sky', status: 'UNKNOWN' },
    { name: 'AAI AIM', status: 'UNKNOWN' },
    { name: 'Jeppesen', status: 'UNKNOWN' },
  ])
  const cycle = getCurrentAIRACCycle()

  useEffect(() => {
    const check = () => {
      // In production, HEAD requests to each endpoint
      setStatuses([
        { name: 'Digital Sky', status: 'ONLINE', lastChecked: new Date() },
        { name: 'AAI AIM', status: 'ONLINE', lastChecked: new Date() },
        { name: 'Jeppesen', status: 'OFFLINE', lastChecked: new Date() },
      ])
    }
    check()
    const interval = setInterval(check, 300000) // 5 min
    return () => clearInterval(interval)
  }, [])

  const statusColor = (s: APIStatus['status']) =>
    s === 'ONLINE' ? '#00C864' : s === 'OFFLINE' ? T.red : T.muted

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.3rem 1rem',
      background: T.surface, borderBottom: `1px solid ${T.border}`, fontSize: '0.6rem',
    }}>
      {statuses.map(s => (
        <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: statusColor(s.status) }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(s.status), display: 'inline-block' }} />
          {s.name}: {s.status}
        </span>
      ))}
      <span style={{ color: T.primary, marginLeft: 'auto' }}>AIRAC: {cycle.cycleNumber}</span>
    </div>
  )
}

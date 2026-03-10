import React, { useState, useEffect } from 'react'
import { T } from '../../theme'
import { fetchFleetDrones, fetchFleetAircraft, getDroneHealthStatus } from '../../services/fleetService'
import type { FleetDrone, FleetAircraft } from '../../services/fleetService'

export function FleetManager() {
  const [tab, setTab] = useState<'drones' | 'aircraft'>('drones')
  const [drones, setDrones] = useState<FleetDrone[]>([])
  const [aircraft, setAircraft] = useState<FleetAircraft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchFleetDrones(), fetchFleetAircraft()]).then(([d, a]) => {
      setDrones(d)
      setAircraft(a)
      setLoading(false)
    })
  }, [])

  const tabBtn = (key: 'drones' | 'aircraft', label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: '6px 16px', fontSize: '0.7rem', fontWeight: 600,
        background: tab === key ? T.primary + '20' : 'transparent',
        color: tab === key ? T.primary : T.muted,
        border: `1px solid ${tab === key ? T.primary + '40' : T.border}`,
        borderRadius: '3px', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Fleet Manager</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Manage drones and aircraft in your fleet
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {tabBtn('drones', `Drones (${drones.length})`)}
        {tabBtn('aircraft', `Aircraft (${aircraft.length})`)}
      </div>

      {loading ? (
        <p style={{ color: T.muted }}>Loading fleet...</p>
      ) : tab === 'drones' ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Serial #</th>
                <th style={{ padding: '0.4rem' }}>Model</th>
                <th style={{ padding: '0.4rem' }}>Category</th>
                <th style={{ padding: '0.4rem' }}>UIN</th>
                <th style={{ padding: '0.4rem' }}>NPNT</th>
                <th style={{ padding: '0.4rem' }}>Hours</th>
                <th style={{ padding: '0.4rem' }}>Insurance</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {drones.map(d => {
                const health = getDroneHealthStatus(d)
                return (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                    <td style={{ padding: '0.4rem', color: T.primary }}>{d.serialNumber}</td>
                    <td style={{ padding: '0.4rem' }}>{d.manufacturer} {d.model}</td>
                    <td style={{ padding: '0.4rem' }}>
                      <span style={{ padding: '1px 5px', borderRadius: '2px', fontSize: '0.6rem', background: T.border, color: T.text }}>{d.category}</span>
                    </td>
                    <td style={{ padding: '0.4rem', fontSize: '0.6rem', fontFamily: 'monospace' }}>{d.uinNumber}</td>
                    <td style={{ padding: '0.4rem', color: d.npntCompliant ? T.primary : T.red }}>{d.npntCompliant ? 'YES' : 'NO'}</td>
                    <td style={{ padding: '0.4rem' }}>{d.flightHours}h</td>
                    <td style={{ padding: '0.4rem', fontSize: '0.6rem' }}>{d.insuranceExpiry}</td>
                    <td style={{ padding: '0.4rem' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '3px', fontSize: '0.55rem',
                        fontWeight: 700, color: '#fff', background: health.color,
                      }}>{health.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Registration</th>
                <th style={{ padding: '0.4rem' }}>Type</th>
                <th style={{ padding: '0.4rem' }}>Operator</th>
                <th style={{ padding: '0.4rem' }}>C of A</th>
                <th style={{ padding: '0.4rem' }}>C of A Expiry</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {aircraft.map(a => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                  <td style={{ padding: '0.4rem', color: T.primary, fontWeight: 600 }}>{a.registration}</td>
                  <td style={{ padding: '0.4rem' }}>{a.icaoType}</td>
                  <td style={{ padding: '0.4rem' }}>{a.airlineName} ({a.operator})</td>
                  <td style={{ padding: '0.4rem', fontSize: '0.6rem', fontFamily: 'monospace' }}>{a.certOfAirworthiness}</td>
                  <td style={{ padding: '0.4rem', fontSize: '0.6rem' }}>{a.certExpiry}</td>
                  <td style={{ padding: '0.4rem' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700,
                      color: '#fff', background: a.status === 'ACTIVE' ? T.primary : a.status === 'MAINTENANCE' ? T.amber : T.red,
                    }}>{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

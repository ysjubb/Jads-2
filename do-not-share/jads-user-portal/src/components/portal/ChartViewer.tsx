import React, { useState } from 'react'
import { T } from '../../theme'
import { SID_STAR_DATA, getSidStarForAirport } from '../../data/sidStarData'
import { getCurrentAIRACCycle, daysUntilAIRACExpiry, getChartsForAirport } from '../../services/chartService'

const TABS = ['SID Charts', 'STAR Charts', 'IAP Charts', 'Airport Diagrams', 'Enroute'] as const

const AIRPORT_OPTIONS = Object.keys(SID_STAR_DATA).sort()

export function ChartViewer() {
  const [tab, setTab] = useState<typeof TABS[number]>('SID Charts')
  const [selectedAirport, setSelectedAirport] = useState('')
  const cycle = getCurrentAIRACCycle()
  const daysLeft = daysUntilAIRACExpiry()

  const procs = selectedAirport ? getSidStarForAirport(selectedAirport) : undefined
  const charts = procs
    ? procs.procedures.filter(p => {
        if (tab === 'SID Charts') return p.type === 'SID'
        if (tab === 'STAR Charts') return p.type === 'STAR'
        return false
      })
    : []

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.25rem' }}>Chart Viewer</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Jeppesen/AAI eAIP Chart Integration
      </p>

      {/* AIRAC Banner */}
      <AIRACBanner />

      {/* Airport selector */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.6rem', color: T.muted, fontWeight: 600 }}>AIRPORT</label>
        <select style={{
          marginLeft: '0.5rem', padding: '0.4rem', background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '4px', color: T.textBright, fontSize: '0.7rem', fontFamily: 'inherit',
        }} value={selectedAirport} onChange={e => setSelectedAirport(e.target.value)}>
          <option value="">Select airport...</option>
          {AIRPORT_OPTIONS.map(icao => {
            const ap = SID_STAR_DATA[icao]
            return <option key={icao} value={icao}>{icao} — {ap?.name ?? icao}</option>
          })}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: '1rem' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1rem', background: t === tab ? T.primary + '15' : 'transparent',
            border: 'none', borderBottom: t === tab ? `2px solid ${T.primary}` : '2px solid transparent',
            color: t === tab ? T.primary : T.muted, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>

      {/* Chart list */}
      {selectedAirport ? (
        <div>
          {charts.length === 0 ? (
            <p style={{ color: T.muted, fontSize: '0.7rem' }}>
              {tab === 'IAP Charts' || tab === 'Airport Diagrams' || tab === 'Enroute'
                ? 'Chart data available via Jeppesen API or AAI eAIP (PDF fallback)'
                : 'No procedures found for this airport'}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted }}>
                  <th style={{ padding: '0.4rem', textAlign: 'left' }}>Procedure</th>
                  <th style={{ padding: '0.4rem', textAlign: 'left' }}>Runway</th>
                  <th style={{ padding: '0.4rem', textAlign: 'left' }}>Transition</th>
                  <th style={{ padding: '0.4rem', textAlign: 'left' }}>AIRAC</th>
                </tr>
              </thead>
              <tbody>
                {charts.map((c, i) => (
                  <tr key={`${c.name}-${i}`} style={{ borderBottom: `1px solid ${T.border}08` }}>
                    <td style={{ padding: '0.4rem', color: T.primary }}>{c.name}</td>
                    <td style={{ padding: '0.4rem' }}>{c.runway ?? '—'}</td>
                    <td style={{ padding: '0.4rem' }}>{c.transition ?? '—'}</td>
                    <td style={{ padding: '0.4rem', fontSize: '0.6rem' }}>{cycle.cycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <p style={{ color: T.muted, fontSize: '0.7rem' }}>Select an airport to view charts.</p>
      )}
    </div>
  )
}

export function AIRACBanner() {
  const cycle = getCurrentAIRACCycle()
  const daysLeft = daysUntilAIRACExpiry()
  const bannerColor = daysLeft <= 0 ? T.red : daysLeft <= 3 ? T.amber : T.primary

  return (
    <div style={{
      padding: '0.4rem 0.75rem', marginBottom: '1rem', borderRadius: '4px',
      background: bannerColor + '15', border: `1px solid ${bannerColor}40`,
      fontSize: '0.65rem', color: bannerColor, display: 'flex', justifyContent: 'space-between',
    }}>
      <span>AIRAC {cycle.cycle} effective {cycle.effective.toLocaleDateString()}</span>
      <span>
        {daysLeft <= 0 ? 'EXPIRED — NavData Update Required' :
         daysLeft <= 3 ? `Expires in ${daysLeft} days` :
         `Next: ${cycle.expiry.toLocaleDateString()}`}
      </span>
    </div>
  )
}

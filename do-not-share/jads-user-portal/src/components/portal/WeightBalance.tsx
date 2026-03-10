import React, { useState, useMemo } from 'react'
import { T } from '../../theme'
import { AIRCRAFT_PERFORMANCE, getPerformance } from '../../data/performanceData'
import type { AircraftPerformance } from '../../data/performanceData'

interface WeightBalanceProps {
  aircraftType?: string
  onResult?: (result: WBResult) => void
}

interface WBResult {
  oew: number
  payload: number
  zfw: number
  fuelOnBoard: number
  tow: number
  landingWeight: number
  towExceeded: boolean
  ldgExceeded: boolean
  zfwExceeded: boolean
  cgInEnvelope: boolean
}

export function WeightBalance({ aircraftType, onResult }: WeightBalanceProps) {
  const [selectedType, setSelectedType] = useState(aircraftType ?? 'A320')
  const [paxCount, setPaxCount] = useState(150)
  const [paxAvgKg, setPaxAvgKg] = useState(82)
  const [cargoKg, setCargoKg] = useState(2000)
  const [fuelKg, setFuelKg] = useState(12000)
  const [burnoffKg, setBurnoffKg] = useState(8000)

  const perf = useMemo(() => getPerformance(selectedType), [selectedType])

  const result = useMemo((): WBResult | null => {
    if (!perf) return null
    const oew = perf.operatingEmptyWeight
    const payload = (paxCount * paxAvgKg) + cargoKg
    const zfw = oew + payload
    const tow = zfw + fuelKg
    const landingWeight = tow - burnoffKg

    const r: WBResult = {
      oew,
      payload,
      zfw,
      fuelOnBoard: fuelKg,
      tow,
      landingWeight,
      towExceeded: tow > perf.maxTakeoffWeight,
      ldgExceeded: landingWeight > perf.maxLandingWeight,
      zfwExceeded: zfw > perf.maxZeroFuelWeight,
      cgInEnvelope: true, // simplified
    }
    onResult?.(r)
    return r
  }, [perf, paxCount, paxAvgKg, cargoKg, fuelKg, burnoffKg, onResult])

  const row = (label: string, value: number | string, limit?: number, exceeded?: boolean) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '4px 0',
      borderBottom: `1px solid ${T.border}08`, fontSize: '0.7rem',
    }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ color: exceeded ? T.red : T.textBright, fontWeight: exceeded ? 700 : 400 }}>
        {typeof value === 'number' ? value.toLocaleString() + ' kg' : value}
        {limit ? <span style={{ color: T.muted, fontSize: '0.6rem' }}> / {limit.toLocaleString()}</span> : ''}
        {exceeded && ' EXCEEDED'}
      </span>
    </div>
  )

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: '4px', padding: '1rem',
    }}>
      <h3 style={{ color: T.textBright, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        Weight & Balance
      </h3>
      <p style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.75rem' }}>
        Filing authority controls all W&B data. No admin override.
      </p>

      {/* Aircraft selector */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ color: T.muted, fontSize: '0.65rem', display: 'block', marginBottom: '2px' }}>Aircraft Type</label>
        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          style={{
            width: '100%', padding: '6px', background: T.bg, color: T.textBright,
            border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
          }}
        >
          {AIRCRAFT_PERFORMANCE.map(a => (
            <option key={a.icaoType} value={a.icaoType}>{a.icaoType} — {a.name}</option>
          ))}
        </select>
      </div>

      {/* Input fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[
          { label: 'Passengers', value: paxCount, set: setPaxCount, min: 0, max: 500 },
          { label: 'Avg Pax Weight (kg)', value: paxAvgKg, set: setPaxAvgKg, min: 50, max: 120 },
          { label: 'Cargo (kg)', value: cargoKg, set: setCargoKg, min: 0, max: 50000 },
          { label: 'Fuel on Board (kg)', value: fuelKg, set: setFuelKg, min: 0, max: perf?.maxFuelCapacity ?? 30000 },
          { label: 'Fuel Burnoff (kg)', value: burnoffKg, set: setBurnoffKg, min: 0, max: fuelKg },
        ].map(f => (
          <div key={f.label}>
            <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>{f.label}</label>
            <input
              type="number"
              value={f.value}
              onChange={e => f.set(Number(e.target.value))}
              min={f.min}
              max={f.max}
              style={{
                width: '100%', padding: '5px', background: T.bg, color: T.textBright,
                border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
              }}
            />
          </div>
        ))}
      </div>

      {/* Results */}
      {result && perf && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: '3px', padding: '0.5rem',
        }}>
          {row('Operating Empty Weight', result.oew)}
          {row('Payload (Pax + Cargo)', result.payload)}
          {row('Zero Fuel Weight', result.zfw, perf.maxZeroFuelWeight, result.zfwExceeded)}
          {row('Fuel on Board', result.fuelOnBoard, perf.maxFuelCapacity)}
          {row('Takeoff Weight', result.tow, perf.maxTakeoffWeight, result.towExceeded)}
          {row('Landing Weight', result.landingWeight, perf.maxLandingWeight, result.ldgExceeded)}

          {(result.towExceeded || result.ldgExceeded || result.zfwExceeded) && (
            <div style={{
              marginTop: '0.5rem', padding: '6px', background: T.red + '15',
              border: `1px solid ${T.red}40`, borderRadius: '3px',
              color: T.red, fontSize: '0.65rem', fontWeight: 600,
            }}>
              WEIGHT LIMIT EXCEEDED — Reduce payload or fuel before filing.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

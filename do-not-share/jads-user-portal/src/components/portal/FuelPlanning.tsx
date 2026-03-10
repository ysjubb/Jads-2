import React, { useState, useMemo } from 'react'
import { T } from '../../theme'
import { AIRCRAFT_PERFORMANCE, FUEL_POLICIES, calculateFuelRequired, getPerformance } from '../../data/performanceData'

interface FuelPlanningProps {
  aircraftType?: string
  tripDistanceNm?: number
  alternateDistanceNm?: number
}

export function FuelPlanning({
  aircraftType,
  tripDistanceNm: initialTrip = 800,
  alternateDistanceNm: initialAltn = 150,
}: FuelPlanningProps) {
  const [selectedType, setSelectedType] = useState(aircraftType ?? 'A320')
  const [tripDist, setTripDist] = useState(initialTrip)
  const [altnDist, setAltnDist] = useState(initialAltn)
  const [policyKey, setPolicyKey] = useState('DGCA_TURBINE')
  const [extraMinutes, setExtraMinutes] = useState(0)

  const perf = useMemo(() => getPerformance(selectedType), [selectedType])
  const policy = useMemo(() => {
    const base = FUEL_POLICIES[policyKey]
    return { ...base, extraFuel: base.extraFuel + extraMinutes }
  }, [policyKey, extraMinutes])

  const fuelCalc = useMemo(() => {
    if (!perf) return null
    return calculateFuelRequired(tripDist, perf, policy, altnDist)
  }, [perf, tripDist, policy, altnDist])

  const tripTimeHrs = perf ? tripDist / perf.cruiseSpeedKts : 0
  const tripTimeStr = `${Math.floor(tripTimeHrs)}h ${Math.round((tripTimeHrs % 1) * 60)}m`

  const fuelRow = (label: string, value: number, color?: string) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '4px 0',
      borderBottom: `1px solid ${T.border}08`, fontSize: '0.7rem',
    }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ color: color ?? T.textBright, fontFamily: 'monospace' }}>
        {value.toLocaleString()} kg
      </span>
    </div>
  )

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: '4px', padding: '1rem',
    }}>
      <h3 style={{ color: T.textBright, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        Fuel Planning
      </h3>
      <p style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.75rem' }}>
        Filing authority controls fuel data. No admin override. Per DGCA CAR Section 8 Series O Part I.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Aircraft Type</label>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            style={{
              width: '100%', padding: '6px', background: T.bg, color: T.textBright,
              border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
            }}
          >
            {AIRCRAFT_PERFORMANCE.map(a => (
              <option key={a.icaoType} value={a.icaoType}>{a.icaoType}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Fuel Policy</label>
          <select
            value={policyKey}
            onChange={e => setPolicyKey(e.target.value)}
            style={{
              width: '100%', padding: '6px', background: T.bg, color: T.textBright,
              border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
            }}
          >
            {Object.entries(FUEL_POLICIES).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Trip Distance (nm)</label>
          <input
            type="number" value={tripDist} onChange={e => setTripDist(Number(e.target.value))}
            min={10} max={10000}
            style={{
              width: '100%', padding: '5px', background: T.bg, color: T.textBright,
              border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
            }}
          />
        </div>

        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Alternate Distance (nm)</label>
          <input
            type="number" value={altnDist} onChange={e => setAltnDist(Number(e.target.value))}
            min={0} max={3000}
            style={{
              width: '100%', padding: '5px', background: T.bg, color: T.textBright,
              border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
            }}
          />
        </div>

        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Commander's Extra (min)</label>
          <input
            type="number" value={extraMinutes} onChange={e => setExtraMinutes(Number(e.target.value))}
            min={0} max={120}
            style={{
              width: '100%', padding: '5px', background: T.bg, color: T.textBright,
              border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <span style={{ color: T.muted, fontSize: '0.65rem' }}>
            Est. flight time: <strong style={{ color: T.textBright }}>{tripTimeStr}</strong>
          </span>
        </div>
      </div>

      {fuelCalc && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: '3px', padding: '0.5rem',
        }}>
          {fuelRow('Taxi Fuel', fuelCalc.taxiFuel)}
          {fuelRow('Trip Fuel', fuelCalc.tripFuel)}
          {fuelRow(`Contingency (${policy.contingency}%)`, fuelCalc.contingencyFuel)}
          {fuelRow('Alternate Fuel', fuelCalc.alternateFuel)}
          {fuelRow(`Final Reserve (${policy.finalReserve} min)`, fuelCalc.finalReserve)}
          {fuelCalc.extraFuel > 0 && fuelRow('Extra / Commander\'s', fuelCalc.extraFuel)}

          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            fontSize: '0.75rem', fontWeight: 700, borderTop: `1px solid ${T.border}`,
            marginTop: '2px',
          }}>
            <span style={{ color: T.textBright }}>Total Required</span>
            <span style={{
              color: fuelCalc.withinCapacity ? T.primary : T.red,
              fontFamily: 'monospace',
            }}>
              {fuelCalc.totalFuel.toLocaleString()} kg
            </span>
          </div>

          {!fuelCalc.withinCapacity && (
            <div style={{
              marginTop: '0.5rem', padding: '6px', background: T.red + '15',
              border: `1px solid ${T.red}40`, borderRadius: '3px',
              color: T.red, fontSize: '0.65rem', fontWeight: 600,
            }}>
              FUEL EXCEEDS TANK CAPACITY ({perf!.maxFuelCapacity.toLocaleString()} kg).
              Reduce trip distance, select alternate closer to destination, or reduce extra fuel.
            </div>
          )}

          {fuelCalc.withinCapacity && (
            <div style={{
              marginTop: '0.5rem', padding: '6px', background: T.primary + '10',
              border: `1px solid ${T.primary}30`, borderRadius: '3px',
              color: T.primary, fontSize: '0.6rem',
            }}>
              Fuel plan within limits. Remaining capacity: {(perf!.maxFuelCapacity - fuelCalc.totalFuel).toLocaleString()} kg
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react';
import { T } from '../../theme';
import { AIRCRAFT_PERFORMANCE } from '../../data/performanceData';

const perfEntries = Object.entries(AIRCRAFT_PERFORMANCE);

/**
 * Fuel planning calculator.
 * Computes trip fuel, reserves, and total required fuel
 * based on aircraft performance data and route distance.
 */
export function FuelPlanning() {
  const [aircraftType, setAircraftType] = useState('');
  const [distanceNm, setDistanceNm] = useState(0);
  const [altFuelMin, setAltFuelMin] = useState(30); // minutes to alternate

  const perf = aircraftType ? AIRCRAFT_PERFORMANCE[aircraftType] : undefined;

  const tripFuel = perf && distanceNm > 0
    ? (distanceNm / perf.cruiseSpeed) * perf.fuelBurn
    : 0;
  const contingency = tripFuel * 0.05; // 5% contingency per ICAO
  const alternateFuel = perf ? (altFuelMin / 60) * perf.fuelBurn : 0;
  const finalReserve = perf ? 0.5 * perf.fuelBurn : 0; // 30 min final reserve
  const totalRequired = tripFuel + contingency + alternateFuel + finalReserve;

  const selectStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
    color: T.textBright, padding: '0.4rem 0.6rem', fontSize: '0.75rem', width: '100%',
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Fuel Planning</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '0.2rem' }}>Aircraft Type</label>
          <select style={selectStyle} value={aircraftType} onChange={e => setAircraftType(e.target.value)}>
            <option value="">Select...</option>
            {perfEntries.map(([code, a]) => (
              <option key={code} value={code}>{code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '0.2rem' }}>Distance (NM)</label>
          <input style={selectStyle} type="number" value={distanceNm || ''} onChange={e => setDistanceNm(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '0.2rem' }}>Alt Fuel (min)</label>
          <input style={selectStyle} type="number" value={altFuelMin} onChange={e => setAltFuelMin(parseInt(e.target.value) || 0)} />
        </div>
      </div>

      {perf && distanceNm > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.8rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.7rem' }}>
            <span style={{ color: T.muted }}>Trip Fuel:</span>
            <span style={{ color: T.text, textAlign: 'right' }}>{tripFuel.toFixed(0)} kg</span>
            <span style={{ color: T.muted }}>Contingency (5%):</span>
            <span style={{ color: T.text, textAlign: 'right' }}>{contingency.toFixed(0)} kg</span>
            <span style={{ color: T.muted }}>Alternate Fuel:</span>
            <span style={{ color: T.text, textAlign: 'right' }}>{alternateFuel.toFixed(0)} kg</span>
            <span style={{ color: T.muted }}>Final Reserve (30min):</span>
            <span style={{ color: T.text, textAlign: 'right' }}>{finalReserve.toFixed(0)} kg</span>
            <span style={{ color: T.textBright, fontWeight: 600, borderTop: `1px solid ${T.border}`, paddingTop: '0.3rem' }}>
              Total Required:
            </span>
            <span style={{
              color: T.primary, fontWeight: 700, textAlign: 'right',
              borderTop: `1px solid ${T.border}`, paddingTop: '0.3rem', fontSize: '0.85rem',
            }}>
              {totalRequired.toFixed(0)} kg
            </span>
          </div>
          <div style={{ color: T.muted, fontSize: '0.6rem', marginTop: '0.5rem' }}>
            Est. flight time: {(distanceNm / perf.cruiseSpeed).toFixed(1)}h |
            Burn rate: {perf.fuelBurn} kg/h |
            Cruise: {perf.cruiseSpeed} kts
          </div>
        </div>
      )}
    </div>
  );
}

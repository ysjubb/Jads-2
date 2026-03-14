import React, { useState, useEffect } from 'react';
import { T } from '../../theme';
import { getDrones, getAircraft } from '../../services/fleetService';
import type { DroneRecord, AircraftRecord } from '../../services/fleetService';

/**
 * Fleet manager — view registered drones and aircraft.
 */
export function FleetManager() {
  const [drones, setDrones] = useState<DroneRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [tab, setTab] = useState<'drones' | 'aircraft'>('drones');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([getDrones(), getAircraft()]).then(([d, a]) => {
      if (d.status === 'fulfilled') setDrones(d.value);
      if (a.status === 'fulfilled') setAircraft(a.value);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Fleet Manager</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['drones', 'aircraft'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer',
              background: tab === t ? T.primary + '25' : 'transparent',
              border: `1px solid ${tab === t ? T.primary : T.border}`,
              color: tab === t ? T.primary : T.muted, textTransform: 'capitalize',
            }}
          >
            {t} ({t === 'drones' ? drones.length : aircraft.length})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: T.muted, fontSize: '0.75rem' }}>Loading fleet data...</div>
      ) : tab === 'drones' ? (
        drones.length === 0 ? (
          <div style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>No drones registered</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {drones.map(d => (
              <div key={d.id} style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ color: T.textBright, fontSize: '0.75rem', fontWeight: 600 }}>{d.uin}</div>
                  <div style={{ color: T.muted, fontSize: '0.6rem' }}>{d.model} | {d.weightCategory}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: '3px', fontSize: '0.55rem',
                    background: d.npntCompliant ? '#22c55e20' : T.red + '20',
                    color: d.npntCompliant ? '#22c55e' : T.red,
                  }}>
                    {d.npntCompliant ? 'NPNT' : 'NO NPNT'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        aircraft.length === 0 ? (
          <div style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>No aircraft registered</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {aircraft.map(a => (
              <div key={a.id} style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ color: T.textBright, fontSize: '0.75rem', fontWeight: 600 }}>{a.registration}</div>
                  <div style={{ color: T.muted, fontSize: '0.6rem' }}>{a.icaoType} | {a.operator}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

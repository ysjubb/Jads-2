import React, { useState } from 'react';
import { T } from '../../theme';

interface WBEntry {
  label: string;
  weight: number;
  arm: number;
}

/**
 * Simple weight & balance calculator.
 * Computes total weight, CG position, and moment.
 */
export function WeightBalance() {
  const [entries, setEntries] = useState<WBEntry[]>([
    { label: 'Empty Weight', weight: 0, arm: 0 },
    { label: 'Fuel', weight: 0, arm: 0 },
    { label: 'Pilot', weight: 0, arm: 0 },
    { label: 'Payload', weight: 0, arm: 0 },
  ]);

  const updateEntry = (idx: number, field: keyof WBEntry, value: string) => {
    setEntries(prev => prev.map((e, i) =>
      i === idx ? { ...e, [field]: field === 'label' ? value : parseFloat(value) || 0 } : e
    ));
  };

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  const totalMoment = entries.reduce((s, e) => s + e.weight * e.arm, 0);
  const cg = totalWeight > 0 ? totalMoment / totalWeight : 0;

  const inputStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: '3px',
    color: T.textBright, padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: '100%',
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Weight & Balance</h2>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', marginBottom: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted }}>
            <th style={{ padding: '0.3rem', textAlign: 'left' }}>Item</th>
            <th style={{ padding: '0.3rem', textAlign: 'right' }}>Weight (kg)</th>
            <th style={{ padding: '0.3rem', textAlign: 'right' }}>Arm (m)</th>
            <th style={{ padding: '0.3rem', textAlign: 'right' }}>Moment</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.border}10` }}>
              <td style={{ padding: '0.3rem' }}>
                <input style={inputStyle} value={e.label} onChange={ev => updateEntry(i, 'label', ev.target.value)} />
              </td>
              <td style={{ padding: '0.3rem' }}>
                <input style={{ ...inputStyle, textAlign: 'right' }} type="number" value={e.weight || ''} onChange={ev => updateEntry(i, 'weight', ev.target.value)} />
              </td>
              <td style={{ padding: '0.3rem' }}>
                <input style={{ ...inputStyle, textAlign: 'right' }} type="number" value={e.arm || ''} onChange={ev => updateEntry(i, 'arm', ev.target.value)} />
              </td>
              <td style={{ padding: '0.3rem', textAlign: 'right', color: T.text }}>{(e.weight * e.arm).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${T.border}` }}>
            <td style={{ padding: '0.3rem', color: T.textBright, fontWeight: 600 }}>Total</td>
            <td style={{ padding: '0.3rem', textAlign: 'right', color: T.primary, fontWeight: 600 }}>{totalWeight.toFixed(1)}</td>
            <td style={{ padding: '0.3rem', textAlign: 'right', color: T.muted }}></td>
            <td style={{ padding: '0.3rem', textAlign: 'right', color: T.primary, fontWeight: 600 }}>{totalMoment.toFixed(1)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem' }}>
        <span style={{ color: T.muted, fontSize: '0.65rem' }}>CG Position: </span>
        <span style={{ color: T.primary, fontSize: '0.8rem', fontWeight: 700 }}>{cg.toFixed(3)}m</span>
      </div>
    </div>
  );
}

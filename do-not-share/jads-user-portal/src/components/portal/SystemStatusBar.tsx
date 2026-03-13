import React from 'react';
import { T } from '../../theme';

export interface SystemStatus {
  backend: 'UP' | 'DOWN' | 'DEGRADED';
  digitalSky: 'UP' | 'DOWN' | 'DEGRADED';
  npntGateway: 'UP' | 'DOWN' | 'DEGRADED';
}

const STATUS_COLORS = { UP: '#22c55e', DOWN: '#ef4444', DEGRADED: '#eab308' };

/**
 * Compact status bar showing backend, DigitalSky, and NPNT gateway status.
 */
export function SystemStatusBar({ status }: { status?: SystemStatus }) {
  const s = status ?? { backend: 'UP', digitalSky: 'UP', npntGateway: 'UP' };

  const items: { label: string; value: 'UP' | 'DOWN' | 'DEGRADED' }[] = [
    { label: 'Backend', value: s.backend },
    { label: 'DigitalSky', value: s.digitalSky },
    { label: 'NPNT Gateway', value: s.npntGateway },
  ];

  return (
    <div style={{
      display: 'flex', gap: '1rem', padding: '0.4rem 0.8rem',
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      fontSize: '0.6rem',
    }}>
      {items.map(item => (
        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: STATUS_COLORS[item.value],
          }} />
          <span style={{ color: T.muted }}>{item.label}</span>
          <span style={{ color: STATUS_COLORS[item.value], fontWeight: 600 }}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

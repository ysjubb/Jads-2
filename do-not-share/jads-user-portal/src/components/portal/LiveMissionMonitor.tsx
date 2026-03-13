import React, { useState, useEffect } from 'react';
import { T } from '../../theme';
import type { DroneMission } from '../../types/flightPlan';

interface LiveTelemetry {
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  battery: number;
  heading: number;
  timestamp: number;
}

/**
 * Live mission monitor — shows real-time telemetry for an active drone mission.
 * In production, would connect via WebSocket to the backend.
 */
export function LiveMissionMonitor({ mission }: { mission?: DroneMission }) {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Simulated telemetry for demo
  useEffect(() => {
    if (!mission || mission.status !== 'IN_FLIGHT') return;

    const interval = setInterval(() => {
      setTelemetry({
        lat: 28.5665 + (Math.random() - 0.5) * 0.001,
        lng: 77.1031 + (Math.random() - 0.5) * 0.001,
        altitude: 80 + Math.random() * 20,
        speed: 5 + Math.random() * 3,
        battery: Math.max(20, 100 - elapsed * 0.5),
        heading: Math.floor(Math.random() * 360),
        timestamp: Date.now(),
      });
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [mission, elapsed]);

  if (!mission) {
    return (
      <div style={{ color: T.muted, fontSize: '0.75rem', padding: '2rem', textAlign: 'center' }}>
        No active mission selected
      </div>
    );
  }

  const items: { label: string; value: string; color?: string }[] = telemetry ? [
    { label: 'Position', value: `${telemetry.lat.toFixed(5)}, ${telemetry.lng.toFixed(5)}` },
    { label: 'Altitude', value: `${telemetry.altitude.toFixed(1)}m AGL`, color: telemetry.altitude > 121.92 ? T.red : undefined },
    { label: 'Speed', value: `${telemetry.speed.toFixed(1)} m/s` },
    { label: 'Battery', value: `${telemetry.battery.toFixed(0)}%`, color: telemetry.battery < 30 ? T.red : telemetry.battery < 50 ? T.amber : undefined },
    { label: 'Heading', value: `${telemetry.heading}°` },
    { label: 'Elapsed', value: `${elapsed}s` },
  ] : [];

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.4rem' }}>Live Mission</h2>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem', alignItems: 'center' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: mission.status === 'IN_FLIGHT' ? '#22c55e' : T.muted,
          animation: mission.status === 'IN_FLIGHT' ? 'pulse 1s infinite' : 'none',
        }} />
        <span style={{ color: T.text, fontSize: '0.7rem' }}>{mission.id} — {mission.missionType}</span>
        <span style={{ color: T.muted, fontSize: '0.6rem' }}>{mission.status}</span>
      </div>

      {telemetry && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {items.map(item => (
            <div key={item.label} style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
              padding: '0.5rem',
            }}>
              <div style={{ color: T.muted, fontSize: '0.55rem', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ color: item.color ?? T.textBright, fontSize: '0.75rem', fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { T } from '../../theme';
import { getCurrentAIRACCycle, daysUntilAIRACExpiry } from '../../services/chartService';
import { getActiveNotams } from '../../data/sampleNotams';

/**
 * Portal Dashboard — summary cards for quick situational awareness.
 * Shows AIRAC cycle status, active NOTAMs, compliance status, and fleet summary.
 */
export function Dashboard() {
  const [airac, setAirac] = useState({ cycle: '', daysLeft: 0 });
  const [notamCount, setNotamCount] = useState(0);

  useEffect(() => {
    const { cycle } = getCurrentAIRACCycle();
    setAirac({ cycle, daysLeft: daysUntilAIRACExpiry() });
    setNotamCount(getActiveNotams().length);
  }, []);

  const cards: { label: string; value: string; color: string; sub?: string }[] = [
    { label: 'AIRAC Cycle', value: airac.cycle, color: airac.daysLeft < 5 ? T.red : T.primary, sub: `${airac.daysLeft}d remaining` },
    { label: 'Active NOTAMs', value: String(notamCount), color: notamCount > 0 ? T.amber : T.primary },
    { label: 'Compliance', value: 'CHECK', color: T.primary, sub: 'Run compliance engine' },
    { label: 'Fleet', value: '--', color: T.muted, sub: 'Load fleet data' },
  ];

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '1rem' }}>Portal Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.8rem' }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px',
            padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem',
          }}>
            <span style={{ color: T.muted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            <span style={{ color: c.color, fontSize: '1.3rem', fontWeight: 700 }}>{c.value}</span>
            {c.sub && <span style={{ color: T.muted, fontSize: '0.6rem' }}>{c.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

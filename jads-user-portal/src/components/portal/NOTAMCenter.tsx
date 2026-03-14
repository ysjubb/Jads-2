import React, { useState, useEffect } from 'react';
import { T } from '../../theme';
import { getNotams, formatNotamBriefing } from '../../services/notamService';
import type { NOTAM } from '../../types/charts';

const TYPE_LABELS: Record<string, string> = { N: 'NEW', R: 'REPLACE', C: 'CANCEL' };
const TYPE_COLORS: Record<string, string> = { N: T.primary, R: T.amber, C: T.red };

/**
 * NOTAM center — browse, filter, and generate pre-flight briefings.
 */
export function NOTAMCenter() {
  const [notams, setNotams] = useState<NOTAM[]>([]);
  const [filter, setFilter] = useState('');
  const [briefing, setBriefing] = useState('');

  useEffect(() => {
    getNotams().then(setNotams).catch(() => {});
  }, []);

  const filtered = notams.filter(n =>
    !filter || n.icaoLocation.includes(filter.toUpperCase()) || n.text.toLowerCase().includes(filter.toLowerCase())
  );

  const handleBriefing = () => {
    setBriefing(formatNotamBriefing(filtered));
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>NOTAM Center</h2>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
        <input
          style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
            color: T.textBright, padding: '0.4rem 0.7rem', fontSize: '0.75rem', flex: 1,
          }}
          placeholder="Filter by ICAO code or text..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button
          onClick={handleBriefing}
          style={{
            background: T.primary + '20', border: `1px solid ${T.primary}40`, borderRadius: '4px',
            color: T.primary, padding: '0.4rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Generate Briefing
        </button>
      </div>

      {/* NOTAM list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {filtered.map(n => (
          <div key={n.id} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ color: T.textBright, fontSize: '0.75rem', fontWeight: 600 }}>{n.id}</span>
              <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{ color: T.muted, fontSize: '0.6rem' }}>{n.icaoLocation}</span>
                <span style={{
                  padding: '1px 5px', borderRadius: '2px', fontSize: '0.55rem', fontWeight: 700,
                  background: (TYPE_COLORS[n.type] ?? T.muted) + '20', color: TYPE_COLORS[n.type] ?? T.muted,
                }}>
                  {TYPE_LABELS[n.type] ?? n.type}
                </span>
              </span>
            </div>
            <div style={{ color: T.text, fontSize: '0.7rem', lineHeight: 1.4 }}>{n.text}</div>
            <div style={{ color: T.muted, fontSize: '0.6rem', marginTop: '0.3rem' }}>
              {n.startTime} — {n.endTime}
              {n.radius ? ` | Radius: ${n.radius}NM` : ''}
              {n.qCode ? ` | Q: ${n.qCode}` : ''}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>
            No NOTAMs match the filter
          </div>
        )}
      </div>

      {/* Briefing output */}
      {briefing && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.8rem',
          fontFamily: 'monospace', fontSize: '0.65rem', color: T.text, whiteSpace: 'pre-wrap',
        }}>
          {briefing}
        </div>
      )}
    </div>
  );
}

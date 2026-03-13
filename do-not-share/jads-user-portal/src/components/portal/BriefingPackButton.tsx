import React, { useState } from 'react';
import { T } from '../../theme';
import { formatNotamBriefing } from '../../services/notamService';
import { getCurrentAIRACCycle } from '../../services/chartService';
import { getActiveNotams } from '../../data/sampleNotams';

/**
 * One-click pre-flight briefing pack generator.
 * Compiles NOTAMs, AIRAC status, and weather placeholder into a single briefing.
 */
export function BriefingPackButton({ route, departure }: { route?: string; departure?: string }) {
  const [generated, setGenerated] = useState(false);

  const handleGenerate = () => {
    const notams = departure
      ? getActiveNotams().filter(n => n.icaoLocation === departure)
      : getActiveNotams();
    const { cycle } = getCurrentAIRACCycle();
    const notamBriefing = formatNotamBriefing(notams);

    const briefing = [
      `=== PRE-FLIGHT BRIEFING PACK ===`,
      `Generated: ${new Date().toISOString()}`,
      `AIRAC Cycle: ${cycle}`,
      route ? `Route: ${route}` : '',
      departure ? `Departure: ${departure}` : '',
      '',
      notamBriefing,
      '',
      '=== WEATHER ===',
      'METAR/TAF: Check current weather from authorized source.',
      '',
      '=== END BRIEFING PACK ===',
    ].filter(Boolean).join('\n');

    // Download as text file
    const blob = new Blob([briefing], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `briefing-${departure ?? 'pack'}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerated(true);
    setTimeout(() => setGenerated(false), 3000);
  };

  return (
    <button
      onClick={handleGenerate}
      style={{
        background: generated ? '#22c55e20' : T.primary + '20',
        border: `1px solid ${generated ? '#22c55e40' : T.primary + '40'}`,
        borderRadius: '4px', color: generated ? '#22c55e' : T.primary,
        padding: '0.5rem 1rem', fontSize: '0.75rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.4rem',
      }}
    >
      {generated ? 'Downloaded' : 'Generate Briefing Pack'}
    </button>
  );
}

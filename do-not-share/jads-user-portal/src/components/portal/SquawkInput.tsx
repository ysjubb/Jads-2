import React, { useState } from 'react';
import { T } from '../../theme';
import {
  validateSquawk, isSquawkAssignable, generateRandomSquawk,
  RESERVED_SQUAWKS, INDIA_VFR_CONSPICUITY,
} from '../../utils/transponderUtils';
import type { SquawkValidation } from '../../utils/transponderUtils';

/**
 * Squawk code input with real-time validation.
 * Blocks emergency codes (7500/7600/7700), flags reserved codes,
 * enforces octal-only digits (0-7), and uses India VFR conspicuity 7000.
 */
export function SquawkInput({ onSelect }: { onSelect?: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<SquawkValidation | null>(null);

  const handleChange = (value: string) => {
    const cleaned = value.replace(/[^0-7]/g, '').slice(0, 4);
    setCode(cleaned);
    if (cleaned.length === 4) {
      const result = validateSquawk(cleaned);
      setValidation(result);
    } else {
      setValidation(null);
    }
  };

  const handleRandom = () => {
    const sq = generateRandomSquawk();
    setCode(sq);
    setValidation(validateSquawk(sq));
  };

  const handleVFR = () => {
    setCode(INDIA_VFR_CONSPICUITY);
    setValidation(validateSquawk(INDIA_VFR_CONSPICUITY));
  };

  const handleConfirm = () => {
    if (validation?.valid && onSelect) {
      onSelect(code);
    }
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Squawk Code</h2>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
        <div>
          <input
            style={{
              background: T.bg, border: `1px solid ${validation ? (validation.valid ? '#22c55e' : T.red) : T.border}`,
              borderRadius: '4px', color: T.textBright, padding: '0.6rem 0.8rem',
              fontSize: '1.2rem', fontFamily: 'monospace', width: '6rem', textAlign: 'center',
              letterSpacing: '0.2em',
            }}
            value={code}
            onChange={e => handleChange(e.target.value)}
            placeholder="0000"
            maxLength={4}
          />
          {validation && !validation.valid && (
            <div style={{ color: T.red, fontSize: '0.6rem', marginTop: '0.3rem', maxWidth: '12rem' }}>
              {validation.error}
            </div>
          )}
          {validation?.isReserved && (
            <div style={{ color: T.amber, fontSize: '0.6rem', marginTop: '0.3rem' }}>
              Reserved: {RESERVED_SQUAWKS[code]}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <button onClick={handleVFR} style={btnStyle}>VFR (7000)</button>
          <button onClick={handleRandom} style={btnStyle}>Random</button>
          {validation?.valid && onSelect && (
            <button onClick={handleConfirm} style={{ ...btnStyle, borderColor: '#22c55e40', color: '#22c55e' }}>
              Assign
            </button>
          )}
        </div>
      </div>

      {/* Quick reference */}
      <div style={{ color: T.muted, fontSize: '0.6rem', lineHeight: 1.6 }}>
        <div>Octal digits only (0-7). India VFR conspicuity = 7000.</div>
        <div>Blocked: 7500 (hijack), 7600 (radio failure), 7700 (emergency)</div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${T.border}`, borderRadius: '3px',
  color: T.primary, padding: '0.3rem 0.6rem', fontSize: '0.65rem', cursor: 'pointer',
};

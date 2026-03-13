import React from 'react';
import { T } from '../../theme';
import { getCurrentAIRACCycle, daysUntilAIRACExpiry } from '../../services/chartService';

/**
 * AIRAC cycle banner — shows current cycle and days until expiry.
 * Turns red when <5 days remain.
 */
export function AIRACBanner() {
  const { cycle } = getCurrentAIRACCycle();
  const daysLeft = daysUntilAIRACExpiry();
  const isUrgent = daysLeft < 5;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.4rem 0.8rem', borderRadius: '4px',
      background: isUrgent ? T.red + '15' : T.primary + '10',
      border: `1px solid ${isUrgent ? T.red + '40' : T.primary + '25'}`,
    }}>
      <span style={{ color: T.textBright, fontSize: '0.7rem' }}>
        AIRAC <span style={{ fontWeight: 700 }}>{cycle}</span>
      </span>
      <span style={{
        color: isUrgent ? T.red : T.primary, fontSize: '0.65rem', fontWeight: 600,
      }}>
        {daysLeft}d remaining
      </span>
    </div>
  );
}

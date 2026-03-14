import React from 'react';
import { T } from '../../theme';
import { formatField7, buildField18, detectMilitaryField8 } from '../../utils/aftnFormatter';
import type { FlightPlan } from '../../types/flightPlan';

/**
 * Preview the AFTN message that would be generated for a flight plan.
 * Shows Field 7 formatting, Field 18 auto-population, and military detection.
 */
export function AftnMessagePreview({ plan }: { plan: Partial<FlightPlan> }) {
  if (!plan.callsign) {
    return <div style={{ color: T.muted, fontSize: '0.7rem' }}>Enter a callsign to preview AFTN message</div>;
  }

  const field7 = formatField7(plan.callsign);
  const mil = detectMilitaryField8(field7.callsign);
  const field18 = buildField18({
    reg: plan.callsign,
    dof: new Date().toISOString().slice(2, 10).replace(/-/g, ''),
  });

  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.8rem' }}>
      <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
        AFTN Message Preview
      </div>
      <pre style={{
        color: T.textBright, fontSize: '0.7rem', fontFamily: 'monospace',
        lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap',
      }}>
{`(FPL-${field7.callsign}-${plan.flightRules ?? 'I'}${plan.flightType ?? 'S'}
-${plan.aircraftType ?? 'ZZZZ'}/${plan.equipment ?? 'S'}
-${plan.departureAerodrome ?? 'ZZZZ'}${plan.eobt ?? '0000'}
-${plan.cruisingSpeed ?? 'N0000'}${plan.cruisingLevel ?? 'F000'} ${plan.route ?? 'DCT'}
-${plan.destinationAerodrome ?? 'ZZZZ'}${plan.totalEET ?? '0000'}${plan.alternateAerodrome ? ' ' + plan.alternateAerodrome : ''}
-${field18})`}
      </pre>

      {/* Warnings */}
      {field7.warnings.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {field7.warnings.map((w, i) => (
            <div key={i} style={{ color: T.amber, fontSize: '0.6rem' }}>{w}</div>
          ))}
        </div>
      )}
      {mil.suggestMilitary && (
        <div style={{ color: T.amber, fontSize: '0.6rem', marginTop: '0.3rem' }}>{mil.note}</div>
      )}
    </div>
  );
}

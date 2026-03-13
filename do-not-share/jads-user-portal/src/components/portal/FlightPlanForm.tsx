import React, { useState } from 'react';
import { T } from '../../theme';
import { formatField7, buildField18, autoPopulateField18, detectMilitaryField8 } from '../../utils/aftnFormatter';
import { validateFlightPlan } from '../../services/flightPlanService';
import type { FlightPlan } from '../../types/flightPlan';
import type { ComplianceResult } from '../../types/compliance';

const EMPTY_PLAN: Partial<FlightPlan> = {
  callsign: '', flightRules: 'I', flightType: 'S',
  departureAerodrome: '', destinationAerodrome: '',
  eobt: '', totalEET: '', cruisingLevel: '', cruisingSpeed: '',
  route: '', equipment: '', alternateAerodrome: '',
};

/**
 * ICAO Flight Plan filing form.
 * Auto-formats Field 7 callsign, detects military callsigns,
 * and validates all fields before submission.
 */
export function FlightPlanForm() {
  const [plan, setPlan] = useState<Partial<FlightPlan>>(EMPTY_PLAN);
  const [validationResults, setValidationResults] = useState<ComplianceResult[]>([]);
  const [field7Info, setField7Info] = useState<{ callsign: string; warnings: string[] } | null>(null);

  const update = (field: keyof FlightPlan, value: string) => {
    setPlan(prev => ({ ...prev, [field]: value }));
  };

  const handleCallsignBlur = () => {
    if (!plan.callsign) return;
    const result = formatField7(plan.callsign);
    setField7Info(result);
    setPlan(prev => ({ ...prev, callsign: result.callsign }));

    const mil = detectMilitaryField8(result.callsign);
    if (mil.suggestMilitary && plan.flightType !== 'M') {
      setPlan(prev => ({ ...prev, flightType: 'M' }));
    }
  };

  const handleValidate = () => {
    if (!plan.callsign || !plan.departureAerodrome || !plan.destinationAerodrome) return;
    const results = validateFlightPlan(plan as FlightPlan);
    setValidationResults(results);
  };

  const field18Preview = buildField18(autoPopulateField18({
    registration: plan.callsign,
    departureDate: new Date(),
  }));

  const inputStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
    color: T.textBright, padding: '0.5rem 0.7rem', fontSize: '0.75rem',
    width: '100%', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    color: T.muted, fontSize: '0.65rem', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '0.2rem', display: 'block',
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '1rem' }}>ICAO Flight Plan</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
        {/* Field 7: Callsign */}
        <div>
          <label style={labelStyle}>Field 7 — Aircraft ID</label>
          <input
            style={inputStyle}
            value={plan.callsign ?? ''}
            onChange={e => update('callsign', e.target.value.toUpperCase())}
            onBlur={handleCallsignBlur}
            placeholder="VT-ABC or IGO1234"
            maxLength={7}
          />
          {field7Info?.warnings.map((w, i) => (
            <div key={i} style={{ color: T.amber, fontSize: '0.6rem', marginTop: '0.2rem' }}>{w}</div>
          ))}
        </div>

        {/* Field 8a: Flight Rules */}
        <div>
          <label style={labelStyle}>Field 8a — Flight Rules</label>
          <select style={inputStyle} value={plan.flightRules ?? 'I'} onChange={e => update('flightRules', e.target.value)}>
            <option value="I">I — IFR</option>
            <option value="V">V — VFR</option>
            <option value="Y">Y — IFR then VFR</option>
            <option value="Z">Z — VFR then IFR</option>
          </select>
        </div>

        {/* Field 8b: Flight Type */}
        <div>
          <label style={labelStyle}>Field 8b — Type of Flight</label>
          <select style={inputStyle} value={plan.flightType ?? 'S'} onChange={e => update('flightType', e.target.value)}>
            <option value="S">S — Scheduled</option>
            <option value="N">N — Non-scheduled</option>
            <option value="G">G — General aviation</option>
            <option value="M">M — Military</option>
            <option value="X">X — Other</option>
          </select>
        </div>

        {/* Field 13: Departure */}
        <div>
          <label style={labelStyle}>Field 13 — Departure</label>
          <input style={inputStyle} value={plan.departureAerodrome ?? ''} onChange={e => update('departureAerodrome', e.target.value.toUpperCase())} placeholder="VIDP" maxLength={4} />
        </div>

        {/* Field 16: Destination */}
        <div>
          <label style={labelStyle}>Field 16 — Destination</label>
          <input style={inputStyle} value={plan.destinationAerodrome ?? ''} onChange={e => update('destinationAerodrome', e.target.value.toUpperCase())} placeholder="VABB" maxLength={4} />
        </div>

        {/* EOBT */}
        <div>
          <label style={labelStyle}>EOBT (HHMM UTC)</label>
          <input style={inputStyle} value={plan.eobt ?? ''} onChange={e => update('eobt', e.target.value)} placeholder="0930" maxLength={4} />
        </div>

        {/* EET */}
        <div>
          <label style={labelStyle}>Total EET (HHMM)</label>
          <input style={inputStyle} value={plan.totalEET ?? ''} onChange={e => update('totalEET', e.target.value)} placeholder="0145" maxLength={4} />
        </div>

        {/* Cruising Level */}
        <div>
          <label style={labelStyle}>Cruising Level</label>
          <input style={inputStyle} value={plan.cruisingLevel ?? ''} onChange={e => update('cruisingLevel', e.target.value.toUpperCase())} placeholder="F350" />
        </div>

        {/* Equipment */}
        <div>
          <label style={labelStyle}>Field 10 — Equipment</label>
          <input style={inputStyle} value={plan.equipment ?? ''} onChange={e => update('equipment', e.target.value.toUpperCase())} placeholder="SDFGHIRWY/LB1" />
        </div>
      </div>

      {/* Route */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Field 15 — Route</label>
        <textarea
          style={{ ...inputStyle, minHeight: '3rem', resize: 'vertical' }}
          value={plan.route ?? ''}
          onChange={e => update('route', e.target.value.toUpperCase())}
          placeholder="AGRAS UR460 GUDUM"
        />
      </div>

      {/* Field 18 preview */}
      {field18Preview !== '0' && (
        <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem', marginBottom: '1rem' }}>
          <span style={{ color: T.muted, fontSize: '0.6rem' }}>Field 18 (auto):</span>
          <div style={{ color: T.text, fontSize: '0.7rem', fontFamily: 'monospace', marginTop: '0.2rem' }}>{field18Preview}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
        <button
          onClick={handleValidate}
          style={{
            background: T.primary + '20', border: `1px solid ${T.primary}40`, borderRadius: '4px',
            color: T.primary, padding: '0.5rem 1rem', fontSize: '0.75rem', cursor: 'pointer',
          }}
        >
          Validate
        </button>
      </div>

      {/* Validation results */}
      {validationResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {validationResults.map((r, i) => (
            <div key={i} style={{
              fontSize: '0.7rem', padding: '0.3rem 0.5rem', borderRadius: '3px',
              background: r.status === 'PASS' ? '#22c55e10' : r.status === 'FAIL' ? '#ef444410' : '#eab30810',
              color: r.status === 'PASS' ? '#22c55e' : r.status === 'FAIL' ? T.red : T.amber,
            }}>
              [{r.status}] {r.ruleId}: {r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { T } from '../../theme';
import { runDroneCompliance, runAircraftCompliance } from '../../services/complianceEngine';
import { DRONE_RULES, AIRCRAFT_RULES } from '../../data/complianceRules';
import type { ComplianceResult, OverallStatus } from '../../types/compliance';

const STATUS_COLORS: Record<string, string> = {
  PASS: '#22c55e', FAIL: '#ef4444', WARNING: '#eab308', NOT_APPLICABLE: T.muted,
};

const OVERALL_COLORS: Record<OverallStatus, string> = {
  COMPLIANT: '#22c55e', NON_COMPLIANT: '#ef4444', WARNINGS: '#eab308',
};

/**
 * Compliance checklist — run drone or aircraft compliance checks
 * against DGCA/ICAO rules and display results.
 */
export function ComplianceChecklist() {
  const [mode, setMode] = useState<'DRONE' | 'AIRCRAFT'>('DRONE');
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [overall, setOverall] = useState<OverallStatus | null>(null);

  const handleRunDrone = () => {
    // Demo run with sample DroneMission
    const report = runDroneCompliance({
      id: 'demo-drone-001',
      droneUIN: 'UA-12345678',
      pilotRPL: 'RPL-DEMO-001',
      missionType: 'VLOS',
      operationZone: {
        id: 'zone-demo', name: 'Demo Green Zone', type: 'GREEN',
        boundary: [], altitudeFloor: 0, altitudeCeiling: 400,
      },
      altitude: 100,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      npntRequired: true,
      status: 'PLANNED',
    });
    setResults(report.results);
    setOverall(report.overallStatus);
  };

  const handleRunAircraft = () => {
    const report = runAircraftCompliance({
      id: 'demo-fpl-001',
      callsign: 'VTABC',
      aircraftType: 'B738',
      departureAerodrome: 'VIDP',
      destinationAerodrome: 'VABB',
      route: 'AGRAS UR460 GUDUM',
      cruisingLevel: 'F350',
      cruisingSpeed: 'N0450',
      eobt: '0930',
      totalEET: '0145',
      flightRules: 'I',
      flightType: 'S',
      equipment: 'SDFGHIRWY/LB1',
      surveillance: 'B1',
      field18Remarks: '',
      status: 'DRAFT',
    });
    setResults(report.results);
    setOverall(report.overallStatus);
  };

  const rules = mode === 'DRONE' ? DRONE_RULES : AIRCRAFT_RULES;

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Compliance Engine</h2>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['DRONE', 'AIRCRAFT'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setResults([]); setOverall(null); }}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer',
              background: mode === m ? T.primary + '25' : 'transparent',
              border: `1px solid ${mode === m ? T.primary : T.border}`,
              color: mode === m ? T.primary : T.muted,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={{ color: T.muted, fontSize: '0.65rem' }}>{rules.length} rules loaded</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
          {rules.map(r => {
            const result = results.find(res => res.ruleId === r.id);
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem',
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
              }}>
                {result ? (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STATUS_COLORS[result.status], flexShrink: 0,
                  }} />
                ) : (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1px solid ${T.muted}`, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textBright, fontSize: '0.7rem' }}>{r.name}</div>
                  <div style={{ color: T.muted, fontSize: '0.6rem' }}>{r.regulation}</div>
                </div>
                <span style={{
                  fontSize: '0.55rem', padding: '1px 4px', borderRadius: '2px',
                  color: r.severity === 'CRITICAL' ? T.red : r.severity === 'HIGH' ? T.amber : T.muted,
                  background: (r.severity === 'CRITICAL' ? T.red : r.severity === 'HIGH' ? T.amber : T.muted) + '15',
                }}>
                  {r.severity}
                </span>
                {result && <span style={{ color: STATUS_COLORS[result.status], fontSize: '0.6rem', fontWeight: 600 }}>{result.status}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={mode === 'DRONE' ? handleRunDrone : handleRunAircraft}
        style={{
          background: T.primary + '20', border: `1px solid ${T.primary}40`, borderRadius: '4px',
          color: T.primary, padding: '0.5rem 1.2rem', fontSize: '0.75rem', cursor: 'pointer',
        }}
      >
        Run {mode} Compliance Check
      </button>

      {/* Overall status */}
      {overall && (
        <div style={{
          marginTop: '0.8rem', padding: '0.5rem 0.8rem', borderRadius: '4px',
          background: OVERALL_COLORS[overall] + '15', border: `1px solid ${OVERALL_COLORS[overall]}40`,
          color: OVERALL_COLORS[overall], fontSize: '0.8rem', fontWeight: 700,
        }}>
          {overall}
        </div>
      )}
    </div>
  );
}

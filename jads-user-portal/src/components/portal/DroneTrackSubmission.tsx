import React, { useState, useCallback } from 'react';
import { T } from '../../theme';
import { detectLogFormat, parseDJICSV, convertDJIToTrack, parseNPNTFromFile } from '../../services/djiLogParser';
import { parseNPNTLog } from '../../services/npntService';
import type { FlightLogFormat, NPNTLogEntry, DJILogEntry } from '../../types/npnt';

/**
 * Drone flight log upload and NPNT validation.
 * Supports DJI CSV, NPNT JSON, and flags DJI binary for server-side decode.
 * CRITICAL: NPNT logs are event-based ONLY — never resample or interpolate.
 */
export function DroneTrackSubmission() {
  const [format, setFormat] = useState<FlightLogFormat | null>(null);
  const [npntEntries, setNpntEntries] = useState<NPNTLogEntry[]>([]);
  const [djiEntries, setDjiEntries] = useState<DJILogEntry[]>([]);
  const [validationMsg, setValidationMsg] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const detected = detectLogFormat(text);
      setFormat(detected);
      setValidationMsg([]);

      if (detected === 'NPNT_JSON') {
        try {
          const entries = parseNPNTFromFile(text);
          setNpntEntries(entries);
          setDjiEntries([]);

          // Validate events
          const parsed = parseNPNTLog(text);
          const msgs: string[] = [`Parsed ${parsed.length} NPNT events`];
          const hasArm = parsed.some(e => e.entryType === 'ARM');
          const hasDisarm = parsed.some(e => e.entryType === 'DISARM');
          if (!hasArm) msgs.push('WARNING: No ARM event found');
          if (!hasDisarm) msgs.push('WARNING: No DISARM event found');
          const breaches = parsed.filter(e => e.entryType === 'GEOFENCE_BREACH' || e.entryType === 'TIME_BREACH');
          if (breaches.length > 0) msgs.push(`ALERT: ${breaches.length} breach event(s) detected`);
          setValidationMsg(msgs);
        } catch (err) {
          setValidationMsg([`Parse error: ${err instanceof Error ? err.message : 'Unknown'}`]);
        }
      } else if (detected === 'DJI_CSV') {
        const entries = parseDJICSV(text);
        setDjiEntries(entries);
        setNpntEntries([]);
        const track = convertDJIToTrack(entries);
        setValidationMsg([
          `Parsed ${entries.length} rows, ${track.length} valid GPS points`,
          'DJI CSV — can be resampled for visualization',
        ]);
      } else {
        setValidationMsg(['DJI binary (.txt) detected — must upload to server for decoding']);
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Drone Track Submission</h2>

      {/* Upload area */}
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: `2px dashed ${T.border}`, borderRadius: '6px', padding: '2rem', cursor: 'pointer',
        background: T.surface, marginBottom: '1rem',
      }}>
        <span style={{ color: T.primary, fontSize: '0.8rem', marginBottom: '0.3rem' }}>
          {fileName || 'Click to upload flight log'}
        </span>
        <span style={{ color: T.muted, fontSize: '0.65rem' }}>
          Supports: NPNT JSON, DJI AirData CSV, DJI Binary (.txt)
        </span>
        <input type="file" accept=".json,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
      </label>

      {/* Format badge */}
      {format && (
        <div style={{ marginBottom: '0.8rem' }}>
          <span style={{
            padding: '0.3rem 0.6rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
            background: format === 'NPNT_JSON' ? '#22c55e20' : format === 'DJI_CSV' ? T.primary + '20' : T.amber + '20',
            color: format === 'NPNT_JSON' ? '#22c55e' : format === 'DJI_CSV' ? T.primary : T.amber,
          }}>
            {format.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Validation messages */}
      {validationMsg.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.6rem' }}>
          {validationMsg.map((msg, i) => (
            <div key={i} style={{
              fontSize: '0.7rem', padding: '0.2rem 0',
              color: msg.startsWith('ALERT') ? T.red : msg.startsWith('WARNING') ? T.amber : T.text,
            }}>
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* NPNT event table */}
      {npntEntries.length > 0 && (
        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted }}>
                <th style={{ padding: '0.3rem', textAlign: 'left' }}>Event</th>
                <th style={{ padding: '0.3rem', textAlign: 'left' }}>Timestamp</th>
                <th style={{ padding: '0.3rem', textAlign: 'left' }}>Lat</th>
                <th style={{ padding: '0.3rem', textAlign: 'left' }}>Lng</th>
                <th style={{ padding: '0.3rem', textAlign: 'left' }}>Alt</th>
              </tr>
            </thead>
            <tbody>
              {npntEntries.slice(0, 50).map((e, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}10` }}>
                  <td style={{ padding: '0.3rem', color: e.entryType.includes('BREACH') ? T.red : T.primary, fontWeight: 600 }}>{e.entryType}</td>
                  <td style={{ padding: '0.3rem' }}>{new Date(e.timeStamp).toISOString()}</td>
                  <td style={{ padding: '0.3rem' }}>{e.latitude?.toFixed(5)}</td>
                  <td style={{ padding: '0.3rem' }}>{e.longitude?.toFixed(5)}</td>
                  <td style={{ padding: '0.3rem' }}>{e.altitude}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DJI track summary */}
      {djiEntries.length > 0 && (
        <div style={{ marginTop: '1rem', color: T.text, fontSize: '0.7rem' }}>
          <p>Track: {djiEntries.length} data points</p>
          <p>First: {djiEntries[0].timestamp} | Last: {djiEntries[djiEntries.length - 1].timestamp}</p>
          <p>Max altitude: {Math.max(...djiEntries.map(e => e.altitude)).toFixed(1)}m</p>
        </div>
      )}
    </div>
  );
}

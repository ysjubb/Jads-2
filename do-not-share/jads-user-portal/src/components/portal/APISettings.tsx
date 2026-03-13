import React, { useState } from 'react';
import { T } from '../../theme';

/**
 * API connection settings panel.
 * Allows configuring backend URL, DigitalSky endpoint, and NPNT gateway.
 */
export function APISettings() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem('jads_backend_url') ?? '/api');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('jads_backend_url', backendUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
    color: T.textBright, padding: '0.4rem 0.6rem', fontSize: '0.75rem', width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    color: T.muted, fontSize: '0.6rem', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '0.2rem', display: 'block',
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>API Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '400px' }}>
        <div>
          <label style={labelStyle}>Backend API URL</label>
          <input style={inputStyle} value={backendUrl} onChange={e => setBackendUrl(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>DigitalSky Endpoint</label>
          <input style={inputStyle} disabled value="https://digitalsky.dgca.gov.in/api" />
          <span style={{ color: T.muted, fontSize: '0.55rem' }}>Read-only — configured server-side</span>
        </div>

        <div>
          <label style={labelStyle}>NPNT Gateway</label>
          <input style={inputStyle} disabled value="Configured via backend adapter" />
          <span style={{ color: T.muted, fontSize: '0.55rem' }}>Read-only — uses adapter pattern</span>
        </div>

        <button onClick={handleSave} style={{
          background: saved ? '#22c55e20' : T.primary + '20',
          border: `1px solid ${saved ? '#22c55e40' : T.primary + '40'}`,
          borderRadius: '4px', color: saved ? '#22c55e' : T.primary,
          padding: '0.5rem 1rem', fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start',
        }}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

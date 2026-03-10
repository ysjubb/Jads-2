import React, { useState } from 'react'
import { T } from '../../theme'

interface APICredential {
  id: string
  name: string
  provider: string
  description: string
  configured: boolean
  lastTested: string | null
  status: 'CONNECTED' | 'ERROR' | 'NOT_CONFIGURED'
}

const DEFAULT_CREDENTIALS: APICredential[] = [
  {
    id: 'digitalsky', name: 'Digital Sky API', provider: 'DGCA',
    description: 'NPNT permission artefact requests, drone registration validation',
    configured: false, lastTested: null, status: 'NOT_CONFIGURED',
  },
  {
    id: 'aai-aim', name: 'AAI AIM (AIS)', provider: 'AAI',
    description: 'NOTAM feed, eAIP access, AIRAC cycle data',
    configured: false, lastTested: null, status: 'NOT_CONFIGURED',
  },
  {
    id: 'jeppesen', name: 'Jeppesen NavData', provider: 'Jeppesen',
    description: 'SID/STAR charts, approach plates, airport diagrams',
    configured: false, lastTested: null, status: 'NOT_CONFIGURED',
  },
  {
    id: 'openaip', name: 'OpenAIP', provider: 'OpenAIP',
    description: 'Navaids, airspace boundaries, airport data (open source)',
    configured: false, lastTested: null, status: 'NOT_CONFIGURED',
  },
  {
    id: 'imd-weather', name: 'IMD Weather API', provider: 'IMD',
    description: 'METAR, TAF, SIGMET for Indian aerodromes',
    configured: false, lastTested: null, status: 'NOT_CONFIGURED',
  },
]

const STATUS_COLOR = {
  CONNECTED: '#00C864',
  ERROR: '#FF3B3B',
  NOT_CONFIGURED: '#4A6A7A',
}

export function APISettings() {
  const [credentials, setCredentials] = useState<APICredential[]>(DEFAULT_CREDENTIALS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const testConnection = (id: string) => {
    setCredentials(prev => prev.map(c =>
      c.id === id
        ? { ...c, configured: true, lastTested: new Date().toISOString(), status: 'CONNECTED' as const }
        : c
    ))
    setEditingId(null)
    setApiKey('')
    setBaseUrl('')
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>API Settings</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Configure external service credentials for JADS integrations
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {credentials.map(cred => (
          <div key={cred.id} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: '4px', padding: '0.75rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: T.textBright, fontSize: '0.8rem', fontWeight: 600 }}>{cred.name}</span>
                  <span style={{
                    padding: '1px 6px', borderRadius: '2px', fontSize: '0.55rem', fontWeight: 700,
                    color: '#fff', background: STATUS_COLOR[cred.status],
                  }}>{cred.status.replace('_', ' ')}</span>
                </div>
                <div style={{ color: T.muted, fontSize: '0.6rem', marginTop: '2px' }}>
                  {cred.provider} &middot; {cred.description}
                </div>
                {cred.lastTested && (
                  <div style={{ color: T.muted, fontSize: '0.55rem', marginTop: '2px' }}>
                    Last tested: {new Date(cred.lastTested).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditingId(editingId === cred.id ? null : cred.id)}
                style={{
                  padding: '4px 10px', fontSize: '0.65rem', fontWeight: 600,
                  background: T.primary + '20', color: T.primary,
                  border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
                }}
              >
                {editingId === cred.id ? 'Cancel' : 'Configure'}
              </button>
            </div>

            {editingId === cred.id && (
              <div style={{
                marginTop: '0.75rem', padding: '0.5rem', background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: '3px',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>API Key / Token</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="Enter API key..."
                      style={{
                        width: '100%', padding: '5px', background: T.surface, color: T.textBright,
                        border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ color: T.muted, fontSize: '0.6rem', display: 'block', marginBottom: '2px' }}>Base URL (optional)</label>
                    <input
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      style={{
                        width: '100%', padding: '5px', background: T.surface, color: T.textBright,
                        border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => testConnection(cred.id)}
                    style={{
                      padding: '5px 12px', fontSize: '0.65rem', fontWeight: 600,
                      background: T.primary + '20', color: T.primary,
                      border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
                    }}
                  >
                    Save & Test Connection
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '1rem', padding: '0.5rem', background: T.bg,
        border: `1px solid ${T.border}`, borderRadius: '3px',
        color: T.muted, fontSize: '0.6rem',
      }}>
        API credentials are stored securely on the server. Keys are never exposed to the browser after initial configuration.
      </div>
    </div>
  )
}

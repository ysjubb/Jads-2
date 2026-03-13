import React, { useEffect, useState } from 'react'
import { useAuditAuth } from '../hooks/useAuditAuth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB800',
  green:      '#00FF88',
  amber:      '#FFD600',
  red:        '#FF3B3B',
  muted:      '#6A6040',
  text:       '#c8b890',
  textBright: '#e8d8b0',
  mono:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
}

interface AdapterEntry {
  id: string; name: string; status: 'LIVE' | 'STUB'; reason: string | null
}

export function AdapterStatusPage() {
  const { token } = useAuditAuth()
  const [adapters, setAdapters] = useState<AdapterEntry[]>([])
  const [useLive, setUseLive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/system/adapter-status`, {
      headers: { 'X-JADS-Version': '4.0' },
    })
      .then(r => r.json())
      .then(data => {
        setAdapters(data.adapters ?? [])
        setUseLive(data.useLiveAdapters ?? false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const liveInternalIds = ['hash_chain', 'npnt_pa_builder', 'forensic_verify', 'aftn_builder', 'clearance_sse']
  const externalAdapters = adapters.filter(a => !liveInternalIds.includes(a.id))
  const allExternalStubs = externalAdapters.length > 0 && externalAdapters.every(a => a.status === 'STUB')

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <div style={{
        fontFamily: T.mono, fontSize: '0.85rem', fontWeight: 700,
        color: T.primary, letterSpacing: '0.1em', marginBottom: '1rem',
      }}>
        [ ADAPTER STATUS ]
      </div>

      {loading ? (
        <div style={{ color: T.muted, fontSize: '0.75rem' }}>Loading adapter status...</div>
      ) : (
        <div>
          {allExternalStubs && (
            <div style={{
              padding: '0.5rem 0.75rem', marginBottom: '0.75rem', borderRadius: '4px',
              background: T.amber + '10', border: `1px solid ${T.amber}40`,
              color: T.amber, fontSize: '0.7rem', fontWeight: 600, fontFamily: T.mono,
            }}>
              DEMO MODE — All external integrations use stubs. Government credentials required for live operation.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {adapters.map(a => {
              const isLive = a.status === 'LIVE'
              const dotColor = isLive ? T.green : T.amber
              const labelColor = isLive ? T.green : T.amber
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.6rem', fontSize: '0.75rem',
                  background: T.surface, borderRadius: '3px',
                  border: `1px solid ${T.border}`,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: dotColor, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: T.mono, fontWeight: 700, fontSize: '0.65rem',
                    color: labelColor, width: 40,
                  }}>
                    {a.status}
                  </span>
                  <span style={{ color: T.textBright, flex: 1 }}>{a.name}</span>
                  {a.status === 'STUB' && a.reason && (
                    <span style={{ color: T.muted, fontSize: '0.65rem', fontStyle: 'italic' }}>
                      {a.reason}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

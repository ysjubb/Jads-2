import React, { useState } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useAuditAuth }   from '../hooks/useAuditAuth'

const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB800',
  green:      '#00FF88',
  red:        '#FF3B3B',
  muted:      '#6A6040',
  text:       '#c8b890',
  textBright: '#e8d8b0',
}

export function AuditLoginPage() {
  const { login, error, loading } = useAuditAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(username, password)
    if (ok) navigate('/missions')
  }

  return (
    <div style={{
      display:'flex', justifyContent:'center', alignItems:'center',
      minHeight:'100vh', background: T.bg
    }}>
      <div style={{
        background: T.surface, padding:'2rem', borderRadius:'8px',
        width:'360px', boxShadow: `0 2px 24px rgba(255,184,0,0.08)`,
        border: `1px solid ${T.border}`
      }}>
        <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
          <div style={{ fontSize:'1.5rem', fontWeight:700, color: T.primary,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>JADS</div>
          <div style={{ fontSize:'0.9rem', color: T.muted,
            fontFamily: "'JetBrains Mono', monospace" }}>Forensic Audit Portal</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'1rem' }}>
            <label style={{ display:'block', marginBottom:'0.25rem',
              fontWeight:500, fontSize:'0.875rem', color: T.text,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Username
            </label>
            <input
              type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              required autoFocus disabled={loading}
              placeholder="e.g. dgca.admin"
              style={{ width:'100%', padding:'0.5rem', border: `1px solid ${T.border}`,
                borderRadius:'4px', boxSizing:'border-box', fontSize:'0.9rem',
                background: T.surface, color: T.textBright,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom:'1.5rem' }}>
            <label style={{ display:'block', marginBottom:'0.25rem',
              fontWeight:500, fontSize:'0.875rem', color: T.text,
              fontFamily: "'JetBrains Mono', monospace" }}>
              Password
            </label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              required disabled={loading}
              style={{ width:'100%', padding:'0.5rem', border: `1px solid ${T.border}`,
                borderRadius:'4px', boxSizing:'border-box', fontSize:'0.9rem',
                background: T.surface, color: T.textBright,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ background: T.red + '15', border: `1px solid ${T.red}40`,
              color: T.red, padding:'0.5rem 0.75rem', borderRadius:'4px',
              marginBottom:'1rem', fontSize:'0.875rem',
              fontFamily: "'JetBrains Mono', monospace" }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{ width:'100%', padding:'0.6rem',
              background: loading ? T.muted : T.primary, color: T.bg,
              border:'none', borderRadius:'4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize:'1rem', fontWeight:600,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop:'1.25rem', padding:'0.75rem', background: T.primary + '15',
          border: `1px solid ${T.primary}30`, borderRadius:'4px', fontSize:'0.75rem', color: T.primary,
          fontFamily: "'JetBrains Mono', monospace" }}>
          <strong>Audit access is read-only.</strong> All access is logged to the
          immutable audit trail. Sessions expire after 2 hours.
        </div>
      </div>
    </div>
  )
}

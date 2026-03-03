import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../hooks/useAdminAuth'

const T = {
  bg:       '#050A08',
  surface:  '#0A120E',
  border:   '#1A3020',
  primary:  '#00FF88',
  amber:    '#FFB800',
  red:      '#FF3B3B',
  muted:    '#4A7A5A',
  text:     '#b0c8b8',
  textBright: '#d0e8d8',
}

export function LoginPage() {
  const { login, error, loading } = useAdminAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(username, password)
    if (ok) navigate('/')
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: T.bg
    }}>
      <div style={{
        background: T.surface, padding: '2rem', borderRadius: '8px',
        width: '360px', boxShadow: `0 2px 12px rgba(0,255,136,0.08)`,
        border: `1px solid ${T.border}`
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: T.primary }}>JADS</div>
          <div style={{ fontSize: '0.9rem', color: T.muted }}>Government Admin Portal</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.875rem', color: T.text }}>
              Username
            </label>
            <input
              type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              required autoFocus disabled={loading}
              style={{
                width: '100%', padding: '0.5rem',
                border: `1px solid ${T.border}`, borderRadius: '4px',
                boxSizing: 'border-box', fontSize: '0.9rem',
                background: T.surface, color: T.text
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.875rem', color: T.text }}>
              Password
            </label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              required disabled={loading}
              style={{
                width: '100%', padding: '0.5rem',
                border: `1px solid ${T.border}`, borderRadius: '4px',
                boxSizing: 'border-box', fontSize: '0.9rem',
                background: T.surface, color: T.text
              }}
            />
          </div>

          {error && (
            <div style={{
              background: T.red + '15', border: `1px solid ${T.red}`, color: T.red,
              padding: '0.5rem 0.75rem', borderRadius: '4px',
              marginBottom: '1rem', fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '0.6rem',
              background: loading ? T.muted : T.primary, color: T.bg,
              border: 'none', borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem', fontWeight: 500
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.75rem', color: T.muted }}>
          Sessions expire after 2 hours
        </div>
      </div>
    </div>
  )
}

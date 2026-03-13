import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { T } from '../theme'

export function LoginPage() {
  const { error, loading, loginStep, pendingUserId, loginInitiate, loginComplete, loginSpecial } = useAuth()
  const [mode, setMode]       = useState<'CIVILIAN' | 'SPECIAL'>('CIVILIAN')
  const [identifier, setId]   = useState('')
  const [otp, setOtp]         = useState('')
  const [username, setUser]   = useState('')
  const [password, setPass]   = useState('')

  const handleCivilianStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (identifier.trim()) await loginInitiate(identifier.trim())
  }

  const handleCivilianStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pendingUserId && otp.trim()) await loginComplete(pendingUserId, otp.trim())
  }

  const handleSpecialLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim() && password) await loginSpecial(username.trim(), password)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.8rem', background: T.surface, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem',
  }
  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem', background: T.primary, color: T.bg, border: 'none',
    borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: T.bg }}>
      <div style={{ width: '380px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '2rem' }}>
        <h1 style={{ color: T.primary, fontSize: '1.2rem', textAlign: 'center', marginBottom: '0.3rem' }}>JADS</h1>
        <p style={{ color: T.muted, fontSize: '0.65rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          Joint Airspace Defence System — User Portal v4.0
        </p>

        {/* Tab toggle */}
        <div style={{ display: 'flex', marginBottom: '1rem', gap: '2px' }}>
          {(['CIVILIAN', 'SPECIAL'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '0.5rem', border: `1px solid ${T.border}`, borderRadius: '4px',
                background: mode === m ? T.primary + '15' : 'transparent',
                color: mode === m ? T.primary : T.muted,
                cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
              }}>
              {m === 'CIVILIAN' ? 'Civilian (OTP)' : 'Unit Login'}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: T.red + '15', border: `1px solid ${T.red}30`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', color: T.red, fontSize: '0.7rem' }}>
            {error}
          </div>
        )}

        {mode === 'CIVILIAN' ? (
          loginStep === 'IDLE' || loginStep === 'DONE' ? (
            <form onSubmit={handleCivilianStep1} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <label style={{ fontSize: '0.7rem', color: T.muted }}>Email or Mobile Number</label>
              <input value={identifier} onChange={e => setId(e.target.value)} placeholder="+919800000001 or pilot@email.com" style={inputStyle} />
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Sending OTP...' : 'Send OTP'}</button>
            </form>
          ) : (
            <form onSubmit={handleCivilianStep2} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <p style={{ fontSize: '0.7rem', color: T.primary }}>OTP sent. Check your email/phone.</p>
              <label style={{ fontSize: '0.7rem', color: T.muted }}>Enter OTP</label>
              <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" style={inputStyle} maxLength={6} />
              <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
            </form>
          )
        ) : (
          <form onSubmit={handleSpecialLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <label style={{ fontSize: '0.7rem', color: T.muted }}>Username</label>
            <input value={username} onChange={e => setUser(e.target.value)} placeholder="unit.username" style={inputStyle} />
            <label style={{ fontSize: '0.7rem', color: T.muted }}>Password</label>
            <input value={password} onChange={e => setPass(e.target.value)} type="password" placeholder="********" style={inputStyle} />
            <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Logging in...' : 'Login'}</button>
          </form>
        )}
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useAuditAuth }   from '../hooks/useAuditAuth'

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
      minHeight:'100vh', background:'#f0f2f5'
    }}>
      <div style={{
        background:'white', padding:'2rem', borderRadius:'8px',
        width:'360px', boxShadow:'0 2px 12px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
          <div style={{ fontSize:'1.5rem', fontWeight:700, color:'#262626' }}>JADS</div>
          <div style={{ fontSize:'0.9rem', color:'#8c8c8c' }}>Forensic Audit Portal</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'1rem' }}>
            <label style={{ display:'block', marginBottom:'0.25rem',
              fontWeight:500, fontSize:'0.875rem' }}>
              Username
            </label>
            <input
              type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              required autoFocus disabled={loading}
              placeholder="e.g. dgca.admin"
              style={{ width:'100%', padding:'0.5rem', border:'1px solid #d9d9d9',
                borderRadius:'4px', boxSizing:'border-box', fontSize:'0.9rem' }}
            />
          </div>

          <div style={{ marginBottom:'1.5rem' }}>
            <label style={{ display:'block', marginBottom:'0.25rem',
              fontWeight:500, fontSize:'0.875rem' }}>
              Password
            </label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              required disabled={loading}
              style={{ width:'100%', padding:'0.5rem', border:'1px solid #d9d9d9',
                borderRadius:'4px', boxSizing:'border-box', fontSize:'0.9rem' }}
            />
          </div>

          {error && (
            <div style={{ background:'#fff2f0', border:'1px solid #ffccc7',
              color:'#cf1322', padding:'0.5rem 0.75rem', borderRadius:'4px',
              marginBottom:'1rem', fontSize:'0.875rem' }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{ width:'100%', padding:'0.6rem',
              background: loading ? '#69c0ff' : '#262626', color:'white',
              border:'none', borderRadius:'4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize:'1rem', fontWeight:500 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop:'1.25rem', padding:'0.75rem', background:'#fffbe6',
          border:'1px solid #ffe58f', borderRadius:'4px', fontSize:'0.75rem', color:'#614700' }}>
          <strong>Audit access is read-only.</strong> All access is logged to the
          immutable audit trail. Sessions expire after 2 hours.
        </div>
      </div>
    </div>
  )
}

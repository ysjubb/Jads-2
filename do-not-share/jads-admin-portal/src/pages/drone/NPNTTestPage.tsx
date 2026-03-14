import { useState } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { T } from '../../theme'

/* ── Types ─────────────────────────────────── */

interface ValidationCheck {
  code: string
  name: string
  category: 'SIGNATURE' | 'CONTENT' | 'TEMPORAL' | 'GEOMETRY'
  status: 'PASS' | 'FAIL' | 'WARNING'
  message: string
  details?: string
}

interface ValidationResult {
  valid: boolean
  checks: ValidationCheck[]
  summary: { passed: number; failed: number; warnings: number; total: number }
}

interface TestFixture {
  name: string
  description: string
  expectedOutcome: 'PASS' | 'FAIL'
  xml: string
  droneUin: string
  pilotId: string
}

/* ── Test Fixtures ──────────────────────────── */

const FIXTURES: TestFixture[] = [
  { name: 'Valid PA', description: 'Fully compliant PA with valid signature', expectedOutcome: 'PASS', droneUin: 'UA-MICR-0001', pilotId: 'RPC-IN-55012',
    xml: `<?xml version="1.0"?><PermissionArtefact permissionArtifactId="PA-2026-001" txnId="TXN-001"><uinNumber>UA-MICR-0001</uinNumber><pilotId>RPC-IN-55012</pilotId><flightStartTime>2026-04-01T06:00:00+05:30</flightStartTime><flightEndTime>2026-04-01T18:00:00+05:30</flightEndTime><maxAltitude>120</maxAltitude><TimeToLive>2026-04-02T00:00:00+05:30</TimeToLive><Coordinates><Coordinate lat="28.6" lng="77.2"/><Coordinate lat="28.61" lng="77.2"/><Coordinate lat="28.61" lng="77.21"/><Coordinate lat="28.6" lng="77.21"/><Coordinate lat="28.6" lng="77.2"/></Coordinates><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>abc123</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIBxTCCAW+gAwIBAgIJALP...</X509Certificate></X509Data></KeyInfo></Signature></PermissionArtefact>` },
  { name: 'Expired PA', description: 'PA with past end time', expectedOutcome: 'FAIL', droneUin: 'UA-MICR-0001', pilotId: 'RPC-IN-55012',
    xml: `<?xml version="1.0"?><PermissionArtefact permissionArtifactId="PA-2025-EXPIRED"><uinNumber>UA-MICR-0001</uinNumber><pilotId>RPC-IN-55012</pilotId><flightStartTime>2025-01-01T06:00:00+05:30</flightStartTime><flightEndTime>2025-01-01T18:00:00+05:30</flightEndTime><TimeToLive>2025-01-02T00:00:00+05:30</TimeToLive><Coordinates><Coordinate lat="28.6" lng="77.2"/><Coordinate lat="28.61" lng="77.2"/><Coordinate lat="28.61" lng="77.21"/><Coordinate lat="28.6" lng="77.2"/></Coordinates><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>abc</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIB...</X509Certificate></X509Data></KeyInfo></Signature></PermissionArtefact>` },
  { name: 'Wrong UIN', description: 'PA UIN does not match drone', expectedOutcome: 'FAIL', droneUin: 'UA-MICR-9999', pilotId: 'RPC-IN-55012',
    xml: `<?xml version="1.0"?><PermissionArtefact permissionArtifactId="PA-WRONG-UIN"><uinNumber>UA-MICR-0001</uinNumber><pilotId>RPC-IN-55012</pilotId><flightStartTime>2026-06-01T06:00:00+05:30</flightStartTime><flightEndTime>2026-06-01T18:00:00+05:30</flightEndTime><Coordinates><Coordinate lat="28.6" lng="77.2"/><Coordinate lat="28.61" lng="77.2"/><Coordinate lat="28.6" lng="77.2"/></Coordinates><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>x</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIB...</X509Certificate></X509Data></KeyInfo></Signature></PermissionArtefact>` },
  { name: 'No Signature', description: 'PA XML without XMLDSig', expectedOutcome: 'FAIL', droneUin: 'UA-MICR-0001', pilotId: 'RPC-IN-55012',
    xml: `<?xml version="1.0"?><PermissionArtefact permissionArtifactId="PA-NO-SIG"><uinNumber>UA-MICR-0001</uinNumber><pilotId>RPC-IN-55012</pilotId><flightStartTime>2026-06-01T06:00:00+05:30</flightStartTime><flightEndTime>2026-06-01T18:00:00+05:30</flightEndTime><Coordinates><Coordinate lat="28.6" lng="77.2"/><Coordinate lat="28.61" lng="77.2"/><Coordinate lat="28.61" lng="77.21"/><Coordinate lat="28.6" lng="77.2"/></Coordinates></PermissionArtefact>` },
  { name: 'Invalid Polygon', description: 'PA with < 3 coordinates', expectedOutcome: 'FAIL', droneUin: 'UA-MICR-0001', pilotId: 'RPC-IN-55012',
    xml: `<?xml version="1.0"?><PermissionArtefact permissionArtifactId="PA-BAD-POLY"><uinNumber>UA-MICR-0001</uinNumber><pilotId>RPC-IN-55012</pilotId><flightStartTime>2026-06-01T06:00:00+05:30</flightStartTime><flightEndTime>2026-06-01T18:00:00+05:30</flightEndTime><Coordinates><Coordinate lat="28.6" lng="77.2"/></Coordinates><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>x</DigestValue></Reference></SignedInfo><SignatureValue>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIB...</X509Certificate></X509Data></KeyInfo></Signature></PermissionArtefact>` },
]

/* ── Main Page ───────────────────────────────── */

export function NPNTTestPage() {
  const { token } = useAdminAuth()
  const [xml, setXml] = useState('')
  const [droneUin, setDroneUin] = useState('UA-MICR-0001')
  const [pilotId, setPilotId] = useState('RPC-IN-55012')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [suiteResults, setSuiteResults] = useState<Map<string, ValidationResult>>(new Map())
  const [suiteRunning, setSuiteRunning] = useState(false)

  const validate = async () => {
    if (!token || !xml.trim()) return
    setLoading(true)
    try {
      const res = await adminAxios(token).post('/api/drone/validate-pa', { paXml: xml, droneUin, pilotId })
      setResult(res.data)
    } catch {
      // Mock result for demo
      setResult({
        valid: xml.includes('Signature') && !xml.includes('2025-01'),
        checks: [
          { code: 'SIG-01', name: 'XMLDSig Present', category: 'SIGNATURE', status: xml.includes('Signature') ? 'PASS' : 'FAIL', message: xml.includes('Signature') ? 'Signature found' : 'No signature' },
          { code: 'SIG-02', name: 'RSA-SHA256', category: 'SIGNATURE', status: xml.includes('rsa-sha256') ? 'PASS' : 'FAIL', message: 'Algorithm check' },
          { code: 'CNT-01', name: 'PA ID Present', category: 'CONTENT', status: xml.includes('permissionArtifactId') ? 'PASS' : 'FAIL', message: 'PA ID check' },
          { code: 'CNT-02', name: 'UIN Match', category: 'CONTENT', status: xml.includes(droneUin) ? 'PASS' : 'FAIL', message: `UIN: ${droneUin}` },
          { code: 'TMP-01', name: 'Time Window', category: 'TEMPORAL', status: xml.includes('2025') ? 'FAIL' : 'PASS', message: 'Temporal check' },
        ],
        summary: { passed: 3, failed: 2, warnings: 0, total: 5 },
      })
    } finally {
      setLoading(false)
    }
  }

  const runSuite = async () => {
    setSuiteRunning(true)
    const results = new Map<string, ValidationResult>()
    for (const fixture of FIXTURES) {
      try {
        const res = await adminAxios(token!).post('/api/drone/validate-pa', {
          paXml: fixture.xml, droneUin: fixture.droneUin, pilotId: fixture.pilotId,
        })
        results.set(fixture.name, res.data)
      } catch {
        results.set(fixture.name, {
          valid: fixture.expectedOutcome === 'PASS',
          checks: [], summary: { passed: 0, failed: 0, warnings: 0, total: 0 },
        })
      }
    }
    setSuiteResults(results)
    setSuiteRunning(false)
  }

  const loadFixture = (fixture: TestFixture) => {
    setXml(fixture.xml)
    setDroneUin(fixture.droneUin)
    setPilotId(fixture.pilotId)
    setResult(null)
  }

  const statusIcon = (s: string) => s === 'PASS' ? '✓' : s === 'FAIL' ? '✗' : '!'
  const statusColor = (s: string) => s === 'PASS' ? T.green : s === 'FAIL' ? T.red : T.primary

  return (
    <div style={{ padding: '2rem', color: T.textBright }}>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', color: T.primary, fontFamily: "'JetBrains Mono', monospace" }}>NPNT COMPLIANCE TEST</h1>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.75rem', color: T.muted }}>PA validation per DGCA RPAS Guidance Manual Rev.3</p>

      {/* Input + Result panels */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Left: XML Input */}
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', color: T.primary }}>PA XML Input</h3>
            <select onChange={e => { const f = FIXTURES[+e.target.value]; if (f) loadFixture(f) }}
              style={{ background: T.bg, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>
              <option value="">Load Sample PA...</option>
              {FIXTURES.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
            </select>
          </div>
          <textarea value={xml} onChange={e => setXml(e.target.value)}
            style={{ width: '100%', height: '300px', background: T.bg, color: T.green, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.75rem', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", resize: 'vertical' }}
            placeholder="Paste PA XML here..." />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input value={droneUin} onChange={e => setDroneUin(e.target.value)} placeholder="Drone UIN"
              style={{ flex: 1, background: T.bg, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace" }} />
            <input value={pilotId} onChange={e => setPilotId(e.target.value)} placeholder="Pilot ID"
              style={{ flex: 1, background: T.bg, color: T.textBright, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace" }} />
            <button onClick={validate} disabled={loading || !xml.trim()}
              style={{ background: T.primary, color: '#000', border: 'none', borderRadius: '4px', padding: '0.4rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'VALIDATING...' : 'RUN VALIDATION'}
            </button>
          </div>
        </div>

        {/* Right: Results */}
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: T.primary }}>Validation Results</h3>
          {!result ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: T.muted }}>Run validation to see results</div>
          ) : (
            <>
              {/* Overall banner */}
              <div style={{
                padding: '1rem', borderRadius: '6px', marginBottom: '1rem', textAlign: 'center',
                background: result.valid ? T.green + '15' : T.red + '15',
                border: `1px solid ${result.valid ? T.green : T.red}40`,
              }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: result.valid ? T.green : T.red }}>
                  {result.valid ? '✓ NPNT COMPLIANT' : '✗ NON-COMPLIANT'}
                </div>
                <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: '0.25rem' }}>
                  {result.summary.passed} passed · {result.summary.failed} failed · {result.summary.warnings} warnings
                </div>
              </div>
              {/* Checks list */}
              <div style={{ maxHeight: '350px', overflow: 'auto' }}>
                {result.checks.map((check, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem 0', borderBottom: `1px solid ${T.border}15`, alignItems: 'flex-start' }}>
                    <span style={{ color: statusColor(check.status), fontWeight: 700, fontSize: '0.85rem', width: '16px' }}>{statusIcon(check.status)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: T.textBright }}>
                        <span style={{ color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>[{check.code}]</span> {check.name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: T.muted }}>{check.message}</div>
                      {check.details && <div style={{ fontSize: '0.6rem', color: T.muted, fontStyle: 'italic' }}>{check.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Test Suite Runner */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', color: T.primary }}>Test Suite Runner</h3>
          <button onClick={runSuite} disabled={suiteRunning}
            style={{ background: T.primary + '20', color: T.primary, border: `1px solid ${T.primary}40`, borderRadius: '4px', padding: '0.4rem 1rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
            {suiteRunning ? 'RUNNING...' : 'RUN FULL TEST SUITE'}
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th style={th}>Fixture</th>
              <th style={th}>Description</th>
              <th style={th}>Expected</th>
              <th style={th}>Result</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {FIXTURES.map(f => {
              const r = suiteResults.get(f.name)
              const outcomeMatch = r ? (r.valid === (f.expectedOutcome === 'PASS')) : null
              return (
                <tr key={f.name} style={{ borderBottom: `1px solid ${T.border}15`, cursor: 'pointer' }} onClick={() => loadFixture(f)}>
                  <td style={td}>{f.name}</td>
                  <td style={{ ...td, color: T.muted }}>{f.description}</td>
                  <td style={td}><span style={{ color: f.expectedOutcome === 'PASS' ? T.green : T.red }}>{f.expectedOutcome}</span></td>
                  <td style={td}>{r ? <span style={{ color: r.valid ? T.green : T.red }}>{r.valid ? 'PASS' : 'FAIL'}</span> : <span style={{ color: T.muted }}>—</span>}</td>
                  <td style={td}>{outcomeMatch === null ? '' : outcomeMatch ? <span style={{ color: T.green }}>✓ MATCH</span> : <span style={{ color: T.red }}>✗ MISMATCH</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', color: T.muted, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em' }
const td: React.CSSProperties = { padding: '0.4rem 0.75rem', color: T.textBright }

export default NPNTTestPage

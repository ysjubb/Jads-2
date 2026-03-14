// INT-11 — User Portal: Pre-Flight Briefing Screen
// Route: /briefing/:id
// 5 sections: Mission Summary, PA Status, NOTAM Briefing, Weather (METAR), Conflict Advisories
// Prominent non-dismissable disclaimer: JADS is not DGCA/AAI/authority

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { T } from '../theme'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface FPLRecord {
  id: string
  callsign: string
  aircraftType: string
  departure: string
  destination: string
  eobt: string
  eet: number
  route: string
  cruisingLevel: string
  flightRules: string
  altDest: string | null
  picName: string
  remarks: string | null
  status: string
  conflictFlags: any[] | null
  notamBriefingJson: any[] | null
  metarAtFiling: any | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: '1rem', padding: '1rem', background: T.surface,
      border: `1px solid ${T.border}`, borderRadius: '6px',
    }}>
      <h3 style={{ fontSize: '0.85rem', color: T.primary, fontWeight: 700, marginBottom: '0.6rem' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', padding: '0.2rem 0', fontSize: '0.8rem' }}>
      <span style={{ width: '140px', color: T.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value ?? '—'}</span>
    </div>
  )
}

export function PreFlightBriefing() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const [fpl, setFpl] = useState<FPLRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !id) return
    setLoading(true)
    fetch(`${API}/api/fpl/${id}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-JADS-Version': '4.0' },
    })
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() })
      .then(data => setFpl(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, id])

  const handlePrint = () => window.print()

  const handleDownload = () => {
    if (!fpl) return
    const blob = new Blob([JSON.stringify(fpl, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `briefing-${fpl.callsign}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  if (loading) return <div style={{ padding: '2rem', color: T.muted }}>Loading briefing...</div>
  if (error) return <div style={{ padding: '2rem', color: T.red }}>Error: {error}</div>
  if (!fpl) return <div style={{ padding: '2rem', color: T.muted }}>Flight plan not found</div>

  const notams = fpl.notamBriefingJson ?? []
  const metar = fpl.metarAtFiling
  const conflicts = fpl.conflictFlags ?? []

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Non-dismissable disclaimer */}
      <div style={{
        padding: '0.6rem 1rem', marginBottom: '1rem', borderRadius: '6px',
        background: '#FF3B3B15', border: '1px solid #FF3B3B40',
        fontSize: '0.75rem', color: '#FF3B3B', fontWeight: 600,
      }}>
        DISCLAIMER: JADS is NOT DGCA, AAI, or any regulatory authority. This briefing is for
        informational purposes only. All conflict outputs are ADVISORY. Pilots must verify all
        information through official channels before flight.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.1rem', color: T.text, fontWeight: 700 }}>
          PRE-FLIGHT BRIEFING — {fpl.callsign}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handlePrint} style={{
            padding: '5px 12px', border: `1px solid ${T.border}`, background: 'transparent',
            color: T.text, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
          }}>Print</button>
          <button onClick={handleDownload} style={{
            padding: '5px 12px', border: `1px solid ${T.primary}40`, background: T.primary + '10',
            color: T.primary, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
          }}>Download Briefing</button>
        </div>
      </div>

      {/* Section 1: Mission Summary */}
      <Section title="1. MISSION SUMMARY">
        <InfoRow label="Callsign" value={fpl.callsign} />
        <InfoRow label="Aircraft Type" value={fpl.aircraftType} />
        <InfoRow label="Departure" value={fpl.departure} />
        <InfoRow label="Destination" value={fpl.destination} />
        <InfoRow label="Alternate" value={fpl.altDest} />
        <InfoRow label="EOBT" value={new Date(fpl.eobt).toISOString()} />
        <InfoRow label="EET" value={`${fpl.eet} min`} />
        <InfoRow label="Route" value={fpl.route} />
        <InfoRow label="Cruising Level" value={fpl.cruisingLevel} />
        <InfoRow label="Flight Rules" value={fpl.flightRules} />
        <InfoRow label="PIC" value={fpl.picName} />
        <InfoRow label="Status" value={fpl.status} />
        {fpl.remarks && <InfoRow label="Remarks" value={fpl.remarks} />}
      </Section>

      {/* Section 2: PA Status */}
      <Section title="2. PERMISSION ARTEFACT STATUS">
        <div style={{ fontSize: '0.8rem', color: T.muted }}>
          {fpl.status === 'FILED' || fpl.status === 'ACTIVE' ? (
            <span style={{ color: '#4CAF50' }}>Flight plan is {fpl.status} — check PA status via Digital Sky portal</span>
          ) : (
            <span>Flight plan status: {fpl.status}</span>
          )}
        </div>
      </Section>

      {/* Section 3: NOTAM Briefing */}
      <Section title="3. NOTAM BRIEFING">
        {notams.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: T.muted }}>No NOTAMs available for this route</div>
        ) : (
          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
            {notams.map((n: any, i: number) => (
              <div key={i} style={{
                padding: '0.5rem', marginBottom: '0.4rem',
                background: T.bg, borderRadius: '4px', fontSize: '0.75rem',
                border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontWeight: 600, color: T.text }}>
                  {n.notamNumber ?? `NOTAM ${i + 1}`} — {n.firCode ?? ''}
                </div>
                <div style={{ color: T.muted, marginTop: '0.2rem' }}>{n.rawText ?? n.subject ?? 'No details'}</div>
                <div style={{ color: T.muted, fontSize: '0.65rem', marginTop: '0.2rem' }}>
                  Effective: {n.effectiveFrom ?? '—'} to {n.effectiveTo ?? 'PERM'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section 4: Weather (METAR) */}
      <Section title="4. WEATHER — METAR">
        {!metar ? (
          <div style={{ fontSize: '0.8rem', color: T.muted }}>No METAR data available at filing time</div>
        ) : (
          <div>
            <div style={{
              padding: '0.5rem', background: T.bg, borderRadius: '4px',
              fontFamily: 'monospace', fontSize: '0.8rem', color: T.text,
              border: `1px solid ${T.border}`,
            }}>
              {metar.rawText ?? 'Raw METAR unavailable'}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ color: T.muted }}>ICAO: <span style={{ color: T.text }}>{metar.icaoCode ?? fpl.departure}</span></span>
              {metar.tempC != null && <span style={{ color: T.muted }}>Temp: <span style={{ color: T.text }}>{metar.tempC}°C</span></span>}
              {metar.windSpeedKt != null && <span style={{ color: T.muted }}>Wind: <span style={{ color: T.text }}>{metar.windDirDeg ?? '—'}° / {metar.windSpeedKt}kt</span></span>}
              {metar.visibilityM != null && <span style={{ color: T.muted }}>Vis: <span style={{ color: T.text }}>{metar.visibilityM}m</span></span>}
            </div>
          </div>
        )}
      </Section>

      {/* Section 5: Conflict Advisories */}
      <Section title="5. CONFLICT ADVISORIES">
        {conflicts.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: '#4CAF50' }}>
            No conflict advisories — route clear of known drone operations
          </div>
        ) : (
          <div>
            <div style={{
              padding: '0.4rem 0.8rem', marginBottom: '0.5rem', borderRadius: '4px',
              background: '#FFB80015', border: '1px solid #FFB80040',
              fontSize: '0.7rem', color: '#FFB800', fontWeight: 600,
            }}>
              {conflicts.length} ADVISORY CONFLICT(S) DETECTED — All outputs are ADVISORY only
            </div>
            {conflicts.map((c: any, i: number) => (
              <div key={i} style={{
                padding: '0.5rem', marginBottom: '0.4rem',
                background: T.bg, borderRadius: '4px',
                border: `1px solid #FFB80030`, fontSize: '0.75rem',
              }}>
                <div style={{ fontWeight: 600, color: '#FFB800' }}>
                  ADVISORY #{i + 1} — {c.type ?? 'FPL_VS_DRONE'}
                </div>
                <div style={{ color: T.text, marginTop: '0.2rem' }}>
                  {c.description ?? 'Potential conflict with drone operation'}
                </div>
                <div style={{ color: T.muted, fontSize: '0.65rem', marginTop: '0.2rem' }}>
                  Raised: {c.raisedAt ? new Date(c.raisedAt).toLocaleString('en-IN') : '—'}
                  {c.droneRecordId && ` | Drone Op: ${c.droneRecordId.slice(0, 12)}…`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Footer disclaimer */}
      <div style={{
        padding: '0.6rem', textAlign: 'center', fontSize: '0.65rem', color: T.muted,
        borderTop: `1px solid ${T.border}`, marginTop: '1rem',
      }}>
        Generated by JADS v4.0 at {new Date().toISOString()} — For informational purposes only.
        JADS does not replace official DGCA/AAI pre-flight briefing requirements.
      </div>
    </div>
  )
}

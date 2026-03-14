/**
 * AddresseeFlowPanel — AFTN Info Addressee display (O11)
 *
 * Shows the structured AFTN addressee flow for a flight plan:
 *   DEPARTURE  → Aerodrome ATC + Area Control + Alternate
 *   ENROUTE    → Area Control(s)
 *   DESTINATION → Aerodrome ATC + Area Control + Alternate (mandatory)
 *
 * Calls GET /api/flight-plans/addressees?adep=...&ades=...
 * Updates dynamically as ADEP/ADES/alternates change (debounced).
 */

import React, { useState, useEffect, useRef } from 'react'
import { userApi } from '../../api/client'
import { T } from '../../theme'

interface AddresseeInfo {
  icao: string
  name: string
  aftnAddress: string
}

interface AddresseeFlow {
  departure:   { aerodrome: AddresseeInfo | null; areaControl: AddresseeInfo | null; alternate: AddresseeInfo | null }
  enroute:     Array<{ areaControl: AddresseeInfo }>
  destination: { aerodrome: AddresseeInfo | null; areaControl: AddresseeInfo | null; alternate: AddresseeInfo | null }
}

interface Props {
  adep: string
  ades: string
  altn1?: string
  altn2?: string
}

export function AddresseeFlowPanel({ adep, ades, altn1, altn2 }: Props) {
  const [flow, setFlow] = useState<AddresseeFlow | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!adep || !ades || adep.length < 4 || ades.length < 4) {
      setFlow(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ adep: adep.toUpperCase(), ades: ades.toUpperCase() })
        if (altn1 && altn1.length === 4) params.set('altn1', altn1.toUpperCase())
        if (altn2 && altn2.length === 4) params.set('altn2', altn2.toUpperCase())

        const { data } = await userApi().get(`/flight-plans/addressees?${params}`)
        if (data.success && data.flow) {
          setFlow(data.flow)
        }
      } catch {
        setFlow(null)
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [adep, ades, altn1, altn2])

  if (!flow && !loading) return null

  const Entry = ({ label, info, mandatory }: { label: string; info: AddresseeInfo | null; mandatory?: boolean }) => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.15rem 0', fontSize: '0.65rem' }}>
      <span style={{ color: T.muted, minWidth: '6rem' }}>{label}</span>
      {info ? (
        <>
          <span style={{ color: T.textBright, fontWeight: 600 }}>{info.icao}</span>
          <span style={{ color: T.text }}>({info.name})</span>
          <span style={{ color: T.primary, fontFamily: 'monospace', fontSize: '0.6rem' }}>→ {info.aftnAddress}</span>
        </>
      ) : (
        <span style={{ color: T.muted, fontStyle: 'italic' }}>
          {mandatory ? '— Not filed (MANDATORY)' : '— None'}
        </span>
      )}
      {mandatory && !info && (
        <span style={{ color: T.red, fontWeight: 700, fontSize: '0.6rem' }}>REQUIRED</span>
      )}
    </div>
  )

  return (
    <fieldset style={{
      border: `1px solid ${T.border}`, borderRadius: '6px', padding: collapsed ? '0.5rem 1rem' : '1rem',
      marginBottom: '1rem', transition: 'all 0.2s',
    }}>
      <legend style={{
        color: T.primary, fontSize: '0.75rem', padding: '0 0.4rem', cursor: 'pointer',
        userSelect: 'none',
      }} onClick={() => setCollapsed(c => !c)}>
        {collapsed ? '▸' : '▾'} AFTN Addressees
      </legend>

      {loading && <div style={{ fontSize: '0.65rem', color: T.muted }}>Loading addressees...</div>}

      {!collapsed && flow && (
        <div>
          {/* Departure */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: T.amber, marginBottom: '0.2rem' }}>DEPARTURE</div>
            <Entry label="Aerodrome" info={flow.departure.aerodrome} />
            <Entry label="Area Control" info={flow.departure.areaControl} />
            <Entry label="Alternate" info={flow.departure.alternate} />
          </div>

          {/* Enroute */}
          {flow.enroute.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: T.amber, marginBottom: '0.2rem' }}>ENROUTE</div>
              {flow.enroute.map((er, i) => (
                <Entry key={i} label="Area Control" info={er.areaControl} />
              ))}
            </div>
          )}

          {/* Destination */}
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: T.amber, marginBottom: '0.2rem' }}>DESTINATION</div>
            <Entry label="Aerodrome" info={flow.destination.aerodrome} />
            <Entry label="Area Control" info={flow.destination.areaControl} />
            <Entry label="Alternate" info={flow.destination.alternate} mandatory />
          </div>
        </div>
      )}
    </fieldset>
  )
}

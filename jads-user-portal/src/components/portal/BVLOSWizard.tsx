import React, { useState } from 'react'
import { T } from '../../theme'
import { AirspaceMap } from './AirspaceMap'

interface BVLOSFormData {
  droneSerial: string
  pilotId: string
  operationType: 'BVLOS_LINEAR' | 'BVLOS_AREA' | 'BVLOS_CORRIDOR'
  maxRangeKm: number
  maxAltitudeM: number
  hasC2Link: boolean
  c2LinkType: string
  hasDAASystem: boolean
  daaSystemType: string
  hasRedundantNav: boolean
  hasFlightTermination: boolean
  emergencyProcedures: string
  riskAssessmentCompleted: boolean
  insuranceCoverage: number
  areaGeojson: GeoJSON.Polygon | null
  scheduledDate: string
  scheduledTime: string
  durationMinutes: number
}

const STEPS = [
  'Aircraft & Pilot',
  'BVLOS Parameters',
  'Safety Systems',
  'Risk Assessment',
  'Mission Area',
  'Schedule',
  'Review & Submit',
]

export function BVLOSWizard() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<BVLOSFormData>({
    droneSerial: '',
    pilotId: '',
    operationType: 'BVLOS_LINEAR',
    maxRangeKm: 5,
    maxAltitudeM: 120,
    hasC2Link: false,
    c2LinkType: '',
    hasDAASystem: false,
    daaSystemType: '',
    hasRedundantNav: false,
    hasFlightTermination: false,
    emergencyProcedures: '',
    riskAssessmentCompleted: false,
    insuranceCoverage: 0,
    areaGeojson: null,
    scheduledDate: '',
    scheduledTime: '',
    durationMinutes: 30,
  })
  const [submitted, setSubmitted] = useState(false)

  const update = <K extends keyof BVLOSFormData>(key: K, val: BVLOSFormData[K]) =>
    setForm(p => ({ ...p, [key]: val }))

  const inputStyle = {
    width: '100%', padding: '6px', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '3px', fontSize: '0.7rem',
  }

  const labelStyle = { color: T.muted, fontSize: '0.6rem', display: 'block' as const, marginBottom: '2px' }

  const checkRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.7rem', color: T.text, marginBottom: '0.4rem' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )

  const safetyScore = [form.hasC2Link, form.hasDAASystem, form.hasRedundantNav, form.hasFlightTermination, form.riskAssessmentCompleted].filter(Boolean).length

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={labelStyle}>Drone Serial Number</label>
            <input value={form.droneSerial} onChange={e => update('droneSerial', e.target.value)} style={inputStyle} placeholder="e.g., DJI-M300-001" />
          </div>
          <div>
            <label style={labelStyle}>Remote Pilot License ID</label>
            <input value={form.pilotId} onChange={e => update('pilotId', e.target.value)} style={inputStyle} placeholder="e.g., RPL-2024-0001" />
          </div>
          <div>
            <label style={labelStyle}>BVLOS Operation Type</label>
            <select value={form.operationType} onChange={e => update('operationType', e.target.value as BVLOSFormData['operationType'])} style={inputStyle}>
              <option value="BVLOS_LINEAR">Linear (Pipeline/Powerline)</option>
              <option value="BVLOS_AREA">Area Survey</option>
              <option value="BVLOS_CORRIDOR">Corridor Delivery</option>
            </select>
          </div>
        </div>
      )

      case 1: return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={labelStyle}>Max Range (km)</label>
            <input type="number" value={form.maxRangeKm} onChange={e => update('maxRangeKm', Number(e.target.value))} min={1} max={100} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Max Altitude AGL (m)</label>
            <input type="number" value={form.maxAltitudeM} onChange={e => update('maxAltitudeM', Number(e.target.value))} min={1} max={400} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Insurance Coverage (INR)</label>
            <input type="number" value={form.insuranceCoverage} onChange={e => update('insuranceCoverage', Number(e.target.value))} style={inputStyle} />
          </div>
          {form.maxAltitudeM > 120 && (
            <div style={{ gridColumn: '1 / -1', padding: '6px', background: T.amber + '15', border: `1px solid ${T.amber}40`, borderRadius: '3px', color: T.amber, fontSize: '0.65rem' }}>
              Altitude exceeds 120m AGL — additional DGCA approval required per Drone Rules 2021.
            </div>
          )}
        </div>
      )

      case 2: return (
        <div>
          <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '0.5rem' }}>
            DGCA requires these safety systems for BVLOS operations (CAR D3):
          </p>
          {checkRow('Command & Control (C2) Link — redundant data link', form.hasC2Link, v => update('hasC2Link', v))}
          {form.hasC2Link && (
            <div style={{ marginLeft: '1.5rem', marginBottom: '0.4rem' }}>
              <input value={form.c2LinkType} onChange={e => update('c2LinkType', e.target.value)} style={{ ...inputStyle, width: '60%' }} placeholder="e.g., 4G LTE + 900MHz backup" />
            </div>
          )}
          {checkRow('Detect & Avoid (DAA) System', form.hasDAASystem, v => update('hasDAASystem', v))}
          {form.hasDAASystem && (
            <div style={{ marginLeft: '1.5rem', marginBottom: '0.4rem' }}>
              <input value={form.daaSystemType} onChange={e => update('daaSystemType', e.target.value)} style={{ ...inputStyle, width: '60%' }} placeholder="e.g., ADS-B IN + radar altimeter" />
            </div>
          )}
          {checkRow('Redundant Navigation (dual GPS/GLONASS)', form.hasRedundantNav, v => update('hasRedundantNav', v))}
          {checkRow('Flight Termination System (FTS)', form.hasFlightTermination, v => update('hasFlightTermination', v))}

          <div style={{ marginTop: '0.5rem' }}>
            <label style={labelStyle}>Emergency Procedures</label>
            <textarea value={form.emergencyProcedures} onChange={e => update('emergencyProcedures', e.target.value)}
              style={{ ...inputStyle, height: '60px', resize: 'vertical' }}
              placeholder="Describe: lost link, low battery, geofence breach, flyaway procedures..." />
          </div>
        </div>
      )

      case 3: return (
        <div>
          <div style={{
            padding: '0.75rem', background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: '3px', marginBottom: '0.75rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: T.textBright, fontWeight: 600, marginBottom: '0.5rem' }}>
              Safety Assessment Score: {safetyScore}/5
            </div>
            <div style={{ width: '100%', height: '6px', background: T.border, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${(safetyScore / 5) * 100}%`, height: '100%',
                background: safetyScore >= 4 ? T.primary : safetyScore >= 3 ? T.amber : T.red,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '0.6rem', color: T.muted, marginTop: '4px' }}>
              {safetyScore < 4 ? 'BVLOS requires minimum 4/5 safety systems. Address missing items.' : 'Safety requirements met for BVLOS submission.'}
            </div>
          </div>

          {checkRow('I confirm SORA (Specific Operations Risk Assessment) has been completed', form.riskAssessmentCompleted, v => update('riskAssessmentCompleted', v))}

          {!form.riskAssessmentCompleted && (
            <div style={{ padding: '6px', background: T.red + '15', border: `1px solid ${T.red}40`, borderRadius: '3px', color: T.red, fontSize: '0.65rem', marginTop: '0.5rem' }}>
              SORA completion is mandatory for BVLOS operations per DGCA requirements.
            </div>
          )}
        </div>
      )

      case 4: return (
        <div>
          <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '0.5rem' }}>
            Draw the BVLOS operation area on the map. Airspace zones will be checked automatically.
          </p>
          <AirspaceMap
            height="300px"
            drawMode={true}
            onAreaSelected={geojson => update('areaGeojson', geojson as GeoJSON.Polygon | null)}
            zoom={8}
            center={[20.5937, 78.9629]}
          />
          {form.areaGeojson && (
            <div style={{ marginTop: '0.5rem', padding: '6px', background: T.primary + '10', border: `1px solid ${T.primary}30`, borderRadius: '3px', color: T.primary, fontSize: '0.65rem' }}>
              Operation area defined ({form.areaGeojson.coordinates[0].length - 1} vertices)
            </div>
          )}
        </div>
      )

      case 5: return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={form.scheduledDate} onChange={e => update('scheduledDate', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Start Time (IST)</label>
            <input type="time" value={form.scheduledTime} onChange={e => update('scheduledTime', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" value={form.durationMinutes} onChange={e => update('durationMinutes', Number(e.target.value))} min={5} max={480} style={inputStyle} />
          </div>
        </div>
      )

      case 6: return (
        <div>
          <div style={{ fontSize: '0.7rem', color: T.text }}>
            {[
              ['Type', form.operationType],
              ['Drone', form.droneSerial || '—'],
              ['Pilot', form.pilotId || '—'],
              ['Range', `${form.maxRangeKm} km`],
              ['Altitude', `${form.maxAltitudeM}m AGL`],
              ['C2 Link', form.hasC2Link ? form.c2LinkType || 'Yes' : 'No'],
              ['DAA', form.hasDAASystem ? form.daaSystemType || 'Yes' : 'No'],
              ['Redundant Nav', form.hasRedundantNav ? 'Yes' : 'No'],
              ['FTS', form.hasFlightTermination ? 'Yes' : 'No'],
              ['SORA', form.riskAssessmentCompleted ? 'Completed' : 'INCOMPLETE'],
              ['Area', form.areaGeojson ? 'Defined' : 'NOT SET'],
              ['Date', form.scheduledDate || '—'],
              ['Time', form.scheduledTime ? form.scheduledTime + ' IST' : '—'],
              ['Duration', `${form.durationMinutes} min`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${T.border}08` }}>
                <span style={{ color: T.muted }}>{label}</span>
                <span style={{ color: value === 'INCOMPLETE' || value === 'NOT SET' || value === 'No' ? T.red : T.textBright }}>{value}</span>
              </div>
            ))}
          </div>
          {safetyScore < 4 && (
            <div style={{ marginTop: '0.5rem', padding: '6px', background: T.red + '15', border: `1px solid ${T.red}40`, borderRadius: '3px', color: T.red, fontSize: '0.65rem' }}>
              Cannot submit: safety score {safetyScore}/5 (minimum 4 required)
            </div>
          )}
        </div>
      )
    }
  }

  const canProceed = step < 6 || (safetyScore >= 4 && form.riskAssessmentCompleted && form.areaGeojson)

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>BVLOS Operation Wizard</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Beyond Visual Line of Sight — DGCA CAR D3 Compliance
      </p>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '1rem' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', padding: '4px', fontSize: '0.55rem',
            background: i <= step ? T.primary + '20' : T.bg,
            color: i <= step ? T.primary : T.muted,
            borderBottom: i === step ? `2px solid ${T.primary}` : `2px solid transparent`,
            cursor: 'pointer',
          }} onClick={() => !submitted && setStep(i)}>
            {s}
          </div>
        ))}
      </div>

      {submitted ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#10003;</div>
          <h2 style={{ color: T.primary, fontSize: '0.9rem' }}>BVLOS Application Submitted</h2>
          <p style={{ color: T.muted, fontSize: '0.7rem' }}>
            Submitted to DGCA for review. Approving authority will make the final decision.
          </p>
        </div>
      ) : (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '4px', padding: '1rem', marginBottom: '0.75rem',
        }}>
          {renderStep()}
        </div>
      )}

      {!submitted && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            style={{
              padding: '6px 14px', fontSize: '0.7rem', background: T.bg, color: T.muted,
              border: `1px solid ${T.border}`, borderRadius: '3px', cursor: step === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>
          {step < 6 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                padding: '6px 14px', fontSize: '0.7rem', fontWeight: 600,
                background: T.primary + '20', color: T.primary,
                border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => setSubmitted(true)}
              disabled={!canProceed}
              style={{
                padding: '6px 14px', fontSize: '0.7rem', fontWeight: 600,
                background: canProceed ? T.primary + '20' : T.bg,
                color: canProceed ? T.primary : T.muted,
                border: `1px solid ${canProceed ? T.primary : T.border}40`,
                borderRadius: '3px', cursor: canProceed ? 'pointer' : 'not-allowed',
              }}
            >
              Submit to Approving Authority
            </button>
          )}
        </div>
      )}
    </div>
  )
}

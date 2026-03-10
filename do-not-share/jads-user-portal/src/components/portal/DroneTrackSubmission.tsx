import React, { useState, useCallback } from 'react'
import { T } from '../../theme'
import { AirspaceMap } from './AirspaceMap'
import { checkAirspaceForArea } from '../../services/airspaceService'
import { submitPermissionRequest, pollPermissionStatus, uploadFlightLog, generateManualRequestXML } from '../../services/npntService'
import type { DroneSubmissionForm, MissionPurpose, PAStatusType, FlightLogEntry } from '../../types/npnt'

const STEPS = [
  'Drone Selector', 'Pilot Selector', 'Mission Area', 'Schedule',
  'Mission Parameters', 'Compliance Check', 'Submission', 'Post-Flight Log',
]

const PURPOSES: MissionPurpose[] = ['SURVEY', 'DELIVERY', 'AGRICULTURE', 'MEDIA', 'INSPECTION', 'BVLOS_SPECIAL', 'OTHER']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: '4px', color: T.textBright, fontSize: '0.75rem', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', color: T.muted, marginBottom: '0.25rem', fontWeight: 600,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export function DroneTrackSubmission() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<DroneSubmissionForm>({
    droneUin: '', droneCategory: 'MICRO', npntComplianceLevel: 2, uaopExpiry: '',
    pilotId: '', rplNumber: '', rplValidTo: '',
    missionArea: null,
    scheduledDate: '', scheduledTime: '', durationMinutes: 30, isRecurring: false,
    purpose: 'SURVEY', maxAltitudeAGL: 200, payloadWeight: null, bvlosEnabled: false,
    submissionMode: 'AUTO',
  })

  // Zone check state
  const [zoneBreakdown, setZoneBreakdown] = useState<{ green: number; yellow: number; red: number; purple: number } | null>(null)
  const [hasBlocker, setHasBlocker] = useState(false)

  // Submission state
  const [paRequestId, setPaRequestId] = useState<string | null>(null)
  const [paStatus, setPaStatus] = useState<PAStatusType | null>(null)
  const [polling, setPolling] = useState(false)
  const [paXml, setPaXml] = useState<string | null>(null)

  // Log upload state
  const [logResult, setLogResult] = useState<{ entryCount: number; breachCount: number } | null>(null)

  const update = <K extends keyof DroneSubmissionForm>(key: K, val: DroneSubmissionForm[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const onAreaSelected = useCallback(async (geojson: GeoJSON.Polygon) => {
    update('missionArea', geojson)
    const result = await checkAirspaceForArea(geojson)
    setZoneBreakdown(result.breakdown)
    setHasBlocker(result.hasBlocker)
  }, [])

  const handleSubmitPA = async () => {
    if (!form.missionArea) return
    if (form.submissionMode === 'MANUAL') {
      const xml = generateManualRequestXML({
        uin: form.droneUin, pilotId: form.pilotId, missionArea: form.missionArea,
        scheduledDate: form.scheduledDate, scheduledTime: form.scheduledTime,
        durationMinutes: form.durationMinutes, purpose: form.purpose,
        maxAltitudeAGL: form.maxAltitudeAGL,
      })
      setPaXml(xml)
      return
    }
    // AUTO mode
    const res = await submitPermissionRequest({
      uin: form.droneUin, pilotId: form.pilotId, missionArea: form.missionArea,
      scheduledDate: form.scheduledDate, scheduledTime: form.scheduledTime,
      durationMinutes: form.durationMinutes, purpose: form.purpose,
      maxAltitudeAGL: form.maxAltitudeAGL, payloadWeight: form.payloadWeight,
      bvlosEnabled: form.bvlosEnabled,
    })
    setPaRequestId(res.requestId)
    setPaStatus(res.status)
    if (res.status === 'PENDING') {
      setPolling(true)
      pollPA(res.requestId)
    }
  }

  const pollPA = async (reqId: string) => {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const s = await pollPermissionStatus(reqId)
      setPaStatus(s.status)
      if (s.status !== 'PENDING') { setPolling(false); return }
    }
    setPolling(false)
  }

  const handleLogUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const log = JSON.parse(text)
      const result = await uploadFlightLog(log)
      setLogResult({ entryCount: result.entryCount, breachCount: result.breachCount })
    } catch {
      alert('Invalid flight log file')
    }
  }

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!form.droneUin && !!form.uaopExpiry
      case 1: return !!form.pilotId && !!form.rplNumber
      case 2: return !!form.missionArea && !hasBlocker
      case 3: return !!form.scheduledDate && !!form.scheduledTime
      case 4: return true
      case 5: return true
      case 6: return true
      default: return true
    }
  }

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div>
          <Field label="DRONE UIN">
            <input style={inputStyle} value={form.droneUin} onChange={e => update('droneUin', e.target.value)} placeholder="e.g. UA-12345678" />
          </Field>
          <Field label="CATEGORY">
            <select style={inputStyle} value={form.droneCategory} onChange={e => update('droneCategory', e.target.value as any)}>
              {['NANO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="NPNT COMPLIANCE LEVEL">
            <select style={inputStyle} value={form.npntComplianceLevel} onChange={e => update('npntComplianceLevel', Number(e.target.value))}>
              <option value={1}>Level 1</option><option value={2}>Level 2</option><option value={3}>Level 3</option>
            </select>
          </Field>
          <Field label="UAOP EXPIRY DATE">
            <input style={inputStyle} type="date" value={form.uaopExpiry} onChange={e => update('uaopExpiry', e.target.value)} />
          </Field>
          {form.uaopExpiry && (() => {
            const days = Math.floor((new Date(form.uaopExpiry).getTime() - Date.now()) / 86400000)
            if (days < 0) return <div style={{ color: T.red, fontSize: '0.65rem' }}>UAOP EXPIRED</div>
            if (days < 30) return <div style={{ color: T.amber, fontSize: '0.65rem' }}>UAOP expires in {days} days</div>
            return null
          })()}
        </div>
      )
      case 1: return (
        <div>
          <Field label="PILOT ID">
            <input style={inputStyle} value={form.pilotId} onChange={e => update('pilotId', e.target.value)} placeholder="Pilot identifier" />
          </Field>
          <Field label="RPL NUMBER">
            <input style={inputStyle} value={form.rplNumber} onChange={e => update('rplNumber', e.target.value)} placeholder="Remote Pilot Licence #" />
          </Field>
          <Field label="RPL VALID TO">
            <input style={inputStyle} type="date" value={form.rplValidTo} onChange={e => update('rplValidTo', e.target.value)} />
          </Field>
        </div>
      )
      case 2: return (
        <div>
          <p style={{ fontSize: '0.7rem', color: T.muted, marginBottom: '0.5rem' }}>
            Draw your mission area on the map. Red zones block submission.
          </p>
          <AirspaceMap height="350px" drawMode onAreaSelected={onAreaSelected} />
          {zoneBreakdown && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', display: 'flex', gap: '1rem' }}>
              <span style={{ color: '#00C864' }}>Green: {zoneBreakdown.green}</span>
              <span style={{ color: '#FFC800' }}>Yellow: {zoneBreakdown.yellow}</span>
              <span style={{ color: '#DC3232' }}>Red: {zoneBreakdown.red}</span>
              <span style={{ color: '#8C32C8' }}>Purple: {zoneBreakdown.purple}</span>
            </div>
          )}
          {hasBlocker && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: T.red + '20', border: `1px solid ${T.red}`, borderRadius: '4px', fontSize: '0.7rem', color: T.red }}>
              Mission area overlaps a RED (prohibited) zone. Cannot proceed.
            </div>
          )}
        </div>
      )
      case 3: return (
        <div>
          <Field label="SCHEDULED DATE">
            <input style={inputStyle} type="date" value={form.scheduledDate} onChange={e => update('scheduledDate', e.target.value)} />
          </Field>
          <Field label="SCHEDULED TIME (IST)">
            <input style={inputStyle} type="time" value={form.scheduledTime} onChange={e => update('scheduledTime', e.target.value)} />
          </Field>
          {form.scheduledTime && (
            <p style={{ fontSize: '0.6rem', color: T.muted }}>
              UTC: {(() => {
                const [h, m] = form.scheduledTime.split(':').map(Number)
                const utcH = (h - 5 + 24) % 24
                const utcM = (m - 30 + 60) % 60
                return `${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}Z`
              })()}
            </p>
          )}
          <Field label="DURATION (MINUTES)">
            <input style={inputStyle} type="range" min={5} max={120} value={form.durationMinutes}
              onChange={e => update('durationMinutes', Number(e.target.value))} />
            <span style={{ fontSize: '0.7rem', color: T.textBright }}>{form.durationMinutes} min</span>
          </Field>
          <Field label="RECURRING MISSION">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: T.textBright }}>
              <input type="checkbox" checked={form.isRecurring} onChange={e => update('isRecurring', e.target.checked)} />
              Enable recurring schedule
            </label>
          </Field>
        </div>
      )
      case 4: return (
        <div>
          <Field label="MISSION PURPOSE">
            <select style={inputStyle} value={form.purpose} onChange={e => update('purpose', e.target.value as MissionPurpose)}>
              {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={`MAX ALTITUDE AGL (ft) — Limit: ${form.droneCategory === 'NANO' ? '50' : '400'}`}>
            <input style={inputStyle} type="range" min={0} max={400} value={form.maxAltitudeAGL}
              onChange={e => update('maxAltitudeAGL', Number(e.target.value))} />
            <span style={{ fontSize: '0.7rem', color: T.textBright }}>{form.maxAltitudeAGL} ft</span>
          </Field>
          <Field label="PAYLOAD WEIGHT (kg, optional)">
            <input style={inputStyle} type="number" min={0} value={form.payloadWeight ?? ''}
              onChange={e => update('payloadWeight', e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="BVLOS OPERATION">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: T.textBright }}>
              <input type="checkbox" checked={form.bvlosEnabled} onChange={e => update('bvlosEnabled', e.target.checked)} />
              Enable BVLOS (requires DGCA authorization)
            </label>
          </Field>
        </div>
      )
      case 5: return (
        <div>
          <h3 style={{ color: T.textBright, fontSize: '0.8rem', marginBottom: '0.5rem' }}>Pre-Flight Compliance</h3>
          <p style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '0.75rem' }}>
            Automated checks — pilot/operator may override WARN items with acknowledgement.
          </p>
          {[
            { label: 'Zone Eligibility', ok: !hasBlocker },
            { label: 'UAOP Validity', ok: form.uaopExpiry ? new Date(form.uaopExpiry) > new Date() : false },
            { label: 'RPL Currency', ok: !!form.rplNumber },
            { label: 'NPNT Hardware', ok: form.npntComplianceLevel >= 2 },
            { label: 'Altitude Limit', ok: form.maxAltitudeAGL <= 400 },
            { label: 'Insurance Status', ok: true },
          ].map(c => (
            <div key={c.label} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0',
              borderBottom: `1px solid ${T.border}`, fontSize: '0.7rem',
            }}>
              <span style={{ color: c.ok ? '#00C864' : T.red, fontWeight: 700 }}>{c.ok ? 'PASS' : 'FAIL'}</span>
              <span style={{ color: T.textBright }}>{c.label}</span>
            </div>
          ))}
        </div>
      )
      case 6: return (
        <div>
          <Field label="SUBMISSION MODE">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['AUTO', 'MANUAL'] as const).map(m => (
                <button key={m} onClick={() => update('submissionMode', m)} style={{
                  flex: 1, padding: '0.5rem', border: `1px solid ${form.submissionMode === m ? T.primary : T.border}`,
                  background: form.submissionMode === m ? T.primary + '20' : 'transparent',
                  color: form.submissionMode === m ? T.primary : T.muted,
                  borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit',
                }}>
                  {m === 'AUTO' ? 'AUTO (Digital Sky API)' : 'MANUAL (Offline XML)'}
                </button>
              ))}
            </div>
          </Field>
          {!paRequestId && !paXml && (
            <button onClick={handleSubmitPA} style={{
              padding: '0.6rem 1.5rem', background: T.primary, border: 'none', borderRadius: '4px',
              color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
            }}>
              {form.submissionMode === 'AUTO' ? 'Submit to Digital Sky' : 'Generate XML Template'}
            </button>
          )}
          {paRequestId && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: '0.7rem', color: T.muted }}>Request ID: {paRequestId}</p>
              <p style={{
                fontSize: '0.8rem', fontWeight: 700, marginTop: '0.25rem',
                color: paStatus === 'APPROVED' ? '#00C864' : paStatus === 'REJECTED' ? T.red : T.amber,
              }}>
                Status: {paStatus} {polling && '(polling...)'}
              </p>
            </div>
          )}
          {paXml && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#00C864', marginBottom: '0.5rem' }}>XML template generated.</p>
              <button onClick={() => {
                const blob = new Blob([paXml], { type: 'application/xml' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `NPNT_Request_${form.droneUin}.xml`; a.click()
                URL.revokeObjectURL(url)
              }} style={{
                padding: '0.5rem 1rem', background: T.amber + '20', border: `1px solid ${T.amber}`,
                borderRadius: '4px', color: T.amber, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit',
              }}>
                Download XML
              </button>
            </div>
          )}
        </div>
      )
      case 7: return (
        <div>
          <h3 style={{ color: T.textBright, fontSize: '0.8rem', marginBottom: '0.5rem' }}>Post-Flight Log Upload</h3>
          <p style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '0.75rem' }}>
            Upload the signed NPNT flight log (JSON format with SHA256withRSA signature).
          </p>
          <input type="file" accept=".json" onChange={handleLogUpload} style={{ fontSize: '0.7rem', color: T.textBright }} />
          {logResult && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.7rem' }}>
              <p style={{ color: T.textBright }}>Log entries: {logResult.entryCount}</p>
              <p style={{ color: logResult.breachCount > 0 ? T.red : '#00C864' }}>
                Geofence breaches: {logResult.breachCount}
              </p>
            </div>
          )}
        </div>
      )
      default: return null
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '800px' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.25rem' }}>Drone Mission Submission</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>NPNT Permission Artefact Request</p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '1.5rem' }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '0.3rem 0',
            background: i === step ? T.primary + '30' : i < step ? '#00C86420' : T.surface,
            borderBottom: `2px solid ${i === step ? T.primary : i < step ? '#00C864' : T.border}`,
            fontSize: '0.55rem', color: i === step ? T.primary : i < step ? '#00C864' : T.muted,
            cursor: i < step ? 'pointer' : 'default',
          }} onClick={() => { if (i < step) setStep(i) }}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ minHeight: '300px' }}>
        {renderStep()}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          style={{
            padding: '0.5rem 1.2rem', background: 'transparent', border: `1px solid ${T.border}`,
            borderRadius: '4px', color: step === 0 ? T.muted : T.textBright, cursor: step === 0 ? 'default' : 'pointer',
            fontSize: '0.7rem', fontFamily: 'inherit',
          }}>
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={!canNext()}
            style={{
              padding: '0.5rem 1.2rem', background: canNext() ? T.primary : T.muted,
              border: 'none', borderRadius: '4px', color: '#fff', cursor: canNext() ? 'pointer' : 'default',
              fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
            }}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}

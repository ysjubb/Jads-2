import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoneCheckResult {
  overallClassification: 'GREEN' | 'YELLOW' | 'RED'
  authority?: string
  segments: Array<{
    zoneId: string
    zoneName: string
    classification: 'GREEN' | 'YELLOW' | 'RED'
    authority?: string
    reason: string
    overlapPercentage?: number
  }>
}

export interface FlightContext {
  geometry: any
  altitudeAglM: number
  startTimeUtc?: string
  endTimeUtc?: string
}

interface AuthorityInfo {
  name: string
  code: string
  contactEmail: string
  contactPhone: string
  avgResponseDays: number
  address: string
  jurisdiction: string
}

interface SubmissionResult {
  applicationId: string
  status: 'SUBMITTED' | 'PENDING_REVIEW'
  estimatedApprovalDate: string
  trackingUrl?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const OPERATION_TYPES = [
  { value: 'VLOS',              label: 'Visual Line of Sight (VLOS)' },
  { value: 'BVLOS',             label: 'Beyond Visual Line of Sight (BVLOS)' },
  { value: 'AGRICULTURAL',      label: 'Agricultural Operations' },
  { value: 'SURVEY',            label: 'Aerial Survey / Mapping' },
  { value: 'PHOTOGRAPHY',       label: 'Aerial Photography / Videography' },
  { value: 'EMERGENCY_MEDICAL', label: 'Emergency / Medical Delivery' },
  { value: 'INFRASTRUCTURE',    label: 'Infrastructure Inspection' },
  { value: 'DEFENCE',           label: 'Defence Operations' },
] as const

type OperationType = typeof OPERATION_TYPES[number]['value']

const MAX_INSURANCE_SIZE_MB = 5
const MAX_MANUAL_SIZE_MB = 10
const MAX_SORA_SIZE_MB = 10
const MAX_PESTICIDE_SIZE_MB = 5

// ── Zod Schema ───────────────────────────────────────────────────────────────

const yellowZoneSchema = z.object({
  // Step 2 fields
  typeOfOperation: z.enum([
    'VLOS', 'BVLOS', 'AGRICULTURAL', 'SURVEY',
    'PHOTOGRAPHY', 'EMERGENCY_MEDICAL', 'INFRASTRUCTURE', 'DEFENCE',
  ], { required_error: 'Select an operation type' }),
  flightTerminationOrReturnHomeCapability: z.boolean(),
  geoFencingCapability: z.boolean(),
  detectAndAvoidCapability: z.boolean(),
  selfDeclaration: z.boolean().refine(v => v === true, {
    message: 'You must accept the self-declaration to proceed',
  }),
  ssrTransponder: z.boolean(),
  adsbOut: z.boolean(),
}).superRefine((data, ctx) => {
  // SSR transponder and ADS-B OUT are required if altitude > 120m
  // This check happens at the component level since we need flight context
})

type YellowZoneFormData = z.infer<typeof yellowZoneSchema>

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '6px',
  padding: '0.8rem',
  marginBottom: '0.6rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  color: T.muted,
  marginBottom: '2px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.5rem',
  background: T.bg,
  color: T.textBright,
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  fontSize: '0.72rem',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6'%3E%3Cpath d='M0 0l4 6 4-6z' fill='%234A6A7A'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.5rem center',
  paddingRight: '1.5rem',
}

const btnBase: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.68rem',
  fontWeight: 600,
  transition: 'all 0.15s',
  fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: T.primary,
  color: '#fff',
  borderColor: T.primary,
}

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: 'transparent',
  color: T.text,
  borderColor: T.border,
}

const errorTextStyle: React.CSSProperties = {
  fontSize: '0.58rem',
  color: T.red,
  marginTop: '2px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: T.textBright,
  marginBottom: '0.5rem',
  letterSpacing: '0.02em',
}

// ── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Authority' },
  { num: 2, label: 'Details' },
  { num: 3, label: 'Documents' },
  { num: 4, label: 'Review' },
] as const

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      marginBottom: '1rem',
      padding: '0 0.2rem',
    }}>
      {STEPS.map((step, i) => {
        const isActive = step.num === current
        const isCompleted = step.num < current
        const dotColor = isCompleted ? '#22C55E' : isActive ? T.primary : T.border

        return (
          <React.Fragment key={step.num}>
            {i > 0 && (
              <div style={{
                flex: 1,
                height: '1px',
                background: isCompleted ? '#22C55E40' : T.border,
              }} />
            )}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              minWidth: '48px',
            }}>
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: isCompleted ? '#22C55E20' : isActive ? T.primary + '20' : 'transparent',
                border: `2px solid ${dotColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.58rem',
                fontWeight: 700,
                color: isCompleted ? '#22C55E' : isActive ? T.primary : T.muted,
              }}>
                {isCompleted ? '\u2713' : step.num}
              </div>
              <span style={{
                fontSize: '0.52rem',
                color: isActive ? T.primary : isCompleted ? '#22C55E' : T.muted,
                fontWeight: isActive ? 700 : 400,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Toggle Component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.4rem 0',
        cursor: 'pointer',
      }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: '32px',
        minWidth: '32px',
        height: '18px',
        borderRadius: '9px',
        background: checked ? T.primary + '40' : T.border,
        position: 'relative',
        transition: 'background 0.2s',
        marginTop: '1px',
      }}>
        <div style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: checked ? T.primary : T.muted,
          position: 'absolute',
          top: '2px',
          left: checked ? '16px' : '2px',
          transition: 'left 0.2s, background 0.2s',
        }} />
      </div>
      <div>
        <div style={{
          fontSize: '0.68rem',
          color: T.textBright,
          fontWeight: 500,
        }}>{label}</div>
        {description && (
          <div style={{
            fontSize: '0.55rem',
            color: T.muted,
            marginTop: '1px',
            lineHeight: 1.4,
          }}>{description}</div>
        )}
      </div>
    </div>
  )
}

// ── File Upload Zone ─────────────────────────────────────────────────────────

interface UploadedFile {
  file: File
  name: string
  sizeMB: number
  type: string
}

function FileUploadZone({
  label,
  accept,
  maxSizeMB,
  required,
  file,
  onFileSelect,
  onFileRemove,
  error,
}: {
  label: string
  accept: string
  maxSizeMB: number
  required: boolean
  file: UploadedFile | null
  onFileSelect: (f: UploadedFile) => void
  onFileRemove: () => void
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const validateAndSet = useCallback((f: File) => {
    setLocalError(null)

    const sizeMB = f.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      setLocalError(`File exceeds ${maxSizeMB}MB limit (${sizeMB.toFixed(1)}MB)`)
      return
    }

    const ext = f.name.toLowerCase().split('.').pop() || ''
    const acceptedExts = accept.split(',').map(a => a.trim().replace('.', '').toLowerCase())
    if (!acceptedExts.includes(ext)) {
      setLocalError(`Invalid file type. Accepted: ${accept}`)
      return
    }

    onFileSelect({ file: f, name: f.name, sizeMB, type: ext })
  }, [accept, maxSizeMB, onFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }, [validateAndSet])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
    if (inputRef.current) inputRef.current.value = ''
  }, [validateAndSet])

  const displayError = localError || error

  if (file) {
    return (
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: T.red }}>*</span>}
        </label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          background: '#22C55E10',
          border: '1px solid #22C55E30',
          borderRadius: '4px',
        }}>
          <span style={{ color: '#22C55E', fontSize: '0.8rem' }}>{'\u2713'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.65rem',
              color: T.textBright,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{file.name}</div>
            <div style={{
              fontSize: '0.52rem',
              color: T.muted,
            }}>{file.sizeMB.toFixed(1)} MB -- {file.type.toUpperCase()}</div>
          </div>
          <button
            type="button"
            onClick={onFileRemove}
            style={{
              background: 'none',
              border: 'none',
              color: T.red,
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '0 0.2rem',
              fontFamily: 'inherit',
            }}
          >{'\u2715'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: T.red }}>*</span>}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `1px dashed ${isDragging ? T.primary : displayError ? T.red : T.border}`,
          borderRadius: '4px',
          padding: '0.6rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? T.primary + '08' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: '1rem', color: T.muted, marginBottom: '0.2rem' }}>{'\u2191'}</div>
        <div style={{ fontSize: '0.58rem', color: T.muted }}>
          Drag & drop or click to upload
        </div>
        <div style={{ fontSize: '0.5rem', color: T.muted, marginTop: '0.15rem' }}>
          {accept.toUpperCase()} -- Max {maxSizeMB}MB
        </div>
      </div>
      {displayError && <div style={errorTextStyle}>{displayError}</div>}
    </div>
  )
}

// ── Authority Lookup (mock data for known Indian ATC authorities) ────────────

function resolveAuthority(authorityCode?: string): AuthorityInfo {
  const authorities: Record<string, AuthorityInfo> = {
    'AAI': {
      name: 'Airports Authority of India',
      code: 'AAI',
      contactEmail: 'uasops@aai.aero',
      contactPhone: '+91-11-24632950',
      avgResponseDays: 7,
      address: 'Rajiv Gandhi Bhawan, Safdarjung Airport, New Delhi - 110003',
      jurisdiction: 'Civil Controlled Airspace',
    },
    'IAF': {
      name: 'Indian Air Force (AFMLU)',
      code: 'IAF',
      contactEmail: 'afmlu.ops@iaf.nic.in',
      contactPhone: '+91-11-23010231',
      avgResponseDays: 14,
      address: 'Air Force Military Liaison Unit, Vayu Bhawan, New Delhi - 110011',
      jurisdiction: 'Military / Defence Airspace',
    },
    'DGCA': {
      name: 'Directorate General of Civil Aviation',
      code: 'DGCA',
      contactEmail: 'uas-section@dgca.gov.in',
      contactPhone: '+91-11-24622495',
      avgResponseDays: 10,
      address: 'Opp. Safdarjung Airport, New Delhi - 110003',
      jurisdiction: 'All Indian Controlled Airspace (Yellow Zones)',
    },
    'NAVY': {
      name: 'Indian Navy (DNAS)',
      code: 'NAVY',
      contactEmail: 'dnas.ops@navy.gov.in',
      contactPhone: '+91-11-21748750',
      avgResponseDays: 14,
      address: 'Directorate of Naval Air Staff, South Block, New Delhi - 110011',
      jurisdiction: 'Naval Airspace & Coastal Zones',
    },
  }

  const code = authorityCode?.toUpperCase() || 'DGCA'
  return authorities[code] || authorities['DGCA']
}

function isExpeditedEligible(opType: string): boolean {
  return opType === 'EMERGENCY_MEDICAL' || opType === 'DEFENCE'
}

function estimateApprovalDate(authority: AuthorityInfo, isExpedited: boolean): string {
  const days = isExpedited ? Math.ceil(authority.avgResponseDays / 3) : authority.avgResponseDays
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface YellowZoneWizardProps {
  zoneCheckResult: ZoneCheckResult
  flightContext: FlightContext
  onClose: () => void
  onSubmitted?: (applicationId: string) => void
}

// ── Main Component ───────────────────────────────────────────────────────────

export function YellowZoneWizard({
  zoneCheckResult,
  flightContext,
  onClose,
  onSubmitted,
}: YellowZoneWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Document uploads
  const [insuranceFile, setInsuranceFile] = useState<UploadedFile | null>(null)
  const [manualFile, setManualFile] = useState<UploadedFile | null>(null)
  const [soraFile, setSoraFile] = useState<UploadedFile | null>(null)
  const [pesticideFile, setPesticideFile] = useState<UploadedFile | null>(null)

  // Authority info
  const authority = resolveAuthority(zoneCheckResult.authority)

  // React Hook Form setup
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
    trigger,
  } = useForm<YellowZoneFormData>({
    resolver: zodResolver(yellowZoneSchema),
    mode: 'onChange',
    defaultValues: {
      typeOfOperation: undefined,
      flightTerminationOrReturnHomeCapability: false,
      geoFencingCapability: false,
      detectAndAvoidCapability: false,
      selfDeclaration: false,
      ssrTransponder: false,
      adsbOut: false,
    },
  })

  const typeOfOperation = watch('typeOfOperation')
  const needsBvlosDocs = typeOfOperation === 'BVLOS'
  const needsPesticideDocs = typeOfOperation === 'AGRICULTURAL'
  const isAbove120m = flightContext.altitudeAglM > 120

  // ── Step navigation ──────────────────────────────────────────────────────

  const canAdvanceToStep2 = true // Step 1 is informational
  const canAdvanceToStep3 = isValid
  const canAdvanceToStep4 = (() => {
    if (!insuranceFile) return false
    if (!manualFile) return false
    if (needsBvlosDocs && !soraFile) return false
    if (needsPesticideDocs && !pesticideFile) return false
    return true
  })()

  const goNext = useCallback(async () => {
    if (currentStep === 2) {
      const valid = await trigger()
      if (!valid) return
    }
    setCurrentStep(prev => Math.min(prev + 1, 4))
  }, [currentStep, trigger])

  const goBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }, [])

  // ── Submission ───────────────────────────────────────────────────────────

  const onSubmit = useCallback(async (formData: YellowZoneFormData) => {
    setSubmitting(true)
    setSubmitError(null)

    try {
      const payload = new FormData()

      // Append form fields
      payload.append('typeOfOperation', formData.typeOfOperation)
      payload.append('flightTerminationOrReturnHomeCapability', String(formData.flightTerminationOrReturnHomeCapability))
      payload.append('geoFencingCapability', String(formData.geoFencingCapability))
      payload.append('detectAndAvoidCapability', String(formData.detectAndAvoidCapability))
      payload.append('selfDeclaration', String(formData.selfDeclaration))
      payload.append('ssrTransponder', String(formData.ssrTransponder))
      payload.append('adsbOut', String(formData.adsbOut))

      // Append flight context
      payload.append('geometry', JSON.stringify(flightContext.geometry))
      payload.append('altitudeAglM', String(flightContext.altitudeAglM))
      if (flightContext.startTimeUtc) payload.append('startTimeUtc', flightContext.startTimeUtc)
      if (flightContext.endTimeUtc) payload.append('endTimeUtc', flightContext.endTimeUtc)

      // Append zone info
      payload.append('authorityCode', authority.code)
      payload.append('zoneClassification', zoneCheckResult.overallClassification)
      payload.append('zoneSegments', JSON.stringify(zoneCheckResult.segments))

      // Append files
      if (insuranceFile) payload.append('insuranceCertificate', insuranceFile.file)
      if (manualFile) payload.append('operationsManual', manualFile.file)
      if (soraFile) payload.append('soraDocument', soraFile.file)
      if (pesticideFile) payload.append('pesticideApplicatorCert', pesticideFile.file)

      const { data } = await userApi().post('/drone/flight-permission/submit', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setSubmissionResult({
        applicationId: data.applicationId || data.id || 'FP-' + Date.now(),
        status: data.status || 'SUBMITTED',
        estimatedApprovalDate: data.estimatedApprovalDate || estimateApprovalDate(
          authority,
          isExpeditedEligible(formData.typeOfOperation),
        ),
        trackingUrl: data.trackingUrl,
      })

      onSubmitted?.(data.applicationId || data.id)
    } catch (err: any) {
      const msg = err?.response?.data?.error
        || err?.response?.data?.message
        || err?.message
        || 'Submission failed. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [flightContext, authority, zoneCheckResult, insuranceFile, manualFile, soraFile, pesticideFile, onSubmitted])

  // ── Step 1: Authority Identification ─────────────────────────────────────

  function renderStep1() {
    const expedited = typeOfOperation ? isExpeditedEligible(typeOfOperation) : false

    return (
      <div>
        <h3 style={sectionTitle}>ATC Authority Identification</h3>

        {/* Authority card */}
        <div style={{
          ...cardStyle,
          borderColor: T.primary + '40',
          borderLeft: `3px solid ${T.primary}`,
        }}>
          <div style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: T.textBright,
            marginBottom: '0.3rem',
          }}>{authority.name}</div>
          <div style={{
            fontSize: '0.55rem',
            color: T.muted,
            marginBottom: '0.1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>CODE: {authority.code} -- {authority.jurisdiction}</div>

          <div style={{ borderTop: `1px solid ${T.border}`, margin: '0.5rem 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <div>
              <span style={{ ...labelStyle, marginBottom: 0 }}>EMAIL</span>
              <div style={{ fontSize: '0.62rem', color: T.primary }}>{authority.contactEmail}</div>
            </div>
            <div>
              <span style={{ ...labelStyle, marginBottom: 0 }}>PHONE</span>
              <div style={{ fontSize: '0.62rem', color: T.textBright }}>{authority.contactPhone}</div>
            </div>
            <div>
              <span style={{ ...labelStyle, marginBottom: 0 }}>ADDRESS</span>
              <div style={{ fontSize: '0.58rem', color: T.text, lineHeight: 1.3 }}>{authority.address}</div>
            </div>
            <div>
              <span style={{ ...labelStyle, marginBottom: 0 }}>AVG. RESPONSE TIME</span>
              <div style={{ fontSize: '0.62rem', color: T.amber }}>{authority.avgResponseDays} business days</div>
            </div>
          </div>
        </div>

        {/* Expedited eligibility banner */}
        {expedited && (
          <div style={{
            ...cardStyle,
            background: '#22C55E10',
            borderColor: '#22C55E30',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1rem', color: '#22C55E' }}>{'\u26A1'}</span>
            <div>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#22C55E',
              }}>Expedited Processing Eligible</div>
              <div style={{
                fontSize: '0.55rem',
                color: T.text,
              }}>Emergency/Medical and Defence operations qualify for expedited review ({Math.ceil(authority.avgResponseDays / 3)} days)</div>
            </div>
          </div>
        )}

        {/* Zone segments summary */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>AFFECTED ZONE SEGMENTS</div>
          {zoneCheckResult.segments.map((seg, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.4rem',
              padding: '0.25rem 0',
              borderTop: i > 0 ? `1px solid ${T.border}` : undefined,
            }}>
              <span style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                color: seg.classification === 'YELLOW' ? '#EAB308' : '#22C55E',
                minWidth: '42px',
              }}>{seg.classification}</span>
              <div>
                <div style={{ fontSize: '0.62rem', color: T.textBright, fontWeight: 500 }}>{seg.zoneName}</div>
                <div style={{ fontSize: '0.52rem', color: T.muted }}>{seg.reason}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Documents needed preview */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>DOCUMENTS YOU WILL NEED</div>
          <ul style={{
            margin: 0,
            paddingLeft: '1rem',
            fontSize: '0.62rem',
            color: T.text,
            lineHeight: 1.6,
          }}>
            <li>Insurance certificate (PDF, max {MAX_INSURANCE_SIZE_MB}MB)</li>
            <li>Operations manual / SOP (PDF, max {MAX_MANUAL_SIZE_MB}MB)</li>
            {needsBvlosDocs && (
              <li style={{ color: T.amber }}>SORA (Specific Operations Risk Assessment) -- required for BVLOS</li>
            )}
            {needsPesticideDocs && (
              <li style={{ color: T.amber }}>Pesticide Applicator Certificate -- required for Agricultural ops</li>
            )}
            {isAbove120m && (
              <li style={{ color: T.amber }}>SSR Transponder and/or ADS-B OUT evidence -- required above 120m AGL</li>
            )}
          </ul>
        </div>
      </div>
    )
  }

  // ── Step 2: Additional Details ───────────────────────────────────────────

  function renderStep2() {
    return (
      <div>
        <h3 style={sectionTitle}>Additional Operation Details</h3>

        {/* Type of Operation */}
        <div style={{ marginBottom: '0.6rem' }}>
          <label style={labelStyle}>TYPE OF OPERATION <span style={{ color: T.red }}>*</span></label>
          <Controller
            name="typeOfOperation"
            control={control}
            render={({ field }) => (
              <select
                value={field.value || ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                style={{
                  ...selectStyle,
                  borderColor: errors.typeOfOperation ? T.red : T.border,
                }}
              >
                <option value="" disabled>Select operation type...</option>
                {OPERATION_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          />
          {errors.typeOfOperation && (
            <div style={errorTextStyle}>{errors.typeOfOperation.message}</div>
          )}
        </div>

        {/* Capability toggles */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>DRONE CAPABILITIES</div>

          <Controller
            name="flightTerminationOrReturnHomeCapability"
            control={control}
            render={({ field }) => (
              <Toggle
                checked={field.value}
                onChange={field.onChange}
                label="Flight Termination / Return-to-Home"
                description="Drone can autonomously terminate flight or return to launch point on command loss or geofence breach."
              />
            )}
          />

          <Controller
            name="geoFencingCapability"
            control={control}
            render={({ field }) => (
              <Toggle
                checked={field.value}
                onChange={field.onChange}
                label="Geo-Fencing Capability"
                description="Drone enforces geo-fence boundaries and will not cross into restricted airspace."
              />
            )}
          />

          <Controller
            name="detectAndAvoidCapability"
            control={control}
            render={({ field }) => (
              <Toggle
                checked={field.value}
                onChange={field.onChange}
                label="Detect & Avoid (DAA)"
                description="Drone has onboard sensors (radar, LIDAR, ADS-B IN) for detecting and avoiding other aircraft."
              />
            )}
          />
        </div>

        {/* Equipment checkboxes */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>
            SURVEILLANCE EQUIPMENT
            {isAbove120m && (
              <span style={{ color: T.amber, fontWeight: 700 }}> (REQUIRED ABOVE 120m)</span>
            )}
          </div>

          <Controller
            name="ssrTransponder"
            control={control}
            render={({ field }) => (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0',
                cursor: 'pointer',
                fontSize: '0.65rem',
                color: T.textBright,
              }}>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  style={{ accentColor: T.primary }}
                />
                SSR Transponder (Mode A/C or Mode S)
              </label>
            )}
          />

          <Controller
            name="adsbOut"
            control={control}
            render={({ field }) => (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0',
                cursor: 'pointer',
                fontSize: '0.65rem',
                color: T.textBright,
              }}>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  style={{ accentColor: T.primary }}
                />
                ADS-B OUT (1090 MHz or UAT)
              </label>
            )}
          />

          {isAbove120m && !watch('ssrTransponder') && !watch('adsbOut') && (
            <div style={{
              ...errorTextStyle,
              background: T.red + '10',
              padding: '0.3rem 0.5rem',
              borderRadius: '3px',
              marginTop: '0.3rem',
            }}>
              At least one surveillance equipment is required for operations above 120m AGL.
            </div>
          )}
        </div>

        {/* Self-declaration */}
        <div style={{
          ...cardStyle,
          borderColor: errors.selfDeclaration ? T.red : T.border,
        }}>
          <Controller
            name="selfDeclaration"
            control={control}
            render={({ field }) => (
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  style={{ accentColor: T.primary, marginTop: '2px' }}
                />
                <div>
                  <div style={{
                    fontSize: '0.65rem',
                    color: T.textBright,
                    fontWeight: 600,
                    marginBottom: '0.25rem',
                  }}>Self-Declaration</div>
                  <div style={{
                    fontSize: '0.55rem',
                    color: T.text,
                    lineHeight: 1.5,
                  }}>
                    I hereby declare that all information provided is true and accurate to the best of my knowledge.
                    I understand that providing false information is an offence under the DGCA UAS Rules 2021 and
                    may result in suspension or revocation of my Remote Pilot Certificate (RPC) and Unmanned Aircraft
                    Operator Permit (UAOP). I confirm that the drone to be operated complies with all applicable
                    airworthiness requirements and that I hold a valid remote pilot licence for the category of
                    operation specified. I acknowledge that ATC permission does not absolve me of responsibility for
                    safe operation and compliance with all applicable regulations.
                  </div>
                </div>
              </label>
            )}
          />
          {errors.selfDeclaration && (
            <div style={{ ...errorTextStyle, marginTop: '0.3rem', marginLeft: '1.2rem' }}>
              {errors.selfDeclaration.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Step 3: Document Upload ──────────────────────────────────────────────

  function renderStep3() {
    return (
      <div>
        <h3 style={sectionTitle}>Document Upload</h3>

        <div style={{
          fontSize: '0.58rem',
          color: T.muted,
          marginBottom: '0.6rem',
          lineHeight: 1.4,
        }}>
          Upload required documents for ATC permission processing.
          All files must be in PDF format.
        </div>

        {/* Insurance Certificate */}
        <FileUploadZone
          label="Insurance Certificate"
          accept=".pdf"
          maxSizeMB={MAX_INSURANCE_SIZE_MB}
          required={true}
          file={insuranceFile}
          onFileSelect={setInsuranceFile}
          onFileRemove={() => setInsuranceFile(null)}
        />

        {/* Operations Manual / SOP */}
        <FileUploadZone
          label="Operations Manual / SOP"
          accept=".pdf"
          maxSizeMB={MAX_MANUAL_SIZE_MB}
          required={true}
          file={manualFile}
          onFileSelect={setManualFile}
          onFileRemove={() => setManualFile(null)}
        />

        {/* SORA -- only for BVLOS */}
        {needsBvlosDocs && (
          <FileUploadZone
            label="SORA (Specific Operations Risk Assessment)"
            accept=".pdf"
            maxSizeMB={MAX_SORA_SIZE_MB}
            required={true}
            file={soraFile}
            onFileSelect={setSoraFile}
            onFileRemove={() => setSoraFile(null)}
          />
        )}

        {/* Pesticide cert -- only for Agricultural */}
        {needsPesticideDocs && (
          <FileUploadZone
            label="Pesticide Applicator Certificate"
            accept=".pdf"
            maxSizeMB={MAX_PESTICIDE_SIZE_MB}
            required={true}
            file={pesticideFile}
            onFileSelect={setPesticideFile}
            onFileRemove={() => setPesticideFile(null)}
          />
        )}

        {/* Upload summary */}
        <div style={{
          ...cardStyle,
          background: T.bg,
          marginTop: '0.3rem',
        }}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>UPLOAD STATUS</div>
          {([
            { label: 'Insurance Certificate', done: !!insuranceFile, required: true },
            { label: 'Operations Manual / SOP', done: !!manualFile, required: true },
            ...(needsBvlosDocs ? [{ label: 'SORA Document', done: !!soraFile, required: true }] : []),
            ...(needsPesticideDocs ? [{ label: 'Pesticide Applicator Cert', done: !!pesticideFile, required: true }] : []),
          ]).map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.15rem 0',
              fontSize: '0.58rem',
            }}>
              <span style={{
                color: item.done ? '#22C55E' : T.red,
                fontSize: '0.7rem',
              }}>{item.done ? '\u2713' : '\u2022'}</span>
              <span style={{
                color: item.done ? T.text : T.muted,
              }}>{item.label}</span>
              {item.required && !item.done && (
                <span style={{ color: T.red, fontSize: '0.5rem' }}>REQUIRED</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 4: Review & Submit ──────────────────────────────────────────────

  function renderStep4() {
    const formValues = watch()
    const expedited = typeOfOperation ? isExpeditedEligible(typeOfOperation) : false
    const estDate = estimateApprovalDate(authority, expedited)

    // If already submitted
    if (submissionResult) {
      return (
        <div>
          <div style={{
            ...cardStyle,
            borderColor: '#22C55E40',
            background: '#22C55E08',
            textAlign: 'center',
            padding: '1.2rem',
          }}>
            <div style={{
              fontSize: '2rem',
              color: '#22C55E',
              marginBottom: '0.5rem',
            }}>{'\u2713'}</div>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#22C55E',
              marginBottom: '0.3rem',
            }}>Application Submitted Successfully</div>
            <div style={{
              fontSize: '0.62rem',
              color: T.text,
              marginBottom: '0.8rem',
            }}>Your application has been routed to {authority.name} for review.</div>

            <div style={{
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: '4px',
              padding: '0.8rem',
              textAlign: 'left',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <span style={labelStyle}>APPLICATION ID</span>
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: T.primary,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  }}>{submissionResult.applicationId}</div>
                </div>
                <div>
                  <span style={labelStyle}>STATUS</span>
                  <div style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    color: T.amber,
                  }}>{submissionResult.status.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <span style={labelStyle}>ESTIMATED APPROVAL</span>
                  <div style={{
                    fontSize: '0.65rem',
                    color: T.textBright,
                  }}>{submissionResult.estimatedApprovalDate}</div>
                </div>
                <div>
                  <span style={labelStyle}>AUTHORITY</span>
                  <div style={{
                    fontSize: '0.65rem',
                    color: T.text,
                  }}>{authority.code}</div>
                </div>
              </div>
            </div>

            {/* Tracking instructions */}
            <div style={{
              marginTop: '0.8rem',
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: '4px',
              padding: '0.6rem',
              textAlign: 'left',
            }}>
              <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>TRACKING INSTRUCTIONS</div>
              <ul style={{
                margin: 0,
                paddingLeft: '1rem',
                fontSize: '0.58rem',
                color: T.text,
                lineHeight: 1.6,
              }}>
                <li>Your application ID is <strong style={{ color: T.primary }}>{submissionResult.applicationId}</strong>. Save this for reference.</li>
                <li>You will receive status updates via email and in-app notifications.</li>
                <li>Check the Dashboard for real-time status updates on your application.</li>
                <li>Average processing time: {authority.avgResponseDays} business days{expedited ? ' (expedited)' : ''}.</li>
                <li>If no response within the estimated timeframe, contact {authority.contactEmail}.</li>
              </ul>
            </div>
          </div>

          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
            <button
              onClick={onClose}
              style={{
                ...btnPrimary,
                padding: '0.5rem 1.5rem',
              }}
            >
              Return to Flight Planner
            </button>
          </div>
        </div>
      )
    }

    // Review summary
    return (
      <div>
        <h3 style={sectionTitle}>Review & Submit</h3>

        {/* Summary card */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>APPLICATION SUMMARY</div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr',
            gap: '0.25rem 0.5rem',
            fontSize: '0.62rem',
          }}>
            <span style={{ color: T.muted }}>Authority:</span>
            <span style={{ color: T.textBright }}>{authority.name} ({authority.code})</span>

            <span style={{ color: T.muted }}>Operation Type:</span>
            <span style={{ color: T.textBright }}>
              {OPERATION_TYPES.find(o => o.value === formValues.typeOfOperation)?.label || '--'}
            </span>

            <span style={{ color: T.muted }}>Altitude (AGL):</span>
            <span style={{ color: isAbove120m ? T.amber : T.textBright }}>
              {flightContext.altitudeAglM}m{isAbove120m ? ' (above 120m limit)' : ''}
            </span>

            {flightContext.startTimeUtc && (
              <>
                <span style={{ color: T.muted }}>Start Time:</span>
                <span style={{ color: T.textBright }}>{new Date(flightContext.startTimeUtc).toLocaleString()}</span>
              </>
            )}

            {flightContext.endTimeUtc && (
              <>
                <span style={{ color: T.muted }}>End Time:</span>
                <span style={{ color: T.textBright }}>{new Date(flightContext.endTimeUtc).toLocaleString()}</span>
              </>
            )}
          </div>
        </div>

        {/* Capabilities summary */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>CAPABILITIES DECLARED</div>
          {([
            { label: 'Flight Termination / RTH', value: formValues.flightTerminationOrReturnHomeCapability },
            { label: 'Geo-Fencing', value: formValues.geoFencingCapability },
            { label: 'Detect & Avoid (DAA)', value: formValues.detectAndAvoidCapability },
            { label: 'SSR Transponder', value: formValues.ssrTransponder },
            { label: 'ADS-B OUT', value: formValues.adsbOut },
          ]).map((cap, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.15rem 0',
              fontSize: '0.6rem',
            }}>
              <span style={{
                color: cap.value ? '#22C55E' : T.muted,
                fontSize: '0.7rem',
                width: '14px',
                textAlign: 'center',
              }}>{cap.value ? '\u2713' : '\u2717'}</span>
              <span style={{ color: cap.value ? T.textBright : T.muted }}>{cap.label}</span>
            </div>
          ))}
        </div>

        {/* Documents summary */}
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>DOCUMENTS ATTACHED</div>
          {([
            { label: 'Insurance Certificate', file: insuranceFile },
            { label: 'Operations Manual / SOP', file: manualFile },
            ...(needsBvlosDocs ? [{ label: 'SORA Document', file: soraFile }] : []),
            ...(needsPesticideDocs ? [{ label: 'Pesticide Applicator Cert', file: pesticideFile }] : []),
          ]).map((doc, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.15rem 0',
              fontSize: '0.6rem',
            }}>
              <span style={{ color: '#22C55E', fontSize: '0.7rem' }}>{'\u2713'}</span>
              <span style={{ color: T.textBright }}>{doc.label}</span>
              {doc.file && (
                <span style={{ color: T.muted, fontSize: '0.5rem' }}>({doc.file.sizeMB.toFixed(1)}MB)</span>
              )}
            </div>
          ))}
        </div>

        {/* Zone map preview (non-editable) */}
        <div style={{
          ...cardStyle,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>ZONE MAP PREVIEW</div>
          <div style={{
            height: '140px',
            background: T.bg,
            borderRadius: '4px',
            border: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Map area representation */}
            <div style={{
              fontSize: '0.58rem',
              color: T.muted,
              textAlign: 'center',
              lineHeight: 1.4,
            }}>
              <div style={{ marginBottom: '0.3rem' }}>{'\u{1F5FA}'}</div>
              Flight area geometry with {authority.code} territory overlay
              <br />
              {zoneCheckResult.segments.length} zone segment(s) identified
            </div>
            {/* Authority territory badge */}
            <div style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              background: '#EAB30820',
              border: '1px solid #EAB30840',
              borderRadius: '3px',
              padding: '0.15rem 0.4rem',
              fontSize: '0.5rem',
              color: '#EAB308',
              fontWeight: 600,
            }}>
              {authority.code} TERRITORY
            </div>
          </div>
        </div>

        {/* Estimated approval */}
        <div style={{
          ...cardStyle,
          borderColor: T.amber + '40',
          background: T.amber + '08',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: T.amber }}>{'\u23F1'}</span>
            <div>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: T.amber,
              }}>Estimated Approval: {estDate}</div>
              <div style={{
                fontSize: '0.52rem',
                color: T.text,
              }}>
                Based on {authority.code} average processing time
                {expedited ? ' (expedited track)' : ''} -- {expedited ? Math.ceil(authority.avgResponseDays / 3) : authority.avgResponseDays} business days
              </div>
            </div>
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div style={{
            ...cardStyle,
            borderColor: T.red + '40',
            background: T.red + '10',
            fontSize: '0.62rem',
            color: T.red,
          }}>
            {submitError}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1()
      case 2: return renderStep2()
      case 3: return renderStep3()
      case 4: return renderStep4()
      default: return null
    }
  }

  const canGoNext = (() => {
    switch (currentStep) {
      case 1: return canAdvanceToStep2
      case 2: return canAdvanceToStep3
      case 3: return canAdvanceToStep4
      default: return false
    }
  })()

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    }}>
      <div style={{
        width: '580px',
        maxWidth: '95vw',
        maxHeight: '92vh',
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.7rem 1rem',
          borderBottom: `1px solid ${T.border}`,
          background: '#EAB30808',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', color: '#EAB308' }}>{'\u26A0'}</span>
            <div>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#EAB308',
                letterSpacing: '0.04em',
              }}>YELLOW ZONE PERMISSION WIZARD</div>
              <div style={{
                fontSize: '0.52rem',
                color: T.muted,
              }}>ATC permission application for controlled airspace operations</div>
            </div>
          </div>
          {!submissionResult && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: T.muted,
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '0.2rem',
                fontFamily: 'inherit',
              }}
            >{'\u2715'}</button>
          )}
        </div>

        {/* Step indicator */}
        {!submissionResult && (
          <div style={{ padding: '0.7rem 1rem 0' }}>
            <StepIndicator current={currentStep} />
          </div>
        )}

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 1rem 1rem',
        }}>
          {renderCurrentStep()}
        </div>

        {/* Footer navigation */}
        {!submissionResult && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 1rem',
            borderTop: `1px solid ${T.border}`,
            background: T.bg,
          }}>
            <button
              onClick={currentStep === 1 ? onClose : goBack}
              style={btnSecondary}
            >
              {currentStep === 1 ? 'Cancel' : 'Back'}
            </button>

            <div style={{
              fontSize: '0.52rem',
              color: T.muted,
            }}>
              Step {currentStep} of 4
            </div>

            {currentStep < 4 ? (
              <button
                onClick={goNext}
                disabled={!canGoNext}
                style={{
                  ...btnPrimary,
                  opacity: canGoNext ? 1 : 0.4,
                  cursor: canGoNext ? 'pointer' : 'not-allowed',
                }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit(onSubmit)}
                disabled={submitting}
                style={{
                  ...btnPrimary,
                  background: '#EAB308',
                  borderColor: '#EAB308',
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                {submitting ? 'Submitting...' : 'Submit for ATC Permission'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

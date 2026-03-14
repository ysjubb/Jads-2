import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useForm, Controller, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { T } from '../../theme'
import { userApi } from '../../api/client'
import {
  FlightCategory,
  FlightCategoryType,
  CATEGORY_META,
  CategoryMeta,
  buildSchemaForCategory,
  detectCategory,
  UserProfile,
  PURPOSE_OPTIONS,
  CIBRC_PESTICIDE_CODES,
  CROP_TYPES,
  SENSOR_TYPES,
  DATA_USAGE_TYPES,
} from '../../schemas/drone/flightPlanSchemas'

// ── Types ────────────────────────────────────────────────────────────────────

interface AdaptiveFlightFormProps {
  userProfile?: UserProfile
  initialCategory?: FlightCategoryType
  onSubmitSuccess?: (result: any) => void
  onCancel?: () => void
}

interface ZoneCheckResult {
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

interface UploadedFile {
  file: File
  name: string
  sizeMB: number
  type: string
}

// ── Styles (match existing codebase) ────────────────────────────────────────

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
  appearance: 'none' as const,
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

const infoCardStyle: React.CSSProperties = {
  background: T.primary + '10',
  border: `1px solid ${T.primary}30`,
  borderRadius: '6px',
  padding: '0.8rem 1rem',
  marginBottom: '0.8rem',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

function roundTo15Min(date: Date): Date {
  const d = new Date(date)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function estimateSecondsRemaining(
  currentStep: number,
  totalSteps: number,
  totalMinutes: number,
): number {
  const fraction = (totalSteps - currentStep) / totalSteps
  return Math.round(fraction * totalMinutes * 60)
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Almost done'
  if (seconds < 60) return `~${seconds}s remaining`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (sec === 0) return `~${min}m remaining`
  return `~${min}m ${sec}s remaining`
}

// ── Category Selector ───────────────────────────────────────────────────────

const CATEGORY_GROUPS = [
  {
    group: 'Recreational',
    items: [
      FlightCategory.NANO_RECREATIONAL,
      FlightCategory.MICRO_RECREATIONAL,
    ],
  },
  {
    group: 'Commercial VLOS',
    items: [
      FlightCategory.MICRO_COMMERCIAL,
      FlightCategory.SMALL_VLOS,
    ],
  },
  {
    group: 'Specialized',
    items: [
      FlightCategory.AGRICULTURAL,
      FlightCategory.COMMERCIAL_SURVEY,
      FlightCategory.PHOTOGRAPHY,
    ],
  },
  {
    group: 'Advanced',
    items: [
      FlightCategory.BVLOS,
      FlightCategory.NIGHT_OPS,
      FlightCategory.SPECIAL,
    ],
  },
]

function CategorySelector({
  selected,
  onChange,
}: {
  selected: FlightCategoryType
  onChange: (c: FlightCategoryType) => void
}) {
  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Operation Category</div>
      <p style={{ fontSize: '0.6rem', color: T.muted, marginBottom: '0.6rem' }}>
        Select the category that matches your drone and operation type.
        The form will adapt to show only the fields you need.
      </p>
      {CATEGORY_GROUPS.map(group => (
        <div key={group.group} style={{ marginBottom: '0.5rem' }}>
          <div style={{
            fontSize: '0.55rem', color: T.muted, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: '0.3rem',
          }}>
            {group.group}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {group.items.map(cat => {
              const meta = CATEGORY_META[cat]
              const isActive = selected === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onChange(cat)}
                  style={{
                    ...btnBase,
                    background: isActive ? T.primary + '20' : 'transparent',
                    color: isActive ? T.primary : T.text,
                    borderColor: isActive ? T.primary : T.border,
                    fontSize: '0.62rem',
                    padding: '0.35rem 0.6rem',
                  }}
                >
                  {meta.label}
                  <span style={{
                    fontSize: '0.5rem',
                    color: T.muted,
                    marginLeft: '0.3rem',
                  }}>
                    ~{meta.estimatedMinutes < 1
                      ? '30s'
                      : meta.estimatedMinutes + 'min'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Progress Indicator ──────────────────────────────────────────────────────

function ProgressIndicator({
  currentStep,
  totalSteps,
  stepLabels,
  estimatedSeconds,
}: {
  currentStep: number
  totalSteps: number
  stepLabels: string[]
  estimatedSeconds: number
}) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '6px',
      padding: '0.6rem 0.8rem',
      marginBottom: '0.6rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.8rem',
    }}>
      {/* Step counter */}
      <div style={{
        fontSize: '0.68rem',
        fontWeight: 700,
        color: T.primary,
        whiteSpace: 'nowrap',
      }}>
        Step {currentStep} of {totalSteps}
      </div>

      {/* Progress bar */}
      <div style={{
        flex: 1,
        height: '4px',
        background: T.border,
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${T.primary}, #22C55E)`,
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {stepLabels.map((label, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < currentStep
          const isActive = stepNum === currentStep
          const dotColor = isCompleted ? '#22C55E' : isActive ? T.primary : T.border

          return (
            <div
              key={i}
              title={label}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isCompleted ? '#22C55E' : isActive ? T.primary : 'transparent',
                border: `1.5px solid ${dotColor}`,
                transition: 'all 0.2s',
              }}
            />
          )
        })}
      </div>

      {/* Time remaining */}
      <div style={{
        fontSize: '0.55rem',
        color: T.muted,
        whiteSpace: 'nowrap',
      }}>
        {formatTimeRemaining(estimatedSeconds)}
      </div>
    </div>
  )
}

// ── Toggle Component ────────────────────────────────────────────────────────

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

// ── File Upload Zone ────────────────────────────────────────────────────────

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

  const displayError = localError || error

  if (file) {
    return (
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: T.red }}>*</span>}
        </label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.4rem 0.6rem',
          background: '#22C55E10', border: '1px solid #22C55E30', borderRadius: '4px',
        }}>
          <span style={{ color: '#22C55E', fontSize: '0.8rem' }}>{'\u2713'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.65rem', color: T.textBright,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{file.name}</div>
            <div style={{ fontSize: '0.52rem', color: T.muted }}>
              {file.sizeMB.toFixed(1)} MB -- {file.type.toUpperCase()}
            </div>
          </div>
          <button type="button" onClick={onFileRemove} style={{
            background: 'none', border: 'none', color: T.red,
            cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.2rem', fontFamily: 'inherit',
          }}>{'\u2715'}</button>
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
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) validateAndSet(f)
          if (inputRef.current) inputRef.current.value = ''
        }}
        style={{ display: 'none' }}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setIsDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) validateAndSet(f)
        }}
        style={{
          border: `1px dashed ${isDragging ? T.primary : displayError ? T.red : T.border}`,
          borderRadius: '4px', padding: '0.6rem', textAlign: 'center',
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

// ── Field Group: Basic (Nano Recreational) ──────────────────────────────────

function BasicFieldGroup({
  form,
  mapRef,
}: {
  form: UseFormReturn<any>
  mapRef: React.RefObject<HTMLDivElement>
}) {
  const { register, formState: { errors }, setValue, watch } = form
  const locationLat = watch('locationLat')
  const locationLon = watch('locationLon')
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) mapInstanceRef.current.remove()

    const map = L.map(mapRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng
      setValue('locationLat', parseFloat(lat.toFixed(6)), { shouldValidate: true })
      setValue('locationLon', parseFloat(lng.toFixed(6)), { shouldValidate: true })
    })

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  // Update marker
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const L = (window as any).L
    const map = mapInstanceRef.current

    if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null }

    const lat = parseFloat(locationLat)
    const lon = parseFloat(locationLon)
    if (isNaN(lat) || isNaN(lon)) return

    markerRef.current = L.marker([lat, lon]).addTo(map).bindPopup('Flight Location')
    map.setView([lat, lon], 12)
  }, [locationLat, locationLon])

  const defaultStart = formatDateTimeLocal(roundTo15Min(new Date(Date.now() + 3600000)))

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Basic Flight Details</div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>Drone Description <span style={{ color: T.red }}>*</span></label>
        <input
          {...register('droneDescription')}
          placeholder='e.g. DJI Mini 3, 249g, recreational'
          style={inputStyle}
        />
        {errors.droneDescription && (
          <div style={errorTextStyle}>{(errors.droneDescription as any).message}</div>
        )}
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>Location (click map or enter coordinates)</label>
        <div ref={mapRef} style={{
          height: '250px', borderRadius: '6px', border: `1px solid ${T.border}`,
          marginBottom: '0.4rem', background: '#0a0a0a',
        }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
          <div>
            <label style={labelStyle}>Latitude</label>
            <input
              type="number"
              step="0.000001"
              {...register('locationLat', { valueAsNumber: true })}
              placeholder="28.5562"
              style={inputStyle}
            />
            {errors.locationLat && (
              <div style={errorTextStyle}>{(errors.locationLat as any).message}</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Longitude</label>
            <input
              type="number"
              step="0.000001"
              {...register('locationLon', { valueAsNumber: true })}
              placeholder="77.1000"
              style={inputStyle}
            />
            {errors.locationLon && (
              <div style={errorTextStyle}>{(errors.locationLon as any).message}</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Planned Time <span style={{ color: T.red }}>*</span></label>
        <input
          type="datetime-local"
          {...register('plannedTime')}
          defaultValue={defaultStart}
          style={inputStyle}
        />
        {errors.plannedTime && (
          <div style={errorTextStyle}>{(errors.plannedTime as any).message}</div>
        )}
      </div>
    </div>
  )
}

// ── Field Group: Location with Polygon ──────────────────────────────────────

function LocationFieldGroup({
  form,
  mapRef,
}: {
  form: UseFormReturn<any>
  mapRef: React.RefObject<HTMLDivElement>
}) {
  const { register, formState: { errors }, setValue, watch } = form
  const mapInstanceRef = useRef<any>(null)
  const polygonRef = useRef<any>(null)
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || typeof (window as any).L === 'undefined') return
    const L = (window as any).L

    if (mapInstanceRef.current) mapInstanceRef.current.remove()

    const map = L.map(mapRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: any) => {
      setPolygonPoints(pts => {
        const newPts = [...pts, [e.latlng.lat, e.latlng.lng] as [number, number]]
        if (newPts.length >= 3) {
          const coords = [...newPts, newPts[0]].map(([lat, lon]) => [lon, lat])
          setValue('locationGeoJson', JSON.stringify({ type: 'Polygon', coordinates: [coords] }), { shouldValidate: true })
        }
        return newPts
      })
    })

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  // Update polygon on map
  useEffect(() => {
    if (!mapInstanceRef.current) return
    const L = (window as any).L
    const map = mapInstanceRef.current

    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null }
    if (polygonPoints.length < 3) return

    const poly = L.polygon(polygonPoints, {
      color: T.amber, fillColor: T.amber, fillOpacity: 0.2, weight: 2,
    }).addTo(map)
    polygonRef.current = poly
    map.fitBounds(poly.getBounds(), { padding: [30, 30] })
  }, [polygonPoints])

  const defaultStart = formatDateTimeLocal(roundTo15Min(new Date(Date.now() + 3600000)))
  const defaultEnd = formatDateTimeLocal(roundTo15Min(new Date(Date.now() + 7200000)))

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Operation Area & Time</div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>
          Operation Polygon (click map to add vertices) <span style={{ color: T.red }}>*</span>
        </label>
        <div ref={mapRef} style={{
          height: '300px', borderRadius: '6px', border: `1px solid ${T.border}`,
          marginBottom: '0.4rem', background: '#0a0a0a',
        }} />
        <p style={{ fontSize: '0.55rem', color: T.muted, marginBottom: '0.3rem' }}>
          {polygonPoints.length} point(s) set. Need at least 3.
          {polygonPoints.length > 0 && (
            <> Vertices: {polygonPoints.map(([lat, lon]) =>
              `(${lat.toFixed(4)}, ${lon.toFixed(4)})`).join(' -> ')}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setPolygonPoints([])
            setValue('locationGeoJson', '', { shouldValidate: true })
          }}
          style={{
            ...btnBase, fontSize: '0.6rem', padding: '0.25rem 0.6rem',
            color: T.red, borderColor: T.red + '40', background: T.red + '10',
          }}
        >
          Clear Vertices
        </button>
        {errors.locationGeoJson && (
          <div style={errorTextStyle}>{(errors.locationGeoJson as any).message}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Start Time (UTC) <span style={{ color: T.red }}>*</span></label>
          <input type="datetime-local" {...register('plannedStartUtc')} defaultValue={defaultStart} style={inputStyle} />
          {errors.plannedStartUtc && <div style={errorTextStyle}>{(errors.plannedStartUtc as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>End Time (UTC) <span style={{ color: T.red }}>*</span></label>
          <input type="datetime-local" {...register('plannedEndUtc')} defaultValue={defaultEnd} style={inputStyle} />
          {errors.plannedEndUtc && <div style={errorTextStyle}>{(errors.plannedEndUtc as any).message}</div>}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Purpose <span style={{ color: T.red }}>*</span></label>
        <select {...register('purpose')} style={selectStyle}>
          <option value="">-- Select Purpose --</option>
          {PURPOSE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {errors.purpose && <div style={errorTextStyle}>{(errors.purpose as any).message}</div>}
      </div>
    </div>
  )
}

// ── Field Group: Operator Details ───────────────────────────────────────────

function OperatorFieldGroup({ form }: { form: UseFormReturn<any> }) {
  const { register, formState: { errors } } = form

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Operator & Drone Credentials</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>UIN <span style={{ color: T.red }}>*</span></label>
          <input {...register('uin')} placeholder="UA-2025-00123" style={inputStyle} />
          {errors.uin && <div style={errorTextStyle}>{(errors.uin as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>UAOP Number <span style={{ color: T.red }}>*</span></label>
          <input {...register('uaop')} placeholder="UAOP-000001" style={inputStyle} />
          {errors.uaop && <div style={errorTextStyle}>{(errors.uaop as any).message}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Remote Pilot Certificate (RPC) ID <span style={{ color: T.red }}>*</span></label>
          <input {...register('rpcId')} placeholder="RPC-IN-000001" style={inputStyle} />
          {errors.rpcId && <div style={errorTextStyle}>{(errors.rpcId as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Operator Name <span style={{ color: T.red }}>*</span></label>
          <input {...register('operatorName')} placeholder="Pilot name" style={inputStyle} />
          {errors.operatorName && <div style={errorTextStyle}>{(errors.operatorName as any).message}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Contact Number <span style={{ color: T.red }}>*</span></label>
          <input {...register('operatorContact')} placeholder="+91-9800000001" style={inputStyle} />
          {errors.operatorContact && <div style={errorTextStyle}>{(errors.operatorContact as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Email <span style={{ color: T.red }}>*</span></label>
          <input {...register('operatorEmail')} placeholder="pilot@company.com" style={inputStyle} />
          {errors.operatorEmail && <div style={errorTextStyle}>{(errors.operatorEmail as any).message}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Field Group: Mission Details ────────────────────────────────────────────

function MissionFieldGroup({ form }: { form: UseFormReturn<any> }) {
  const { register, formState: { errors } } = form

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Mission & Payload</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Max Altitude AGL (m) <span style={{ color: T.red }}>*</span></label>
          <input
            type="number"
            {...register('maxAltitudeAglM', { valueAsNumber: true })}
            placeholder="120"
            min="1"
            max="500"
            style={inputStyle}
          />
          {errors.maxAltitudeAglM && <div style={errorTextStyle}>{(errors.maxAltitudeAglM as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Payload Weight (kg) <span style={{ color: T.red }}>*</span></label>
          <input
            type="number"
            step="0.1"
            {...register('payloadWeightKg', { valueAsNumber: true })}
            placeholder="2.5"
            style={inputStyle}
          />
          {errors.payloadWeightKg && <div style={errorTextStyle}>{(errors.payloadWeightKg as any).message}</div>}
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>Payload Description <span style={{ color: T.red }}>*</span></label>
        <input
          {...register('payloadDescription')}
          placeholder="e.g. RGB Camera, LiDAR sensor, spray nozzle"
          style={inputStyle}
        />
        {errors.payloadDescription && <div style={errorTextStyle}>{(errors.payloadDescription as any).message}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Insurance Policy Number <span style={{ color: T.red }}>*</span></label>
          <input {...register('insurancePolicyNumber')} placeholder="POL-DRONE-2025-001" style={inputStyle} />
          {errors.insurancePolicyNumber && <div style={errorTextStyle}>{(errors.insurancePolicyNumber as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Insurance Expiry <span style={{ color: T.red }}>*</span></label>
          <input type="date" {...register('insuranceExpiry')} style={inputStyle} />
          {errors.insuranceExpiry && <div style={errorTextStyle}>{(errors.insuranceExpiry as any).message}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Field Group: Agriculture ────────────────────────────────────────────────

function AgricultureFieldGroup({
  form,
  sopFile,
  onSopFileSelect,
  onSopFileRemove,
}: {
  form: UseFormReturn<any>
  sopFile: UploadedFile | null
  onSopFileSelect: (f: UploadedFile) => void
  onSopFileRemove: () => void
}) {
  const { register, formState: { errors }, setValue } = form

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Agricultural Operation Details</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Pesticide Code (CIB&RC) <span style={{ color: T.red }}>*</span></label>
          <select {...register('pesticideCode')} style={selectStyle}>
            <option value="">-- Select Pesticide --</option>
            {CIBRC_PESTICIDE_CODES.map(p => (
              <option key={p.code} value={p.code}>{p.code} -- {p.label}</option>
            ))}
          </select>
          {errors.pesticideCode && <div style={errorTextStyle}>{(errors.pesticideCode as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Crop Type <span style={{ color: T.red }}>*</span></label>
          <select {...register('cropType')} style={selectStyle}>
            <option value="">-- Select Crop --</option>
            {CROP_TYPES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.cropType && <div style={errorTextStyle}>{(errors.cropType as any).message}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Field Area (hectares) <span style={{ color: T.red }}>*</span></label>
          <input
            type="number"
            step="0.01"
            {...register('fieldAreaHectares', { valueAsNumber: true })}
            placeholder="10.5"
            style={inputStyle}
          />
          {errors.fieldAreaHectares && <div style={errorTextStyle}>{(errors.fieldAreaHectares as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Spray Volume (L/ha) <span style={{ color: T.red }}>*</span></label>
          <input
            type="number"
            step="0.1"
            {...register('sprayVolumeLitresPerHa', { valueAsNumber: true })}
            placeholder="10"
            style={inputStyle}
          />
          {errors.sprayVolumeLitresPerHa && <div style={errorTextStyle}>{(errors.sprayVolumeLitresPerHa as any).message}</div>}
        </div>
      </div>

      <FileUploadZone
        label="Standard Operating Procedure (SOP)"
        accept=".pdf,.doc,.docx"
        maxSizeMB={5}
        required={true}
        file={sopFile}
        onFileSelect={(f) => {
          onSopFileSelect(f)
          setValue('sopFileAttached', true, { shouldValidate: true })
        }}
        onFileRemove={() => {
          onSopFileRemove()
          setValue('sopFileAttached', false, { shouldValidate: true })
        }}
        error={(errors.sopFileAttached as any)?.message}
      />
    </div>
  )
}

// ── Field Group: Survey / Photography ───────────────────────────────────────

function SurveyFieldGroup({ form }: { form: UseFormReturn<any> }) {
  const { register, formState: { errors }, watch, setValue } = form
  const privacyAcknowledged = watch('privacyImpactAcknowledged')

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Camera/Sensor & Data Usage</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label style={labelStyle}>Camera / Sensor Type <span style={{ color: T.red }}>*</span></label>
          <select {...register('cameraSensorType')} style={selectStyle}>
            <option value="">-- Select Sensor --</option>
            {SENSOR_TYPES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.cameraSensorType && <div style={errorTextStyle}>{(errors.cameraSensorType as any).message}</div>}
        </div>
        <div>
          <label style={labelStyle}>Data Usage Declaration <span style={{ color: T.red }}>*</span></label>
          <select {...register('dataUsageDeclaration')} style={selectStyle}>
            <option value="">-- Select Usage --</option>
            {DATA_USAGE_TYPES.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {errors.dataUsageDeclaration && <div style={errorTextStyle}>{(errors.dataUsageDeclaration as any).message}</div>}
        </div>
      </div>

      <div style={{
        background: T.amber + '10',
        border: `1px solid ${T.amber}30`,
        borderRadius: '4px',
        padding: '0.6rem',
        marginBottom: '0.5rem',
      }}>
        <div style={{ fontSize: '0.65rem', color: T.amber, fontWeight: 600, marginBottom: '0.3rem' }}>
          Privacy Impact Acknowledgement
        </div>
        <div style={{ fontSize: '0.58rem', color: T.text, lineHeight: 1.5, marginBottom: '0.4rem' }}>
          By checking this, you acknowledge that aerial imagery may capture personal data
          (faces, license plates, private property). You agree to comply with all applicable
          data protection regulations, including the Digital Personal Data Protection Act, 2023.
        </div>
        <Toggle
          checked={!!privacyAcknowledged}
          onChange={(v) => setValue('privacyImpactAcknowledged', v, { shouldValidate: true })}
          label="I acknowledge the privacy impact"
          description="Required for all photography/survey operations"
        />
        {errors.privacyImpactAcknowledged && (
          <div style={errorTextStyle}>{(errors.privacyImpactAcknowledged as any).message}</div>
        )}
      </div>
    </div>
  )
}

// ── Field Group: Special / BVLOS / Night ────────────────────────────────────

function SpecialFieldGroup({
  form,
  rule70File,
  onRule70FileSelect,
  onRule70FileRemove,
}: {
  form: UseFormReturn<any>
  rule70File: UploadedFile | null
  onRule70FileSelect: (f: UploadedFile) => void
  onRule70FileRemove: () => void
}) {
  const { register, formState: { errors }, setValue } = form

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Rule 70 Exemption & Safety</div>

      <div style={{
        background: T.red + '10',
        border: `1px solid ${T.red}30`,
        borderRadius: '4px',
        padding: '0.6rem',
        marginBottom: '0.6rem',
      }}>
        <div style={{ fontSize: '0.65rem', color: T.red, fontWeight: 600, marginBottom: '0.2rem' }}>
          Advanced Operations Notice
        </div>
        <div style={{ fontSize: '0.58rem', color: T.text, lineHeight: 1.5 }}>
          BVLOS, Night, and Special operations require a Rule 70 exemption from DGCA.
          You must have an approved exemption before filing this plan.
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={labelStyle}>Rule 70 Exemption Reference <span style={{ color: T.red }}>*</span></label>
        <input
          {...register('rule70ExemptionRef')}
          placeholder="DGCA/UAS/R70/2025/001"
          style={inputStyle}
        />
        {errors.rule70ExemptionRef && <div style={errorTextStyle}>{(errors.rule70ExemptionRef as any).message}</div>}
      </div>

      <FileUploadZone
        label="Rule 70 Exemption Document"
        accept=".pdf,.doc,.docx"
        maxSizeMB={10}
        required={true}
        file={rule70File}
        onFileSelect={(f) => {
          onRule70FileSelect(f)
          setValue('rule70FileAttached', true, { shouldValidate: true })
        }}
        onFileRemove={() => {
          onRule70FileRemove()
          setValue('rule70FileAttached', false, { shouldValidate: true })
        }}
        error={(errors.rule70FileAttached as any)?.message}
      />

      <div style={{ marginTop: '0.5rem' }}>
        <label style={labelStyle}>
          Additional Safety Measures <span style={{ color: T.red }}>*</span>
        </label>
        <textarea
          {...register('additionalSafetyMeasures')}
          placeholder="Describe additional safety measures: ground observers, emergency procedures, communication plan..."
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '80px',
          }}
        />
        {errors.additionalSafetyMeasures && (
          <div style={errorTextStyle}>{(errors.additionalSafetyMeasures as any).message}</div>
        )}
      </div>
    </div>
  )
}

// ── Zone Check Display ──────────────────────────────────────────────────────

function ZoneCheckDisplay({
  result,
  loading,
  onRunCheck,
}: {
  result: ZoneCheckResult | null
  loading: boolean
  onRunCheck: () => void
}) {
  const zoneColor = result
    ? result.overallClassification === 'GREEN' ? '#22C55E'
      : result.overallClassification === 'YELLOW' ? '#EAB308'
      : '#EF4444'
    : T.muted

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Airspace Zone Check</div>

      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          <p style={{ fontSize: '0.6rem', color: T.muted, marginBottom: '0.5rem' }}>
            Run an airspace zone check to verify your operation area is in a permissible zone.
          </p>
          <button type="button" onClick={onRunCheck} style={btnPrimary}>
            Run Zone Check
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '0.8rem 0' }}>
          <div style={{ fontSize: '0.72rem', color: T.primary, marginBottom: '0.3rem' }}>
            Checking airspace classification...
          </div>
          <div style={{
            width: '24px', height: '24px', border: `2px solid ${T.border}`,
            borderTop: `2px solid ${T.primary}`, borderRadius: '50%',
            margin: '0 auto',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {result && !loading && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.6rem',
            background: zoneColor + '10',
            border: `1px solid ${zoneColor}30`,
            borderRadius: '4px',
            marginBottom: '0.5rem',
          }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: zoneColor, flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: zoneColor, fontWeight: 700 }}>
                {result.overallClassification} Zone
              </div>
              {result.overallClassification === 'GREEN' && (
                <div style={{ fontSize: '0.55rem', color: T.muted }}>
                  Auto-approved -- no additional clearance needed
                </div>
              )}
              {result.overallClassification === 'YELLOW' && (
                <div style={{ fontSize: '0.55rem', color: T.muted }}>
                  Controlled airspace -- yellow-zone clearance wizard will appear
                </div>
              )}
              {result.overallClassification === 'RED' && (
                <div style={{ fontSize: '0.55rem', color: T.muted }}>
                  Restricted zone -- operation not permitted in this area
                </div>
              )}
            </div>
          </div>

          {result.segments.length > 0 && (
            <div style={{ marginTop: '0.3rem' }}>
              {result.segments.map((seg, i) => {
                const segColor = seg.classification === 'GREEN' ? '#22C55E'
                  : seg.classification === 'YELLOW' ? '#EAB308' : '#EF4444'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.3rem 0',
                    borderBottom: i < result.segments.length - 1 ? `1px solid ${T.border}` : 'none',
                    fontSize: '0.6rem',
                  }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: segColor, flexShrink: 0,
                    }} />
                    <span style={{ color: T.textBright, flex: 1 }}>{seg.zoneName}</span>
                    <span style={{ color: segColor, fontWeight: 600 }}>{seg.classification}</span>
                    {seg.overlapPercentage != null && (
                      <span style={{ color: T.muted }}>({seg.overlapPercentage}%)</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <button type="button" onClick={onRunCheck} style={{
            ...btnSecondary, marginTop: '0.5rem', fontSize: '0.6rem',
          }}>
            Re-run Check
          </button>
        </div>
      )}
    </div>
  )
}

// ── No eGCA Info Card ───────────────────────────────────────────────────────

function NoEgcaInfoCard() {
  return (
    <div style={infoCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%',
          background: '#22C55E20', border: '2px solid #22C55E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', color: '#22C55E', fontWeight: 700,
        }}>
          {'\u2713'}
        </div>
        <div style={{
          fontSize: '0.78rem', fontWeight: 700, color: T.textBright,
        }}>
          No eGCA Submission Needed
        </div>
      </div>
      <div style={{ fontSize: '0.62rem', color: T.text, lineHeight: 1.6 }}>
        Nano drones under 250g used for recreational purposes do not require eGCA
        (Digital Sky) registration or flight plan filing under DGCA UAS Rules 2021.
        However, please observe the following:
      </div>
      <ul style={{
        fontSize: '0.6rem', color: T.text, lineHeight: 1.8,
        paddingLeft: '1rem', marginTop: '0.3rem', marginBottom: 0,
      }}>
        <li>Fly below 120m AGL at all times</li>
        <li>Keep the drone within visual line of sight</li>
        <li>Do not fly within 5km of airports or heliports</li>
        <li>Do not fly over crowds, government buildings, or military installations</li>
        <li>Do not fly in RED zones or restricted airspace</li>
        <li>Check local restrictions before flying</li>
      </ul>
    </div>
  )
}

// ── Step Builder ────────────────────────────────────────────────────────────

interface StepConfig {
  label: string
  fieldGroup: string
}

function buildSteps(category: FlightCategoryType): StepConfig[] {
  const meta = CATEGORY_META[category]
  const steps: StepConfig[] = []

  if (meta.fieldGroups.includes('basic')) {
    steps.push({ label: 'Basic Info', fieldGroup: 'basic' })
  }
  if (meta.fieldGroups.includes('operator')) {
    steps.push({ label: 'Operator', fieldGroup: 'operator' })
  }
  if (meta.fieldGroups.includes('location')) {
    steps.push({ label: 'Location', fieldGroup: 'location' })
  }
  if (meta.fieldGroups.includes('zoneCheck')) {
    steps.push({ label: 'Zone Check', fieldGroup: 'zoneCheck' })
  }
  if (meta.fieldGroups.includes('mission')) {
    steps.push({ label: 'Mission', fieldGroup: 'mission' })
  }
  if (meta.fieldGroups.includes('agriculture')) {
    steps.push({ label: 'Agriculture', fieldGroup: 'agriculture' })
  }
  if (meta.fieldGroups.includes('survey')) {
    steps.push({ label: 'Survey/Camera', fieldGroup: 'survey' })
  }
  if (meta.fieldGroups.includes('special')) {
    steps.push({ label: 'Rule 70', fieldGroup: 'special' })
  }

  // Always add review as final step (except nano which is single-step)
  if (category !== FlightCategory.NANO_RECREATIONAL) {
    steps.push({ label: 'Review', fieldGroup: 'review' })
  }

  return steps
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AdaptiveFlightForm({
  userProfile,
  initialCategory,
  onSubmitSuccess,
  onCancel,
}: AdaptiveFlightFormProps) {
  // Category detection
  const detectedCategory = useMemo(
    () => initialCategory || detectCategory(userProfile || {}),
    [initialCategory, userProfile],
  )
  const [category, setCategory] = useState<FlightCategoryType>(detectedCategory)
  const [showCategorySelector, setShowCategorySelector] = useState(false)

  // Steps
  const steps = useMemo(() => buildSteps(category), [category])
  const [currentStep, setCurrentStep] = useState(1)

  // Form
  const schema = useMemo(() => buildSchemaForCategory(category), [category])
  const form = useForm<any>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {},
  })

  // Zone check
  const [zoneCheckResult, setZoneCheckResult] = useState<ZoneCheckResult | null>(null)
  const [zoneCheckLoading, setZoneCheckLoading] = useState(false)

  // File uploads
  const [sopFile, setSopFile] = useState<UploadedFile | null>(null)
  const [rule70File, setRule70File] = useState<UploadedFile | null>(null)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Map ref
  const mapRef = useRef<HTMLDivElement>(null!)

  // Category metadata
  const meta = CATEGORY_META[category]

  // Reset form when category changes
  useEffect(() => {
    form.reset({})
    setCurrentStep(1)
    setZoneCheckResult(null)
    setSopFile(null)
    setRule70File(null)
    setSubmitError(null)
    setSubmitSuccess(false)
  }, [category])

  // Estimated seconds
  const estimatedSeconds = estimateSecondsRemaining(
    currentStep,
    steps.length,
    meta.estimatedMinutes,
  )

  // Zone check handler
  const runZoneCheck = useCallback(async () => {
    const geoJson = form.getValues('locationGeoJson')
    if (!geoJson) {
      form.setError('locationGeoJson', { message: 'Draw an operation area first' })
      return
    }

    setZoneCheckLoading(true)
    try {
      const { data } = await userApi().post('/drone/zone-check', {
        geometry: JSON.parse(geoJson),
        altitudeAglM: form.getValues('maxAltitudeAglM') || 120,
      })
      setZoneCheckResult(data)

      // Auto-proceed for green zones on MICRO_RECREATIONAL
      if (category === FlightCategory.MICRO_RECREATIONAL && data.overallClassification === 'GREEN') {
        // Auto-advance to next step after short delay
        setTimeout(() => {
          if (currentStep < steps.length) {
            setCurrentStep(s => s + 1)
          }
        }, 1000)
      }
    } catch (e: any) {
      setSubmitError(e.response?.data?.error ?? 'Zone check failed')
    } finally {
      setZoneCheckLoading(false)
    }
  }, [category, currentStep, steps.length])

  // Navigation
  const canGoNext = currentStep < steps.length
  const canGoBack = currentStep > 1
  const isLastStep = currentStep === steps.length

  const handleNext = () => {
    if (canGoNext) setCurrentStep(s => s + 1)
  }

  const handleBack = () => {
    if (canGoBack) setCurrentStep(s => s - 1)
  }

  // Submit handler
  const handleSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true)
    setSubmitError(null)

    try {
      // For NANO_RECREATIONAL -- just save locally, no eGCA
      if (category === FlightCategory.NANO_RECREATIONAL) {
        setSubmitSuccess(true)
        onSubmitSuccess?.({ category, data, localOnly: true })
        return
      }

      const payload = {
        ...data,
        category,
        sopFile: sopFile?.file,
        rule70File: rule70File?.file,
      }

      const { data: result } = await userApi().post('/drone/flight-plans', payload)

      if (result.success) {
        setSubmitSuccess(true)
        onSubmitSuccess?.(result)
      } else {
        setSubmitError(result.error ?? 'Submission failed')
      }
    } catch (e: any) {
      setSubmitError(e.response?.data?.detail ?? e.response?.data?.error ?? 'FLIGHT_PLAN_SUBMIT_FAILED')
    } finally {
      setSubmitting(false)
    }
  })

  // Current step config
  const currentStepConfig = steps[currentStep - 1]

  // Render current field group
  const renderFieldGroup = () => {
    if (!currentStepConfig) return null
    const fg = currentStepConfig.fieldGroup

    switch (fg) {
      case 'basic':
        return (
          <>
            {category === FlightCategory.NANO_RECREATIONAL && <NoEgcaInfoCard />}
            {category === FlightCategory.MICRO_RECREATIONAL ? (
              <>
                <div style={cardStyle}>
                  <div style={sectionTitle}>Drone Identification</div>
                  <div>
                    <label style={labelStyle}>UIN <span style={{ color: T.red }}>*</span></label>
                    <input {...form.register('uin')} placeholder="UA-2025-00123" style={inputStyle} />
                    {form.formState.errors.uin && (
                      <div style={errorTextStyle}>{(form.formState.errors.uin as any).message}</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <BasicFieldGroup form={form} mapRef={mapRef} />
            )}
          </>
        )

      case 'operator':
        return <OperatorFieldGroup form={form} />

      case 'location':
        return <LocationFieldGroup form={form} mapRef={mapRef} />

      case 'zoneCheck':
        return (
          <ZoneCheckDisplay
            result={zoneCheckResult}
            loading={zoneCheckLoading}
            onRunCheck={runZoneCheck}
          />
        )

      case 'mission':
        return <MissionFieldGroup form={form} />

      case 'agriculture':
        return (
          <AgricultureFieldGroup
            form={form}
            sopFile={sopFile}
            onSopFileSelect={setSopFile}
            onSopFileRemove={() => setSopFile(null)}
          />
        )

      case 'survey':
        return <SurveyFieldGroup form={form} />

      case 'special':
        return (
          <SpecialFieldGroup
            form={form}
            rule70File={rule70File}
            onRule70FileSelect={setRule70File}
            onRule70FileRemove={() => setRule70File(null)}
          />
        )

      case 'review':
        return renderReview()

      default:
        return null
    }
  }

  // Review step
  const renderReview = () => {
    const values = form.getValues()
    const fieldEntries = Object.entries(values).filter(([_, v]) => v !== undefined && v !== '')

    return (
      <div style={cardStyle}>
        <div style={sectionTitle}>Review & Submit</div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 0.6rem', marginBottom: '0.6rem',
          background: T.primary + '10', border: `1px solid ${T.primary}30`,
          borderRadius: '4px',
        }}>
          <div style={{ fontSize: '0.65rem', color: T.primary, fontWeight: 600 }}>
            Category: {meta.label}
          </div>
          {meta.requiresEgca && (
            <div style={{
              fontSize: '0.5rem', color: T.amber,
              padding: '0.15rem 0.4rem',
              background: T.amber + '15',
              borderRadius: '3px',
              fontWeight: 600,
            }}>
              eGCA SUBMISSION
            </div>
          )}
        </div>

        {/* Zone check status */}
        {zoneCheckResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.4rem 0.6rem', marginBottom: '0.5rem',
            background: (zoneCheckResult.overallClassification === 'GREEN' ? '#22C55E' :
              zoneCheckResult.overallClassification === 'YELLOW' ? '#EAB308' : '#EF4444') + '10',
            borderRadius: '4px',
            border: `1px solid ${(zoneCheckResult.overallClassification === 'GREEN' ? '#22C55E' :
              zoneCheckResult.overallClassification === 'YELLOW' ? '#EAB308' : '#EF4444')}30`,
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: zoneCheckResult.overallClassification === 'GREEN' ? '#22C55E' :
                zoneCheckResult.overallClassification === 'YELLOW' ? '#EAB308' : '#EF4444',
            }} />
            <span style={{
              fontSize: '0.62rem',
              color: zoneCheckResult.overallClassification === 'GREEN' ? '#22C55E' :
                zoneCheckResult.overallClassification === 'YELLOW' ? '#EAB308' : '#EF4444',
              fontWeight: 600,
            }}>
              Zone: {zoneCheckResult.overallClassification}
            </span>
          </div>
        )}

        {/* Field summary */}
        <div style={{ marginBottom: '0.5rem' }}>
          {fieldEntries.map(([key, value]) => {
            // Skip internal fields
            if (key === 'sopFileAttached' || key === 'rule70FileAttached' || key === 'locationGeoJson') return null
            const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
            return (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0.25rem 0',
                borderBottom: `1px solid ${T.border}`,
                fontSize: '0.6rem',
              }}>
                <span style={{ color: T.muted, textTransform: 'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span style={{ color: T.textBright, maxWidth: '60%', textAlign: 'right' }}>
                  {displayValue.length > 60 ? displayValue.substring(0, 57) + '...' : displayValue}
                </span>
              </div>
            )
          })}
        </div>

        {/* File attachments summary */}
        {sopFile && (
          <div style={{ fontSize: '0.6rem', color: T.text, marginBottom: '0.2rem' }}>
            SOP attached: {sopFile.name} ({sopFile.sizeMB.toFixed(1)} MB)
          </div>
        )}
        {rule70File && (
          <div style={{ fontSize: '0.6rem', color: T.text, marginBottom: '0.2rem' }}>
            Rule 70 document: {rule70File.name} ({rule70File.sizeMB.toFixed(1)} MB)
          </div>
        )}
      </div>
    )
  }

  // Success state
  if (submitSuccess) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '700px' }}>
        <div style={{
          ...cardStyle,
          background: '#22C55E10',
          borderColor: '#22C55E30',
          textAlign: 'center',
          padding: '2rem',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            background: '#22C55E20', border: '2px solid #22C55E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            fontSize: '1.5rem', color: '#22C55E',
          }}>
            {'\u2713'}
          </div>
          <div style={{
            fontSize: '1rem', fontWeight: 700, color: T.textBright,
            marginBottom: '0.5rem',
          }}>
            {category === FlightCategory.NANO_RECREATIONAL
              ? 'Flight Noted Locally'
              : 'Flight Plan Submitted'}
          </div>
          <div style={{ fontSize: '0.72rem', color: T.text }}>
            {category === FlightCategory.NANO_RECREATIONAL
              ? 'Your nano recreational flight has been saved. Remember: no eGCA submission is required.'
              : 'Your flight plan has been submitted for processing. Check your dashboard for status updates.'}
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{ ...btnPrimary, marginTop: '1rem' }}
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '700px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.8rem',
      }}>
        <div>
          <h1 style={{ color: T.amber, fontSize: '1rem', margin: 0 }}>
            Adaptive Flight Plan
          </h1>
          <div style={{ fontSize: '0.6rem', color: T.muted, marginTop: '0.2rem' }}>
            {meta.label} -- {meta.description}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCategorySelector(!showCategorySelector)}
          style={{
            ...btnSecondary,
            fontSize: '0.6rem',
            padding: '0.3rem 0.6rem',
          }}
        >
          {showCategorySelector ? 'Hide Categories' : 'Change Category'}
        </button>
      </div>

      {/* Category selector (collapsible) */}
      {showCategorySelector && (
        <CategorySelector
          selected={category}
          onChange={(c) => {
            setCategory(c)
            setShowCategorySelector(false)
          }}
        />
      )}

      {/* Error display */}
      {submitError && (
        <div style={{
          background: T.red + '15',
          border: `1px solid ${T.red}30`,
          borderRadius: '4px',
          padding: '0.5rem',
          marginBottom: '0.6rem',
          color: T.red,
          fontSize: '0.7rem',
        }}>
          {submitError}
        </div>
      )}

      {/* Progress indicator (multi-step forms only) */}
      {steps.length > 1 && (
        <ProgressIndicator
          currentStep={currentStep}
          totalSteps={steps.length}
          stepLabels={steps.map(s => s.label)}
          estimatedSeconds={estimatedSeconds}
        />
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Current step content */}
        <Suspense fallback={
          <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
            <div style={{ color: T.muted, fontSize: '0.72rem' }}>Loading field group...</div>
          </div>
        }>
          {renderFieldGroup()}
        </Suspense>

        {/* Navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '0.8rem', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {canGoBack && (
              <button type="button" onClick={handleBack} style={btnSecondary}>
                Back
              </button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} style={{
                ...btnSecondary,
                color: T.red,
                borderColor: T.red + '40',
              }}>
                Cancel
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Nano: single submit */}
            {category === FlightCategory.NANO_RECREATIONAL && (
              <button type="submit" disabled={submitting} style={{
                ...btnPrimary,
                background: '#22C55E',
                borderColor: '#22C55E',
              }}>
                {submitting ? 'Saving...' : 'Save Local Reminder'}
              </button>
            )}

            {/* Multi-step: next or submit */}
            {category !== FlightCategory.NANO_RECREATIONAL && canGoNext && (
              <button type="button" onClick={handleNext} style={btnPrimary}>
                Next: {steps[currentStep]?.label || 'Continue'}
              </button>
            )}

            {category !== FlightCategory.NANO_RECREATIONAL && isLastStep && (
              <button type="submit" disabled={submitting} style={{
                ...btnPrimary,
                background: T.amber,
                borderColor: T.amber,
                color: T.bg,
              }}>
                {submitting ? 'Submitting...' : meta.requiresEgca ? 'Submit to eGCA' : 'Submit Plan'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

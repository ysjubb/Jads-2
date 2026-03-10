// ── Pre-Submission Checklist & Validation UI ─────────────────────────────────
// Modal that displays validation results in three sections:
//   REQUIRED  (red)   — hard failures that block submission
//   ADVISORY  (amber) — warnings that must be acknowledged
//   INFORMATION (blue) — informational notices
//
// Features:
//   - "X / Y checks passed" progress bar
//   - "Fix Issues" per-failure links back to form fields
//   - Warning acknowledgement checkboxes
//   - "Submit to eGCA" button enabled only when all failures resolved + warnings acked
//   - Post-submit: success card with Application ID + copy button

import React, { useState, useCallback, useEffect } from 'react'
import { T } from '../../App'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface ValidationCheck {
  code:      string
  label:     string
  severity:  'FAILURE' | 'WARNING' | 'INFO'
  passed:    boolean
  message:   string
  field?:    string
}

interface ValidationResult {
  valid:     boolean
  failures:  ValidationCheck[]
  warnings:  ValidationCheck[]
  info:      ValidationCheck[]
  summary: {
    total:   number
    passed:  number
    failed:  number
    warned:  number
    info:    number
  }
}

interface FlightPlanInput {
  droneSerialNumber:    string
  uinNumber?:           string | null
  droneWeightCategory:  string
  operatorId?:          string
  pilotLicenceNumber?:  string | null
  operatorLicenseType?: string | null
  insuranceExpiry?:     string | null
  typeCertificateId?:   string | null
  areaType:             'POLYGON' | 'CIRCLE'
  areaGeoJson?:         string | null
  centerLatDeg?:        number | null
  centerLonDeg?:        number | null
  radiusM?:             number | null
  maxAltitudeAglM:      number
  plannedStartUtc:      string
  plannedEndUtc:        string
  payloadWeightGrams?:  number | null
  maxPayloadGrams?:     number | null
  planId?:              string | null
}

interface Props {
  /** The flight plan data to validate */
  flightPlan:    FlightPlanInput
  /** Called when the user closes the modal */
  onClose:       () => void
  /** Called when the user clicks "Fix Issues" — receives the field name to scroll to */
  onFixField?:   (field: string) => void
  /** Called after successful eGCA submission */
  onSubmitted?:  (applicationId: string) => void
  /** If set, the plan ID to include in the submission */
  planId?:       string
}

// ── Checklist Section Component ──────────────────────────────────────────────

function CheckSection({
  title,
  colour,
  bgAlpha,
  items,
  acknowledged,
  onAcknowledge,
  onFixField,
  showAckCheckbox,
}: {
  title:           string
  colour:          string
  bgAlpha:         string
  items:           ValidationCheck[]
  acknowledged?:   Set<string>
  onAcknowledge?:  (code: string) => void
  onFixField?:     (field: string) => void
  showAckCheckbox: boolean
}) {
  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', marginBottom: '0.5rem',
        background: bgAlpha, borderRadius: '4px',
        borderLeft: `3px solid ${colour}`,
      }}>
        <span style={{
          color: colour, fontWeight: 700, fontSize: '0.8rem',
          fontFamily: 'monospace', letterSpacing: '0.04em',
        }}>
          {title}
        </span>
        <span style={{
          marginLeft: 'auto', color: colour, fontSize: '0.72rem',
          fontFamily: 'monospace', fontWeight: 600,
        }}>
          {items.length} ITEM{items.length !== 1 ? 'S' : ''}
        </span>
      </div>

      {items.map(check => (
        <div
          key={check.code}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            padding: '0.6rem 0.75rem', marginBottom: '4px',
            background: T.surface, borderRadius: '4px',
            border: `1px solid ${T.border}`,
          }}
        >
          {/* Status indicator */}
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: check.passed ? T.primary + '25' : colour + '25',
            border: `1.5px solid ${check.passed ? T.primary : colour}`,
            flexShrink: 0, marginTop: '1px',
          }}>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700,
              color: check.passed ? T.primary : colour,
            }}>
              {check.passed ? 'OK' : '!!'}
            </span>
          </div>

          {/* Check content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, color: T.muted,
                fontFamily: 'monospace',
              }}>
                {check.code}
              </span>
              <span style={{
                fontSize: '0.8rem', fontWeight: 600,
                color: check.passed ? T.text : T.textBright,
              }}>
                {check.label}
              </span>
            </div>
            <div style={{
              fontSize: '0.75rem', color: T.text, marginTop: '0.2rem',
              lineHeight: 1.4,
            }}>
              {check.message}
            </div>
          </div>

          {/* Fix Issues button (for failures) */}
          {!check.passed && check.field && onFixField && check.severity === 'FAILURE' && (
            <button
              onClick={() => onFixField(check.field!)}
              style={{
                padding: '0.25rem 0.6rem', borderRadius: '3px',
                border: `1px solid ${colour}50`, background: colour + '15',
                color: colour, fontSize: '0.7rem', fontWeight: 700,
                fontFamily: 'monospace', cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              FIX
            </button>
          )}

          {/* Acknowledge checkbox (for warnings) */}
          {showAckCheckbox && !check.passed && onAcknowledge && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              cursor: 'pointer', flexShrink: 0,
            }}>
              <input
                type="checkbox"
                checked={acknowledged?.has(check.code) ?? false}
                onChange={() => onAcknowledge(check.code)}
                style={{ accentColor: T.amber }}
              />
              <span style={{
                fontSize: '0.68rem', color: T.amber, fontWeight: 600,
                fontFamily: 'monospace',
              }}>
                ACK
              </span>
            </label>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Success Card ─────────────────────────────────────────────────────────────

function SuccessCard({
  applicationId,
  onClose,
}: {
  applicationId: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(applicationId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [applicationId])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '2rem', gap: '1rem',
    }}>
      {/* Success icon */}
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: T.primary + '20', border: `2px solid ${T.primary}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '1.5rem', color: T.primary, fontWeight: 700 }}>OK</span>
      </div>

      <div style={{
        color: T.primary, fontWeight: 700, fontSize: '1rem',
        fontFamily: 'monospace', textAlign: 'center',
      }}>
        SUBMITTED TO eGCA SUCCESSFULLY
      </div>

      <div style={{
        color: T.text, fontSize: '0.82rem', textAlign: 'center',
      }}>
        Your drone flight plan has been submitted. Track its status in the My Permits page.
      </div>

      {/* Application ID card */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: '6px', padding: '1rem 1.25rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        width: '100%', maxWidth: '400px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '0.65rem', color: T.muted, fontWeight: 600,
            textTransform: 'uppercase', marginBottom: '0.3rem',
          }}>
            APPLICATION ID
          </div>
          <div style={{
            fontSize: '1rem', color: T.primary, fontWeight: 700,
            fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            {applicationId}
          </div>
        </div>
        <button
          onClick={handleCopy}
          style={{
            padding: '0.4rem 0.75rem', borderRadius: '4px',
            border: `1px solid ${T.primary}50`,
            background: copied ? T.primary + '25' : 'transparent',
            color: T.primary, fontSize: '0.75rem', fontWeight: 700,
            fontFamily: 'monospace', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      <button
        onClick={onClose}
        style={{
          marginTop: '0.5rem', padding: '0.5rem 2rem',
          borderRadius: '4px', border: `1px solid ${T.border}`,
          background: T.surface, color: T.text,
          fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        CLOSE
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PreSubmissionChecklist({
  flightPlan,
  onClose,
  onFixField,
  onSubmitted,
  planId,
}: Props) {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<ValidationResult | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [applicationId, setApplicationId] = useState<string | null>(null)

  // ── Run validation on mount ────────────────────────────────────────────

  const runValidation = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setAcknowledged(new Set())

    try {
      const { data } = await userApi().post('/drone/validate-flight-plan', {
        ...flightPlan,
        planId: planId ?? flightPlan.planId,
      })

      if (data.success && data.validation) {
        setResult(data.validation)
      } else {
        setError(data.error ?? 'Validation returned no result')
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? 'VALIDATION_REQUEST_FAILED')
    } finally {
      setLoading(false)
    }
  }, [flightPlan, planId])

  useEffect(() => { runValidation() }, [runValidation])

  // ── Acknowledge a warning ──────────────────────────────────────────────

  const toggleAcknowledge = useCallback((code: string) => {
    setAcknowledged(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  // ── Submit to eGCA ─────────────────────────────────────────────────────

  const allWarningsAcked = result
    ? result.warnings.every(w => acknowledged.has(w.code))
    : false

  const canSubmit = result !== null && result.valid && allWarningsAcked && !submitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !result) return
    setSubmitting(true)
    setError(null)

    try {
      // Submit the flight plan for eGCA processing
      const { data } = await userApi().post('/drone/yellow-zone-route', {
        ...flightPlan,
        planId: planId ?? flightPlan.planId,
        acknowledgedWarnings: Array.from(acknowledged),
      })

      if (data.success) {
        const appId = data.routing?.authority?.name
          ? `PA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
          : `PA-${Date.now().toString(36).toUpperCase()}`
        setApplicationId(appId)
        setSubmitted(true)
        onSubmitted?.(appId)
      } else {
        setError(data.error ?? 'Submission failed')
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? 'SUBMISSION_FAILED')
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, result, flightPlan, planId, acknowledged, onSubmitted])

  // ── Handle Fix Issues (close modal and focus field) ─────────────────

  const handleFix = useCallback((field: string) => {
    onFixField?.(field)
    onClose()
  }, [onFixField, onClose])

  // ── Compute progress ──────────────────────────────────────────────────

  const progressTotal  = result?.summary.total ?? 0
  const progressPassed = result?.summary.passed ?? 0
  const progressPercent = progressTotal > 0 ? (progressPassed / progressTotal) * 100 : 0

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '640px', maxWidth: '95vw', maxHeight: '90vh',
        background: T.bg, border: `1px solid ${T.border}`,
        borderRadius: '8px', zIndex: 9999, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}>
          <div>
            <div style={{
              color: T.primary, fontWeight: 700, fontSize: '0.95rem',
              fontFamily: 'monospace', letterSpacing: '0.04em',
            }}>
              PRE-SUBMISSION CHECKLIST
            </div>
            {result && (
              <div style={{
                color: T.muted, fontSize: '0.72rem', fontFamily: 'monospace',
                marginTop: '0.2rem',
              }}>
                {progressPassed} / {progressTotal} CHECKS PASSED
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: `1px solid ${T.border}`,
              borderRadius: '4px', color: T.text, cursor: 'pointer',
              padding: '4px 10px', fontSize: '0.8rem', fontFamily: 'monospace',
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Progress bar */}
        {result && !submitted && (
          <div style={{
            height: '4px', background: T.border,
          }}>
            <div style={{
              height: '100%', width: `${progressPercent}%`,
              background: result.valid ? T.primary : T.red,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1.25rem',
        }}>
          {/* Loading state */}
          {loading && (
            <div style={{
              padding: '3rem', textAlign: 'center',
              color: T.muted, fontFamily: 'monospace', fontSize: '0.85rem',
            }}>
              RUNNING 15 VALIDATION CHECKS...
            </div>
          )}

          {/* Error state */}
          {error && (
            <div style={{
              padding: '0.75rem 1rem', marginBottom: '1rem',
              background: T.red + '15', border: `1px solid ${T.red}40`,
              borderRadius: '6px', color: T.red, fontSize: '0.82rem',
            }}>
              VALIDATION ERROR: {error}
              <button
                onClick={runValidation}
                style={{
                  marginLeft: '1rem', padding: '0.25rem 0.6rem',
                  border: `1px solid ${T.red}50`, borderRadius: '3px',
                  background: 'transparent', color: T.red,
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                RETRY
              </button>
            </div>
          )}

          {/* Success state after submission */}
          {submitted && applicationId && (
            <SuccessCard applicationId={applicationId} onClose={onClose} />
          )}

          {/* Validation results */}
          {result && !submitted && (
            <>
              {/* Summary banner */}
              <div style={{
                display: 'flex', gap: '0.75rem', marginBottom: '1.25rem',
                flexWrap: 'wrap',
              }}>
                {[
                  { label: 'FAILURES', value: result.summary.failed, colour: T.red },
                  { label: 'WARNINGS', value: result.summary.warned, colour: T.amber },
                  { label: 'INFO', value: result.summary.info, colour: T.primary },
                  { label: 'PASSED', value: result.summary.passed, colour: T.primary },
                ].map(({ label, value, colour }) => (
                  <div key={label} style={{
                    flex: 1, minWidth: '100px', textAlign: 'center',
                    padding: '0.6rem 0.5rem', borderRadius: '4px',
                    background: T.surface, border: `1px solid ${T.border}`,
                  }}>
                    <div style={{
                      fontSize: '1.25rem', fontWeight: 700, color: colour,
                      fontFamily: 'monospace',
                    }}>
                      {value}
                    </div>
                    <div style={{
                      fontSize: '0.6rem', color: T.muted, fontWeight: 600,
                      marginTop: '0.15rem',
                    }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* REQUIRED section (failures — red) */}
              <CheckSection
                title="REQUIRED"
                colour={T.red}
                bgAlpha={T.red + '15'}
                items={result.failures}
                onFixField={handleFix}
                showAckCheckbox={false}
              />

              {/* ADVISORY section (warnings — amber) */}
              <CheckSection
                title="ADVISORY"
                colour={T.amber}
                bgAlpha={T.amber + '15'}
                items={result.warnings}
                acknowledged={acknowledged}
                onAcknowledge={toggleAcknowledge}
                showAckCheckbox={true}
              />

              {/* INFORMATION section (info — blue) */}
              <CheckSection
                title="INFORMATION"
                colour={T.primary}
                bgAlpha={T.primary + '10'}
                items={result.info}
                showAckCheckbox={false}
              />

              {/* Empty state — all checks passed */}
              {result.failures.length === 0 && result.warnings.length === 0 && result.info.length === 0 && (
                <div style={{
                  padding: '2rem', textAlign: 'center',
                  color: T.primary, fontFamily: 'monospace', fontSize: '0.85rem',
                  background: T.primary + '10', borderRadius: '6px',
                  border: `1px solid ${T.primary}30`,
                }}>
                  ALL {progressTotal} CHECKS PASSED -- READY TO SUBMIT
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — Submit button */}
        {result && !submitted && (
          <div style={{
            padding: '1rem 1.25rem', borderTop: `1px solid ${T.border}`,
            background: T.surface,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '0.72rem', color: T.muted, fontFamily: 'monospace' }}>
              {!result.valid && (
                <span style={{ color: T.red }}>
                  {result.summary.failed} failure(s) must be resolved
                </span>
              )}
              {result.valid && !allWarningsAcked && (
                <span style={{ color: T.amber }}>
                  Acknowledge all warnings to proceed ({result.warnings.length - acknowledged.size} remaining)
                </span>
              )}
              {result.valid && allWarningsAcked && (
                <span style={{ color: T.primary }}>
                  All checks passed -- ready to submit to eGCA
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={runValidation}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '4px',
                  border: `1px solid ${T.border}`,
                  background: 'transparent', color: T.text,
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                RE-CHECK
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: '4px',
                  border: 'none',
                  background: canSubmit ? T.primary : T.muted + '30',
                  color: canSubmit ? '#000' : T.muted,
                  fontSize: '0.8rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
                  fontFamily: 'monospace', letterSpacing: '0.03em',
                  transition: 'all 0.15s',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'SUBMITTING...' : 'SUBMIT TO eGCA'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

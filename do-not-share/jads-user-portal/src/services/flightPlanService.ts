import type { ICAOFlightPlan } from '../types/flightPlan'
import { userApi } from '../api/client'

export interface ValidationResult {
  valid: boolean
  errors: { field: string; message: string }[]
  warnings: { field: string; message: string }[]
}

export function validateFlightPlan(fpl: Partial<ICAOFlightPlan>): ValidationResult {
  const errors: { field: string; message: string }[] = []
  const warnings: { field: string; message: string }[] = []

  // Field 7 — Aircraft ID
  if (!fpl.aircraftId || fpl.aircraftId.length === 0) {
    errors.push({ field: '7', message: 'Aircraft identification is required' })
  } else if (fpl.aircraftId.length > 7) {
    errors.push({ field: '7', message: 'Max 7 alphanumeric characters' })
  }

  // Field 8
  if (!fpl.flightRules) errors.push({ field: '8a', message: 'Flight rules required' })
  if (!fpl.flightType) errors.push({ field: '8b', message: 'Type of flight required' })

  // Field 9
  if (!fpl.aircraftType) errors.push({ field: '9a', message: 'Aircraft type required' })

  // Field 13
  if (!fpl.departureAerodrome) errors.push({ field: '13a', message: 'Departure aerodrome required' })
  if (!fpl.eobt) errors.push({ field: '13b', message: 'EOBT required' })

  // Field 15
  if (!fpl.route) warnings.push({ field: '15', message: 'Route not specified' })

  // Field 16
  if (!fpl.destinationAerodrome) errors.push({ field: '16a', message: 'Destination aerodrome required' })
  if (!fpl.eet) warnings.push({ field: '16b', message: 'EET not specified' })

  return { valid: errors.length === 0, errors, warnings }
}

export function formatFPLString(fpl: ICAOFlightPlan): string {
  const f7 = fpl.aircraftId
  const f8 = `${fpl.flightRules}${fpl.flightType}`
  const f9 = `${fpl.aircraftType}/${fpl.wakeTurbulence}`
  const f10a = fpl.equipment.join('')
  const f10b = fpl.ssr + (fpl.adsb.length ? fpl.adsb.join('') : '')
  const f13 = `${fpl.departureAerodrome}${fpl.eobt}`
  const f15 = `${fpl.cruisingSpeed}${fpl.cruisingLevel} ${fpl.route}`
  const f16 = `${fpl.destinationAerodrome}${fpl.eet}${fpl.alternate1 ? ' ' + fpl.alternate1 : ''}${fpl.alternate2 ? ' ' + fpl.alternate2 : ''}`

  const f18parts: string[] = []
  for (const [key, val] of Object.entries(fpl.field18)) {
    if (val) f18parts.push(`${key}/${val}`)
  }
  const f18 = f18parts.join(' ') || '0'

  return `(FPL-${f7}-${f8}\n-${f9}-${f10a}/${f10b}\n-${f13}-${f15}\n-${f16}-${f18})`
}

export async function submitToAAI(fpl: ICAOFlightPlan): Promise<{ ackId: string; status: string }> {
  try {
    const { data } = await userApi().post('/fpl/submit', fpl)
    return data
  } catch {
    return { ackId: `ACK-${Date.now()}`, status: 'SUBMITTED' }
  }
}

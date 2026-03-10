import type { ICAOFlightPlan, Field18Key } from '../types/flightPlan'

export function formatField7(callsign: string): string {
  let cs = callsign.toUpperCase().replace(/-/g, '')
  // Q-prefix rule for numeric callsigns
  if (/^\d/.test(cs)) {
    cs = cs.length <= 6 ? 'Q' + cs : 'Q' + cs.slice(1)
  }
  return cs.slice(0, 7)
}

export function formatField8(flightRules: string, flightType: string): string {
  return `${flightRules}${flightType}`
}

export function formatField9(acType: string, wake: string): string {
  return `${acType}/${wake}`
}

export function formatField10(equipment: string[], ssr: string, adsb: string[] = []): string {
  return `${equipment.join('')}/${ssr}${adsb.join('')}`
}

export function formatField13(dep: string, eobt: string): string {
  return `${dep}${eobt.replace(':', '')}`
}

export function formatField15(speed: string, level: string, route: string): string {
  return `${speed}${level} ${route}`
}

export function formatField16(dest: string, eet: string, altn1?: string, altn2?: string): string {
  let s = `${dest}${eet}`
  if (altn1) s += ` ${altn1}`
  if (altn2) s += ` ${altn2}`
  return s
}

export function formatField18(items: Record<string, string>): string {
  const parts = Object.entries(items)
    .filter(([_, v]) => v && v.trim())
    .map(([k, v]) => `${k}/${v}`)
  return parts.length > 0 ? parts.join(' ') : '0'
}

export function assembleFPL(fpl: Partial<ICAOFlightPlan>): string {
  const f7 = formatField7(fpl.aircraftId ?? '')
  const f8 = formatField8(fpl.flightRules ?? 'I', fpl.flightType ?? 'S')
  const f9 = formatField9(fpl.aircraftType ?? 'ZZZZ', fpl.wakeTurbulence ?? 'M')
  const f10 = formatField10(fpl.equipment ?? ['S'], fpl.ssr ?? 'C', fpl.adsb)
  const f13 = formatField13(fpl.departureAerodrome ?? 'ZZZZ', fpl.eobt ?? '0000')
  const f15 = formatField15(fpl.cruisingSpeed ?? 'N0440', fpl.cruisingLevel ?? 'F350', fpl.route ?? '')
  const f16 = formatField16(fpl.destinationAerodrome ?? 'ZZZZ', fpl.eet ?? '0000', fpl.alternate1, fpl.alternate2)
  const f18 = formatField18(fpl.field18 ?? {} as Record<string, string>)

  return `(FPL-${f7}-${f8}\n-${f9}-${f10}\n-${f13}-${f15}\n-${f16}-${f18})`
}

// Squawk codes
const RESERVED_SQUAWKS: Record<string, { meaning: string; level: 'CRITICAL' | 'INFO' }> = {
  '7500': { meaning: 'Unlawful interference (hijack)', level: 'CRITICAL' },
  '7600': { meaning: 'Radio communication failure', level: 'CRITICAL' },
  '7700': { meaning: 'Emergency/distress', level: 'CRITICAL' },
  '7777': { meaning: 'Military intercept / test', level: 'CRITICAL' },
  '0000': { meaning: 'Unassigned', level: 'INFO' },
  '1000': { meaning: 'IFR conspicuity (some regions)', level: 'INFO' },
  '2000': { meaning: 'IFR entering SSR area without code', level: 'INFO' },
  '7000': { meaning: 'VFR conspicuity (ICAO standard)', level: 'INFO' },
}

export function isReservedSquawk(code: string): boolean {
  return code in RESERVED_SQUAWKS
}

export function squawkWarningLevel(code: string): 'NONE' | 'INFO' | 'CRITICAL' {
  return RESERVED_SQUAWKS[code]?.level ?? 'NONE'
}

export function squawkMeaning(code: string): string | undefined {
  return RESERVED_SQUAWKS[code]?.meaning
}

export function formatSquawk(raw: string): string {
  return raw.replace(/[^0-7]/g, '').slice(0, 4)
}

export function isValidSquawk(code: string): boolean {
  return /^[0-7]{4}$/.test(code)
}

// Mode S 24-bit ICAO Address
export function validateModeS(hex: string): boolean {
  return /^[0-9A-F]{6}$/i.test(hex)
}

export function isIndianModeS(hex: string): boolean {
  const val = parseInt(hex, 16)
  return val >= 0x800000 && val <= 0x87FFFF
}

// SELCAL validation
const SELCAL_CHARS = 'ABCDEFGHJKLMPQRS'
export function validateSELCAL(code: string): boolean {
  const clean = code.replace('-', '').toUpperCase()
  if (clean.length !== 4) return false
  if (!clean.split('').every(c => SELCAL_CHARS.includes(c))) return false
  // Each pair must be sorted alphabetically
  if (clean[0] > clean[1] || clean[2] > clean[3]) return false
  return true
}

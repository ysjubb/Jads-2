import { en } from './en'
import { hi } from './hi'

export type Locale = 'en' | 'hi'

const translations: Record<Locale, typeof en> = { en, hi }

let currentLocale: Locale = 'en'

export function setLocale(locale: Locale) {
  currentLocale = locale
  localStorage.setItem('jads-locale', locale)
}

export function getLocale(): Locale {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('jads-locale') as Locale | null
    if (stored && translations[stored]) {
      currentLocale = stored
    }
  }
  return currentLocale
}

export function t(path: string, params?: Record<string, string | number>): string {
  const keys = path.split('.')
  let value: any = translations[currentLocale]
  for (const key of keys) {
    value = value?.[key]
  }
  if (typeof value !== 'string') return path

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? `{{${key}}}`))
  }
  return value
}

export function getAvailableLocales(): Array<{ code: Locale; name: string }> {
  return [
    { code: 'en', name: 'English' },
    { code: 'hi', name: '\u0939\u093F\u0902\u0926\u0940' },
  ]
}

// Structured logger. Invariant G5: no console.log anywhere — use createServiceLogger.
// All output is newline-delimited JSON.

import { env } from './env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ServiceLogger {
  debug(message: string, meta?: { data?: Record<string, unknown> }): void
  info (message: string, meta?: { data?: Record<string, unknown> }): void
  warn (message: string, meta?: { data?: Record<string, unknown> }): void
  error(message: string, meta?: { data?: Record<string, unknown> }): void
}

function writeEntry(
  service: string, level: LogLevel, message: string,
  data?: Record<string, unknown>
): void {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), service, level, message, data })
  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n')
  } else {
    process.stdout.write(entry + '\n')
  }
}

export function createServiceLogger(service: string): ServiceLogger {
  return {
    debug: (msg, meta) => { if (env.NODE_ENV === 'development') writeEntry(service, 'debug', msg, meta?.data) },
    info:  (msg, meta) => writeEntry(service, 'info',  msg, meta?.data),
    warn:  (msg, meta) => writeEntry(service, 'warn',  msg, meta?.data),
    error: (msg, meta) => writeEntry(service, 'error', msg, meta?.data),
  }
}

export const rootLogger = createServiceLogger('ROOT')

// Single source of truth for all environment variables.
// Invariant G7: no direct process.env access outside this file.
// If a required variable is missing, process exits immediately with a clear message.

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value || value.trim() === '') {
    // In test mode, return a safe placeholder so pure-logic tests can import
    // services without crashing.  Integration tests that need real env vars
    // should set them in their own setup.
    if (process.env.NODE_ENV === 'test') {
      return `__test_placeholder_${key}__`
    }
    process.stderr.write(
      `FATAL: Missing required environment variable: ${key}\n` +
      `Copy .env.example to .env and fill in all values.\n`
    )
    process.exit(1)
  }
  return value.trim()
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue
}

export const env = {
  NODE_ENV:        optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  PORT:            parseInt(optionalEnv('PORT', '8080')),
  JADS_VERSION:    '4.0',

  DATABASE_URL:    requireEnv('DATABASE_URL'),
  JWT_SECRET:      requireEnv('JWT_SECRET'),
  ADMIN_JWT_SECRET: requireEnv('ADMIN_JWT_SECRET'),

  DIGITAL_SKY_BASE_URL: optionalEnv('DIGITAL_SKY_BASE_URL', ''),
  DIGITAL_SKY_API_KEY:  optionalEnv('DIGITAL_SKY_API_KEY', ''),
  UIDAI_BASE_URL:       optionalEnv('UIDAI_BASE_URL', ''),
  UIDAI_API_KEY:        optionalEnv('UIDAI_API_KEY', ''),
  AFMLU_BASE_URL:       optionalEnv('AFMLU_BASE_URL', ''),
  AFMLU_API_KEY:        optionalEnv('AFMLU_API_KEY', ''),
  FIR_BASE_URL:         optionalEnv('FIR_BASE_URL', ''),
  AFTN_GATEWAY_HOST:    optionalEnv('AFTN_GATEWAY_HOST', ''),
  AFTN_GATEWAY_PORT:    parseInt(optionalEnv('AFTN_GATEWAY_PORT', '0')),
  METAR_BASE_URL:       optionalEnv('METAR_BASE_URL', ''),
  NOTAM_BASE_URL:       optionalEnv('NOTAM_BASE_URL', ''),
  USE_LIVE_ADAPTERS:    optionalEnv('USE_LIVE_ADAPTERS', 'false') === 'true',

  // Jeppesen NavData (ONE_WAY import — licensed chart and navaid data)
  JEPPESEN_BASE_URL:   optionalEnv('JEPPESEN_BASE_URL', ''),
  JEPPESEN_API_KEY:    optionalEnv('JEPPESEN_API_KEY', ''),
  JEPPESEN_LICENSE_ID: optionalEnv('JEPPESEN_LICENSE_ID', ''),

  // AAI Data Exchange (TWO_WAY — aerodrome data import + flight status push)
  AAI_DATA_BASE_URL:   optionalEnv('AAI_DATA_BASE_URL', ''),
  AAI_DATA_API_KEY:    optionalEnv('AAI_DATA_API_KEY', ''),

  // Shared secret for inbound adapter push webhooks (AFMLU, FIR).
  // Must be set to a strong random value in production.
  // AFMLU/FIR systems include this in X-JADS-Adapter-Key header.
  ADAPTER_INBOUND_KEY: requireEnv('ADAPTER_INBOUND_KEY'),

  // RFC 3161 Trusted Timestamping Authority (optional — for forensic-grade temporal proof)
  // Use CDAC (http://tsa.cdac.in) or eMudhra (https://tsa.emudhra.com) for Indian CCA compliance.
  RFC3161_TSA_URL:          optionalEnv('RFC3161_TSA_URL', ''),
  RFC3161_TSA_USERNAME:     optionalEnv('RFC3161_TSA_USERNAME', ''),
  RFC3161_TSA_PASSWORD:     optionalEnv('RFC3161_TSA_PASSWORD', ''),
  RFC3161_TSA_TIMEOUT_MS:   parseInt(optionalEnv('RFC3161_TSA_TIMEOUT_MS', '15000')),
  RFC3161_TOKEN_STORE_PATH: optionalEnv('RFC3161_TOKEN_STORE_PATH', ''),
} as const

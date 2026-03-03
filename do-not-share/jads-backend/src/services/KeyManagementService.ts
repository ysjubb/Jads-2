// KeyManagementService — abstracts cryptographic key operations behind an
// HSM-ready interface. Defense against Threat 1 (Full Backend Compromise).
//
// Current: EnvKeyProvider reads secrets from environment variables.
// Production: Replace with HsmKeyProvider that delegates to AWS CloudHSM,
//   Azure Dedicated HSM, or on-premises PKCS#11 HSM.
//
// The critical property: even with root on the server, the attacker cannot
// extract signing keys from an HSM — they can only ask it to sign things
// in real-time, not forge historical signatures.

import crypto from 'crypto'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('KeyManagementService')

// ── Interface ────────────────────────────────────────────────────────────

export interface IKeyProvider {
  name: string

  // Sign arbitrary data (e.g., JWT, audit entries)
  sign(data: Buffer, keyId: string): Promise<Buffer>

  // Verify a signature
  verify(data: Buffer, signature: Buffer, keyId: string): Promise<boolean>

  // Get a secret value (e.g., JWT_SECRET for HMAC)
  // HSM providers would derive this from a master key
  getSecret(keyId: string): Promise<string>

  // Report whether keys are hardware-backed
  isHardwareBacked(): boolean
}

// ── Environment Key Provider (current implementation) ────────────────────

export class EnvKeyProvider implements IKeyProvider {
  name = 'env'
  private secrets: Map<string, string> = new Map()

  constructor(secrets: Record<string, string>) {
    for (const [k, v] of Object.entries(secrets)) {
      this.secrets.set(k, v)
    }
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    const secret = this.secrets.get(keyId)
    if (!secret) throw new Error(`KEY_NOT_FOUND: ${keyId}`)
    return Buffer.from(crypto.createHmac('sha256', secret).update(data).digest())
  }

  async verify(data: Buffer, signature: Buffer, keyId: string): Promise<boolean> {
    const expected = await this.sign(data, keyId)
    return crypto.timingSafeEqual(expected, signature)
  }

  async getSecret(keyId: string): Promise<string> {
    const secret = this.secrets.get(keyId)
    if (!secret) throw new Error(`KEY_NOT_FOUND: ${keyId}`)
    return secret
  }

  isHardwareBacked(): boolean { return false }
}

// ── HSM Key Provider (production interface — requires HSM infrastructure) ─

export class HsmKeyProvider implements IKeyProvider {
  name = 'hsm'

  constructor(
    private readonly hsmEndpoint: string,
    private readonly hsmCredentials: string
  ) {
    log.info('hsm_provider_initialized', { data: { endpoint: hsmEndpoint } })
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    // Production: call HSM PKCS#11 or cloud HSM API
    // e.g., AWS CloudHSM: sign(keyHandle, mechanism, data)
    throw new Error('HSM_NOT_CONFIGURED: Implement PKCS#11 or cloud HSM integration')
  }

  async verify(data: Buffer, signature: Buffer, keyId: string): Promise<boolean> {
    throw new Error('HSM_NOT_CONFIGURED: Implement PKCS#11 or cloud HSM integration')
  }

  async getSecret(keyId: string): Promise<string> {
    // HSM-backed: derive secret from master key stored in HSM
    throw new Error('HSM_NOT_CONFIGURED: Implement key derivation from HSM master key')
  }

  isHardwareBacked(): boolean { return true }
}

// ── Runtime Integrity Service ────────────────────────────────────────────
// Detects if critical service files have been modified since deployment.
// Defense against attack vector: attacker modifies ForensicVerifier to always
// return allInvariantsHold=true.
//
// At startup, compute SHA-256 hashes of critical files. Periodically re-check.
// If a hash changes, the server has been tampered with.

export class RuntimeIntegrityService {
  private baselineHashes: Map<string, string> = new Map()

  constructor(private readonly criticalPaths: string[]) {}

  computeBaseline(): void {
    const fs = require('fs')
    for (const p of this.criticalPaths) {
      try {
        const content = fs.readFileSync(p)
        const hash = crypto.createHash('sha256').update(content).digest('hex')
        this.baselineHashes.set(p, hash)
      } catch {
        // File not found at startup — record as absent
        this.baselineHashes.set(p, 'FILE_NOT_FOUND')
      }
    }
    log.info('integrity_baseline_computed', {
      data: { fileCount: this.baselineHashes.size }
    })
  }

  checkIntegrity(): { intact: boolean; violations: string[] } {
    const fs = require('fs')
    const violations: string[] = []

    for (const [p, expectedHash] of this.baselineHashes) {
      try {
        const content = fs.readFileSync(p)
        const currentHash = crypto.createHash('sha256').update(content).digest('hex')
        if (currentHash !== expectedHash) {
          violations.push(`MODIFIED: ${p} baseline=${expectedHash.slice(0, 16)}... current=${currentHash.slice(0, 16)}...`)
        }
      } catch {
        if (expectedHash !== 'FILE_NOT_FOUND') {
          violations.push(`MISSING: ${p} was present at startup but is now absent`)
        }
      }
    }

    if (violations.length > 0) {
      log.error('integrity_violation_detected', { data: { violations } })
    }

    return { intact: violations.length === 0, violations }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createKeyProvider(): IKeyProvider {
  const hsmEndpoint = process.env.HSM_ENDPOINT
  const hsmCreds    = process.env.HSM_CREDENTIALS

  if (hsmEndpoint && hsmCreds) {
    log.info('using_hsm_key_provider', { data: { endpoint: hsmEndpoint } })
    return new HsmKeyProvider(hsmEndpoint, hsmCreds)
  }

  // Fallback to env-based keys
  log.info('using_env_key_provider', {
    data: { message: 'Set HSM_ENDPOINT for hardware-backed key management' }
  })
  return new EnvKeyProvider({
    jwt:       process.env.JWT_SECRET       ?? '',
    admin_jwt: process.env.ADMIN_JWT_SECRET ?? '',
    adapter:   process.env.ADAPTER_INBOUND_KEY ?? '',
    anchor:    process.env.ANCHOR_HMAC_KEY  ?? '',
  })
}

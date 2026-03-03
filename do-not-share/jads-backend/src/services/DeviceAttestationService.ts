// DeviceAttestationService — verifies Android device integrity before
// accepting drone mission telemetry. Defense against Threat 4 (Compromised Device).
//
// Current architecture gap: the Android app self-reports strongboxBacked and
// secureBootVerified. A rooted device can set these to any value.
//
// This service adds server-side verification of device integrity tokens
// (Play Integrity API / SafetyNet attestation) before accepting missions.
//
// Without verified attestation, a mission is flagged as UNATTESTED — still
// accepted (backwards compatibility) but with reduced forensic weight.

import crypto from 'crypto'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('DeviceAttestationService')

// ── Attestation Input (from Android app) ─────────────────────────────────

export interface DeviceAttestationInput {
  // Self-reported (can be spoofed on rooted devices)
  strongboxBacked?:    boolean
  secureBootVerified?: boolean
  androidVersion?:     string

  // Cryptographic attestation (cannot be spoofed without Google compromise)
  playIntegrityToken?: string    // Play Integrity API token
  keyAttestationCert?: string    // Base64 DER of key attestation certificate chain
}

// ── Attestation Result ───────────────────────────────────────────────────

export interface AttestationResult {
  trustLevel:        'FULL' | 'PARTIAL' | 'UNATTESTED' | 'FAILED'
  deviceIntegrity:   boolean | null   // null = not checked
  appIntegrity:      boolean | null
  keyHardwareBacked: boolean | null
  details:           string[]
  advisories:        string[]
}

// ── Attestation Verifier Interface ───────────────────────────────────────

export interface IAttestationVerifier {
  name: string
  verify(input: DeviceAttestationInput): Promise<AttestationResult>
}

// ── Play Integrity Verifier (production) ─────────────────────────────────
// Calls Google Play Integrity API to decode and verify the integrity token.
// Requires: PLAY_INTEGRITY_DECRYPTION_KEY and PLAY_INTEGRITY_VERIFICATION_KEY
// or a Google Cloud project with Play Integrity API enabled.

export class PlayIntegrityVerifier implements IAttestationVerifier {
  name = 'play_integrity'

  constructor(
    private readonly projectId: string,
    private readonly apiKey:    string
  ) {}

  async verify(input: DeviceAttestationInput): Promise<AttestationResult> {
    if (!input.playIntegrityToken) {
      return {
        trustLevel: 'UNATTESTED',
        deviceIntegrity: null, appIntegrity: null, keyHardwareBacked: null,
        details: ['No Play Integrity token provided'],
        advisories: ['Device integrity cannot be verified without Play Integrity token'],
      }
    }

    // Production: decode token via Google API
    // POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken
    // with { integrity_token: input.playIntegrityToken }
    //
    // Response contains:
    //   deviceIntegrity.deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"]
    //   appIntegrity.appRecognitionVerdict: "PLAY_RECOGNIZED"
    //   accountDetails.appLicensingVerdict: "LICENSED"
    //
    // For now: return UNATTESTED (no Google API configured)
    log.warn('play_integrity_not_configured', {
      data: { message: 'Set PLAY_INTEGRITY_PROJECT_ID to enable device attestation' }
    })

    return {
      trustLevel: 'UNATTESTED',
      deviceIntegrity: null, appIntegrity: null, keyHardwareBacked: null,
      details: ['Play Integrity API not configured on server'],
      advisories: ['Configure PLAY_INTEGRITY_PROJECT_ID for production device verification'],
    }
  }
}

// ── Key Attestation Verifier ─────────────────────────────────────────────
// Verifies that the device's signing key was generated inside hardware
// (StrongBox or TEE) by checking the key attestation certificate chain.
//
// The certificate chain is rooted in a Google hardware attestation root CA.
// If the chain validates, the key is provably hardware-backed.

export class KeyAttestationVerifier implements IAttestationVerifier {
  name = 'key_attestation'

  async verify(input: DeviceAttestationInput): Promise<AttestationResult> {
    if (!input.keyAttestationCert) {
      return {
        trustLevel: 'UNATTESTED',
        deviceIntegrity: null, appIntegrity: null,
        keyHardwareBacked: null,
        details: ['No key attestation certificate provided'],
        advisories: ['Android app should send keyAttestationCert for hardware key verification'],
      }
    }

    try {
      // Parse the DER certificate
      const certDer = Buffer.from(input.keyAttestationCert, 'base64')
      const cert = new crypto.X509Certificate(certDer)

      // Check basic certificate properties
      const details: string[] = []
      const advisories: string[] = []

      // Verify certificate is not expired
      const now = new Date()
      const notBefore = new Date(cert.validFrom)
      const notAfter  = new Date(cert.validTo)

      if (now < notBefore || now > notAfter) {
        return {
          trustLevel: 'FAILED',
          deviceIntegrity: null, appIntegrity: null, keyHardwareBacked: false,
          details: [`Certificate expired or not yet valid: ${cert.validFrom} to ${cert.validTo}`],
          advisories: ['Device certificate is outside its validity period'],
        }
      }

      details.push(`Certificate valid: ${cert.validFrom} to ${cert.validTo}`)
      details.push(`Subject: ${cert.subject}`)
      details.push(`Issuer: ${cert.issuer}`)

      // Check if key is EC P-256 (expected for JADS)
      const keyType = cert.publicKey.asymmetricKeyType
      if (keyType !== 'ec') {
        advisories.push(`Unexpected key type: ${keyType} (expected EC P-256)`)
      }

      // Production: verify full certificate chain against Google root CA
      // For now: accept if certificate is parseable and valid
      const keyHardwareBacked = input.strongboxBacked ?? null

      return {
        trustLevel: keyHardwareBacked ? 'PARTIAL' : 'PARTIAL',
        deviceIntegrity: null,
        appIntegrity: null,
        keyHardwareBacked,
        details,
        advisories: advisories.length > 0 ? advisories :
          ['Full chain verification against Google root CA not yet configured'],
      }
    } catch (e) {
      return {
        trustLevel: 'FAILED',
        deviceIntegrity: null, appIntegrity: null, keyHardwareBacked: false,
        details: [`Certificate parse error: ${e instanceof Error ? e.message : String(e)}`],
        advisories: ['Device key attestation certificate could not be verified'],
      }
    }
  }
}

// ── Composite Device Attestation Service ─────────────────────────────────

export class DeviceAttestationService {
  private verifiers: IAttestationVerifier[] = []

  constructor(verifiers?: IAttestationVerifier[]) {
    if (verifiers) this.verifiers = verifiers
  }

  addVerifier(v: IAttestationVerifier): void {
    this.verifiers.push(v)
  }

  async verifyDevice(input: DeviceAttestationInput): Promise<{
    overallTrust: 'FULL' | 'PARTIAL' | 'UNATTESTED' | 'FAILED'
    results:      Array<{ verifier: string; result: AttestationResult }>
    trustScore:   number   // 0-100, higher = more trusted
  }> {
    if (this.verifiers.length === 0) {
      return {
        overallTrust: 'UNATTESTED',
        results: [],
        trustScore: computeTrustScore(input, []),
      }
    }

    const results = await Promise.all(
      this.verifiers.map(async v => ({
        verifier: v.name,
        result:   await v.verify(input),
      }))
    )

    // Overall trust: worst result wins
    const levels = results.map(r => r.result.trustLevel)
    let overallTrust: 'FULL' | 'PARTIAL' | 'UNATTESTED' | 'FAILED' = 'FULL'
    if (levels.includes('FAILED'))      overallTrust = 'FAILED'
    else if (levels.includes('UNATTESTED')) overallTrust = 'UNATTESTED'
    else if (levels.includes('PARTIAL'))    overallTrust = 'PARTIAL'

    const trustScore = computeTrustScore(input, results.map(r => r.result))

    log.info('device_attestation_complete', {
      data: { overallTrust, trustScore, verifiers: results.map(r => r.verifier) }
    })

    return { overallTrust, results, trustScore }
  }
}

// ── Trust Score Computation ──────────────────────────────────────────────
// Numeric score (0-100) reflecting the evidentiary weight of device integrity.
//
//   100 = Full Play Integrity + StrongBox key + secure boot
//    70 = Key attestation verified but no Play Integrity
//    40 = Self-reported StrongBox but no cryptographic proof
//    20 = Device claims no StrongBox (software-only key)
//     0 = Attestation failed or device tampered

function computeTrustScore(
  input: DeviceAttestationInput,
  results: AttestationResult[]
): number {
  let score = 20  // Base score for submitting a mission

  // Play Integrity verified
  if (results.some(r => r.deviceIntegrity === true))  score += 30
  if (results.some(r => r.appIntegrity === true))      score += 10

  // Hardware-backed key
  if (results.some(r => r.keyHardwareBacked === true)) score += 25
  else if (input.strongboxBacked === true)             score += 10  // Self-reported, less weight

  // Secure boot
  if (input.secureBootVerified === true) score += 15

  // Cap at 100
  return Math.min(100, score)
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createDeviceAttestationService(): DeviceAttestationService {
  const service = new DeviceAttestationService()

  const playProjectId = process.env.PLAY_INTEGRITY_PROJECT_ID
  const playApiKey    = process.env.PLAY_INTEGRITY_API_KEY
  if (playProjectId && playApiKey) {
    service.addVerifier(new PlayIntegrityVerifier(playProjectId, playApiKey))
  }

  // Key attestation is always available (no external API needed)
  service.addVerifier(new KeyAttestationVerifier())

  return service
}

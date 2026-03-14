/**
 * DS-02 — PKI Certificate Chain Service
 *
 * Implements the 3-tier certificate trust hierarchy from Digital Sky:
 *   CCA Root Certificate (Controller of Certifying Authorities, India)
 *     └── Intermediate CA (optional — manufacturer trust chain)
 *          └── End Entity Certificate (manufacturer / PA signer / device)
 *
 * Operations:
 *   - PKIX path validation (certificate chain verification)
 *   - DN matching (CN + O attributes must match)
 *   - Digital signature verification using certificate's public key
 *   - Certificate storage (CCA root, manufacturer chains, server signing certs)
 *   - Demo certificate generation for dev/test
 *
 * DS alignment:
 *   - Revocation checking DISABLED (same as DS reference implementation)
 *   - Self-signed certificates accepted when selfSignedValid=true (dev mode)
 *   - DN matching: issuer CN/O must match chain cert subject CN/O
 *
 * Production: CCA root from CCA India, manufacturer certs uploaded during
 * manufacturer profile creation, server cert from CCA-licensed CA (eMudhra, CDAC).
 */

import * as crypto from 'crypto'
import * as x509 from '@peculiar/x509'
import { createServiceLogger } from '../../logger'

// Use Node.js built-in WebCrypto for @peculiar/x509
x509.cryptoProvider.set(globalThis.crypto)

const log = createServiceLogger('PkiCertificateChainService')

// ── Types ──────────────────────────────────────────────────────────────

export interface CertificateInfo {
  subject:      string
  issuer:       string
  serialNumber: string
  validFrom:    Date
  validTo:      Date
  isExpired:    boolean
  isSelfSigned: boolean
  publicKeyAlgorithm: string
  signatureAlgorithm: string
  /** CN extracted from subject */
  commonName:   string
  /** O extracted from subject */
  organization: string
}

export interface ChainValidationResult {
  valid:              boolean
  errors:             string[]
  chainLength:        number
  leafCert:           CertificateInfo | null
  rootCert:           CertificateInfo | null
  /** Whether all certs in chain are temporally valid */
  allCertsValid:      boolean
  /** Whether DN matching passed */
  dnMatchValid:       boolean
}

export interface SignatureVerificationResult {
  valid:              boolean
  errors:             string[]
  signerCN:           string
  algorithm:          string
}

export interface StoredCertificateChain {
  id:                 string
  label:              string
  certificates:       string[]  // PEM strings, leaf → root order
  uploadedAt:         Date
  uploadedBy:         string
}

// ── Certificate Chain Service ──────────────────────────────────────────

export class PkiCertificateChainService {
  /** CCA Root certificate PEM (trust anchor) */
  private ccaRootPem: string | null = null
  /** Server signing key PEM (for PA signing) */
  private serverKeyPem: string | null = null
  /** Server certificate PEM (for PA signing) */
  private serverCertPem: string | null = null
  /** Manufacturer certificate chains: manufacturerId → PEM chain */
  private manufacturerChains: Map<string, StoredCertificateChain> = new Map()
  /** Allow self-signed certs (dev/demo mode) */
  private selfSignedValid: boolean

  constructor(options?: {
    ccaRootPem?: string
    serverKeyPem?: string
    serverCertPem?: string
    selfSignedValid?: boolean
  }) {
    this.ccaRootPem = options?.ccaRootPem ?? null
    this.serverKeyPem = options?.serverKeyPem ?? null
    this.serverCertPem = options?.serverCertPem ?? null
    this.selfSignedValid = options?.selfSignedValid ?? true  // true for dev
    log.info('pki_service_initialized', {
      data: {
        hasCcaRoot: !!this.ccaRootPem,
        hasServerKey: !!this.serverKeyPem,
        hasServerCert: !!this.serverCertPem,
        selfSignedValid: this.selfSignedValid,
      }
    })
  }

  // ── Certificate Parsing ──────────────────────────────────────────────

  /**
   * Parse a PEM certificate and extract info.
   */
  parseCertificate(pem: string): CertificateInfo {
    const cert = new crypto.X509Certificate(pem)
    const now = new Date()

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      validFrom: new Date(cert.validFrom),
      validTo: new Date(cert.validTo),
      isExpired: now > new Date(cert.validTo),
      isSelfSigned: cert.subject === cert.issuer,
      publicKeyAlgorithm: cert.publicKey.asymmetricKeyType ?? 'unknown',
      signatureAlgorithm: 'RSA-SHA256', // Node crypto doesn't expose this directly
      commonName: extractDnField(cert.subject, 'CN'),
      organization: extractDnField(cert.subject, 'O'),
    }
  }

  // ── Chain Validation (PKIX-style) ────────────────────────────────────

  /**
   * Validate a certificate chain.
   *
   * DS validation process:
   *   1. Parse all certificates in the chain
   *   2. Verify temporal validity (not expired)
   *   3. Verify issuer→subject chain linkage
   *   4. Verify DN matching (CN + O)
   *   5. Verify signature chain (each cert signed by next)
   *   6. Root must be self-signed or match CCA root
   *
   * @param certPems  PEM certificates, leaf → root order
   */
  validateChain(certPems: string[]): ChainValidationResult {
    const errors: string[] = []

    if (certPems.length === 0) {
      return { valid: false, errors: ['Empty certificate chain'], chainLength: 0,
        leafCert: null, rootCert: null, allCertsValid: false, dnMatchValid: false }
    }

    // Parse all certs
    const certs: crypto.X509Certificate[] = []
    const certInfos: CertificateInfo[] = []
    for (let i = 0; i < certPems.length; i++) {
      try {
        const cert = new crypto.X509Certificate(certPems[i])
        certs.push(cert)
        certInfos.push(this.parseCertificate(certPems[i]))
      } catch (e: any) {
        errors.push(`Certificate [${i}]: failed to parse — ${e.message}`)
      }
    }

    if (certs.length === 0) {
      return { valid: false, errors, chainLength: 0,
        leafCert: null, rootCert: null, allCertsValid: false, dnMatchValid: false }
    }

    // Check temporal validity
    const now = new Date()
    let allCertsValid = true
    for (let i = 0; i < certs.length; i++) {
      if (now < new Date(certs[i].validFrom)) {
        errors.push(`Certificate [${i}] (${certInfos[i].commonName}): not yet valid`)
        allCertsValid = false
      }
      if (now > new Date(certs[i].validTo)) {
        errors.push(`Certificate [${i}] (${certInfos[i].commonName}): expired on ${certs[i].validTo}`)
        allCertsValid = false
      }
    }

    // Verify issuer→subject chain linkage and DN matching
    let dnMatchValid = true
    for (let i = 0; i < certs.length - 1; i++) {
      const current = certs[i]
      const issuerCert = certs[i + 1]

      // Issuer of current should match subject of next cert
      if (current.issuer !== issuerCert.subject) {
        errors.push(`Certificate [${i}] issuer does not match certificate [${i + 1}] subject`)
        dnMatchValid = false
      }

      // DN matching: CN and O must match (DS requirement)
      const currentIssuerCN = extractDnField(current.issuer, 'CN')
      const issuerSubjectCN = extractDnField(issuerCert.subject, 'CN')
      const currentIssuerO = extractDnField(current.issuer, 'O')
      const issuerSubjectO = extractDnField(issuerCert.subject, 'O')

      if (currentIssuerCN && issuerSubjectCN && currentIssuerCN !== issuerSubjectCN) {
        errors.push(`DN mismatch: cert[${i}] issuer CN='${currentIssuerCN}' != cert[${i + 1}] subject CN='${issuerSubjectCN}'`)
        dnMatchValid = false
      }
      if (currentIssuerO && issuerSubjectO && currentIssuerO !== issuerSubjectO) {
        errors.push(`DN mismatch: cert[${i}] issuer O='${currentIssuerO}' != cert[${i + 1}] subject O='${issuerSubjectO}'`)
        dnMatchValid = false
      }

      // Verify signature (current cert signed by issuer cert)
      try {
        const isSignedBy = current.checkIssued(issuerCert)
        if (!isSignedBy) {
          errors.push(`Certificate [${i}] signature not valid — not issued by certificate [${i + 1}]`)
        }
      } catch (e: any) {
        errors.push(`Certificate [${i}] signature check error: ${e.message}`)
      }
    }

    // Root cert: must be self-signed or match CCA root
    const rootCert = certs[certs.length - 1]
    const rootInfo = certInfos[certInfos.length - 1]
    if (rootInfo.isSelfSigned) {
      if (!this.selfSignedValid && !this.isCcaRoot(rootCert)) {
        errors.push('Root certificate is self-signed but self-signed validation is disabled and it does not match CCA root')
      }
    } else if (this.ccaRootPem) {
      // Verify root is signed by CCA
      try {
        const ccaRoot = new crypto.X509Certificate(this.ccaRootPem)
        const isSignedByCCA = rootCert.checkIssued(ccaRoot)
        if (!isSignedByCCA) {
          errors.push('Root certificate not issued by CCA root')
        }
      } catch (e: any) {
        errors.push(`CCA root verification error: ${e.message}`)
      }
    }

    const valid = errors.length === 0

    log.info('chain_validation_complete', {
      data: {
        valid,
        chainLength: certs.length,
        leafCN: certInfos[0]?.commonName,
        rootCN: rootInfo?.commonName,
        errorCount: errors.length,
      }
    })

    return {
      valid,
      errors,
      chainLength: certs.length,
      leafCert: certInfos[0] ?? null,
      rootCert: rootInfo ?? null,
      allCertsValid,
      dnMatchValid,
    }
  }

  // ── Signature Verification ───────────────────────────────────────────

  /**
   * Verify a digital signature against a certificate.
   * DS device registration uses SHA256withRSA.
   *
   * @param data       The data that was signed (Buffer or string)
   * @param signature  Base64-encoded signature
   * @param certPem    PEM certificate whose public key was used to sign
   * @param algorithm  Hash algorithm (default: SHA256)
   */
  verifySignature(
    data: Buffer | string,
    signature: string,
    certPem: string,
    algorithm: string = 'SHA256'
  ): SignatureVerificationResult {
    const errors: string[] = []
    let signerCN = ''

    try {
      const cert = new crypto.X509Certificate(certPem)
      signerCN = extractDnField(cert.subject, 'CN')

      // Check cert validity
      const now = new Date()
      if (now > new Date(cert.validTo)) {
        errors.push(`Signer certificate expired on ${cert.validTo}`)
      }

      // Verify signature
      const verifier = crypto.createVerify(algorithm)
      verifier.update(data)
      const valid = verifier.verify(cert.publicKey, signature, 'base64')

      if (!valid) {
        errors.push('Digital signature verification failed')
      }
    } catch (e: any) {
      errors.push(`Signature verification error: ${e.message}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      signerCN,
      algorithm: `RSA-${algorithm}`,
    }
  }

  /**
   * Sign data with the server's private key (for PA signing).
   */
  signData(data: Buffer | string, algorithm: string = 'SHA256'): string {
    if (!this.serverKeyPem) {
      throw new Error('PKI_NO_SERVER_KEY: Server signing key not configured')
    }
    const signer = crypto.createSign(algorithm)
    signer.update(data)
    return signer.sign(this.serverKeyPem, 'base64')
  }

  // ── Manufacturer Chain Storage ───────────────────────────────────────

  /**
   * Store a manufacturer's trusted certificate chain.
   * Called during manufacturer profile creation (DS §3.4).
   */
  storeManufacturerChain(
    manufacturerId: string,
    label: string,
    certPems: string[],
    uploadedBy: string
  ): ChainValidationResult {
    // Validate the chain first
    const validation = this.validateChain(certPems)
    if (!validation.valid) {
      log.warn('manufacturer_chain_rejected', {
        data: { manufacturerId, label, errors: validation.errors }
      })
      return validation
    }

    this.manufacturerChains.set(manufacturerId, {
      id: manufacturerId,
      label,
      certificates: certPems,
      uploadedAt: new Date(),
      uploadedBy,
    })

    log.info('manufacturer_chain_stored', {
      data: { manufacturerId, label, chainLength: certPems.length }
    })

    return validation
  }

  /**
   * Get a manufacturer's stored certificate chain.
   */
  getManufacturerChain(manufacturerId: string): StoredCertificateChain | null {
    return this.manufacturerChains.get(manufacturerId) ?? null
  }

  /**
   * Validate a device certificate against a manufacturer's stored chain.
   * This is the core of DS device registration PKI validation.
   */
  validateDeviceCertAgainstManufacturer(
    deviceCertPem: string,
    manufacturerId: string
  ): ChainValidationResult {
    const chain = this.manufacturerChains.get(manufacturerId)
    if (!chain) {
      return {
        valid: false,
        errors: [`No stored certificate chain for manufacturer '${manufacturerId}'`],
        chainLength: 0, leafCert: null, rootCert: null,
        allCertsValid: false, dnMatchValid: false,
      }
    }

    // Build full chain: device cert + manufacturer chain
    const fullChain = [deviceCertPem, ...chain.certificates]
    return this.validateChain(fullChain)
  }

  // ── Server Certificate Management ────────────────────────────────────

  /**
   * Get the server's signing certificate PEM (for PA signing KeyInfo).
   */
  getServerCertPem(): string | null {
    return this.serverCertPem
  }

  /**
   * Get the server's private key PEM (for PA signing).
   */
  getServerKeyPem(): string | null {
    return this.serverKeyPem
  }

  /**
   * Set server signing credentials (can be called after initialization).
   */
  setServerCredentials(keyPem: string, certPem: string): void {
    this.serverKeyPem = keyPem
    this.serverCertPem = certPem
    log.info('server_credentials_updated', {
      data: { certCN: extractDnField(new crypto.X509Certificate(certPem).subject, 'CN') }
    })
  }

  /**
   * Set CCA root certificate.
   */
  setCcaRoot(pem: string): void {
    this.ccaRootPem = pem
    const cert = new crypto.X509Certificate(pem)
    log.info('cca_root_set', {
      data: { subject: cert.subject, validTo: cert.validTo }
    })
  }

  // ── Demo Certificate Generation ──────────────────────────────────────

  /**
   * Generate a self-signed demo certificate and key pair.
   * FOR DEV/DEMO ONLY — not issued by CCA.
   *
   * @param cn  Common Name (e.g., "JADS Demo PA Signer")
   * @param org Organization (e.g., "JADS Platform")
   */
  async generateDemoCertificate(
    cn: string = 'JADS Demo PA Signer',
    org: string = 'JADS Platform'
  ): Promise<{ privateKey: string; certificate: string }> {
    const alg: RsaHashedKeyGenParams = {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    }

    const keys = await globalThis.crypto.subtle.generateKey(alg, true, ['sign', 'verify'])

    const serialBytes = crypto.randomBytes(8)
    const serialNumber = serialBytes.toString('hex')

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber,
      name: `CN=${cn}, O=${org}, C=IN`,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      keys,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
        new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.3'], false),
      ],
    })

    const certificate = cert.toString('pem')

    const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', keys.privateKey)
    const pkBase64 = Buffer.from(pkcs8).toString('base64')
    const pkLines = pkBase64.match(/.{1,64}/g)!.join('\n')
    const privateKey = `-----BEGIN PRIVATE KEY-----\n${pkLines}\n-----END PRIVATE KEY-----`

    log.info('demo_certificate_generated', {
      data: { cn, org, serialNumber, validDays: 365 }
    })

    return { privateKey, certificate }
  }

  /**
   * Generate demo credentials and set them as server credentials.
   * Convenience method for dev startup.
   */
  async initDemoCredentials(): Promise<void> {
    const { privateKey, certificate } = await this.generateDemoCertificate()
    this.setServerCredentials(privateKey, certificate)
    log.info('demo_credentials_initialized', { data: {} })
  }

  // ── Summary / Status ─────────────────────────────────────────────────

  getStatus(): {
    hasCcaRoot: boolean
    hasServerKey: boolean
    hasServerCert: boolean
    selfSignedValid: boolean
    manufacturerChainsCount: number
    serverCertInfo: CertificateInfo | null
  } {
    let serverCertInfo: CertificateInfo | null = null
    if (this.serverCertPem) {
      try {
        serverCertInfo = this.parseCertificate(this.serverCertPem)
      } catch { /* ignore */ }
    }

    return {
      hasCcaRoot: !!this.ccaRootPem,
      hasServerKey: !!this.serverKeyPem,
      hasServerCert: !!this.serverCertPem,
      selfSignedValid: this.selfSignedValid,
      manufacturerChainsCount: this.manufacturerChains.size,
      serverCertInfo,
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  private isCcaRoot(cert: crypto.X509Certificate): boolean {
    if (!this.ccaRootPem) return false
    try {
      const ccaRoot = new crypto.X509Certificate(this.ccaRootPem)
      return cert.fingerprint === ccaRoot.fingerprint
    } catch {
      return false
    }
  }
}

// ── Utility ────────────────────────────────────────────────────────────

/**
 * Extract a field from an X.509 Distinguished Name string.
 * e.g., extractDnField('CN=Foo, O=Bar, C=IN', 'CN') → 'Foo'
 */
export function extractDnField(dn: string, field: string): string {
  // Node.js X509Certificate subject format: "CN=value\nO=value\nC=value"
  // or sometimes comma-separated
  const patterns = [
    new RegExp(`${field}=([^\\n,]+)`),
  ]
  for (const pat of patterns) {
    const m = dn.match(pat)
    if (m) return m[1].trim()
  }
  return ''
}

// ── Singleton Factory ──────────────────────────────────────────────────

let _instance: PkiCertificateChainService | null = null

export function getPkiService(): PkiCertificateChainService {
  if (!_instance) {
    _instance = new PkiCertificateChainService({
      selfSignedValid: process.env.NODE_ENV !== 'production',
    })
  }
  return _instance
}

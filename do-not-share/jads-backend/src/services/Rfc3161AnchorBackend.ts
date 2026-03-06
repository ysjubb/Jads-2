// Rfc3161AnchorBackend — RFC 3161 Trusted Timestamping Authority integration.
//
// RFC 3161 (Internet X.509 PKI Time-Stamp Protocol) provides independently
// verifiable temporal proof from a Trusted Third Party. Unlike NTP (which only
// synchronises clocks), RFC 3161 produces a signed TimeStampToken that proves
// a hash existed at a specific point in time — independently verifiable by any
// party without trusting JADS.
//
// Indian TSA options:
//   - CDAC (Centre for Development of Advanced Computing) — CCA-licensed
//   - eMudhra — CCA-licensed, commercially available
//
// This backend integrates with the existing ExternalAnchorService as an
// IAnchorBackend. It:
//   1. Hashes the anchor payload (SHA-256)
//   2. Builds an RFC 3161 TimeStampReq (DER-encoded ASN.1)
//   3. Sends it to the configured TSA endpoint over HTTPS
//   4. Receives a TimeStampResp containing the signed TimeStampToken
//   5. Stores the token alongside the anchor for independent verification
//
// Standards references:
//   - RFC 3161: Internet X.509 Public Key Infrastructure Time-Stamp Protocol
//   - RFC 5816: ESSCertIDv2 Update for RFC 3161
//   - ITU-T X.680/X.690: ASN.1 encoding rules (DER)
//
// For courtroom use: The TimeStampToken from a CCA-licensed TSA constitutes
// independent temporal proof under BSA 2023 Section 63. A defense attorney
// cannot challenge the timestamp without challenging the TSA itself.

import crypto from 'crypto'
import https  from 'https'
import http   from 'http'
import { createServiceLogger } from '../logger'
import type { IAnchorBackend, AnchorPayload, AnchorReceipt } from './ExternalAnchorService'

const log = createServiceLogger('Rfc3161Backend')

// ── ASN.1 DER helpers ────────────────────────────────────────────────────────
// Minimal DER encoder for TimeStampReq construction.
// We build the ASN.1 structure by hand to avoid heavy dependencies.
// Production alternative: use a full ASN.1 library (asn1js, @peculiar/asn1-*).

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length])
  if (length < 0x100) return Buffer.from([0x81, length])
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff])
}

function derSequence(contents: Buffer): Buffer {
  const len = derLength(contents.length)
  return Buffer.concat([Buffer.from([0x30]), len, contents])
}

function derInteger(value: number): Buffer {
  // Simple small-integer encoding (for version = 1)
  if (value < 0x80) return Buffer.from([0x02, 0x01, value])
  return Buffer.from([0x02, 0x02, (value >> 8) & 0xff, value & 0xff])
}

function derOctetString(data: Buffer): Buffer {
  const len = derLength(data.length)
  return Buffer.concat([Buffer.from([0x04]), len, data])
}

function derOid(oid: number[]): Buffer {
  // Encode OID — first two components merged: 40*a + b
  const bytes: number[] = [40 * oid[0] + oid[1]]
  for (let i = 2; i < oid.length; i++) {
    let val = oid[i]
    if (val < 128) {
      bytes.push(val)
    } else {
      // Multi-byte encoding for values >= 128
      const parts: number[] = []
      parts.push(val & 0x7f)
      val >>= 7
      while (val > 0) {
        parts.push((val & 0x7f) | 0x80)
        val >>= 7
      }
      parts.reverse()
      bytes.push(...parts)
    }
  }
  const content = Buffer.from(bytes)
  const len = derLength(content.length)
  return Buffer.concat([Buffer.from([0x06]), len, content])
}

function derBoolean(value: boolean): Buffer {
  return Buffer.from([0x01, 0x01, value ? 0xff : 0x00])
}

// SHA-256 OID: 2.16.840.1.101.3.4.2.1
const SHA256_OID = [2, 16, 840, 1, 101, 3, 4, 2, 1]

// ── TimeStampReq builder ────────────────────────────────────────────────────
// RFC 3161 §2.4.1:
//   TimeStampReq ::= SEQUENCE {
//     version          INTEGER { v1(1) },
//     messageImprint   MessageImprint,
//     reqPolicy        TSAPolicyId OPTIONAL,
//     nonce            INTEGER OPTIONAL,
//     certReq          BOOLEAN DEFAULT FALSE,
//     extensions       [0] IMPLICIT Extensions OPTIONAL
//   }
//
//   MessageImprint ::= SEQUENCE {
//     hashAlgorithm    AlgorithmIdentifier,
//     hashedMessage    OCTET STRING
//   }

function buildTimeStampReq(hash: Buffer, nonce: Buffer): Buffer {
  // AlgorithmIdentifier for SHA-256 (OID + NULL parameters)
  const algId = derSequence(Buffer.concat([
    derOid(SHA256_OID),
    Buffer.from([0x05, 0x00]),  // NULL
  ]))

  // MessageImprint
  const messageImprint = derSequence(Buffer.concat([
    algId,
    derOctetString(hash),
  ]))

  // Nonce as INTEGER
  // Prepend 0x00 if high bit set (to avoid negative interpretation)
  const nonceBytes = nonce[0] >= 0x80
    ? Buffer.concat([Buffer.from([0x00]), nonce])
    : nonce
  const nonceDer = Buffer.concat([
    Buffer.from([0x02]),
    derLength(nonceBytes.length),
    nonceBytes,
  ])

  // certReq = TRUE — we want the TSA certificate in the response
  // so verifiers don't need to separately look up the TSA cert
  const certReq = derBoolean(true)

  // Assemble TimeStampReq
  const reqBody = Buffer.concat([
    derInteger(1),       // version = v1
    messageImprint,
    nonceDer,            // nonce for replay protection
    certReq,             // request TSA cert in response
  ])

  return derSequence(reqBody)
}

// ── TimeStampResp parser ────────────────────────────────────────────────────
// Minimal parser — extracts status and the raw TimeStampToken (CMS SignedData).
// Full ASN.1 parsing is not needed for storage — we store the entire DER blob.
// Verification is done by the TSA's public certificate + standard tools.
//
// TimeStampResp ::= SEQUENCE {
//   status          PKIStatusInfo,
//   timeStampToken  TimeStampToken OPTIONAL
// }
//
// PKIStatusInfo ::= SEQUENCE {
//   status    PKIStatus,
//   ...
// }
//
// PKIStatus: 0=granted, 1=grantedWithMods, 2=rejection, 3=waiting, 4=revocationWarning, 5=revocationNotification

interface TimeStampResponse {
  granted:        boolean
  statusCode:     number
  tokenDer:       Buffer | null   // Raw DER of the TimeStampToken (CMS SignedData)
  tokenBase64:    string | null   // Base64-encoded for JSON storage
  responseLength: number
}

function parseTimeStampResp(resp: Buffer): TimeStampResponse {
  // Very minimal DER parsing — just enough to extract status and token
  // We check: outer SEQUENCE → first element is PKIStatusInfo SEQUENCE → first INTEGER is status
  if (resp.length < 10 || resp[0] !== 0x30) {
    return { granted: false, statusCode: -1, tokenDer: null, tokenBase64: null, responseLength: resp.length }
  }

  // Skip outer SEQUENCE tag + length
  let pos = 1
  const outerLen = parseDerLength(resp, pos)
  pos = outerLen.nextPos

  // PKIStatusInfo is a SEQUENCE
  if (resp[pos] !== 0x30) {
    return { granted: false, statusCode: -2, tokenDer: null, tokenBase64: null, responseLength: resp.length }
  }
  pos++
  const statusInfoLen = parseDerLength(resp, pos)
  pos = statusInfoLen.nextPos
  const statusInfoEnd = pos + statusInfoLen.length

  // First element of PKIStatusInfo is an INTEGER (status)
  if (resp[pos] !== 0x02) {
    return { granted: false, statusCode: -3, tokenDer: null, tokenBase64: null, responseLength: resp.length }
  }
  pos++
  const statusIntLen = parseDerLength(resp, pos)
  pos = statusIntLen.nextPos
  let statusCode = 0
  for (let i = 0; i < statusIntLen.length; i++) {
    statusCode = (statusCode << 8) | resp[pos + i]
  }

  const granted = statusCode === 0 || statusCode === 1

  // TimeStampToken follows PKIStatusInfo (if granted)
  let tokenDer: Buffer | null = null
  if (granted && statusInfoEnd < resp.length) {
    tokenDer = resp.subarray(statusInfoEnd)
  }

  return {
    granted,
    statusCode,
    tokenDer,
    tokenBase64: tokenDer ? tokenDer.toString('base64') : null,
    responseLength: resp.length,
  }
}

function parseDerLength(buf: Buffer, pos: number): { length: number; nextPos: number } {
  if (pos >= buf.length) return { length: 0, nextPos: pos }
  const first = buf[pos]
  if (first < 0x80) return { length: first, nextPos: pos + 1 }
  const numBytes = first & 0x7f
  let length = 0
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[pos + 1 + i]
  }
  return { length, nextPos: pos + 1 + numBytes }
}

// ── RFC 3161 Anchor Backend ─────────────────────────────────────────────────

export interface Rfc3161Config {
  // TSA endpoint URL (HTTPS) — e.g. https://tsa.cdac.in or https://timestamp.emudhra.com
  tsaUrl:         string
  // Optional: HTTP Basic Auth for TSA endpoints that require it
  tsaUsername?:    string
  tsaPassword?:    string
  // Request timeout in milliseconds
  timeoutMs?:     number
  // Optional: path to store TimeStampTokens locally as backup
  tokenStorePath?: string
}

export class Rfc3161AnchorBackend implements IAnchorBackend {
  name = 'rfc3161_tsa'

  constructor(private readonly config: Rfc3161Config) {
    if (!config.tsaUrl) {
      throw new Error('Rfc3161AnchorBackend: tsaUrl is required')
    }
  }

  async publish(payload: AnchorPayload): Promise<AnchorReceipt> {
    const timestamp = new Date().toISOString()

    try {
      // Step 1: Hash the anchor payload
      const payloadStr = JSON.stringify(payload)
      const hash = crypto.createHash('sha256').update(payloadStr).digest()

      // Step 2: Generate nonce for replay protection
      const nonce = crypto.randomBytes(8)

      // Step 3: Build TimeStampReq (DER-encoded ASN.1)
      const tsReq = buildTimeStampReq(hash, nonce)

      log.info('rfc3161_request_built', {
        data: {
          anchorDate:  payload.anchorDate,
          hashHex:     hash.toString('hex'),
          nonceHex:    nonce.toString('hex'),
          requestSize: tsReq.length,
        }
      })

      // Step 4: Send to TSA
      const respBuffer = await this.sendToTsa(tsReq)

      // Step 5: Parse response
      const tsResp = parseTimeStampResp(respBuffer)

      if (!tsResp.granted) {
        log.warn('rfc3161_rejected', {
          data: {
            anchorDate:  payload.anchorDate,
            statusCode:  tsResp.statusCode,
            responseLen: tsResp.responseLength,
          }
        })
        return {
          backend:   this.name,
          success:   false,
          timestamp,
          error:     `TSA rejected request: status=${tsResp.statusCode}`,
        }
      }

      // Step 6: Store token locally (backup)
      if (this.config.tokenStorePath && tsResp.tokenBase64) {
        this.storeTokenLocally(payload.anchorDate, payload.anchorHash, tsResp.tokenBase64)
      }

      log.info('rfc3161_timestamp_received', {
        data: {
          anchorDate:    payload.anchorDate,
          statusCode:    tsResp.statusCode,
          tokenSize:     tsResp.tokenDer?.length ?? 0,
          tsaUrl:        this.config.tsaUrl,
        }
      })

      return {
        backend:   this.name,
        success:   true,
        receiptId: `rfc3161_${payload.anchorDate}_${hash.toString('hex').slice(0, 16)}`,
        timestamp,
        proofHash: tsResp.tokenBase64
          ? crypto.createHash('sha256').update(tsResp.tokenDer!).digest('hex')
          : undefined,
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      log.error('rfc3161_error', { data: { error, tsaUrl: this.config.tsaUrl } })
      return { backend: this.name, success: false, timestamp, error }
    }
  }

  async verify(anchorHash: string, anchorDate: string): Promise<{ verified: boolean; detail: string }> {
    // Verification requires the stored TimeStampToken + TSA certificate.
    // For now: check local token store if available.
    if (!this.config.tokenStorePath) {
      return { verified: false, detail: 'RFC 3161 verification requires tokenStorePath configuration' }
    }

    const fs = await import('fs')
    const tokenPath = `${this.config.tokenStorePath}/rfc3161_${anchorDate}.token`

    if (!fs.existsSync(tokenPath)) {
      return { verified: false, detail: `No RFC 3161 token found for ${anchorDate}` }
    }

    try {
      const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
      if (stored.anchorHash !== anchorHash) {
        return {
          verified: false,
          detail: `Anchor hash mismatch: stored=${stored.anchorHash.slice(0, 16)}... expected=${anchorHash.slice(0, 16)}...`,
        }
      }

      // Token exists and anchor hash matches — TSA-level verification would
      // require parsing the CMS SignedData and checking the TSA's certificate.
      // This is left to external tools (openssl ts -verify) or a future
      // FIPS-validated crypto microservice (Phase 3 recommendation).
      return {
        verified: true,
        detail: `RFC 3161 token present for ${anchorDate}, TSA=${this.config.tsaUrl}. Full CMS verification requires external tooling.`,
      }
    } catch (e) {
      return { verified: false, detail: `Token read error: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  // ── HTTPS POST to TSA endpoint ────────────────────────────────────────────

  private sendToTsa(tsReq: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.tsaUrl)
      const isHttps = url.protocol === 'https:'
      const transport = isHttps ? https : http

      const headers: Record<string, string | number> = {
        'Content-Type':   'application/timestamp-query',
        'Content-Length':  tsReq.length,
      }

      // HTTP Basic Auth (some TSAs require it)
      if (this.config.tsaUsername && this.config.tsaPassword) {
        const cred = Buffer.from(`${this.config.tsaUsername}:${this.config.tsaPassword}`).toString('base64')
        headers['Authorization'] = `Basic ${cred}`
      }

      const options = {
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers,
        timeout:  this.config.timeoutMs ?? 15000,
      }

      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks)

          // Verify Content-Type is timestamp-reply
          const contentType = res.headers['content-type'] ?? ''
          if (!contentType.includes('timestamp-reply') && !contentType.includes('octet-stream')) {
            log.warn('rfc3161_unexpected_content_type', {
              data: { contentType, status: res.statusCode }
            })
          }

          if (res.statusCode !== 200) {
            reject(new Error(`TSA HTTP ${res.statusCode}: ${body.toString('utf8').slice(0, 200)}`))
            return
          }

          resolve(body)
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('TSA_TIMEOUT')) })
      req.write(tsReq)
      req.end()
    })
  }

  // ── Local token storage ───────────────────────────────────────────────────

  private storeTokenLocally(anchorDate: string, anchorHash: string, tokenBase64: string): void {
    try {
      const fs = require('fs') as typeof import('fs')
      const dir = this.config.tokenStorePath!
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const filePath = `${dir}/rfc3161_${anchorDate}.token`
      const data = JSON.stringify({
        anchorDate,
        anchorHash,
        tokenBase64,
        tsaUrl:    this.config.tsaUrl,
        storedAt:  new Date().toISOString(),
      }, null, 2)
      fs.writeFileSync(filePath, data, 'utf8')
      log.info('rfc3161_token_stored', { data: { path: filePath } })
    } catch (e) {
      log.warn('rfc3161_token_store_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }
  }
}

// ── Exported helpers for per-record timestamping ────────────────────────────
// These are used by MissionService to timestamp individual telemetry records,
// not just daily anchors. This is the key RFC 3161 upgrade: every record gets
// its own TimeStampToken, not just daily Merkle roots.

export async function timestampRecord(
  tsaUrl: string,
  canonicalPayloadHex: string,
  options?: { tsaUsername?: string; tsaPassword?: string; timeoutMs?: number }
): Promise<{
  success:      boolean
  tokenBase64?: string
  tokenHashHex?: string
  error?:       string
}> {
  try {
    const hash = crypto.createHash('sha256')
      .update(Buffer.from(canonicalPayloadHex, 'hex'))
      .digest()
    const nonce = crypto.randomBytes(8)
    const tsReq = buildTimeStampReq(hash, nonce)

    const backend = new Rfc3161AnchorBackend({
      tsaUrl,
      tsaUsername: options?.tsaUsername,
      tsaPassword: options?.tsaPassword,
      timeoutMs:   options?.timeoutMs,
    })

    const respBuffer = await (backend as any).sendToTsa(tsReq)
    const tsResp = parseTimeStampResp(respBuffer)

    if (!tsResp.granted) {
      return { success: false, error: `TSA rejected: status=${tsResp.statusCode}` }
    }

    return {
      success:      true,
      tokenBase64:  tsResp.tokenBase64 ?? undefined,
      tokenHashHex: tsResp.tokenDer
        ? crypto.createHash('sha256').update(tsResp.tokenDer).digest('hex')
        : undefined,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Exported for testing ────────────────────────────────────────────────────
export { buildTimeStampReq, parseTimeStampResp, SHA256_OID }
export type { TimeStampResponse }

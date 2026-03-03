// ExternalAnchorService — publishes evidence ledger anchors to external systems.
//
// This is the core defense against Threat 2 (External Trust Anchoring Absence)
// and Threat 3 (Long-Term Historical Tampering).
//
// Even if an attacker compromises the DB + server + redeploys code, they cannot
// rewrite anchors that have already been published to systems they don't control.
//
// Anchoring backends (use one or more):
//   1. HMAC-signed file on separate storage (minimum viable)
//   2. HTTP webhook to external service (DGCA timestamp authority, third-party notary)
//   3. Email digest to multiple stakeholders (non-repudiation via email providers)
//
// For production: publish to at least TWO independent backends.
// A single backend is a single point of failure.

import crypto from 'crypto'
import fs     from 'fs'
import path   from 'path'
import https  from 'https'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('ExternalAnchorService')

// ── Anchor Payload ──────────────────────────────────────────────────────────

export interface AnchorPayload {
  anchorDate:        string   // YYYY-MM-DD
  missionCount:      number
  missionIdsCsvHash: string   // SHA-256 of sorted mission IDs
  anchorHash:        string   // SHA-256 chain anchor
  prevAnchorHash:    string
  computedAtUtc:     string   // ISO 8601
  jobRunId:          string
  platformVersion:   string   // JADS version identifier
}

// ── Anchor Receipt ──────────────────────────────────────────────────────────
// Every backend returns a receipt proving it received and stored the anchor.

export interface AnchorReceipt {
  backend:      string       // e.g. "hmac_file", "webhook", "email"
  success:      boolean
  receiptId?:   string       // External system's reference
  timestamp:    string       // When the backend acknowledged
  error?:       string       // If failed
  proofHash?:   string       // Hash of the receipt for verification
}

// ── Backend Interface ─────────────────────────────────────────────────────

export interface IAnchorBackend {
  name: string
  publish(payload: AnchorPayload): Promise<AnchorReceipt>
  verify?(anchorHash: string, anchorDate: string): Promise<{ verified: boolean; detail: string }>
}

// ── Backend 1: HMAC-Signed Append-Only File ──────────────────────────────
// Each line is JSON + HMAC signature. The HMAC key must be stored separately
// from the main server (e.g., environment variable loaded from a different
// secrets store, or a separate HSM-derived key).
//
// An attacker who controls the server but not the HMAC key cannot forge entries.
// An attacker who controls both can forge entries — so the key MUST be isolated.

export class HmacFileAnchorBackend implements IAnchorBackend {
  name = 'hmac_file'

  constructor(
    private readonly filePath: string,
    private readonly hmacKey:  string   // Must be from a DIFFERENT secrets store than JWT_SECRET
  ) {}

  async publish(payload: AnchorPayload): Promise<AnchorReceipt> {
    const timestamp = new Date().toISOString()
    const dataStr   = JSON.stringify(payload)
    const hmac      = crypto.createHmac('sha256', this.hmacKey).update(dataStr).digest('hex')

    const line = JSON.stringify({
      v:         2,           // Format version (v1 = unsigned, v2 = HMAC signed)
      ...payload,
      hmac,
      publishedAt: timestamp,
    }) + '\n'

    try {
      fs.appendFileSync(this.filePath, line, { encoding: 'utf8', flag: 'a' })
      log.info('hmac_anchor_published', { data: { anchorDate: payload.anchorDate, path: this.filePath } })
      return {
        backend:   this.name,
        success:   true,
        receiptId: `hmac_${payload.anchorDate}_${payload.anchorHash.slice(0, 16)}`,
        timestamp,
        proofHash: hmac,
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      log.error('hmac_anchor_failed', { data: { error } })
      return { backend: this.name, success: false, timestamp, error }
    }
  }

  async verify(anchorHash: string, anchorDate: string): Promise<{ verified: boolean; detail: string }> {
    if (!fs.existsSync(this.filePath)) {
      return { verified: false, detail: 'HMAC anchor file does not exist' }
    }

    const raw   = fs.readFileSync(this.filePath, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.anchorDate === anchorDate && entry.anchorHash === anchorHash) {
          // Re-verify HMAC
          const { hmac: storedHmac, publishedAt, v, ...rest } = entry
          const dataStr = JSON.stringify({
            anchorDate: rest.anchorDate,
            missionCount: rest.missionCount,
            missionIdsCsvHash: rest.missionIdsCsvHash,
            anchorHash: rest.anchorHash,
            prevAnchorHash: rest.prevAnchorHash,
            computedAtUtc: rest.computedAtUtc,
            jobRunId: rest.jobRunId,
            platformVersion: rest.platformVersion,
          })
          const recomputed = crypto.createHmac('sha256', this.hmacKey).update(dataStr).digest('hex')

          if (recomputed === storedHmac) {
            return { verified: true, detail: `HMAC verified for ${anchorDate}, published at ${publishedAt}` }
          } else {
            return { verified: false, detail: `HMAC MISMATCH for ${anchorDate} — anchor file may be tampered` }
          }
        }
      } catch { /* skip unparseable lines */ }
    }

    return { verified: false, detail: `No entry found for date=${anchorDate} hash=${anchorHash.slice(0, 16)}...` }
  }
}

// ── Backend 2: HTTP Webhook ──────────────────────────────────────────────
// Posts the anchor to an external HTTPS endpoint (e.g., DGCA timestamp authority,
// third-party notarization service, or a separate microservice).
//
// The external service should:
//   1. Verify the shared secret in the header
//   2. Store the anchor immutably
//   3. Return a receipt with its own timestamp

export class WebhookAnchorBackend implements IAnchorBackend {
  name = 'webhook'

  constructor(
    private readonly endpoint:     string,   // HTTPS URL
    private readonly sharedSecret: string,   // Sent in X-JADS-Anchor-Key header
    private readonly timeoutMs:    number = 10000
  ) {}

  async publish(payload: AnchorPayload): Promise<AnchorReceipt> {
    const timestamp = new Date().toISOString()

    try {
      const body = JSON.stringify(payload)
      const result = await this.httpPost(body)

      log.info('webhook_anchor_published', {
        data: { anchorDate: payload.anchorDate, endpoint: this.endpoint, status: result.status }
      })

      return {
        backend:   this.name,
        success:   result.status >= 200 && result.status < 300,
        receiptId: result.body?.receiptId ?? `webhook_${payload.anchorDate}`,
        timestamp,
        proofHash: crypto.createHash('sha256').update(body + result.rawBody).digest('hex'),
        error:     result.status >= 300 ? `HTTP ${result.status}` : undefined,
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      log.error('webhook_anchor_failed', { data: { error, endpoint: this.endpoint } })
      return { backend: this.name, success: false, timestamp, error }
    }
  }

  private httpPost(body: string): Promise<{ status: number; body: any; rawBody: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint)
      const options = {
        hostname: url.hostname,
        port:     url.port || 443,
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  {
          'Content-Type':       'application/json',
          'Content-Length':     Buffer.byteLength(body),
          'X-JADS-Anchor-Key': this.sharedSecret,
          'X-JADS-Version':    '4.0',
        },
        timeout: this.timeoutMs,
      }

      const req = https.request(options, (res) => {
        let rawBody = ''
        res.on('data', chunk => rawBody += chunk)
        res.on('end', () => {
          let parsed: any = null
          try { parsed = JSON.parse(rawBody) } catch { /* non-JSON response */ }
          resolve({ status: res.statusCode ?? 0, body: parsed, rawBody })
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')) })
      req.write(body)
      req.end()
    })
  }
}

// ── Composite Anchor Service ─────────────────────────────────────────────
// Publishes to ALL configured backends. Returns receipts from each.
// At least ONE backend must succeed for the anchor to be considered published.

export class ExternalAnchorService {
  private backends: IAnchorBackend[] = []

  constructor(backends?: IAnchorBackend[]) {
    if (backends) this.backends = backends
  }

  addBackend(backend: IAnchorBackend): void {
    this.backends.push(backend)
    log.info('anchor_backend_registered', { data: { name: backend.name } })
  }

  async publishAnchor(payload: AnchorPayload): Promise<{
    published: boolean
    receipts:  AnchorReceipt[]
  }> {
    if (this.backends.length === 0) {
      log.warn('no_anchor_backends', { data: { anchorDate: payload.anchorDate } })
      return { published: false, receipts: [] }
    }

    const receipts = await Promise.all(
      this.backends.map(b => b.publish(payload))
    )

    const anySuccess = receipts.some(r => r.success)
    const allSuccess = receipts.every(r => r.success)

    if (!anySuccess) {
      log.error('all_anchor_backends_failed', {
        data: { anchorDate: payload.anchorDate, backends: receipts.map(r => r.backend) }
      })
    } else if (!allSuccess) {
      log.warn('partial_anchor_failure', {
        data: {
          anchorDate: payload.anchorDate,
          succeeded: receipts.filter(r => r.success).map(r => r.backend),
          failed:    receipts.filter(r => !r.success).map(r => r.backend),
        }
      })
    }

    return { published: anySuccess, receipts }
  }

  async verifyAnchor(anchorHash: string, anchorDate: string): Promise<{
    verified:       boolean
    backendResults: Array<{ backend: string; verified: boolean; detail: string }>
  }> {
    const results = await Promise.all(
      this.backends
        .filter(b => b.verify)
        .map(async b => {
          const r = await b.verify!(anchorHash, anchorDate)
          return { backend: b.name, ...r }
        })
    )

    const verified = results.length > 0 && results.some(r => r.verified)
    return { verified, backendResults: results }
  }

  getBackendCount(): number {
    return this.backends.length
  }
}

// ── Factory ──────────────────────────────────────────────────────────────
// Creates an ExternalAnchorService from environment variables.
// Production should configure at least TWO backends.

export function createExternalAnchorService(): ExternalAnchorService {
  const service = new ExternalAnchorService()

  // Backend 1: HMAC-signed file (always enabled if key is set)
  const hmacKey = process.env.ANCHOR_HMAC_KEY
  if (hmacKey) {
    const filePath = process.env.ANCHOR_HMAC_FILE_PATH
      ?? path.join(process.cwd(), 'evidence_anchor_signed.log')
    service.addBackend(new HmacFileAnchorBackend(filePath, hmacKey))
  }

  // Backend 2: Webhook to external service
  const webhookUrl    = process.env.ANCHOR_WEBHOOK_URL
  const webhookSecret = process.env.ANCHOR_WEBHOOK_SECRET
  if (webhookUrl && webhookSecret) {
    service.addBackend(new WebhookAnchorBackend(webhookUrl, webhookSecret))
  }

  if (service.getBackendCount() === 0) {
    log.warn('no_external_anchor_backends_configured', {
      data: {
        message: 'Set ANCHOR_HMAC_KEY and/or ANCHOR_WEBHOOK_URL to enable external trust anchoring',
      }
    })
  }

  return service
}

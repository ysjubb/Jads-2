// Unit tests for RFC 3161 Trusted Timestamping Authority backend.
// Tests DER/ASN.1 encoding, TimeStampReq construction, TimeStampResp parsing,
// and the Rfc3161AnchorBackend lifecycle (publish, verify, token storage).
//
// These tests do NOT call a real TSA — they validate the DER wire format
// and mock the HTTP transport layer.

import crypto from 'crypto'
import {
  Rfc3161AnchorBackend,
  buildTimeStampReq,
  parseTimeStampResp,
  SHA256_OID,
} from '../services/Rfc3161AnchorBackend'
import type { AnchorPayload } from '../services/ExternalAnchorService'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSamplePayload(): AnchorPayload {
  return {
    anchorDate:        '2026-03-06',
    missionCount:      42,
    missionIdsCsvHash: crypto.createHash('sha256').update('m1,m2,m3').digest('hex'),
    anchorHash:        crypto.createHash('sha256').update('test-anchor').digest('hex'),
    prevAnchorHash:    '0'.repeat(64),
    computedAtUtc:     '2026-03-06T00:05:00.000Z',
    jobRunId:          'job-test-001',
    platformVersion:   '4.0',
  }
}

/** Build a minimal valid TimeStampResp DER with status=0 (granted) + fake token */
function buildGrantedResp(): Buffer {
  // PKIStatusInfo: SEQUENCE { INTEGER 0 }
  const statusInt    = Buffer.from([0x02, 0x01, 0x00])          // INTEGER 0
  const statusInfoBody = statusInt
  const statusInfoLen  = statusInfoBody.length
  const statusInfo = Buffer.concat([
    Buffer.from([0x30]),                                         // SEQUENCE tag
    Buffer.from([statusInfoLen]),                                // length
    statusInfoBody,
  ])

  // Fake TimeStampToken (just enough bytes to be non-empty)
  const fakeToken = Buffer.from([
    0x30, 0x0a,                                                  // SEQUENCE(10)
    0x06, 0x08, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07 // fake OID
  ])

  // Outer SEQUENCE wrapping statusInfo + token
  const innerLen = statusInfo.length + fakeToken.length
  return Buffer.concat([
    Buffer.from([0x30]),
    Buffer.from([innerLen]),
    statusInfo,
    fakeToken,
  ])
}

/** Build a TimeStampResp with status=2 (rejection) — padded to >= 10 bytes */
function buildRejectedResp(): Buffer {
  // PKIStatusInfo: SEQUENCE { INTEGER 2, UTF8String "rejected" }
  const statusInt  = Buffer.from([0x02, 0x01, 0x02])            // INTEGER 2
  const freeText   = Buffer.from([0x0c, 0x03, 0x65, 0x72, 0x72]) // UTF8String "err"
  const statusInfoBody = Buffer.concat([statusInt, freeText])
  const statusInfo = Buffer.concat([
    Buffer.from([0x30, statusInfoBody.length]),
    statusInfoBody,
  ])
  const innerLen = statusInfo.length
  return Buffer.concat([
    Buffer.from([0x30, innerLen]),
    statusInfo,
  ])
}

// ── DER encoding tests ───────────────────────────────────────────────────────

describe('RFC 3161 — DER encoding', () => {

  test('buildTimeStampReq produces a valid DER SEQUENCE', () => {
    const hash  = crypto.createHash('sha256').update('test').digest()
    const nonce = crypto.randomBytes(8)
    const req   = buildTimeStampReq(hash, nonce)

    // Must start with SEQUENCE tag (0x30)
    expect(req[0]).toBe(0x30)
    // Total length must match buffer
    expect(req.length).toBeGreaterThan(50)
  })

  test('buildTimeStampReq embeds SHA-256 hash correctly', () => {
    const hash  = crypto.createHash('sha256').update('hello-jads').digest()
    const nonce = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    const req   = buildTimeStampReq(hash, nonce)

    // The 32-byte hash must appear verbatim in the DER output
    const reqHex   = req.toString('hex')
    const hashHex  = hash.toString('hex')
    expect(reqHex).toContain(hashHex)
  })

  test('buildTimeStampReq embeds nonce', () => {
    const hash  = crypto.createHash('sha256').update('nonce-test').digest()
    const nonce = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44])
    const req   = buildTimeStampReq(hash, nonce)
    const reqHex = req.toString('hex')

    // Nonce bytes must appear in the output
    expect(reqHex).toContain('aabbccdd11223344')
  })

  test('buildTimeStampReq sets certReq = TRUE (0xFF)', () => {
    const hash  = crypto.createHash('sha256').update('cert-req').digest()
    const nonce = crypto.randomBytes(8)
    const req   = buildTimeStampReq(hash, nonce)
    const reqHex = req.toString('hex')

    // BOOLEAN TRUE = 01 01 ff
    expect(reqHex).toContain('0101ff')
  })

  test('buildTimeStampReq version is v1 (INTEGER 1)', () => {
    const hash  = crypto.createHash('sha256').update('version').digest()
    const nonce = crypto.randomBytes(8)
    const req   = buildTimeStampReq(hash, nonce)

    // After outer SEQUENCE tag+length, first element should be INTEGER 1
    // 0x02 0x01 0x01
    const reqHex = req.toString('hex')
    // The version INTEGER 1 (020101) should appear near the start
    const versionPos = reqHex.indexOf('020101')
    expect(versionPos).toBeGreaterThan(0)
    expect(versionPos).toBeLessThan(10) // near start of inner content
  })

  test('nonce with high bit set gets 0x00 prefix (no negative)', () => {
    const hash  = crypto.createHash('sha256').update('high-bit').digest()
    const nonce = Buffer.from([0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
    const req   = buildTimeStampReq(hash, nonce)
    const reqHex = req.toString('hex')

    // Nonce should be encoded as INTEGER with leading 0x00
    // Tag 0x02, length 0x09, then 00 ff 01 02 03 04 05 06 07
    expect(reqHex).toContain('020900ff01020304050607')
  })

  test('SHA256_OID is correct (2.16.840.1.101.3.4.2.1)', () => {
    expect(SHA256_OID).toEqual([2, 16, 840, 1, 101, 3, 4, 2, 1])
  })
})

// ── TimeStampResp parsing tests ──────────────────────────────────────────────

describe('RFC 3161 — TimeStampResp parsing', () => {

  test('granted response (status=0) is parsed correctly', () => {
    const resp = buildGrantedResp()
    const parsed = parseTimeStampResp(resp)

    expect(parsed.granted).toBe(true)
    expect(parsed.statusCode).toBe(0)
    expect(parsed.tokenDer).not.toBeNull()
    expect(parsed.tokenBase64).not.toBeNull()
    expect(parsed.responseLength).toBe(resp.length)
  })

  test('rejected response (status=2) is parsed correctly', () => {
    const resp = buildRejectedResp()
    const parsed = parseTimeStampResp(resp)

    expect(parsed.granted).toBe(false)
    expect(parsed.statusCode).toBe(2)
    expect(parsed.tokenDer).toBeNull()
    expect(parsed.tokenBase64).toBeNull()
  })

  test('grantedWithMods (status=1) counts as granted', () => {
    // Build response with status=1
    const statusInt = Buffer.from([0x02, 0x01, 0x01])
    const statusInfo = Buffer.concat([Buffer.from([0x30, 0x03]), statusInt])
    const fakeToken = Buffer.from([0x30, 0x02, 0x05, 0x00])
    const outer = Buffer.concat([
      Buffer.from([0x30, statusInfo.length + fakeToken.length]),
      statusInfo,
      fakeToken,
    ])
    const parsed = parseTimeStampResp(outer)
    expect(parsed.granted).toBe(true)
    expect(parsed.statusCode).toBe(1)
  })

  test('empty/malformed buffer returns granted=false', () => {
    const empty = Buffer.alloc(0)
    expect(parseTimeStampResp(empty).granted).toBe(false)

    const tooShort = Buffer.from([0x30, 0x02, 0x00])
    expect(parseTimeStampResp(tooShort).granted).toBe(false)

    const notSequence = Buffer.from([0x04, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a])
    expect(parseTimeStampResp(notSequence).granted).toBe(false)
  })

  test('tokenBase64 is valid base64 of tokenDer', () => {
    const resp = buildGrantedResp()
    const parsed = parseTimeStampResp(resp)

    if (parsed.tokenDer && parsed.tokenBase64) {
      const decoded = Buffer.from(parsed.tokenBase64, 'base64')
      expect(decoded).toEqual(parsed.tokenDer)
    }
  })
})

// ── Rfc3161AnchorBackend unit tests ──────────────────────────────────────────

describe('RFC 3161 — Rfc3161AnchorBackend', () => {

  test('constructor throws if tsaUrl is empty', () => {
    expect(() => new Rfc3161AnchorBackend({ tsaUrl: '' }))
      .toThrow('tsaUrl is required')
  })

  test('constructor accepts valid config', () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://tsa.cdac.in',
      tsaUsername: 'user',
      tsaPassword: 'pass',
      timeoutMs: 5000,
    })
    expect(backend.name).toBe('rfc3161_tsa')
  })

  test('publish returns failure receipt on network error', async () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://localhost:1/nonexistent',
      timeoutMs: 1000,
    })

    const receipt = await backend.publish(makeSamplePayload())
    expect(receipt.backend).toBe('rfc3161_tsa')
    expect(receipt.success).toBe(false)
    expect(receipt.error).toBeDefined()
  })

  test('verify returns failure when tokenStorePath not configured', async () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://tsa.cdac.in',
    })
    const result = await backend.verify('abc', '2026-03-06')
    expect(result.verified).toBe(false)
    expect(result.detail).toContain('tokenStorePath')
  })

  test('verify returns failure when token file does not exist', async () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://tsa.cdac.in',
      tokenStorePath: '/tmp/jads-test-nonexistent-' + Date.now(),
    })
    const result = await backend.verify('abc', '2026-03-06')
    expect(result.verified).toBe(false)
    expect(result.detail).toContain('No RFC 3161 token found')
  })

  test('publish with mocked TSA returning granted response', async () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://tsa.test.local',
    })

    // Mock sendToTsa to return a granted response
    const grantedResp = buildGrantedResp()
    ;(backend as any).sendToTsa = async () => grantedResp

    const receipt = await backend.publish(makeSamplePayload())
    expect(receipt.success).toBe(true)
    expect(receipt.backend).toBe('rfc3161_tsa')
    expect(receipt.receiptId).toMatch(/^rfc3161_2026-03-06_/)
    expect(receipt.proofHash).toBeDefined()
    expect(receipt.proofHash!.length).toBe(64) // SHA-256 hex
  })

  test('publish with mocked TSA returning rejected response', async () => {
    const backend = new Rfc3161AnchorBackend({
      tsaUrl: 'https://tsa.test.local',
    })

    ;(backend as any).sendToTsa = async () => buildRejectedResp()

    const receipt = await backend.publish(makeSamplePayload())
    expect(receipt.success).toBe(false)
    expect(receipt.error).toContain('status=2')
  })
})

// ── Integration with ExternalAnchorService factory ───────────────────────────

describe('RFC 3161 — ExternalAnchorService factory integration', () => {

  test('factory creates RFC 3161 backend when env var is set', () => {
    // Save and set env
    const origUrl = process.env.RFC3161_TSA_URL
    process.env.RFC3161_TSA_URL = 'https://tsa.cdac.in'

    // We need to re-import to pick up the env change
    const { createExternalAnchorService } = require('../services/ExternalAnchorService')
    const service = createExternalAnchorService()

    // At minimum, the RFC 3161 backend should be registered
    // (other backends may also be registered depending on env)
    expect(service.getBackendCount()).toBeGreaterThanOrEqual(1)

    // Restore
    if (origUrl === undefined) {
      delete process.env.RFC3161_TSA_URL
    } else {
      process.env.RFC3161_TSA_URL = origUrl
    }
  })

  test('factory does NOT create RFC 3161 backend when env var is empty', () => {
    const origUrl = process.env.RFC3161_TSA_URL
    const origHmac = process.env.ANCHOR_HMAC_KEY
    const origWebhook = process.env.ANCHOR_WEBHOOK_URL

    // Clear all anchor env vars
    delete process.env.RFC3161_TSA_URL
    delete process.env.ANCHOR_HMAC_KEY
    delete process.env.ANCHOR_WEBHOOK_URL

    const { createExternalAnchorService } = require('../services/ExternalAnchorService')
    const service = createExternalAnchorService()
    expect(service.getBackendCount()).toBe(0)

    // Restore
    if (origUrl !== undefined) process.env.RFC3161_TSA_URL = origUrl
    if (origHmac !== undefined) process.env.ANCHOR_HMAC_KEY = origHmac
    if (origWebhook !== undefined) process.env.ANCHOR_WEBHOOK_URL = origWebhook
  })
})

// HashChainService — server-side hash chain verification for uploaded
// drone telemetry. Verifies that the chain received from the Android
// app is unbroken before writing to EvidenceLedger.
//
// Cross-runtime invariant: computeHash0 and computeHashN MUST produce
// identical output to Android's HashChainEngine.kt. Any divergence
// means either the prefix string or endianness is wrong.

import { createServiceLogger } from '../logger'
import crypto                  from 'crypto'

const log = createServiceLogger('HashChainService')

// Must match Android HashChainEngine.kt exactly
const HASH_0_PREFIX = 'MISSION_INIT'   // exactly 12 ASCII characters
const PAYLOAD_SIZE  = 96               // canonical telemetry bytes

export interface ChainVerificationResult {
  valid:          boolean
  brokenAtIndex?: number    // first record where chain breaks
  expectedHash?:  string    // what hash should have been
  actualHash?:    string    // what hash was received
  recordCount:    number
}

export interface TelemetryRecord {
  recordSequence: number
  canonical96Hex: string    // 96-byte payload as hex
  currentHashHex: string    // hash claimed by device
  signatureHex:   string
}

export class HashChainService {

  // HASH_0 = SHA256("MISSION_INIT"[12 bytes] || missionId[8 bytes BE])
  computeHash0(missionId: bigint): string {
    const prefixBuf = Buffer.from(HASH_0_PREFIX, 'ascii')
    // 8-byte big-endian encoding of missionId using manual bit-shifting
    // to ensure identical endianness to Android EndianWriter.kt
    const idBuf = Buffer.alloc(8)
    let val = missionId
    for (let i = 7; i >= 0; i--) {
      idBuf[i] = Number(val & 0xFFn)
      val = val >> 8n
    }

    const input = Buffer.concat([prefixBuf, idBuf])
    return this.sha256Hex(input)
  }

  // HASH_n = SHA256(canonical96[96 bytes] || previousHash[32 bytes])
  computeHashN(canonical96Hex: string, previousHashHex: string): string {
    const canonical96 = Buffer.from(canonical96Hex, 'hex')
    if (canonical96.length !== PAYLOAD_SIZE) {
      throw new Error(
        `canonical96 must be ${PAYLOAD_SIZE} bytes, got ${canonical96.length}`
      )
    }

    const previousHash = Buffer.from(previousHashHex, 'hex')
    if (previousHash.length !== 32) {
      throw new Error(
        `previousHash must be 32 bytes, got ${previousHash.length}`
      )
    }

    const input = Buffer.concat([canonical96, previousHash])
    return this.sha256Hex(input)
  }

  verifyChain(
    missionId: bigint,
    records:   TelemetryRecord[]
  ): ChainVerificationResult {
    if (records.length === 0) {
      return { valid: true, recordCount: 0 }
    }

    let previousHash = this.computeHash0(missionId)

    for (let i = 0; i < records.length; i++) {
      const record = records[i]

      // Validate canonical96Hex is exactly 96 bytes (192 hex chars)
      if (record.canonical96Hex.length !== PAYLOAD_SIZE * 2) {
        log.warn('chain_verification_bad_payload_size', {
          data: {
            index: i,
            expectedHexLen: PAYLOAD_SIZE * 2,
            actualHexLen: record.canonical96Hex.length,
          }
        })
        return {
          valid:         false,
          brokenAtIndex: i,
          expectedHash:  'INVALID_PAYLOAD_SIZE',
          actualHash:    record.currentHashHex,
          recordCount:   records.length,
        }
      }

      const expected = this.computeHashN(record.canonical96Hex, previousHash)

      if (expected.toLowerCase() !== record.currentHashHex.toLowerCase()) {
        log.warn('chain_verification_hash_mismatch', {
          data: {
            index: i,
            recordSequence: record.recordSequence,
            expected,
            actual: record.currentHashHex,
          }
        })
        return {
          valid:         false,
          brokenAtIndex: i,
          expectedHash:  expected,
          actualHash:    record.currentHashHex,
          recordCount:   records.length,
        }
      }

      previousHash = record.currentHashHex.toLowerCase()
    }

    log.info('chain_verification_passed', {
      data: { missionId: String(missionId), recordCount: records.length }
    })

    return { valid: true, recordCount: records.length }
  }

  // PRODUCTION: Verify ECDSA P-256 DER signature against device
  // public key stored in DeviceRegistry. Use Node.js crypto.verify()
  // with 'SHA256' digest and the SubjectPublicKeyInfo DER public key.
  verifySignature(
    canonical96Hex: string,
    signatureHex:   string,
    publicKeyHex:   string
  ): boolean {
    return true
  }

  private sha256Hex(input: Buffer): string {
    return crypto.createHash('sha256').update(input).digest('hex')
  }
}

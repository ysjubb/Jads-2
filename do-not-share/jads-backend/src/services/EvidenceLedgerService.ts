// EvidenceLedgerService — populates the EvidenceLedger table after every drone
// mission record is written. Handles RFC 3161 timestamping and Merkle anchoring.
// Does NOT replace the existing hash chain — wraps it with external verifiability.

import { PrismaClient }        from '@prisma/client'
import { createServiceLogger } from '../logger'
import crypto                  from 'crypto'
import * as https              from 'https'
import * as asn1js             from 'asn1js'

const log = createServiceLogger('EvidenceLedgerService')

const FREETSA_URL       = 'https://freetsa.org/tsr'
const TSA_NAME          = 'freetsa.org'
const SHA256_OID        = '2.16.840.1.101.3.4.2.1'
const TSA_TIMEOUT_MS    = 10_000   // 10 seconds
const MAX_RETRIES       = 3
const RETRY_DELAY_MS    = 1_500

export interface TsaResponse {
  token:        string   // base64-encoded RFC 3161 TimeStampToken DER
  tsaName:      string   // e.g. "eMudhra TSA" or "STUB_TSA"
  tsaTimestamp: Date     // time as reported inside the TSA token
  serialNumber: string   // TSA token serial number
}

export interface AnchorResult {
  merkleRoot:    string    // hex SHA-256 of the Merkle root
  leafIndex:     number    // position of this record in the tree
  siblingHashes: string[]  // hex hashes needed to reconstruct root
}

export class EvidenceLedgerService {

  constructor(private readonly prisma: PrismaClient) {}

  // ─── ASN.1 DER encoding helpers ──────────────────────────────────────

  private static derLength(content: Buffer): Buffer {
    if (content.length < 128) {
      return Buffer.from([content.length])
    }
    if (content.length < 256) {
      return Buffer.from([0x81, content.length])
    }
    return Buffer.from([0x82,
      (content.length >> 8) & 0xff,
      content.length & 0xff])
  }

  private static derTag(tag: number, content: Buffer): Buffer {
    return Buffer.concat([
      Buffer.from([tag]),
      EvidenceLedgerService.derLength(content),
      content
    ])
  }

  private static derOid(oidString: string): Buffer {
    const parts = oidString.split('.').map(Number)
    const encoded: number[] = []

    // First two components combined: 40 * first + second
    encoded.push(40 * parts[0] + parts[1])

    // Remaining components: base-128 encoding, MSB set on all but last byte
    for (let i = 2; i < parts.length; i++) {
      let value = parts[i]
      if (value === 0) {
        encoded.push(0)
      } else {
        const bytes: number[] = []
        while (value > 0) {
          bytes.unshift(value & 0x7f)
          value >>= 7
        }
        for (let j = 0; j < bytes.length - 1; j++) {
          bytes[j] |= 0x80
        }
        encoded.push(...bytes)
      }
    }

    return EvidenceLedgerService.derTag(0x06, Buffer.from(encoded))
  }

  private static derNull(): Buffer {
    return Buffer.from([0x05, 0x00])
  }

  private static derInteger(value: number): Buffer {
    return Buffer.from([0x02, 0x01, value])
  }

  private static derBoolean(value: boolean): Buffer {
    return Buffer.from([0x01, 0x01, value ? 0xff : 0x00])
  }

  private static derOctetString(data: Buffer): Buffer {
    return EvidenceLedgerService.derTag(0x04, data)
  }

  private static derSequence(content: Buffer): Buffer {
    return EvidenceLedgerService.derTag(0x30, content)
  }

  private static generateNonce(): Buffer {
    return crypto.randomBytes(8)
  }

  /**
   * Copy a Buffer or Uint8Array into a fresh ArrayBuffer.
   *
   * Node.js pools Buffer allocations, so `buf.buffer` may return an
   * oversized ArrayBuffer shared across multiple Buffers — and TypeScript
   * types it as `ArrayBuffer | SharedArrayBuffer`.  asn1js.fromBER()
   * expects `ArrayBuffer | ArrayBufferView`, so the SharedArrayBuffer
   * union member is rejected by the compiler.
   *
   * This method allocates a correctly-sized ArrayBuffer and copies the
   * source bytes into it, guaranteeing a plain ArrayBuffer with no
   * SharedArrayBuffer ambiguity and no excess bytes from pooled allocation.
   */
  private static toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const ab = new ArrayBuffer(data.byteLength)
    new Uint8Array(ab).set(data)
    return ab
  }

  // ─── RFC 3161 TimeStampReq builder ───────────────────────────────────

  private buildTsRequest(hashHex: string): Buffer {
    const hashBytes    = Buffer.from(hashHex, 'hex')
    const nonce        = EvidenceLedgerService.generateNonce()

    const oidDer       = EvidenceLedgerService.derOid(SHA256_OID)
    const nullDer      = EvidenceLedgerService.derNull()
    const algId        = EvidenceLedgerService.derSequence(
                           Buffer.concat([oidDer, nullDer]))
    const hashOctet    = EvidenceLedgerService.derOctetString(hashBytes)
    const msgImprint   = EvidenceLedgerService.derSequence(
                           Buffer.concat([algId, hashOctet]))
    const versionDer   = EvidenceLedgerService.derInteger(1)
    const nonceDer     = EvidenceLedgerService.derTag(0x02, nonce)
    const certReqDer   = EvidenceLedgerService.derBoolean(true)
    const tsReq        = EvidenceLedgerService.derSequence(
                           Buffer.concat([
                             versionDer,
                             msgImprint,
                             nonceDer,
                             certReqDer
                           ]))

    return tsReq
  }

  // ─── HTTPS POST to TSA ───────────────────────────────────────────────

  private async postTsRequest(tsReqDer: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const req = https.request({
        method:   'POST',
        hostname: 'freetsa.org',
        path:     '/tsr',
        headers: {
          'Content-Type':   'application/timestamp-query',
          'Content-Length':  tsReqDer.length,
          'Accept':         'application/timestamp-reply'
        }
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`TSA_HTTP_ERROR: ${res.statusCode}`))
            return
          }
          resolve(Buffer.concat(chunks))
        })
        res.on('error', reject)
      })

      req.setTimeout(TSA_TIMEOUT_MS, () => {
        req.destroy()
        reject(new Error('TSA_TIMEOUT'))
      })

      req.on('error', reject)
      req.write(tsReqDer)
      req.end()
    })
  }

  // ─── Retry wrapper ───────────────────────────────────────────────────

  private async postWithRetry(tsReqDer: Buffer): Promise<Buffer> {
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.postTsRequest(tsReqDer)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < MAX_RETRIES) {
          log.warn('tsa_retry', { data: { attempt, error: lastError.message } })
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        }
      }
    }
    throw lastError
  }

  // ─── Parse TimeStampResp ─────────────────────────────────────────────

  private parseTsaResponse(responseBuffer: Buffer): {
    tokenDer:     Buffer
    tsaTimestamp: Date
    serialNumber: string
  } {
    try {
      const arrayBuffer = EvidenceLedgerService.toArrayBuffer(responseBuffer)
      const asn1 = asn1js.fromBER(arrayBuffer)
      if (asn1.offset === -1) {
        throw new Error('Invalid ASN.1 data')
      }

      // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
      const tsResp = asn1.result as asn1js.Sequence
      const statusInfo = tsResp.valueBlock.value[0] as asn1js.Sequence

      // PKIStatusInfo ::= SEQUENCE { status PKIStatus (INTEGER) }
      const statusInt = statusInfo.valueBlock.value[0] as asn1js.Integer
      const statusValue = statusInt.valueBlock.valueDec
      if (statusValue !== 0 && statusValue !== 1) {
        throw new Error(`TSA_REJECTED: ${statusValue}`)
      }

      // Extract the raw DER bytes of timeStampToken (ContentInfo)
      if (tsResp.valueBlock.value.length < 2) {
        throw new Error('TSA response missing timeStampToken')
      }
      const contentInfo = tsResp.valueBlock.value[1]
      // Get raw DER of the ContentInfo
      const contentBER = contentInfo.toBER(false)
      const tokenDer = Buffer.from(contentBER)

      // Navigate into ContentInfo → SignedData → encapContentInfo → eContent → TSTInfo
      const ciSeq = contentInfo as asn1js.Sequence
      // ContentInfo.content is [0] EXPLICIT
      const signedDataWrapped = ciSeq.valueBlock.value[1] as asn1js.Constructed
      const signedData = signedDataWrapped.valueBlock.value[0] as asn1js.Sequence

      // SignedData: version, digestAlgorithms, encapContentInfo, ...
      const encapContentInfo = signedData.valueBlock.value[2] as asn1js.Sequence
      // encapContentInfo: contentType, [0] EXPLICIT eContent
      const eContentWrapped = encapContentInfo.valueBlock.value[1] as asn1js.Constructed
      const eContentOctet = eContentWrapped.valueBlock.value[0] as asn1js.OctetString

      // Parse TSTInfo from eContent
      const tstInfoBuf = eContentOctet.valueBlock.valueHexView
      const tstInfoAsn1 = asn1js.fromBER(EvidenceLedgerService.toArrayBuffer(tstInfoBuf))
      const tstInfo = tstInfoAsn1.result as asn1js.Sequence

      // TSTInfo: version, policy, messageImprint, serialNumber, genTime, ...
      const serialNumberInt = tstInfo.valueBlock.value[3] as asn1js.Integer
      const serialHex = Buffer.from(serialNumberInt.valueBlock.valueHexView).toString('hex')

      const genTime = tstInfo.valueBlock.value[4] as asn1js.GeneralizedTime
      const tsaTimestamp = genTime.toDate()

      return { tokenDer, tsaTimestamp, serialNumber: serialHex }
    } catch (err) {
      if (err instanceof Error && (
        err.message.startsWith('TSA_REJECTED') ||
        err.message === 'TSA response missing timeStampToken'
      )) {
        throw err
      }
      throw new Error(`TSA_PARSE_FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ─── Main TSA token request ──────────────────────────────────────────

  private async requestTsaToken(hashHex: string): Promise<TsaResponse> {
    const tsReqDer   = this.buildTsRequest(hashHex)
    const respBuffer = await this.postWithRetry(tsReqDer)
    const parsed     = this.parseTsaResponse(respBuffer)

    log.info('tsa_token_received', {
      data: {
        tsaName:      TSA_NAME,
        serialNumber: parsed.serialNumber,
        tsaTimestamp: parsed.tsaTimestamp.toISOString()
      }
    })

    return {
      token:        parsed.tokenDer.toString('base64'),
      tsaName:      TSA_NAME,
      tsaTimestamp: parsed.tsaTimestamp,
      serialNumber: parsed.serialNumber
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Fire-and-forget TSA timestamping.
   * Queues the TSA call without blocking the caller.  TSA failures are
   * logged and audited but never propagate to the caller — mission upload
   * or ledger anchoring is never delayed by an unreachable TSA.
   *
   * The timestamp is stored on the EvidenceLedger row when it eventually
   * arrives; if it never arrives, the row is left without an RFC 3161 token
   * and can be retried later by the cron job.
   */
  stampRecordAsync(evidenceLedgerId: string): void {
    this.stampRecord(evidenceLedgerId).catch(err => {
      log.warn('tsa_stamp_async_failed', {
        data: { evidenceLedgerId, error: err instanceof Error ? err.message : String(err) },
      })
    })
  }

  async stampRecord(evidenceLedgerId: string): Promise<TsaResponse> {
    const row = await this.prisma.evidenceLedger.findUnique({
      where: { id: evidenceLedgerId }
    })
    if (!row) throw new Error(`EvidenceLedger ${evidenceLedgerId} not found`)

    const payloadHashHex = row.anchorHash
    let tsaResponse: TsaResponse

    try {
      tsaResponse = await this.requestTsaToken(payloadHashHex)
    } catch (err) {
      log.error('tsa_stamp_failed', {
        data: { evidenceLedgerId, error: String(err) }
      })
      await this.prisma.auditLog.create({
        data: {
          actorType:    'SYSTEM',
          actorId:      'EvidenceLedgerService',
          action:       'rfc3161_timestamp_failed',
          resourceType: 'evidence_ledger',
          resourceId:   evidenceLedgerId,
          errorCode:    'TSA_UNAVAILABLE',
          detailJson:   JSON.stringify({ error: String(err) })
        }
      })
      throw new Error(`RFC3161_STAMP_FAILED: ${String(err)}`)
    }

    await this.prisma.evidenceLedger.update({
      where: { id: evidenceLedgerId },
      data: {
        rfc3161TimestampToken: tsaResponse.token,
        tsaName:               tsaResponse.tsaName,
        tsaTimestamp:          tsaResponse.tsaTimestamp,
      }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'EvidenceLedgerService',
        action:       'rfc3161_timestamp_applied',
        resourceType: 'evidence_ledger',
        resourceId:   evidenceLedgerId,
        detailJson:   JSON.stringify({
          tsaName:      tsaResponse.tsaName,
          tsaTimestamp: tsaResponse.tsaTimestamp.toISOString(),
          serialNumber: tsaResponse.serialNumber,
        }),
      }
    })

    log.info('rfc3161_timestamp_applied', {
      data: { evidenceLedgerId, tsaName: tsaResponse.tsaName }
    })

    return tsaResponse
  }

  async verifyTsaToken(
    evidenceLedgerId: string
  ): Promise<{
    verified:      boolean
    tsaName?:      string
    tsaTimestamp?:  Date
    reason?:       string
  }> {
    const row = await this.prisma.evidenceLedger.findUnique({
      where: { id: evidenceLedgerId }
    })
    if (!row) throw new Error(`EvidenceLedger ${evidenceLedgerId} not found`)

    if (!row.rfc3161TimestampToken || row.rfc3161TimestampToken === 'STUB_TSA_TOKEN') {
      return { verified: false, reason: 'NO_REAL_TSA_TOKEN' }
    }

    try {
      const tokenDer = Buffer.from(row.rfc3161TimestampToken, 'base64')

      // Parse the ContentInfo (TimeStampToken) to extract TSTInfo
      const arrayBuffer = EvidenceLedgerService.toArrayBuffer(tokenDer)
      const asn1 = asn1js.fromBER(arrayBuffer)
      if (asn1.offset === -1) {
        return { verified: false, reason: 'INVALID_ASN1' }
      }

      // ContentInfo → SignedData → encapContentInfo → eContent → TSTInfo
      const ciSeq = asn1.result as asn1js.Sequence
      const signedDataWrapped = ciSeq.valueBlock.value[1] as asn1js.Constructed
      const signedData = signedDataWrapped.valueBlock.value[0] as asn1js.Sequence
      const encapContentInfo = signedData.valueBlock.value[2] as asn1js.Sequence
      const eContentWrapped = encapContentInfo.valueBlock.value[1] as asn1js.Constructed
      const eContentOctet = eContentWrapped.valueBlock.value[0] as asn1js.OctetString

      const tstInfoBuf = eContentOctet.valueBlock.valueHexView
      const tstInfoAsn1 = asn1js.fromBER(EvidenceLedgerService.toArrayBuffer(tstInfoBuf))
      const tstInfo = tstInfoAsn1.result as asn1js.Sequence

      // TSTInfo: version, policy, messageImprint, serialNumber, genTime
      const msgImprint = tstInfo.valueBlock.value[2] as asn1js.Sequence
      const hashedMessage = msgImprint.valueBlock.value[1] as asn1js.OctetString
      const embeddedHash = Buffer.from(hashedMessage.valueBlock.valueHexView).toString('hex')

      const serialNumberInt = tstInfo.valueBlock.value[3] as asn1js.Integer
      const genTime = tstInfo.valueBlock.value[4] as asn1js.GeneralizedTime
      const tsaTimestamp = genTime.toDate()

      // Compare embedded hash with the record's anchorHash
      if (embeddedHash.toLowerCase() !== row.anchorHash.toLowerCase()) {
        return { verified: false, reason: 'HASH_MISMATCH' }
      }

      return {
        verified:     true,
        tsaName:      TSA_NAME,
        tsaTimestamp: tsaTimestamp
      }
    } catch (err) {
      return {
        verified: false,
        reason:   `PARSE_ERROR: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  async anchorBatch(evidenceLedgerIds: string[]): Promise<AnchorResult[]> {
    const rows = await Promise.all(
      evidenceLedgerIds.map(id =>
        this.prisma.evidenceLedger.findUniqueOrThrow({ where: { id } })
      )
    )

    const hashes = rows.map(r => r.anchorHash)
    const { root, layers } = this.buildMerkleTree(hashes)

    const results: AnchorResult[] = []

    for (let i = 0; i < rows.length; i++) {
      const siblingHashes = this.computeSiblingHashes(i, layers)

      await this.prisma.evidenceLedger.update({
        where: { id: rows[i].id },
        data: {
          anchorHash:   root,
          tsaRequestHash: JSON.stringify({
            merkleRoot:      root,
            merkleLeafIndex: i,
            merkleSiblingHashesJson: JSON.stringify(siblingHashes),
          }),
        }
      })

      results.push({
        merkleRoot:    root,
        leafIndex:     i,
        siblingHashes,
      })
    }

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      'EvidenceLedgerService',
        action:       'merkle_batch_anchored',
        resourceType: 'evidence_ledger',
        resourceId:   evidenceLedgerIds[0],
        detailJson:   JSON.stringify({
          batchSize:  evidenceLedgerIds.length,
          merkleRoot: root,
          ids:        evidenceLedgerIds,
        }),
      }
    })

    log.info('merkle_batch_anchored', {
      data: { batchSize: evidenceLedgerIds.length, merkleRoot: root }
    })

    return results
  }

  private buildMerkleTree(hexHashes: string[]): {
    root: string
    layers: string[][]
  } {
    if (hexHashes.length === 0) {
      const emptyRoot = this.sha256Hex(Buffer.alloc(0))
      return { root: emptyRoot, layers: [[emptyRoot]] }
    }

    let currentLayer = hexHashes.map(h => h.toLowerCase())
    const layers: string[][] = [currentLayer]

    while (currentLayer.length > 1) {
      const nextLayer: string[] = []

      // If odd number of nodes, duplicate the last
      if (currentLayer.length % 2 !== 0) {
        currentLayer = [...currentLayer, currentLayer[currentLayer.length - 1]]
        // Update the stored layer to include the duplicate
        layers[layers.length - 1] = currentLayer
      }

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left  = Buffer.from(currentLayer[i], 'hex')
        const right = Buffer.from(currentLayer[i + 1], 'hex')
        const parent = this.sha256Hex(Buffer.concat([left, right]))
        nextLayer.push(parent)
      }

      currentLayer = nextLayer
      layers.push(currentLayer)
    }

    return { root: currentLayer[0], layers }
  }

  private computeSiblingHashes(leafIndex: number, layers: string[][]): string[] {
    const siblings: string[] = []
    let idx = leafIndex

    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level]
      // Sibling is the paired node
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1
      if (siblingIdx < layer.length) {
        siblings.push(layer[siblingIdx])
      }
      idx = Math.floor(idx / 2)
    }

    return siblings
  }

  private sha256Hex(input: Buffer): string {
    return crypto.createHash('sha256').update(input).digest('hex')
  }
}

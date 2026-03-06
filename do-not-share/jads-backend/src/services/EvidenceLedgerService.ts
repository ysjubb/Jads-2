// EvidenceLedgerService — populates the EvidenceLedger table after every drone
// mission record is written. Handles RFC 3161 timestamping and Merkle anchoring.
// Does NOT replace the existing hash chain — wraps it with external verifiability.

import { PrismaClient }        from '@prisma/client'
import { createServiceLogger } from '../logger'
import crypto                  from 'crypto'

const log = createServiceLogger('EvidenceLedgerService')

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

  async stampRecord(evidenceLedgerId: string): Promise<TsaResponse> {
    const row = await this.prisma.evidenceLedger.findUnique({
      where: { id: evidenceLedgerId }
    })
    if (!row) throw new Error(`EvidenceLedger ${evidenceLedgerId} not found`)

    const payloadHashHex = row.anchorHash
    const tsaResponse = await this.requestTsaToken(payloadHashHex)

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

  // PRODUCTION: Replace stub with HTTP POST to RFC 3161 TSA endpoint.
  // Recommended TSAs for India: eMudhra (https://www.emudhra.com/tsa),
  // CDAC TSA, or any ETSI EN 319 421 compliant provider.
  // Request body: DER-encoded TimeStampReq with hashAlgorithm SHA-256.
  // Parse response: DER TimeStampResp → extract TimeStampToken.
  private async requestTsaToken(hashHex: string): Promise<TsaResponse> {
    return {
      token:        Buffer.from('STUB_TSA_TOKEN').toString('base64'),
      tsaName:      'STUB_TSA',
      tsaTimestamp: new Date(),
      serialNumber: `STUB-${Date.now()}`,
    }
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

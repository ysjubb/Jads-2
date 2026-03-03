// MerkleTreeService — builds a Merkle tree over daily mission IDs.
// Defense against Threat 3 (Long-Term Historical Tampering).
//
// Instead of just SHA-256(csv_of_ids), we build a proper Merkle tree.
// This allows:
//   1. Compact proof that a specific mission was included in a day's anchor
//   2. Efficient verification without re-downloading all mission IDs
//   3. Third-party auditors can verify inclusion proofs independently
//
// A genesis anchor is published at system initialization. The full chain
// from genesis to present can be verified to detect any rewrite attempt.

import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('MerkleTreeService')

// ── Merkle Node ──────────────────────────────────────────────────────────

export interface MerkleNode {
  hash:  string
  left?: MerkleNode
  right?: MerkleNode
  leaf?: string       // Only present on leaf nodes (missionId)
}

// ── Merkle Proof (for inclusion verification) ────────────────────────────

export interface MerkleProof {
  missionId:  string
  root:       string
  proof:      Array<{ hash: string; position: 'left' | 'right' }>
  leafHash:   string
}

// ── Merkle Tree Builder ──────────────────────────────────────────────────

export function buildMerkleTree(items: string[]): MerkleNode {
  if (items.length === 0) {
    return { hash: sha256('EMPTY_DAY') }
  }

  // Build leaf nodes
  let nodes: MerkleNode[] = items.map(item => ({
    hash: sha256(`LEAF:${item}`),
    leaf: item,
  }))

  // If odd number of nodes, duplicate the last one
  if (nodes.length % 2 !== 0) {
    nodes.push({ ...nodes[nodes.length - 1] })
  }

  // Build tree bottom-up
  while (nodes.length > 1) {
    const nextLevel: MerkleNode[] = []
    for (let i = 0; i < nodes.length; i += 2) {
      const left  = nodes[i]
      const right = nodes[i + 1] ?? left
      nextLevel.push({
        hash:  sha256(`NODE:${left.hash}:${right.hash}`),
        left,
        right,
      })
    }
    nodes = nextLevel
  }

  return nodes[0]
}

// Generate an inclusion proof for a specific mission ID
export function generateMerkleProof(missionIds: string[], targetId: string): MerkleProof | null {
  const idx = missionIds.indexOf(targetId)
  if (idx === -1) return null

  // Build all leaf hashes
  let hashes = missionIds.map(id => sha256(`LEAF:${id}`))
  if (hashes.length % 2 !== 0) hashes.push(hashes[hashes.length - 1])

  const proof: Array<{ hash: string; position: 'left' | 'right' }> = []
  let currentIdx = idx

  while (hashes.length > 1) {
    const nextLevel: string[] = []
    for (let i = 0; i < hashes.length; i += 2) {
      const left  = hashes[i]
      const right = hashes[i + 1] ?? left

      if (i === currentIdx || i + 1 === currentIdx) {
        // This pair contains our target
        if (currentIdx % 2 === 0) {
          proof.push({ hash: right, position: 'right' })
        } else {
          proof.push({ hash: left, position: 'left' })
        }
      }

      nextLevel.push(sha256(`NODE:${left}:${right}`))
    }
    currentIdx = Math.floor(currentIdx / 2)
    hashes = nextLevel
  }

  return {
    missionId: targetId,
    root:      hashes[0],
    proof,
    leafHash:  sha256(`LEAF:${targetId}`),
  }
}

// Verify a Merkle inclusion proof
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let current = proof.leafHash

  for (const step of proof.proof) {
    if (step.position === 'left') {
      current = sha256(`NODE:${step.hash}:${current}`)
    } else {
      current = sha256(`NODE:${current}:${step.hash}`)
    }
  }

  return current === proof.root
}

// ── Genesis Anchor ───────────────────────────────────────────────────────
// Published at system initialization. The genesis block contains:
//   - Platform version
//   - Initialization timestamp
//   - Admin who initialized
//   - Random nonce (prevents pre-computation)
//
// The genesis anchor is the root of trust for the entire ledger chain.
// It should be published to multiple external systems immediately.

export interface GenesisAnchor {
  type:            'GENESIS'
  platformVersion: string
  initializedAt:   string      // ISO 8601
  initializedBy:   string      // Admin user ID
  nonce:           string      // Random 256-bit hex
  genesisHash:     string      // SHA-256 of all above fields
}

export function createGenesisAnchor(adminUserId: string): GenesisAnchor {
  const nonce = crypto.randomBytes(32).toString('hex')
  const initializedAt = new Date().toISOString()

  const input = `GENESIS|JADS-4.0|${initializedAt}|${adminUserId}|${nonce}`
  const genesisHash = sha256(input)

  return {
    type: 'GENESIS',
    platformVersion: 'JADS-4.0',
    initializedAt,
    initializedBy: adminUserId,
    nonce,
    genesisHash,
  }
}

// ── Full Chain Verification ──────────────────────────────────────────────
// Walks the entire ledger from genesis to present.
// Detects: gaps, hash mismatches, rewritten entries.

export async function verifyFullChain(prisma: PrismaClient): Promise<{
  verified:     boolean
  entriesCount: number
  gaps:         string[]
  mismatches:   string[]
  chainStart:   string | null
  chainEnd:     string | null
}> {
  const entries = await prisma.evidenceLedger.findMany({
    orderBy: { anchorDate: 'asc' },
  })

  const GENESIS = '0'.repeat(64)
  const gaps:       string[] = []
  const mismatches: string[] = []

  let prevHash = GENESIS
  let prevDate: string | null = null

  for (const entry of entries) {
    const dateStr = entry.anchorDate.toISOString().slice(0, 10)

    // Check chain link
    if (entry.prevAnchorHash !== prevHash) {
      mismatches.push(
        `CHAIN_BREAK at ${dateStr}: expected prev=${prevHash.slice(0, 16)}... got=${entry.prevAnchorHash.slice(0, 16)}...`
      )
    }

    // Re-verify anchor hash
    const input = `${dateStr}|${entry.missionCount}|${entry.missionIdsCsvHash}|${entry.prevAnchorHash}`
    const recomputed = sha256(input)
    if (recomputed !== entry.anchorHash) {
      mismatches.push(
        `HASH_MISMATCH at ${dateStr}: stored=${entry.anchorHash.slice(0, 16)}... recomputed=${recomputed.slice(0, 16)}...`
      )
    }

    // Check for date gaps (more than 1 day between entries)
    if (prevDate) {
      const prev = new Date(prevDate)
      const curr = new Date(dateStr)
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000)
      if (diffDays > 1) {
        gaps.push(`GAP: ${diffDays - 1} missing day(s) between ${prevDate} and ${dateStr}`)
      }
    }

    prevHash = entry.anchorHash
    prevDate = dateStr
  }

  const chainStart = entries.length > 0 ? entries[0].anchorDate.toISOString().slice(0, 10) : null
  const chainEnd   = entries.length > 0 ? entries[entries.length - 1].anchorDate.toISOString().slice(0, 10) : null

  return {
    verified: mismatches.length === 0,
    entriesCount: entries.length,
    gaps,
    mismatches,
    chainStart,
    chainEnd,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared test helpers for hash chain and canonical payload construction.
// Extracted to prevent drift between chaos-integration, collapse-chaos, and
// mega-stress-chaos test suites.
//
// INVARIANT: These builders MUST mirror the Android HashChainEngine exactly.
// If Android changes the chain derivation, update these builders and all
// dependent tests will automatically pick up the change.
// ─────────────────────────────────────────────────────────────────────────────

import * as crypto from 'crypto'

// ── CRC32 (same polynomial as canonicalSerializer.ts) ───────────────────────

export function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buf) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ── Canonical payload builder ───────────────────────────────────────────────

/**
 * Build a 96-byte canonical telemetry payload with valid CRC32 at bytes 92-95.
 * Bytes 65-91 are zero (reserved). Bytes 0-64 filled with test data.
 */
export function buildCanonicalPayload(seq: number, fillByte: number = 0xAB): string {
  const data = Buffer.alloc(92, 0x00)
  for (let i = 0; i < 65; i++) data[i] = fillByte
  data.writeUInt32BE(seq, 4)  // embed sequence for uniqueness
  const crcValue = crc32(data)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcValue, 0)
  return Buffer.concat([data, crcBuf]).toString('hex')
}

/**
 * Build a 96-byte payload with JADS magic header, lat/lon, altitude.
 * More realistic than buildCanonicalPayload — used for collapse tests.
 */
export function makeCanonicalPayload(
  seq: number,
  lat: number = 28.625,
  lon: number = 77.245
): Buffer {
  const buf = Buffer.alloc(96, 0)
  buf.writeUInt32BE(0x4A414453, 0)             // magic JADS
  buf.writeUInt32BE(seq, 4)                    // sequence
  buf.writeInt32BE(Math.round(lat * 1e6), 8)   // lat microdeg
  buf.writeInt32BE(Math.round(lon * 1e6), 12)  // lon microdeg
  buf.writeInt32BE(15000, 16)                  // alt cm (150m)
  buf.writeUInt32BE(0x00000101, 88)            // flight state 0x01, gnss 0x01
  const crcVal = crc32(buf.slice(0, 92))
  buf.writeUInt32BE(crcVal, 92)
  return buf
}

// ── Hash chain builder ──────────────────────────────────────────────────────

export interface ChainRecord {
  sequence:            number
  canonicalPayloadHex: string
  chainHashHex:        string
  gnssStatus:          string
  signatureHex?:       string
}

/**
 * Build a valid N-record hash chain from a missionId.
 * Mirrors Android HashChainEngine: HASH_0 = SHA256("MISSION_INIT" || missionId_BE8)
 * Each subsequent hash = SHA256(payload || prevHash)
 */
export function buildValidChain(
  missionId: bigint,
  numRecords: number,
  options?: { payloadBuilder?: (seq: number) => string; includeSignature?: boolean }
): ChainRecord[] {
  const prefix = Buffer.from('MISSION_INIT', 'ascii')
  const idBuf  = Buffer.alloc(8)
  idBuf.writeBigInt64BE(missionId)
  let prevHash = crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest()

  const records: ChainRecord[] = []
  for (let seq = 0; seq < numRecords; seq++) {
    const payloadHex = options?.payloadBuilder
      ? options.payloadBuilder(seq)
      : buildCanonicalPayload(seq)
    const payloadBuf = Buffer.from(payloadHex, 'hex')
    const chainHash  = crypto.createHash('sha256')
      .update(Buffer.concat([payloadBuf, prevHash]))
      .digest()

    const record: ChainRecord = {
      sequence:            seq,
      canonicalPayloadHex: payloadHex,
      chainHashHex:        chainHash.toString('hex'),
      gnssStatus:          'GOOD',
    }
    if (options?.includeSignature) {
      record.signatureHex = '00'.repeat(64)  // placeholder — no ECDSA key in unit test
    }
    records.push(record)
    prevHash = chainHash
  }
  return records
}

// ── AFTN input builder ──────────────────────────────────────────────────────

export interface MinimalItem18 {
  dof:      string | null
  reg:      string | null
  pbnCodes: string[]
  opr:      string | null
  sts:      string | null
  dep:      string | null
  dest:     string | null
  selcal:   string | null
  rmk:      string | null
  unknown:  string[]
  raw:      string
}

export function minimalItem18(overrides: Partial<MinimalItem18> = {}): MinimalItem18 {
  return {
    dof:      null,
    reg:      null,
    pbnCodes: [],
    opr:      null,
    sts:      null,
    dep:      null,
    dest:     null,
    selcal:   null,
    rmk:      null,
    unknown:  [],
    raw:      '',
    ...overrides,
  }
}

export function minimalAftnInput(overrides: Record<string, unknown> = {}) {
  return {
    callsign:       'VTA101',
    flightRules:    'I',
    flightType:     'S',
    aircraftType:   'B738',
    wakeTurbulence: 'M',
    equipment:      'SDFGLOP',
    surveillance:   'SB2',
    departureIcao:  'VIDP',
    eobt:           '150600',
    speed:          'N0450',
    level:          'F330',
    route:          'DCT DOGAR DCT KARNU DCT',
    destination:    'VABB',
    eet:            '0200',
    item18Parsed:   minimalItem18({ dof: '260315' }),
    ...overrides,
  }
}

import * as fs     from 'fs'
import * as path   from 'path'
import * as crypto from 'crypto'
import CRC32 from 'crc-32'

const VECTORS_PATH = path.join(__dirname, 'canonical_test_vectors.json')
const vectors = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'))

describe('Canonical Test Vector Compliance — Backend', () => {

  test('VEC-01: HASH_0 computation matches vector', () => {
    const { missionId, inputHex, hash0Hex } = vectors.hash0_computation

    const prefix = Buffer.from('MISSION_INIT', 'ascii')  // exactly 12 bytes
    const idBuf  = Buffer.alloc(8)
    idBuf.writeBigInt64BE(BigInt(missionId), 0)
    const input = Buffer.concat([prefix, idBuf])

    expect(input.toString('hex')).toBe(inputHex)
    expect(input.length).toBe(20)  // 12 + 8

    const hash0 = crypto.createHash('sha256').update(input).digest('hex')
    expect(hash0).toBe(hash0Hex)
    expect(hash0).toBe('04416388bf699ff7246cd094ff0db2980eb3d43c44bd39a5faba39f9cb365327')
  })

  test('VEC-02: Canonical payload length is exactly 96 bytes (192 hex chars)', () => {
    const tv = vectors.vectors.find((v: any) => v._id === 'TV-001')
    expect(tv.expected.canonicalHex).toHaveLength(192)
    expect(Buffer.from(tv.expected.canonicalHex, 'hex').length).toBe(96)
  })

  test('VEC-03: Reserved bytes at offset 65-91 are all 0x00', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    for (let i = 65; i <= 91; i++) {
      expect(buf[i]).toBe(0)
    }
  })

  test('VEC-04: CRC32 stored at offset 92, computed over bytes 0..91', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    expect(buf.length).toBe(96)
    const storedCrc   = buf.readUInt32BE(92)
    const computedCrc = (CRC32.buf(buf.slice(0, 92)) >>> 0)
    expect(storedCrc).toBe(computedCrc)
    expect(storedCrc.toString(16)).toBe(tv.expected.crc32Hex)
  })

  test('VEC-05: GREEN zone — npntClassification = 0x00 at offset 40', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    expect(buf[40]).toBe(0x00)
  })

  test('VEC-06: Sequence = 1 encoded as big-endian uint32 at offset 0 in TV-002', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-002')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    const seq = buf.readUInt32BE(0)
    expect(seq).toBe(tv.inputs.sequence)
    expect(seq).toBe(1)
  })

  test('VEC-07: missionId encoded as big-endian uint64 at offset 41', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    const mid = buf.readBigUInt64BE(41)
    expect(mid.toString()).toBe(tv.inputs.missionId.toString())
    expect(mid.toString()).toBe('1704067200000')
  })

  test('VEC-08: Chain hash = SHA256(canonical || prevHash) matches vector', () => {
    const tv        = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const canonical = Buffer.from(tv.expected.canonicalHex, 'hex')
    const prevHash  = Buffer.from(tv.expected.prevHashHex, 'hex')
    const chain     = crypto.createHash('sha256')
      .update(Buffer.concat([canonical, prevHash]))
      .digest('hex')
    expect(chain).toBe(tv.expected.chainHashHex)
    expect(chain).toBe('076d34521bf38c421d9792dee2248bf0264645c59836532bc9bd1ae28f1adde2')
  })

  test('VEC-09: TV-002 chain hash chains from TV-001', () => {
    const tv1 = vectors.vectors.find((v: any) => v._id === 'TV-001')
    const tv2 = vectors.vectors.find((v: any) => v._id === 'TV-002')

    // TV-002 prevHashHex must equal TV-001 chainHashHex
    expect(tv2.expected.prevHashHex).toBe(tv1.expected.chainHashHex)

    const canonical = Buffer.from(tv2.expected.canonicalHex, 'hex')
    const prevHash  = Buffer.from(tv2.expected.prevHashHex, 'hex')
    const chain     = crypto.createHash('sha256')
      .update(Buffer.concat([canonical, prevHash]))
      .digest('hex')
    expect(chain).toBe(tv2.expected.chainHashHex)
    expect(chain).toBe('486aeb72d57a9f3f7664a266bce6cf22133db32f6c6abb198b70d08066a3bfe3')
  })

  test('VEC-10: TV-002 CRC32 valid', () => {
    const tv  = vectors.vectors.find((v: any) => v._id === 'TV-002')
    const buf = Buffer.from(tv.expected.canonicalHex, 'hex')
    const storedCrc   = buf.readUInt32BE(92)
    const computedCrc = (CRC32.buf(buf.slice(0, 92)) >>> 0)
    expect(storedCrc).toBe(computedCrc)
    expect(storedCrc.toString(16)).toBe(tv.expected.crc32Hex)
  })

  test('VEC-11: MISSION_INIT prefix is exactly 12 ASCII bytes', () => {
    const prefix = Buffer.from('MISSION_INIT', 'ascii')
    expect(prefix.length).toBe(12)
    expect(prefix.toString('hex')).toBe('4d495353494f4e5f494e4954')
    expect(prefix.toString('hex')).toBe(vectors.hash0_computation.prefixHex)
  })

})

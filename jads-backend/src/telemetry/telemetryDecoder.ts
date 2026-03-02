// Decodes a 96-byte canonical telemetry payload into human-readable fields.
// Field layout (all big-endian):
//   [0..3]   uint32  sequence
//   [4..11]  uint64  timestampUtcMs
//   [12..15] int32   latitudeMicrodeg
//   [16..19] int32   longitudeMicrodeg
//   [20..23] uint32  altitudeCm
//   [24..27] int32   velocityNorthMms
//   [28..31] int32   velocityEastMms
//   [32..35] int32   velocityDownMms
//   [36..37] uint16  hdop (x100)
//   [38]     uint8   satelliteCount
//   [39]     uint8   fixType (0=NONE 1=2D 2=3D 3=DGPS)
//   [40]     uint8   npntClassification (0=GREEN 1=YELLOW 2=RED)
//   [41..48] uint64  missionId
//   [49..64] bytes   operatorIdHash SHA256[0..15]
//   [65..91] bytes   reserved (must be 0x00)
//   [92..95] uint32  CRC32 of bytes 0..91

import CRC32 from 'crc-32'

// PAYLOAD_OFFSETS — frozen field layout for the 96-byte canonical payload.
// Used by tests and any tooling that needs to locate fields by name.
export const PAYLOAD_OFFSETS = {
  sequence:           { offset: 0,  length: 4,  type: 'uint32' },
  timestampUtcMs:     { offset: 4,  length: 8,  type: 'uint64' },
  latitudeMicrodeg:   { offset: 12, length: 4,  type: 'int32'  },
  longitudeMicrodeg:  { offset: 16, length: 4,  type: 'int32'  },
  altitudeCm:         { offset: 20, length: 4,  type: 'uint32' },
  velocityNorthMms:   { offset: 24, length: 4,  type: 'int32'  },
  velocityEastMms:    { offset: 28, length: 4,  type: 'int32'  },
  velocityDownMms:    { offset: 32, length: 4,  type: 'int32'  },
  hdop:               { offset: 36, length: 2,  type: 'uint16' },
  satelliteCount:     { offset: 38, length: 1,  type: 'uint8'  },
  fixType:            { offset: 39, length: 1,  type: 'uint8'  },
  npntClassification: { offset: 40, length: 1,  type: 'uint8'  },
  missionId:          { offset: 41, length: 8,  type: 'uint64' },
  operatorIdHash:     { offset: 49, length: 16, type: 'bytes'  },
  reservedBytes:      { offset: 65, length: 27, type: 'bytes'  },
  crc32:              { offset: 92, length: 4,  type: 'uint32' },
} as const

export interface DecodedRecord {
  sequence:             number
  timestampUtcMs:       string
  timestampIso:         string
  latitudeMicrodeg:     number
  longitudeMicrodeg:    number
  latitudeDeg:          number
  longitudeDeg:         number
  latitudeDisplay:      string
  longitudeDisplay:     string
  altitudeCm:           number
  altitudeM:            number
  altitudeFt:           number
  altitudeDisplay:      string
  velocityNorthMms:     number
  velocityEastMms:      number
  velocityDownMms:      number
  groundspeedMms:       number
  groundspeedKph:       number
  hdop:                 number
  satelliteCount:       number
  fixType:              number
  fixTypeLabel:         string
  npntClassification:   number
  npntClassLabel:       string
  missionId:            string
  operatorIdHashHex:    string
  reservedBytesZero:    boolean
  crc32Stored:          number
  crc32Computed:        number
  crc32Valid:           boolean
  payloadSizeBytes:     number
}

const FIX_LABELS  = ['NONE', '2D', '3D', 'DGPS']
const NPNT_LABELS = ['GREEN', 'YELLOW', 'RED']

export function decodeCanonical(canonicalHex: string): DecodedRecord {
  if (canonicalHex.length !== 192) {
    throw new Error(`Invalid payload: expected 192 hex chars, got ${canonicalHex.length}`)
  }
  const buf = Buffer.from(canonicalHex, 'hex')

  const sequence   = buf.readUInt32BE(0)
  const tsMs       = buf.readBigUInt64BE(4)
  const latMicro   = buf.readInt32BE(12)
  const lonMicro   = buf.readInt32BE(16)
  const altCm      = buf.readUInt32BE(20)
  const velN       = buf.readInt32BE(24)
  const velE       = buf.readInt32BE(28)
  const velD       = buf.readInt32BE(32)
  const hdopRaw    = buf.readUInt16BE(36)
  const satCount   = buf[38]
  const fixType    = buf[39]
  const npnt       = buf[40]
  const missionId  = buf.readBigUInt64BE(41)
  const opHashHex  = buf.slice(49, 65).toString('hex')

  // Reserved bytes 65–91
  let reservedZero = true
  for (let i = 65; i <= 91; i++) { if (buf[i] !== 0) { reservedZero = false; break } }

  const crc32Stored   = buf.readUInt32BE(92)
  const crc32Computed = (CRC32.buf(buf.slice(0, 92)) >>> 0)

  const latDeg  = latMicro / 1_000_000
  const lonDeg  = lonMicro / 1_000_000
  const altM    = altCm / 100
  const altFt   = altCm / 30.48
  const gndMms  = Math.sqrt(velN ** 2 + velE ** 2)
  const gndKph  = gndMms * 3.6 / 1000

  return {
    sequence,
    timestampUtcMs:    tsMs.toString(),
    timestampIso:      new Date(Number(tsMs)).toISOString(),
    latitudeMicrodeg:  latMicro,
    longitudeMicrodeg: lonMicro,
    latitudeDeg:       latDeg,
    longitudeDeg:      lonDeg,
    latitudeDisplay:   `${Math.abs(latDeg).toFixed(6)}°${latDeg >= 0 ? 'N' : 'S'}`,
    longitudeDisplay:  `${Math.abs(lonDeg).toFixed(6)}°${lonDeg >= 0 ? 'E' : 'W'}`,
    altitudeCm:        altCm,
    altitudeM:         Math.round(altM * 10) / 10,
    altitudeFt:        Math.round(altFt * 10) / 10,
    altitudeDisplay:   `${altM.toFixed(1)}m (${altFt.toFixed(0)}ft) AGL`,
    velocityNorthMms:  velN,
    velocityEastMms:   velE,
    velocityDownMms:   velD,
    groundspeedMms:    Math.round(gndMms),
    groundspeedKph:    Math.round(gndKph * 10) / 10,
    hdop:              hdopRaw / 100,
    satelliteCount:    satCount,
    fixType,
    fixTypeLabel:      FIX_LABELS[fixType] ?? 'UNKNOWN',
    npntClassification: npnt,
    npntClassLabel:    NPNT_LABELS[npnt] ?? 'UNKNOWN',
    missionId:         missionId.toString(),
    operatorIdHashHex: opHashHex,
    reservedBytesZero: reservedZero,
    crc32Stored,
    crc32Computed,
    crc32Valid:        crc32Stored === crc32Computed,
    payloadSizeBytes:  96,
  }
}

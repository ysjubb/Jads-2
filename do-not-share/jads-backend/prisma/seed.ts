// JADS Platform v4.0 — Development Seed Script
// Populates the database with realistic demo data for laptop demonstrations.
// Run with: npx ts-node prisma/seed.ts
//
// Creates:
//   - 1 Super Admin A (DGCA — drafter)
//   - 1 Admin B (AAI — approver, for two-person rule demo)
//   - 2 IAF unit accounts (1 DRONE domain, 1 AIRCRAFT domain)
//   - 2 Civilians (1 AIRCRAFT pilot via AAI, 1 DRONE operator via Digital Sky)
//   - 2 Airspace versions (1 ACTIVE YELLOW 400ft, 1 DRAFT RED IAF exercise)
//   - 3 Drone missions (GREEN clean 50 recs, YELLOW violation 75 recs, REPLAY 30 recs)
//   - 2 Manned flight plans (1 IFR FILED FL330 RVSM, 1 VFR FULLY_CLEARED FL080)
//   - METAR VIDP + NOTAM A0234/24 (IAF exercise)

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex')
}

function msBigInt(offsetMinutes = 0): string {
  return String(BigInt(Date.now()) + BigInt(offsetMinutes * 60 * 1000))
}

// Build a valid 96-byte canonical telemetry payload matching the Android format.
// Layout (all big-endian):
//   [0..3]   sequence (uint32)
//   [4..11]  timestampUtcMs (uint64)
//   [12..15] latitudeMicrodeg (int32)
//   [16..19] longitudeMicrodeg (int32)
//   [20..23] altitudeCm (uint32)
//   [24..27] velocityNorthMms (int32)
//   [28..31] velocityEastMms (int32)
//   [32..35] velocityDownMms (int32)
//   [36..37] hdop x100 (uint16)
//   [38]     satelliteCount (uint8)
//   [39]     fixType (uint8)
//   [40]     npntClassification (uint8)
//   [41..48] missionId (uint64)
//   [49..64] operatorIdHash SHA256[0..15]
//   [65..91] reserved zeros
//   [92..95] CRC32 of bytes 0..91
function buildCanonicalPayload(
  seq: number, tsMs: bigint, latDeg: number, lonDeg: number,
  altM: number, missionIdBigInt: bigint, operatorIdHashPrefix: string,
  npntClass: number = 0
): { hex: string; crc32Valid: boolean } {
  const buf = Buffer.alloc(96)
  buf.writeUInt32BE(seq, 0)
  buf.writeBigUInt64BE(tsMs, 4)
  buf.writeInt32BE(Math.round(latDeg * 1_000_000), 12)
  buf.writeInt32BE(Math.round(lonDeg * 1_000_000), 16)
  buf.writeUInt32BE(Math.round(altM * 100), 20)
  buf.writeInt32BE(200, 24)   // 200mm/s north
  buf.writeInt32BE(100, 28)   // 100mm/s east
  buf.writeInt32BE(0, 32)     // 0 vertical
  buf.writeUInt16BE(120, 36)  // hdop 1.20
  buf[38] = 8                 // 8 satellites
  buf[39] = 2                 // 3D fix
  buf[40] = npntClass         // zone classification
  buf.writeBigUInt64BE(missionIdBigInt, 41)
  const opHash = Buffer.from(operatorIdHashPrefix, 'hex')
  opHash.copy(buf, 49, 0, 16)
  // bytes 65..91 stay as 0x00 (reserved)
  // CRC32
  let crc = 0xFFFFFFFF
  for (let i = 0; i < 92; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0
  buf.writeUInt32BE(crc, 92)
  return { hex: buf.toString('hex'), crc32Valid: true }
}

// Compute HASH_0 = SHA256("MISSION_INIT" || missionId as big-endian int64)
function computeHash0(missionId: bigint): string {
  const prefix = Buffer.from('MISSION_INIT', 'ascii')
  const idBuf  = Buffer.alloc(8)
  idBuf.writeBigInt64BE(missionId)
  return crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest('hex')
}

// Generate telemetry records with valid hash chain.
function generateTelemetryRecords(opts: {
  missionDbId: string
  count: number
  missionIdBigInt: bigint
  operatorIdHash: string
  baseLat: number
  baseLon: number
  baseAltM: number
  latStep: number
  lonStep: number
  altStep: number
  npntClass?: number
  startTimeOffsetMin: number  // minutes before now for first record
  intervalSec: number
  gnssOverride?: (seq: number) => string
}): { records: any[]; finalChainHash: string } {
  const hash0    = computeHash0(opts.missionIdBigInt)
  let chainHash  = hash0
  const records: any[] = []

  for (let seq = 0; seq < opts.count; seq++) {
    const tsMs   = BigInt(Date.now()) - BigInt((opts.count - seq) * opts.intervalSec * 1000) - BigInt(opts.startTimeOffsetMin * 60000)
    const latDeg = opts.baseLat + seq * opts.latStep
    const lonDeg = opts.baseLon + seq * opts.lonStep
    const altM   = opts.baseAltM + seq * opts.altStep
    const { hex: canonicalHex } = buildCanonicalPayload(
      seq, tsMs, latDeg, lonDeg, altM, opts.missionIdBigInt, opts.operatorIdHash, opts.npntClass ?? 0
    )
    const prevHash = chainHash
    chainHash = sha256(canonicalHex + chainHash)
    const gnssStatus = opts.gnssOverride ? opts.gnssOverride(seq) : 'GOOD'
    records.push({
      missionId:           opts.missionDbId,
      sequence:            seq,
      canonicalPayloadHex: canonicalHex,
      chainHashHex:        chainHash,
      signatureHex:        randomHex(64),
      prevHashPrefixHex:   prevHash.slice(0, 16),
      crc32Valid:          true,
      gnssStatus,
      sensorHealthFlags:   gnssStatus === 'DEGRADED' ? 2 : 0,
      decodedJson:         JSON.stringify({
        sequence: seq, latitudeDeg: latDeg, longitudeDeg: lonDeg,
        altitudeM: Math.round(altM * 10) / 10,
        groundspeedKph: 25, gnssStatus,
        timestampIso: new Date(Number(tsMs)).toISOString(),
      }),
      recordedAtUtcMs: String(tsMs),
    })
  }
  return { records, finalChainHash: chainHash }
}

// ── Seed ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding JADS development database...')

  // ── 0. Clean up all seeded data for idempotent re-runs ────────────
  await prisma.jeppesenChart.deleteMany({})
  await prisma.navaid.deleteMany({})
  await prisma.aerodromeInfo.deleteMany({})
  await prisma.notamRecord.deleteMany({})
  await prisma.metarRecord.deleteMany({})
  await prisma.auditLog.deleteMany({})

  // ── 1. Admin User A (DGCA Super Admin — drafter) ───────────────────
  const adminPassword = await hashPassword('Admin@JADS2024')
  const adminA = await prisma.adminUser.upsert({
    where:  { username: 'dgca.admin' },
    update: {},
    create: {
      username:     'dgca.admin',
      passwordHash: adminPassword,
      role:         'PLATFORM_SUPER_ADMIN',
      entityCode:   'DGCA',
    },
  })
  console.log(`  ✓ Admin A: ${adminA.username}  password: Admin@JADS2024`)

  // ── 1b. Admin User B (AAI — approver for two-person rule) ──────────
  const adminBPassword = await hashPassword('AAI@Approve2024')
  const adminB = await prisma.adminUser.upsert({
    where:  { username: 'aai.approver' },
    update: {},
    create: {
      username:     'aai.approver',
      passwordHash: adminBPassword,
      role:         'GOVT_ADMIN',
      entityCode:   'AAI',
    },
  })
  console.log(`  ✓ Admin B: ${adminB.username}  password: AAI@Approve2024`)

  // ── 1c. Dedicated Auditor Users ──────────────────────────────────
  const auditorPassword = await hashPassword('Auditor@JADS2024')
  const dgcaAuditor = await prisma.adminUser.upsert({
    where:  { username: 'dgca.auditor' },
    update: {},
    create: {
      username:     'dgca.auditor',
      passwordHash: auditorPassword,
      role:         'DGCA_AUDITOR' as any,
      entityCode:   'DGCA',
    },
  })
  console.log(`  ✓ Auditor: ${dgcaAuditor.username}  password: Auditor@JADS2024`)

  const iafAuditor = await prisma.adminUser.upsert({
    where:  { username: 'iaf.auditor' },
    update: {},
    create: {
      username:     'iaf.auditor',
      passwordHash: auditorPassword,
      role:         'IAF_AUDITOR' as any,
      entityCode:   'IAF',
    },
  })
  console.log(`  ✓ Auditor: ${iafAuditor.username}  password: Auditor@JADS2024`)

  // ── 2. Special User — 28 Sqn IAF (DRONE domain) ──────────────────
  const unitPassword = await hashPassword('28SQN@Secure2024')
  const specialDroneUser = await prisma.specialUser.upsert({
    where:  { username: 'iaf.28sqn' },
    update: {},
    create: {
      username:           'iaf.28sqn',
      passwordHash:       unitPassword,
      unitDesignator:     '28 Sqn IAF',
      entityCode:         'IAF',
      role:               'GOVT_DRONE_OPERATOR',
      credentialDomain:   'DRONE',
      issuingAuthority:   'DGCA',
      provisionedBy:      adminA.id,
    },
  })
  console.log(`  ✓ Special user (DRONE): ${specialDroneUser.username}  password: 28SQN@Secure2024`)

  // ── 2b. Special User — 28 Sqn IAF Pilot (AIRCRAFT domain) ───────
  const pilotUnitPassword = await hashPassword('28SQN@Pilot2024')
  const specialAircraftUser = await prisma.specialUser.upsert({
    where:  { username: 'iaf.28sqn.pilot' },
    update: {},
    create: {
      username:           'iaf.28sqn.pilot',
      passwordHash:       pilotUnitPassword,
      unitDesignator:     '28 Sqn IAF — Pilot Wing',
      entityCode:         'IAF',
      role:               'GOVT_PILOT',
      credentialDomain:   'AIRCRAFT',
      issuingAuthority:   'DGCA',
      provisionedBy:      adminA.id,
    },
  })
  console.log(`  ✓ Special user (AIRCRAFT): ${specialAircraftUser.username}  password: 28SQN@Pilot2024`)

  // ── 3. Civilian Aircraft Pilot ───────────────────────────────────
  const civilianAircraft = await prisma.civilianUser.upsert({
    where:  { mobileNumber: '9999000001' },
    update: {},
    create: {
      aadhaarHash:          sha256('123456789012_demo'),
      phone:                '9999000001',
      mobileNumber:         '9999000001',
      email:                'pilot.demo@jads.dev',
      role:                 'PILOT',
      credentialDomain:     'AIRCRAFT',
      issuingAuthority:     'AAI',
      credentialExternalId: 'AAI-CPL-2024-001',
      identityStatus:       'VERIFIED',
      accountStatus:        'ACTIVE',
      dgcaLicenseNumber:    'CPL/1234/2022',
      dgcaLicenseExpiry:    new Date('2026-12-31'),
      annualReconfirmDue:   new Date('2025-03-01'),
    },
  })
  console.log(`  ✓ Civilian AIRCRAFT pilot: ${civilianAircraft.phone}`)

  // ── 3b. Civilian Drone Operator ──────────────────────────────────
  const civilianDrone = await prisma.civilianUser.upsert({
    where:  { mobileNumber: '9999000002' },
    update: {},
    create: {
      aadhaarHash:          sha256('987654321012_demo'),
      phone:                '9999000002',
      mobileNumber:         '9999000002',
      email:                'drone.operator@jads.dev',
      role:                 'DRONE_OPERATOR',
      credentialDomain:     'DRONE',
      issuingAuthority:     'DIGITAL_SKY',
      credentialExternalId: 'DSKY-RPL-2024-001',
      identityStatus:       'VERIFIED',
      accountStatus:        'ACTIVE',
      uinNumber:            'UIN-DEMO-001',
      pilotLicenceNumber:   'RPL/5678/2023',
      annualReconfirmDue:   new Date('2025-06-01'),
    },
  })
  console.log(`  ✓ Civilian DRONE operator: ${civilianDrone.phone}`)

  // ── 4. Airspace Versions ───────────────────────────────────────────

  // Active zone: YELLOW polygon over Delhi NCR, max AGL 400ft.
  // Created by Admin A, approved by Admin B (two-person rule).
  const activeZone = await prisma.airspaceVersion.create({
    data: {
      dataType:      'DRONE_ZONE',
      versionNumber: 1,
      payloadJson:   JSON.stringify({
        zones: [
          {
            id: 'ZONE-ACTIVE-YELLOW-001',
            classification: 'YELLOW',
            name: 'Delhi NCR Controlled Zone',
            maxAglFt: 400,
            polygon: [
              { lat: 28.7041, lon: 77.1025 },
              { lat: 28.7041, lon: 77.2500 },
              { lat: 28.5000, lon: 77.2500 },
              { lat: 28.5000, lon: 77.1025 },
            ],
          },
          { id: 'GZ-DEL-001', classification: 'GREEN',  name: 'Lutyens Zone',         maxAglFt: 200 },
          { id: 'RZ-DEL-001', classification: 'RED',    name: 'Rashtrapati Bhavan',    maxAglFt: 0   },
        ]
      }),
      payloadHash:   sha256('demo_drone_zone_v1_yellow_400ft'),
      approvalStatus:'ACTIVE',
      dataSource:    'ADMIN_OVERRIDE',
      effectiveFrom: new Date('2024-01-01'),
      effectiveTo:   new Date('2026-03-31'),
      changeReason:  'Initial airspace configuration for Delhi region — YELLOW zone 400ft AGL',
      createdBy:     adminA.id,
      approvedBy:    adminB.id,   // Different admin — two-person rule satisfied
      approvedAt:    new Date('2024-01-02'),
    },
  })
  console.log(`  ✓ Airspace version ACTIVE (YELLOW 400ft, Admin A→Admin B): ${activeZone.id}`)

  // Pending zone: RED temporary restricted — IAF exercise, 2026-03-15 to 2026-03-20.
  // Created by Admin A, awaiting approval from Admin B.
  const pendingZone = await prisma.airspaceVersion.create({
    data: {
      dataType:      'DRONE_ZONE',
      versionNumber: 2,
      payloadJson:   JSON.stringify({
        zones: [
          {
            id: 'ZONE-PENDING-RED-001',
            classification: 'RED',
            name: 'IAF Exercise Area — Temporary Restricted',
            maxAglFt: null,  // prohibited — no altitude allowed
            polygon: [
              { lat: 28.25, lon: 77.25 },
              { lat: 28.25, lon: 77.42 },
              { lat: 28.08, lon: 77.42 },
              { lat: 28.08, lon: 77.25 },
            ],
          },
        ]
      }),
      payloadHash:   sha256('demo_drone_zone_v2_red_iaf_exercise'),
      approvalStatus:'DRAFT',
      dataSource:    'ADMIN_OVERRIDE',
      effectiveFrom: new Date('2026-03-15T06:00:00Z'),
      effectiveTo:   new Date('2026-03-20T14:00:00Z'),
      changeReason:  'Temporary RED zone for IAF exercise — awaiting Admin B approval',
      createdBy:     adminA.id,
      // No approvedBy — pending two-person approval
    },
  })
  console.log(`  ✓ Airspace version DRAFT (RED IAF exercise, awaiting approval): ${pendingZone.id}`)

  // ── 5. Drone Missions ──────────────────────────────────────────────
  // Clear existing missions so seed is re-runnable
  await prisma.bsa2023PartBDeclaration.deleteMany({})
  await prisma.droneMissionOverride.deleteMany({})
  await prisma.droneViolation.deleteMany({})
  await prisma.droneTelemetryRecord.deleteMany({})
  await prisma.droneMission.deleteMany({})

  // ── Mission A — GREEN Clean Mission ────────────────────────────────
  // ID: MISSION-GREEN-CLEAN-001, 50 records, no violations, civilian pilot
  const missionA = await prisma.droneMission.create({
    data: {
      missionId:            'MISSION-GREEN-CLEAN-001',
      operatorId:           civilianDrone.id,
      operatorType:         'CIVILIAN',
      deviceId:             'DRONE-DJI-001',
      deviceModel:          'DJI Mavic 3',
      npntClassification:   'GREEN',
      missionStartUtcMs:    msBigInt(-120),
      missionEndUtcMs:      msBigInt(-60),
      ntpSyncStatus:        'SYNCED',
      ntpOffsetMs:          12,
      certValidAtStart:     true,
      chainVerifiedByServer:true,
      uploadStatus:         'COMPLETE',
      strongboxBacked:      true,
      secureBootVerified:   true,
      androidVersionAtUpload:'14',
      sensorHealthSummaryFlags: 0,
      recordsWithDegradedGps:   0,
    },
  })

  // 50 telemetry records — Delhi FIR, alt ~100ft (30m), no violations
  const missionAIdBigInt = BigInt('1000000000001')
  const operatorOpHash   = sha256(civilianDrone.id).slice(0, 32)
  const { records: missionARecords } = generateTelemetryRecords({
    missionDbId:      missionA.id,
    count:            50,
    missionIdBigInt:  missionAIdBigInt,
    operatorIdHash:   operatorOpHash,
    baseLat:          28.6139,    // Delhi — India Gate area
    baseLon:          77.2090,
    baseAltM:         30,         // ~100ft AGL
    latStep:          0.0003,
    lonStep:          0.0003,
    altStep:          0.1,        // gradual altitude change
    npntClass:        0,          // GREEN
    startTimeOffsetMin: 120,
    intervalSec:      30,
  })
  await prisma.droneTelemetryRecord.createMany({ data: missionARecords })
  console.log(`  ✓ Mission A (GREEN clean, 50 records): ${missionA.missionId}`)

  // ── Mission B — YELLOW Violation Mission ───────────────────────────
  // ID: MISSION-YELLOW-VIOLATION-001, 75 records, geofence breach at seq 42,
  // AGL exceeded, operator: IAF special user
  const missionB = await prisma.droneMission.create({
    data: {
      missionId:            'MISSION-YELLOW-VIOLATION-001',
      operatorId:           specialDroneUser.id,
      operatorType:         'SPECIAL',
      deviceId:             'DRONE-IAF-028-01',
      deviceModel:          'Custom Quad — 28 Sqn',
      npntClassification:   'YELLOW',
      missionStartUtcMs:    msBigInt(-300),
      missionEndUtcMs:      msBigInt(-240),
      ntpSyncStatus:        'SYNCED',
      ntpOffsetMs:          8,
      certValidAtStart:     true,
      chainVerifiedByServer:true,
      uploadStatus:         'COMPLETE',
      strongboxBacked:      false,
      secureBootVerified:   true,
      androidVersionAtUpload:'13',
      sensorHealthSummaryFlags: 2,  // GPS_DEGRADED bit
      recordsWithDegradedGps:   5,
    },
  })

  // 75 telemetry records — North Delhi corridor
  const missionBIdBigInt = BigInt('1000000000002')
  const specialOpHash    = sha256(specialDroneUser.id).slice(0, 32)
  const { records: missionBRecords } = generateTelemetryRecords({
    missionDbId:      missionB.id,
    count:            75,
    missionIdBigInt:  missionBIdBigInt,
    operatorIdHash:   specialOpHash,
    baseLat:          28.7041,
    baseLon:          77.1025,
    baseAltM:         60,
    latStep:          0.0002,
    lonStep:          0.0002,
    altStep:          1.5,        // climbing — will exceed 400ft AGL around seq 40+
    npntClass:        1,          // YELLOW
    startTimeOffsetMin: 300,
    intervalSec:      30,
    gnssOverride:     (seq) => (seq >= 35 && seq <= 39) ? 'DEGRADED' : 'GOOD',
  })
  await prisma.droneTelemetryRecord.createMany({ data: missionBRecords })

  // Violation 1: GEOFENCE_BREACH at sequence 42
  await prisma.droneViolation.create({
    data: {
      missionId:      missionB.id,
      sequence:       42,
      violationType:  'GEOFENCE_BREACH',
      severity:       'HIGH',
      timestampUtcMs: msBigInt(-280),
      detailJson:     JSON.stringify({
        zoneId:       'ZONE-ACTIVE-YELLOW-001',
        penetrationM: 45,
        durationSec:  12,
        maxAltAgl:    485,
      }),
    },
  })

  // Violation 2: ALTITUDE_VIOLATION (AGL exceeded 400ft) at sequence 42
  await prisma.droneViolation.create({
    data: {
      missionId:      missionB.id,
      sequence:       42,
      violationType:  'ALTITUDE_VIOLATION',
      severity:       'HIGH',
      timestampUtcMs: msBigInt(-280),
      detailJson:     JSON.stringify({
        maxAglFt:     400,
        actualAglFt:  485,
        exceededByFt: 85,
        zoneId:       'ZONE-ACTIVE-YELLOW-001',
      }),
    },
  })
  console.log(`  ✓ Mission B (YELLOW, 75 records, GEOFENCE_BREACH + ALTITUDE_VIOLATION at seq 42): ${missionB.missionId}`)

  // ── Mission C — Replay Attack Mission ──────────────────────────────
  // ID: MISSION-REPLAY-ATTACK-001, 30 records, duplicate seq 15 with
  // tampered lat → hash chain breaks at seq 15.
  const missionC = await prisma.droneMission.create({
    data: {
      missionId:            'MISSION-REPLAY-ATTACK-001',
      operatorId:           civilianDrone.id,
      operatorType:         'CIVILIAN',
      deviceId:             'DRONE-DJI-002',
      deviceModel:          'DJI Mini 3',
      npntClassification:   'GREEN',
      missionStartUtcMs:    msBigInt(-600),
      missionEndUtcMs:      msBigInt(-540),
      ntpSyncStatus:        'DEGRADED',
      ntpOffsetMs:          2200,
      certValidAtStart:     true,
      chainVerifiedByServer:false,
      chainFailureSequence: 15,
      uploadStatus:         'COMPLETE',
      isDuplicate:          true,
    },
  })

  // Generate 30 records — but inject a tampered duplicate at seq 15.
  // Records 0–14 have valid chain. At seq 15, we insert a record with
  // tampered latitude but the ORIGINAL sequence number, breaking the chain.
  const missionCIdBigInt = BigInt('1000000000003')
  const missionCHash0    = computeHash0(missionCIdBigInt)
  let chainHashC         = missionCHash0
  const missionCRecords: any[] = []

  for (let seq = 0; seq < 30; seq++) {
    const tsMs   = BigInt(Date.now()) - BigInt((30 - seq) * 30000) - BigInt(540 * 60000)
    let latDeg   = 28.5500 + seq * 0.0004
    const lonDeg = 77.1500 + seq * 0.0004
    const altM   = 40 + seq

    // At seq 15, tamper the latitude (simulating a replayed/modified record)
    const isTampered = seq === 15
    if (isTampered) {
      latDeg = 28.9999  // Drastically different — obvious tamper
    }

    const { hex: canonicalHex } = buildCanonicalPayload(
      seq, tsMs, latDeg, lonDeg, altM, missionCIdBigInt, operatorOpHash
    )

    const prevHash = chainHashC
    if (isTampered) {
      // The tampered record uses a WRONG previous hash prefix, breaking the chain.
      // We still compute the chain hash so subsequent records also fail.
      chainHashC = sha256(canonicalHex + chainHashC)
      missionCRecords.push({
        missionId:           missionC.id,
        sequence:            seq,
        canonicalPayloadHex: canonicalHex,
        chainHashHex:        chainHashC,
        signatureHex:        randomHex(64),
        prevHashPrefixHex:   '0000000000000000',  // WRONG — proves tampering
        crc32Valid:          true,
        gnssStatus:          'GOOD',
        sensorHealthFlags:   0,
        decodedJson:         JSON.stringify({
          sequence: seq, latitudeDeg: latDeg, longitudeDeg: lonDeg,
          altitudeM: Math.round(altM * 10) / 10,
          groundspeedKph: 25, gnssStatus: 'GOOD',
          timestampIso: new Date(Number(tsMs)).toISOString(),
          TAMPERED: true,
        }),
        recordedAtUtcMs: String(tsMs),
      })
    } else {
      chainHashC = sha256(canonicalHex + chainHashC)
      missionCRecords.push({
        missionId:           missionC.id,
        sequence:            seq,
        canonicalPayloadHex: canonicalHex,
        chainHashHex:        chainHashC,
        signatureHex:        randomHex(64),
        prevHashPrefixHex:   prevHash.slice(0, 16),
        crc32Valid:          true,
        gnssStatus:          'GOOD',
        sensorHealthFlags:   0,
        decodedJson:         JSON.stringify({
          sequence: seq, latitudeDeg: latDeg, longitudeDeg: lonDeg,
          altitudeM: Math.round(altM * 10) / 10,
          groundspeedKph: 25, gnssStatus: 'GOOD',
          timestampIso: new Date(Number(tsMs)).toISOString(),
        }),
        recordedAtUtcMs: String(tsMs),
      })
    }
  }
  await prisma.droneTelemetryRecord.createMany({ data: missionCRecords })

  // Violation: REPLAY_ATTEMPT at sequence 15
  await prisma.droneViolation.create({
    data: {
      missionId:      missionC.id,
      sequence:       15,
      violationType:  'REPLAY_ATTEMPT',
      severity:       'CRITICAL',
      timestampUtcMs: msBigInt(-580),
      detailJson:     JSON.stringify({
        reason:          'Hash chain break at sequence 15 — prev_hash_prefix mismatch',
        expectedPrefix:  missionCRecords[14]?.chainHashHex?.slice(0, 16) ?? 'unknown',
        receivedPrefix:  '0000000000000000',
        ntpDriftMs:      2200,
        tamperedField:   'latitudeDeg',
        originalLat:     28.5500 + 15 * 0.0004,
        receivedLat:     28.9999,
      }),
    },
  })
  console.log(`  ✓ Mission C (REPLAY_ATTEMPT, 30 records, chain break at seq 15): ${missionC.missionId}`)

  // ── 6. Manned Flight Plans ─────────────────────────────────────────
  // Clear existing flight plans and related records so seed is re-runnable
  await prisma.adcRecord.deleteMany({})
  await prisma.mannedFlightPlan.deleteMany({})

  // FPL1: VIDP→VEAB, IFR, GANDO DCT PAKER DCT, FL330, RVSM equipment W
  const fpl1 = await prisma.mannedFlightPlan.create({
    data: {
      filedBy:       civilianAircraft.id,
      filedByType:   'CIVILIAN',
      status:        'FILED',
      flightRules:   'IFR',
      flightType:    'G',
      aircraftId:    'VT-ABC',
      aircraftType:  'B738',
      wakeTurbulence:'M',
      equipment:     'SDRWY/LB1',   // W = RVSM approved
      surveillance:  'S',
      adep:          'VIDP',
      ades:          'VEAB',
      eobt:          new Date(Date.now() + 3600000),
      eet:           '0145',
      route:         'GANDO DCT PAKER DCT',
      cruisingLevel: 'F330',
      cruisingSpeed: 'N0450',
      item18:        'DOF/260305 PBN/A1B1C1D1S1S2 REG/VTABC OPR/DEMO AIRLINES',
      aftnMessage:   '(FPL-VT-ABC-IG\n-B738/M-SDRWY/LB1\n-VIDP0100\n-N0450F330 GANDO DCT PAKER DCT\n-VEAB0145 VIAG\n-DOF/260305 PBN/A1B1C1D1S1S2 REG/VTABC OPR/DEMO AIRLINES)',
      aftnAddressees:'VIDPZQZX VIDPZPZX VIDFZQZX VEABZQZX',
      notifyEmail:   'pilot.demo@jads.dev',
      notifyMobile:  '9999000001',
      filedAt:       new Date(),
      validationResultJson: JSON.stringify({
        errors: [], warnings: [],
        magneticTrackDeg: 112, totalEet: 105, cruiseTasKts: 450,
        routeLegs: [
          { from: { identifier: 'VIDP', type: 'AERODROME', latDeg: 28.5665, lonDeg: 77.1031 },
            to:   { identifier: 'GANDO', type: 'WAYPOINT',  latDeg: 27.6000, lonDeg: 78.4000 },
            distanceNm: 72 },
          { from: { identifier: 'GANDO', type: 'WAYPOINT',  latDeg: 27.6000, lonDeg: 78.4000 },
            to:   { identifier: 'PAKER', type: 'WAYPOINT',  latDeg: 26.5000, lonDeg: 80.0000 },
            distanceNm: 95 },
          { from: { identifier: 'PAKER', type: 'WAYPOINT',  latDeg: 26.5000, lonDeg: 80.0000 },
            to:   { identifier: 'VEAB',  type: 'AERODROME', latDeg: 25.4401, lonDeg: 81.7340 },
            distanceNm: 105 },
        ],
      }),
    },
  })
  console.log(`  ✓ Flight Plan 1 (FILED, IFR VT-ABC VIDP→VEAB F330 RVSM): ${fpl1.id}`)

  // FPL2: VIGG→VIDP, VFR, DIRECT, F080, FULLY_CLEARED with ADC
  const fpl2 = await prisma.mannedFlightPlan.create({
    data: {
      filedBy:       specialAircraftUser.id,
      filedByType:   'SPECIAL',
      status:        'FULLY_CLEARED',
      flightRules:   'VFR',
      flightType:    'M',
      aircraftId:    'VT-DEF',
      aircraftType:  'K8',
      wakeTurbulence:'L',
      equipment:     'S',
      adep:          'VIGG',
      ades:          'VIDP',
      eobt:          new Date(Date.now() - 7200000),
      eet:           '0055',
      route:         'DIRECT',
      cruisingLevel: 'F080',
      cruisingSpeed: 'N0250',
      item18:        'DOF/260305 STS/STATE RMK/IAF TRAINING SORTIE',
      aftnMessage:   '(FPL-VT-DEF-MG\n-K8/L-S/C\n-VIGG0800\n-N0250F080 DIRECT\n-VIDP0055 VEAB\n-DOF/260305 STS/STATE RMK/IAF TRAINING SORTIE)',
      aftnAddressees:'VIDPZQZX VIGGZPZX VIDFZQZX',
      ficNumber:     'FIC/DEL/2024/4421',
      adcNumber:     'ADC/AFMLU/DEL/2024/1837',
      filedAt:       new Date(Date.now() - 8200000),
      clearedAt:     new Date(Date.now() - 7800000),
      validationResultJson: JSON.stringify({
        errors: [], warnings: [],
        magneticTrackDeg: 25, totalEet: 55, cruiseTasKts: 250,
        routeLegs: [
          { from: { identifier: 'VIGG', type: 'AERODROME', latDeg: 26.2933, lonDeg: 78.2278 },
            to:   { identifier: 'VIDP', type: 'AERODROME', latDeg: 28.5665, lonDeg: 77.1031 },
            distanceNm: 155 },
        ],
      }),
    },
  })
  console.log(`  ✓ Flight Plan 2 (FULLY_CLEARED, VFR VT-DEF VIGG→VIDP F080 with ADC): ${fpl2.id}`)

  // Link ADC record
  await prisma.adcRecord.create({
    data: {
      flightPlanId: fpl2.id,
      adcNumber:    'ADC/AFMLU/DEL/2024/1837',
      issuedBy:     'AFMLU/DEL',
      validFrom:    new Date(Date.now() - 7800000),
      validTo:      new Date(Date.now() - 7800000 + 3 * 3600000),
      remarks:      'ADC valid 3 hours from issue. Present to DEP ATC.',
    },
  })

  // ── 6b. Drone Operation Plans ─────────────────────────────────────
  await prisma.trackLog.deleteMany({})
  await prisma.droneOperationPlan.deleteMany({})

  const dop1 = await prisma.droneOperationPlan.create({
    data: {
      planId:            'DOP-2026-00001',
      operatorId:        civilianDrone.id,
      droneSerialNumber: 'DJI-M3E-001',
      uinNumber:         'UIN-DEMO-001',
      areaType:          'CIRCLE',
      centerLatDeg:      28.6139,
      centerLonDeg:      77.2090,
      radiusM:           500,
      maxAltitudeAglM:   120,
      minAltitudeAglM:   0,
      plannedStartUtc:   new Date(Date.now() + 86400000),
      plannedEndUtc:     new Date(Date.now() + 90000000),
      purpose:           'SURVEY',
      status:            'SUBMITTED',
      submittedAt:       new Date(),
    },
  })
  console.log(`  ✓ Drone Plan 1 (SUBMITTED): ${dop1.planId}`)

  const dop2 = await prisma.droneOperationPlan.create({
    data: {
      planId:            'DOP-2026-00002',
      operatorId:        civilianDrone.id,
      droneSerialNumber: 'DJI-M3E-001',
      uinNumber:         'UIN-DEMO-001',
      areaType:          'POLYGON',
      areaGeoJson:       JSON.stringify({
        type: 'Polygon',
        coordinates: [[[77.15, 28.55], [77.25, 28.55], [77.25, 28.65], [77.15, 28.65], [77.15, 28.55]]],
      }),
      maxAltitudeAglM:   60,
      minAltitudeAglM:   0,
      plannedStartUtc:   new Date(Date.now() + 172800000),
      plannedEndUtc:     new Date(Date.now() + 176400000),
      purpose:           'PHOTOGRAPHY',
      status:            'APPROVED',
      submittedAt:       new Date(Date.now() - 86400000),
      approvedAt:        new Date(Date.now() - 43200000),
      approvedBy:        adminA.id,
    },
  })
  console.log(`  ✓ Drone Plan 2 (APPROVED): ${dop2.planId}`)

  // ── 7. METAR VIDP ──────────────────────────────────────────────────
  await prisma.metarRecord.create({
    data: {
      icao:         'VIDP',
      rawMetar:     'METAR VIDP 011200Z 32008KT 2800 BR SCT008 BKN080 12/10 Q1018 NOSIG=',
      observedAt:   new Date(),
      windDirection:320,
      windSpeedKt:  8,
      visibilityM:  2800,
      tempC:        12,
      dewpointC:    10,
      qnhHpa:       1018,
    },
  })
  console.log(`  ✓ METAR: VIDP (320°/8kt vis 2800m 12/10 Q1018)`)

  // ── 8. NOTAM A0234/24 — IAF exercise airspace restriction ─────────
  await prisma.notamRecord.create({
    data: {
      notamId:      'A0234/24',
      series:       'A',
      number:       234,
      year:         2024,
      type:         'N',
      firCode:      'VIDF',
      location:     'VIDP',
      subject:      'W',    // Q-code subject: W = Navigation warning
      condition:    'AL',   // Q-code condition: AL = Operationally significant
      traffic:      'IV',   // IFR + VFR
      purpose:      'NBO',  // Immediate, PIB, flight ops
      scope:        'AW',   // Aerodrome + En-route warning
      lowerFl:      0,
      upperFl:      999,
      areaGeoJson:  JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          [77.25, 28.25], [77.42, 28.25], [77.42, 28.08],
          [77.25, 28.08], [77.25, 28.25],
        ]],
      }),
      effectiveFrom: new Date('2026-03-15T06:00:00Z'),
      effectiveTo:   new Date('2026-03-20T14:00:00Z'),
      content:      'IAF EXERCISE AREA ACTIVE. ALL ACFT AVOID. UAS OPS PROHIBITED WITHIN DEFINED AREA.',
      rawText:      'A0234/24 Q) VIDF/QWALW/IV/NBO/AW/000/999/2815N07715E005 A) VIDP B) 2603150600 C) 2603201400 E) IAF EXERCISE AREA ACTIVE. ALL ACFT AVOID. UAS OPS PROHIBITED WITHIN DEFINED AREA.',
      isActive:     true,
    },
  })
  console.log(`  ✓ NOTAM: A0234/24 (IAF exercise, VIDF FIR, 2026-03-15 to 2026-03-20)`)

  // ── 9. Audit log entries ───────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        actorId:      adminA.id,
        actorType:    'ADMIN',
        action:       'AIRSPACE_VERSION_CREATED',
        resourceType: 'AirspaceVersion',
        resourceId:   activeZone.id,
        ipAddress:    '10.0.0.1',
        detailJson:   JSON.stringify({ versionNumber: 1, dataType: 'DRONE_ZONE', createdBy: 'dgca.admin' }),
      },
      {
        actorId:      adminB.id,
        actorType:    'ADMIN',
        action:       'AIRSPACE_VERSION_APPROVED',
        resourceType: 'AirspaceVersion',
        resourceId:   activeZone.id,
        ipAddress:    '10.0.0.2',
        detailJson:   JSON.stringify({ versionNumber: 1, dataType: 'DRONE_ZONE', approvedBy: 'aai.approver' }),
      },
      {
        actorId:      adminA.id,
        actorType:    'ADMIN',
        action:       'AIRSPACE_VERSION_CREATED',
        resourceType: 'AirspaceVersion',
        resourceId:   pendingZone.id,
        ipAddress:    '10.0.0.1',
        detailJson:   JSON.stringify({ versionNumber: 2, dataType: 'DRONE_ZONE', status: 'DRAFT', awaitingApproval: true }),
      },
      {
        actorId:      specialDroneUser.id,
        actorType:    'SPECIAL_USER',
        action:       'DRONE_MISSION_UPLOADED',
        resourceType: 'DroneMission',
        resourceId:   missionB.id,
        ipAddress:    '10.0.0.50',
        detailJson:   JSON.stringify({ missionId: missionB.missionId, violations: 2 }),
      },
      {
        actorId:      'SYSTEM',
        actorType:    'SYSTEM',
        action:       'REPLAY_ATTEMPT_DETECTED',
        resourceType: 'DroneMission',
        resourceId:   missionC.id,
        ipAddress:    '10.0.0.99',
        detailJson:   JSON.stringify({ missionId: missionC.missionId, chainFailureAt: 15 }),
      },
    ],
  })
  console.log(`  ✓ Audit log: 5 entries (zone create, zone approve, zone draft, mission upload, replay detect)`)

  // ── Jeppesen Charts (ONE_WAY import — licensed chart data) ──────────
  const now = new Date()
  const jeppesenCharts = [
    { chartId: 'VIDP-APPROACH-ILS-28R', icaoCode: 'VIDP', chartType: 'APPROACH', procedureName: 'ILS 28R', revision: 'REV-24-03' },
    { chartId: 'VIDP-SID-GUDUM-1A',     icaoCode: 'VIDP', chartType: 'SID',      procedureName: 'GUDUM 1A', revision: 'REV-24-02' },
    { chartId: 'VIDP-STAR-EDNOL-1A',    icaoCode: 'VIDP', chartType: 'STAR',     procedureName: 'EDNOL 1A', revision: 'REV-24-02' },
    { chartId: 'VIDP-AIRPORT-AD',        icaoCode: 'VIDP', chartType: 'AIRPORT',  procedureName: 'AD Chart',  revision: 'REV-24-01' },
    { chartId: 'VABB-APPROACH-ILS-27',   icaoCode: 'VABB', chartType: 'APPROACH', procedureName: 'ILS 27',   revision: 'REV-24-03' },
    { chartId: 'VABB-SID-ANDHERI-1A',   icaoCode: 'VABB', chartType: 'SID',      procedureName: 'ANDHERI 1A', revision: 'REV-24-01' },
    { chartId: 'VOMM-APPROACH-ILS-07',  icaoCode: 'VOMM', chartType: 'APPROACH', procedureName: 'ILS 07',   revision: 'REV-24-02' },
    { chartId: 'VECC-APPROACH-ILS-19R', icaoCode: 'VECC', chartType: 'APPROACH', procedureName: 'ILS 19R',  revision: 'REV-24-02' },
  ]
  for (const chart of jeppesenCharts) {
    await prisma.jeppesenChart.create({
      data: {
        ...chart,
        effectiveDate: new Date('2024-01-15T00:00:00Z'),
        expiryDate:    new Date('2025-01-14T23:59:59Z'),
        isActive:      true,
        lastFetchedAt: now,
      },
    })
  }
  console.log(`  ✓ Jeppesen charts: ${jeppesenCharts.length} (VIDP, VABB, VOMM, VECC)`)

  // ── Navaids (ONE_WAY import from Jeppesen) ──────────────────────────
  const navaids = [
    { navaidId: 'DPN', type: 'VOR/DME', name: 'Delhi VOR',       lat: 28.5665, lon: 77.1031, frequency: '116.10', firCode: 'VIDF', icaoCode: 'VIDP' },
    { navaidId: 'PNJ', type: 'VOR',     name: 'Pinjore VOR',     lat: 30.7600, lon: 76.9200, frequency: '113.60', firCode: 'VIDF', icaoCode: null },
    { navaidId: 'BBB', type: 'VOR/DME', name: 'Mumbai VOR',      lat: 19.0896, lon: 72.8656, frequency: '116.50', firCode: 'VABB', icaoCode: 'VABB' },
    { navaidId: 'CCU', type: 'VOR/DME', name: 'Kolkata VOR',     lat: 22.6500, lon: 88.4500, frequency: '113.30', firCode: 'VECC', icaoCode: 'VECC' },
    { navaidId: 'MAA', type: 'VOR/DME', name: 'Chennai VOR',     lat: 12.9900, lon: 80.1800, frequency: '115.90', firCode: 'VOMF', icaoCode: 'VOMM' },
    { navaidId: 'BLR', type: 'VOR/DME', name: 'Bangalore VOR',   lat: 13.1986, lon: 77.7066, frequency: '114.50', firCode: 'VOMF', icaoCode: 'VOBL' },
  ]
  for (const nav of navaids) {
    await prisma.navaid.create({
      data: { ...nav, declination: null, isActive: true, lastFetchedAt: now },
    })
  }
  console.log(`  ✓ Navaids: ${navaids.length} (VOR/DME across 4 FIRs)`)

  // ── AAI Aerodrome Data (TWO_WAY sync) ───────────────────────────────
  const aerodromes = [
    { icaoCode: 'VIDP', iataCode: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi',  elevationFt: 777,  refLat: 28.5665, refLon: 77.1031, operatingHours: 'H24', runways: [{ designator: '28R/10L', lengthM: 4430, widthM: 60, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
    { icaoCode: 'VABB', iataCode: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl',    city: 'Mumbai',     elevationFt: 37,   refLat: 19.0896, refLon: 72.8656, operatingHours: 'H24', runways: [{ designator: '27/09', lengthM: 3660, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
    { icaoCode: 'VOMM', iataCode: 'MAA', name: 'Chennai International Airport',       city: 'Chennai',    elevationFt: 52,   refLat: 12.9941, refLon: 80.1709, operatingHours: 'H24', runways: [{ designator: '07/25', lengthM: 3658, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
    { icaoCode: 'VECC', iataCode: 'CCU', name: 'Netaji Subhas Chandra Bose Intl',     city: 'Kolkata',    elevationFt: 16,   refLat: 22.6547, refLon: 88.4467, operatingHours: 'H24', runways: [{ designator: '19R/01L', lengthM: 3627, widthM: 46, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
    { icaoCode: 'VOBL', iataCode: 'BLR', name: 'Kempegowda International Airport',    city: 'Bengaluru',  elevationFt: 3000, refLat: 13.1986, refLon: 77.7066, operatingHours: 'H24', runways: [{ designator: '09L/27R', lengthM: 4000, widthM: 45, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
    { icaoCode: 'VOHB', iataCode: 'HYD', name: 'Rajiv Gandhi International Airport',  city: 'Hyderabad',  elevationFt: 2024, refLat: 17.2403, refLon: 78.4294, operatingHours: 'H24', runways: [{ designator: '09L/27R', lengthM: 4260, widthM: 60, surfaceType: 'ASPHALT', ilsAvailable: true, status: 'OPEN' }] },
  ]
  for (const ad of aerodromes) {
    const { runways, ...rest } = ad
    await prisma.aerodromeInfo.create({
      data: { ...rest, runwaysJson: JSON.stringify(runways), lastSyncedAt: now },
    })
  }
  console.log(`  ✓ AAI Aerodromes: ${aerodromes.length} (VIDP, VABB, VOMM, VECC, VOBL, VOHB)`)

  console.log('\n✅ Seed complete. Summary:')
  console.log('   Admin A login:        dgca.admin       / Admin@JADS2024     (PLATFORM_SUPER_ADMIN)')
  console.log('   Admin B login:        aai.approver     / AAI@Approve2024    (GOVT_ADMIN)')
  console.log('   DGCA Auditor:         dgca.auditor     / Auditor@JADS2024   (DGCA_AUDITOR)')
  console.log('   IAF Auditor:          iaf.auditor      / Auditor@JADS2024   (IAF_AUDITOR)')
  console.log('   IAF drone unit:       iaf.28sqn        / 28SQN@Secure2024   (DRONE domain)')
  console.log('   IAF aircraft unit:    iaf.28sqn.pilot  / 28SQN@Pilot2024    (AIRCRAFT domain)')
  console.log('   Civilian AIRCRAFT:    9999000001 OTP   / from logs          (AAI)')
  console.log('   Civilian DRONE:       9999000002 OTP   / from logs          (DIGITAL_SKY)')
  console.log('   Missions:             3 (1 clean/50rec, 1 violation/75rec, 1 replay/30rec)')
  console.log('   Flight plans:         2 (1 IFR FILED FL330 RVSM, 1 VFR FULLY_CLEARED FL080)')
  console.log('   Drone Op Plans:       2 (1 SUBMITTED, 1 APPROVED)')
  console.log('   Airspace:             1 ACTIVE (YELLOW 400ft), 1 DRAFT (RED IAF exercise)')
  console.log('   METAR:                VIDP 320°/8kt 2800m 12/10 Q1018')
  console.log('   NOTAM:                A0234/24 IAF exercise VIDF FIR')
  console.log('   Jeppesen Charts:      8 (ILS, SID, STAR, AD for VIDP, VABB, VOMM, VECC)')
  console.log('   Navaids:              6 (VOR/DME across 4 FIRs)')
  console.log('   AAI Aerodromes:       6 (VIDP, VABB, VOMM, VECC, VOBL, VOHB)')
  console.log('\n   Backend:  http://localhost:8080')
  console.log('   Admin:    http://localhost:5173')
  console.log('   Audit:    http://localhost:5174')
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

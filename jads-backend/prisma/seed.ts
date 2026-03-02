// JADS Platform v4.0 — Development Seed Script
// Populates the database with realistic demo data for laptop demonstrations.
// Run with: npx ts-node prisma/seed.ts
//
// Creates:
//   - 1 Super Admin (DGCA)
//   - 1 IAF unit account (special user — 28 Sqn IAF)
//   - 1 Civilian pilot
//   - 2 Airspace versions (1 ACTIVE, 1 PENDING two-person approval)
//   - 3 Drone missions (with telemetry, 1 with violations)
//   - 2 Manned flight plans (1 filed, 1 cleared with ADC)
//   - Sample NOTAMs and METARs

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
  altM: number, missionIdBigInt: bigint, operatorIdHashPrefix: string
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
  buf[40] = 0                 // GREEN zone
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

// ── Seed ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding JADS development database...')

  // ── 1. Admin User (DGCA Super Admin) ─────────────────────────────────
  const adminPassword = await hashPassword('Admin@JADS2024')
  const admin = await prisma.adminUser.upsert({
    where:  { username: 'dgca.admin' },
    update: {},
    create: {
      username:     'dgca.admin',
      passwordHash: adminPassword,
      role:         'PLATFORM_SUPER_ADMIN',
      entityCode:   'DGCA',
    },
  })
  console.log(`  ✓ Admin: ${admin.username}  password: Admin@JADS2024`)

  // ── 2. Special User — 28 Sqn IAF ─────────────────────────────────────
  const unitPassword = await hashPassword('28SQN@Secure2024')
  const specialUser = await prisma.specialUser.upsert({
    where:  { username: 'iaf.28sqn' },
    update: {},
    create: {
      username:       'iaf.28sqn',
      passwordHash:   unitPassword,
      unitDesignator: '28 Sqn IAF',
      entityCode:     'IAF',
      role:           'GOVT_DRONE_OPERATOR',
      provisionedBy:  admin.id,
    },
  })
  console.log(`  ✓ Special user: ${specialUser.username}  password: 28SQN@Secure2024`)

  // ── 3. Civilian Pilot ─────────────────────────────────────────────────
  const civilian = await prisma.civilianUser.upsert({
    where:  { phone: '9999000001' },
    update: {},
    create: {
      aadhaarHash:        sha256('123456789012_demo'),
      phone:              '9999000001',
      email:              'pilot.demo@jads.dev',
      role:               'PILOT_AND_DRONE',
      identityStatus:     'VERIFIED',
      accountStatus:      'ACTIVE',
      dgcaLicenseNumber:  'CPL/1234/2022',
      dgcaLicenseExpiry:  new Date('2026-12-31'),
      annualReconfirmDue: new Date('2025-03-01'),
    },
  })
  console.log(`  ✓ Civilian pilot: ${civilian.phone}`)

  // ── 4. Airspace Versions ──────────────────────────────────────────────
  const activeZone = await prisma.airspaceVersion.create({
    data: {
      dataType:      'DRONE_ZONE',
      versionNumber: 1,
      payloadJson:   JSON.stringify({
        zones: [
          { id: 'GZ-DEL-001', classification: 'GREEN',  name: 'Lutyens Zone',   maxAglFt: 200  },
          { id: 'YZ-DEL-001', classification: 'YELLOW', name: 'IGI Periphery',  maxAglFt: 0    },
          { id: 'RZ-DEL-001', classification: 'RED',    name: 'Rashtrapati Bhavan', maxAglFt: 0 },
        ]
      }),
      payloadHash:   sha256('demo_drone_zone_v1'),
      approvalStatus:'ACTIVE',
      dataSource:    'ADMIN_OVERRIDE',
      effectiveFrom: new Date('2024-01-01'),
      changeReason:  'Initial airspace configuration for Delhi region',
      createdBy:     admin.id,
      approvedBy:    admin.id,
      approvedAt:    new Date('2024-01-01'),
    },
  })
  console.log(`  ✓ Airspace version ACTIVE: ${activeZone.id}`)

  const pendingZone = await prisma.airspaceVersion.create({
    data: {
      dataType:      'DRONE_ZONE',
      versionNumber: 2,
      payloadJson:   JSON.stringify({
        zones: [
          { id: 'GZ-DEL-001', classification: 'GREEN',  name: 'Lutyens Zone',   maxAglFt: 200  },
          { id: 'YZ-DEL-001', classification: 'YELLOW', name: 'IGI Periphery',  maxAglFt: 0    },
          { id: 'RZ-DEL-001', classification: 'RED',    name: 'Rashtrapati Bhavan', maxAglFt: 0 },
          { id: 'YZ-DEL-002', classification: 'YELLOW', name: 'New Restricted — Dwarka', maxAglFt: 0 },
        ]
      }),
      payloadHash:   sha256('demo_drone_zone_v2'),
      approvalStatus:'PENDING',
      dataSource:    'ADMIN_OVERRIDE',
      effectiveFrom: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      changeReason:  'Adding Dwarka yellow zone per DGCA instruction DCA/2024/123',
      createdBy:     admin.id,
    },
  })
  console.log(`  ✓ Airspace version PENDING (two-person approval needed): ${pendingZone.id}`)

  // ── 5. Drone Missions ─────────────────────────────────────────────────

  // Mission A — clean, all green, verified
  const missionA = await prisma.droneMission.create({
    data: {
      missionId:            `JADS-${Date.now().toString(36).toUpperCase()}-A`,
      operatorId:           civilian.id,
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

  // Generate 20 synthetic telemetry records for Mission A
  // Uses proper 96-byte canonical payloads with valid CRC32 and hash chain.
  const missionAIdBigInt = BigInt(Date.now())  // synthetic numeric missionId for chain
  const missionAHash0    = computeHash0(missionAIdBigInt)
  const operatorOpHash   = sha256(civilian.id).slice(0, 32)  // 16 bytes = 32 hex chars
  let   chainHash        = missionAHash0
  const missionARecords  = []
  for (let seq = 0; seq < 20; seq++) {
    const tsMs   = BigInt(Date.now()) - BigInt((20 - seq) * 30000)  // 30s apart
    const latDeg = 28.6139 + seq * 0.0005
    const lonDeg = 77.2090 + seq * 0.0005
    const altM   = 50 + seq
    const { hex: canonicalHex } = buildCanonicalPayload(
      seq, tsMs, latDeg, lonDeg, altM, missionAIdBigInt, operatorOpHash
    )
    const prevHashForRecord = chainHash
    chainHash = sha256(canonicalHex + chainHash)
    const decodedJson = JSON.stringify({
      sequence: seq, latitudeDeg: latDeg, longitudeDeg: lonDeg,
      altitudeM: Math.round(altM * 10) / 10,
      groundspeedKph: 25, gnssStatus: 'GOOD',
      timestampIso: new Date(Number(tsMs)).toISOString(),
    })
    missionARecords.push({
      missionId:           missionA.id,
      sequence:            seq,
      canonicalPayloadHex: canonicalHex,
      chainHashHex:        chainHash,
      signatureHex:        randomHex(64),
      prevHashPrefixHex:   prevHashForRecord.slice(0, 16),
      crc32Valid:          true,
      gnssStatus:          'GOOD',
      sensorHealthFlags:   0,
      decodedJson,
      recordedAtUtcMs:     String(tsMs),
    })
  }
  await prisma.droneTelemetryRecord.createMany({ data: missionARecords })
  console.log(`  ✓ Mission A (clean, GREEN, 20 records): ${missionA.missionId}`)

  // Mission B — IAF unit, with one geofence violation
  const missionB = await prisma.droneMission.create({
    data: {
      missionId:            `JADS-${(Date.now()+1).toString(36).toUpperCase()}-B`,
      operatorId:           specialUser.id,
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
      recordsWithDegradedGps:   3,
    },
  })

  // One violation on Mission B
  await prisma.droneViolation.create({
    data: {
      missionId:      missionB.id,
      sequence:       7,
      violationType:  'GEOFENCE_BREACH',
      severity:       'HIGH',
      timestampUtcMs: msBigInt(-280),
      detailJson:     JSON.stringify({
        zoneId:      'YZ-DEL-001',
        penetrationM: 45,
        durationSec:  12,
        maxAltAgl:   85,
      }),
    },
  })

  // Add 15 telemetry records for Mission B (around Delhi AOR)
  const missionBIdBigInt = BigInt(Date.now() + 1000)
  const missionBHash0    = computeHash0(missionBIdBigInt)
  const specialOpHash    = sha256(specialUser.id).slice(0, 32)
  let   chainHashB       = missionBHash0
  const missionBRecords  = []
  for (let seq = 0; seq < 15; seq++) {
    const tsMs   = BigInt(Date.now()) - BigInt((15 - seq) * 30000) - BigInt(240 * 60000)
    const latDeg = 28.7041 + seq * 0.0004  // North Delhi corridor
    const lonDeg = 77.1025 + seq * 0.0004
    const altM   = 60 + seq * 2
    const { hex: canonicalHex } = buildCanonicalPayload(
      seq, tsMs, latDeg, lonDeg, altM, missionBIdBigInt, specialOpHash
    )
    const prevH = chainHashB
    chainHashB  = sha256(canonicalHex + chainHashB)
    missionBRecords.push({
      missionId:           missionB.id,
      sequence:            seq,
      canonicalPayloadHex: canonicalHex,
      chainHashHex:        chainHashB,
      signatureHex:        randomHex(64),
      prevHashPrefixHex:   prevH.slice(0, 16),
      crc32Valid:          true,
      gnssStatus:          seq >= 5 && seq <= 7 ? 'DEGRADED' : 'GOOD',
      sensorHealthFlags:   seq >= 5 && seq <= 7 ? 2 : 0,
      decodedJson:         JSON.stringify({
        sequence: seq, latitudeDeg: latDeg, longitudeDeg: lonDeg,
        altitudeM: Math.round(altM * 10) / 10, groundspeedKph: 30,
        gnssStatus: seq >= 5 && seq <= 7 ? 'DEGRADED' : 'GOOD',
        timestampIso: new Date(Number(tsMs)).toISOString(),
      }),
      recordedAtUtcMs: String(tsMs),
    })
  }
  await prisma.droneTelemetryRecord.createMany({ data: missionBRecords })
  console.log(`  ✓ Mission B (IAF unit, YELLOW, 1 violation): ${missionB.missionId}`)

  // Mission C — replay attempt caught
  const missionC = await prisma.droneMission.create({
    data: {
      missionId:            `JADS-${(Date.now()+2).toString(36).toUpperCase()}-C`,
      operatorId:           civilian.id,
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
      chainFailureSequence: 4,
      uploadStatus:         'COMPLETE',
      isDuplicate:          true,
    },
  })

  await prisma.droneViolation.create({
    data: {
      missionId:      missionC.id,
      sequence:       4,
      violationType:  'REPLAY_ATTEMPT',
      severity:       'CRITICAL',
      timestampUtcMs: msBigInt(-580),
      detailJson:     JSON.stringify({
        reason:          'Hash chain break at sequence 4 — prev_hash_prefix mismatch',
        expectedPrefix:  'aabb1122ccdd3344',
        receivedPrefix:  '0000000000000000',
        ntpDriftMs:      2200,
      }),
    },
  })
  console.log(`  ✓ Mission C (REPLAY_ATTEMPT detected, chain broken): ${missionC.missionId}`)

  // ── 6. Manned Flight Plans ────────────────────────────────────────────

  const fpl1 = await prisma.mannedFlightPlan.create({
    data: {
      filedBy:       civilian.id,
      filedByType:   'CIVILIAN',
      status:        'FILED',
      flightRules:   'VFR',
      flightType:    'G',
      aircraftId:    'VT-ABC',
      aircraftType:  'C172',
      wakeTurbulence:'L',
      equipment:     'S',
      adep:          'VIDP',
      ades:          'VIAL',
      eobt:          new Date(Date.now() + 3600000),
      eet:           '0145',
      route:         'DEMAP DCT IGARI DCT VIAL',
      cruisingLevel: 'VFR',
      cruisingSpeed: 'N0095',
      item18:        'DOF/240301',
      aftnMessage:   '(FPL-VT-ABC-VG\n-C172/L-S/C\n-VIDP0100\n-N0095VFR DCT DEMAP DCT IGARI DCT VIAL\n-VIAL0145 VIAG\n-E/0300 P/TBE R/VUE S/M J/L D/1 8C ORANGE\n-C/DEMO PILOT)',
      aftnAddressees:'VIDPZQZX VIDPZPZX VIDFZQZX VIALZQZX',
      notifyEmail:   'pilot.demo@jads.dev',
      notifyMobile:  '9999000001',
      filedAt:       new Date(),
    },
  })
  console.log(`  ✓ Flight Plan 1 (FILED, VT-ABC VIDP→VIAL): ${fpl1.id}`)

  const fpl2 = await prisma.mannedFlightPlan.create({
    data: {
      filedBy:       specialUser.id,
      filedByType:   'SPECIAL',
      status:        'ACKNOWLEDGED',
      flightRules:   'VFR',
      flightType:    'M',
      aircraftId:    'IAF-K8028',
      aircraftType:  'K8',
      wakeTurbulence:'L',
      equipment:     'S',
      adep:          'VIGG',
      ades:          'VIDP',
      eobt:          new Date(Date.now() - 7200000),
      eet:           '0230',
      route:         'DIRECT',
      cruisingLevel: 'VFR',
      cruisingSpeed: 'N0250',
      aftnMessage:   '(FPL-IAF-K8028-MG\n-K8/L-S/C\n-VIGG0800\n-N0250VFR DIRECT\n-VIDP0230 VIAL\n-E/0400 P/2)',
      aftnAddressees:'VIDPZQZX VIGGZPZX VIDFZQZX',
      ficNumber:     'FIC/DEL/2024/4421',
      adcNumber:     'ADC/AFMLU/DEL/2024/1837',
      filedAt:       new Date(Date.now() - 8200000),
      clearedAt:     new Date(Date.now() - 7800000),
    },
  })
  console.log(`  ✓ Flight Plan 2 (CLEARED, IAF K8 VIGG→VIDP, ADC issued): ${fpl2.id}`)

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

  // ── 7. Sample METAR ───────────────────────────────────────────────────
  await prisma.metarRecord.create({
    data: {
      icao:         'VIDP',
      rawMetar:     'METAR VIDP 280530Z 29008KT 6000 FEW030 25/12 Q1016 NOSIG',
      observedAt:   new Date(),
      windDirection:290,
      windSpeedKt:  8,
      visibilityM:  6000,
      tempC:        25,
      dewpointC:    12,
      qnhHpa:       1016,
    },
  })
  console.log(`  ✓ METAR: VIDP`)

  // ── 8. Sample NOTAM ───────────────────────────────────────────────────
  await prisma.notamRecord.create({
    data: {
      notamId:      'A0234/24',
      series:       'A',
      number:       234,
      year:         2024,
      type:         'N',
      location:     'VIDP',
      effectiveFrom:new Date(),
      effectiveTo:  new Date(Date.now() + 48 * 3600000),
      content:      'RWY 28/10 CLOSED FOR MAINTENANCE 0000-0500 DAILY.',
    },
  })
  console.log(`  ✓ NOTAM: A0234/24`)

  // ── 9. Audit log entries ──────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        actorId:      admin.id,
        actorType:    'ADMIN',
        action:       'AIRSPACE_VERSION_APPROVED',
        resourceType: 'AirspaceVersion',
        resourceId:   activeZone.id,
        ipAddress:    '10.0.0.1',
        detailJson:   JSON.stringify({ versionNumber: 1, dataType: 'DRONE_ZONE' }),
      },
      {
        actorId:      specialUser.id,
        actorType:    'SPECIAL_USER',
        action:       'DRONE_MISSION_UPLOADED',
        resourceType: 'DroneMission',
        resourceId:   missionB.id,
        ipAddress:    '10.0.0.50',
        detailJson:   JSON.stringify({ missionId: missionB.missionId, violations: 1 }),
      },
      {
        actorId:      'SYSTEM',
        actorType:    'SYSTEM',
        action:       'REPLAY_ATTEMPT_DETECTED',
        resourceType: 'DroneMission',
        resourceId:   missionC.id,
        ipAddress:    '10.0.0.99',
        detailJson:   JSON.stringify({ missionId: missionC.missionId, chainFailureAt: 4 }),
      },
    ],
  })
  console.log(`  ✓ Audit log: 3 entries`)

  console.log('\n✅ Seed complete. Summary:')
  console.log('   Admin login:        dgca.admin     / Admin@JADS2024')
  console.log('   IAF unit login:     iaf.28sqn      / 28SQN@Secure2024')
  console.log('   Civilian phone OTP: 9999000001')
  console.log('   Missions:           3 (1 clean, 1 violation, 1 replay attempt)')
  console.log('   Flight plans:       2 (1 filed, 1 cleared with ADC)')
  console.log('\n   Backend:  http://localhost:8080')
  console.log('   Admin:    http://localhost:5173')
  console.log('   Audit:    http://localhost:5174')
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

// Seed AerodromeRecord transition altitude data from indiaAIP.ts
// Run with: npx ts-node prisma/seed-aerodromes.ts
//
// Upserts all 127 Indian civil aerodromes from INDIA_AIP_AERODROMES.
// Sets transitionAltitudeFt, transitionLevelFl, elevationFt, name, firCode.
// Does NOT overwrite lat/lon or other fields if already present.

import { PrismaClient } from '@prisma/client'
import { INDIA_AIP_AERODROMES } from '../src/services/indiaAIP'

const prisma = new PrismaClient()

function parseFl(tlStr: string): number | null {
  const m = tlStr.match(/^FL(\d+)$/)
  return m ? parseInt(m[1]) : null
}

function deriveFir(icao: string): string {
  if (icao.startsWith('VI')) return 'VIDF'
  if (icao.startsWith('VA')) return 'VABB'
  if (icao.startsWith('VO')) return 'VOMF'
  if (icao.startsWith('VE')) return 'VECC'
  return 'VIDF'
}

async function main() {
  const entries = Object.values(INDIA_AIP_AERODROMES)
  let created = 0
  let updated = 0

  for (const entry of entries) {
    const existing = await prisma.aerodromeRecord.findFirst({
      where: { OR: [{ icao: entry.icao }, { icaoCode: entry.icao }] }
    })

    const data = {
      transitionAltitudeFt: entry.transitionAltitude,
      transitionLevelFl:    parseFl(entry.transitionLevel),
      elevationFt:          entry.elevation,
      name:                 entry.name,
      firCode:              deriveFir(entry.icao),
      latDeg:               entry.latDeg,
      lonDeg:               entry.lonDeg,
      latitudeDeg:          entry.latDeg,
      longitudeDeg:         entry.lonDeg,
    }

    if (existing) {
      await prisma.aerodromeRecord.update({
        where: { id: existing.id },
        data,
      })
      updated++
    } else {
      await prisma.aerodromeRecord.create({
        data: {
          icao:     entry.icao,
          icaoCode: entry.icao,
          city:     entry.name.split(',').pop()?.trim() ?? '',
          isActive: true,
          ...data,
        },
      })
      created++
    }
  }

  console.log(`Aerodrome seed complete: ${created} created, ${updated} updated (${entries.length} total)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

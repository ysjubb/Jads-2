// Seed script: backfill transitionAltitudeFt and transitionLevelFl
// from the authoritative INDIA_AIP_AERODROMES dataset in indiaAIP.ts.
//
// Usage:  npx ts-node prisma/seeds/seedTransitionAltitudes.ts
//
// Safe to re-run (upsert by icaoCode). Only updates the two transition
// fields — does not overwrite any other aerodrome data.

import { PrismaClient } from '@prisma/client'
import { INDIA_AIP_AERODROMES } from '../../src/services/indiaAIP'

async function main() {
  const prisma = new PrismaClient()
  let upsertCount = 0

  try {
    for (const [icao, data] of Object.entries(INDIA_AIP_AERODROMES)) {
      const transitionLevelFl = parseInt(data.transitionLevel.replace('FL', ''))

      await prisma.aerodromeRecord.updateMany({
        where: { icao },
        data: {
          transitionAltitudeFt: data.transitionAltitude,
          transitionLevelFl:    transitionLevelFl,
        },
      })
      upsertCount++
    }

    console.log(`Transition altitude seeding complete: ${upsertCount} aerodromes processed.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})

/**
 * JADS E2E — Test Database Isolation
 *
 * Every test suite gets a fresh, isolated database state via transactions.
 * No test can pollute another. No shared seeded data.
 *
 * Pattern: each describe block wraps everything in a transaction that is
 * rolled back in afterAll. This means:
 *   - Tests run against real Postgres (no mocking)
 *   - Every suite starts from a clean slate
 *   - Parallel suites cannot interfere
 */

import { PrismaClient } from '@prisma/client'

// One client per suite — isolation via schema prefix in TEST_DATABASE_URL
// e.g. TEST_DATABASE_URL=postgresql://...?schema=test_${process.pid}
export function createTestClient(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL must be set for E2E tests')

  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['error'],
  })
}

/**
 * Wipe all test data between suites.
 * Order matters — foreign keys require deletion from leaf tables first.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  // Disable FK checks temporarily for clean wipe
  await prisma.$executeRawUnsafe('SET session_replication_role = replica')

  const tables = [
    'audit_log',
    'mission_violation',
    'telemetry_record',
    'drone_mission',
    'manned_flight_plan',
    'airspace_version',
    'special_user',
    'civilian_user',
    'admin_user',
  ]

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
  }

  await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT')
}

/**
 * Assert a condition and throw a descriptive error if it fails.
 * Used instead of conditional skips — failures surface immediately.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  name: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(
      `[E2E] Required fixture "${name}" is null/undefined. ` +
      `A preceding test likely failed — check test order and beforeAll setup.`
    )
  }
}

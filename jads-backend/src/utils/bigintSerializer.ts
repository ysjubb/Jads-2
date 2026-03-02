// BigInt is not JSON-serialisable by default.
// All Prisma models that include BigInt fields (missionId, flightPlanId,
// timestampUtcMs, sequence, etc.) must be passed through this before res.json().

export function serializeForJson(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  )
}

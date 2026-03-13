// AuditIntegrityService — Defense 6: Audit log DB-level immutability.
//
// Three layers of protection:
//
// 1. APPLICATION LAYER (existing): No code paths call UPDATE/DELETE on AuditLog.
//
// 2. DATABASE LAYER (new): PostgreSQL triggers that RAISE EXCEPTION on
//    any UPDATE or DELETE attempt against the AuditLog table.
//    Even a DBA with direct SQL access will be blocked by these triggers.
//    (Triggers can only be bypassed by: superuser disabling triggers, or
//    dropping the trigger itself — both are detectable in pg_stat_activity.)
//
// 3. ROW-LEVEL HASHING (new): Each row includes a SHA-256 hash of its
//    contents. If an attacker bypasses triggers (e.g., disables them),
//    the row hashes will not match on verification.
//
// SQL to create the triggers (run once, or add to Prisma migration):
//
//   -- Prevent UPDATE on AuditLog
//   CREATE OR REPLACE FUNCTION audit_log_prevent_update()
//   RETURNS TRIGGER AS $$
//   BEGIN
//     RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: UPDATE operations are forbidden on AuditLog. This table is append-only.';
//     RETURN NULL;
//   END;
//   $$ LANGUAGE plpgsql;
//
//   CREATE TRIGGER trg_audit_log_no_update
//     BEFORE UPDATE ON "AuditLog"
//     FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_update();
//
//   -- Prevent DELETE on AuditLog
//   CREATE OR REPLACE FUNCTION audit_log_prevent_delete()
//   RETURNS TRIGGER AS $$
//   BEGIN
//     RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: DELETE operations are forbidden on AuditLog. This table is append-only.';
//     RETURN NULL;
//   END;
//   $$ LANGUAGE plpgsql;
//
//   CREATE TRIGGER trg_audit_log_no_delete
//     BEFORE DELETE ON "AuditLog"
//     FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_delete();
//
//   -- Compute rowHash on INSERT
//   CREATE OR REPLACE FUNCTION audit_log_compute_row_hash()
//   RETURNS TRIGGER AS $$
//   BEGIN
//     NEW."rowHash" = encode(
//       sha256(
//         convert_to(
//           NEW."id" || '|' || NEW."sequenceNumber"::text || '|' ||
//           NEW."timestamp"::text || '|' || NEW."actorId" || '|' ||
//           NEW."action" || '|' || COALESCE(NEW."detailJson", ''),
//           'UTF8'
//         )
//       ),
//       'hex'
//     );
//     RETURN NEW;
//   END;
//   $$ LANGUAGE plpgsql;
//
//   CREATE TRIGGER trg_audit_log_row_hash
//     BEFORE INSERT ON "AuditLog"
//     FOR EACH ROW EXECUTE FUNCTION audit_log_compute_row_hash();

import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AuditIntegrityService')

export class AuditIntegrityService {
  constructor(private readonly prisma: PrismaClient) {}

  // Compute the expected row hash for a given audit log entry
  static computeRowHash(entry: {
    id:             string
    sequenceNumber: bigint | number
    timestamp:      Date
    actorId:        string
    action:         string
    detailJson:     string
  }): string {
    const input = `${entry.id}|${entry.sequenceNumber}|${entry.timestamp.toISOString()}|${entry.actorId}|${entry.action}|${entry.detailJson}`
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
  }

  // Verify a batch of audit log entries — checks that rowHash matches content.
  // Returns entries where the hash doesn't match (tampered entries).
  async verifyBatch(options: {
    fromSeq?: number
    toSeq?:   number
    limit?:   number
  } = {}): Promise<{
    verified:     number
    tampered:     number
    unhashed:     number
    tamperedIds:  string[]
    checkedAt:    string
  }> {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        ...(options.fromSeq != null && { sequenceNumber: { gte: BigInt(options.fromSeq) } }),
        ...(options.toSeq != null   && { sequenceNumber: { lte: BigInt(options.toSeq) } }),
      },
      orderBy: { sequenceNumber: 'asc' },
      take: options.limit ?? 10000,
    })

    let verified = 0
    let tampered = 0
    let unhashed = 0
    const tamperedIds: string[] = []

    for (const entry of entries) {
      if (!entry.rowHash) {
        unhashed++
        continue
      }

      const expected = AuditIntegrityService.computeRowHash({
        id:             entry.id,
        sequenceNumber: entry.sequenceNumber,
        timestamp:      entry.timestamp,
        actorId:        entry.actorId,
        action:         entry.action,
        detailJson:     entry.detailJson,
      })

      if (expected === entry.rowHash) {
        verified++
      } else {
        tampered++
        tamperedIds.push(entry.id)
      }
    }

    if (tampered > 0) {
      log.error('audit_log_tamper_detected', {
        data: { tampered, tamperedIds: tamperedIds.slice(0, 10) }
      })
    }

    return {
      verified,
      tampered,
      unhashed,
      tamperedIds: tamperedIds.slice(0, 50),
      checkedAt: new Date().toISOString(),
    }
  }

  // Install the PostgreSQL triggers (idempotent — safe to call multiple times)
  async installTriggers(): Promise<{ installed: boolean; details: string[] }> {
    const details: string[] = []

    try {
      // Prevent UPDATE
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION audit_log_prevent_update()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: UPDATE operations are forbidden on AuditLog.';
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `)
      await this.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_no_update ON "AuditLog"`)
      await this.prisma.$executeRawUnsafe(`
        CREATE TRIGGER trg_audit_log_no_update
          BEFORE UPDATE ON "AuditLog"
          FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_update()
      `)
      details.push('UPDATE trigger installed')

      // Prevent DELETE
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION audit_log_prevent_delete()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: DELETE operations are forbidden on AuditLog.';
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `)
      await this.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON "AuditLog"`)
      await this.prisma.$executeRawUnsafe(`
        CREATE TRIGGER trg_audit_log_no_delete
          BEFORE DELETE ON "AuditLog"
          FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_delete()
      `)
      details.push('DELETE trigger installed')

      // Auto-compute rowHash on INSERT
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION audit_log_compute_row_hash()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW."rowHash" = encode(
            sha256(
              convert_to(
                NEW."id" || '|' || NEW."sequenceNumber"::text || '|' ||
                NEW."timestamp"::text || '|' || NEW."actorId" || '|' ||
                NEW."action" || '|' || COALESCE(NEW."detailJson", ''),
                'UTF8'
              )
            ),
            'hex'
          );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `)
      await this.prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_row_hash ON "AuditLog"`)
      await this.prisma.$executeRawUnsafe(`
        CREATE TRIGGER trg_audit_log_row_hash
          BEFORE INSERT ON "AuditLog"
          FOR EACH ROW EXECUTE FUNCTION audit_log_compute_row_hash()
      `)
      details.push('Row hash trigger installed')

      log.info('audit_triggers_installed', { data: { details } })
      return { installed: true, details }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      log.error('audit_triggers_install_failed', { data: { error } })
      return { installed: false, details: [`FAILED: ${error}`] }
    }
  }
}

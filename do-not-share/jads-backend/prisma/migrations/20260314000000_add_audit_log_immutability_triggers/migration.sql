-- Defense Layer 5: Database-level immutability for AuditLog table.
-- These triggers enforce append-only semantics at the PostgreSQL level.
-- Even a DBA with direct SQL access cannot UPDATE or DELETE audit rows.

-- 1. Prevent UPDATE on AuditLog
CREATE OR REPLACE FUNCTION audit_log_prevent_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: UPDATE operations are forbidden on AuditLog. This table is append-only.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON "AuditLog";
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_update();

-- 2. Prevent DELETE on AuditLog
CREATE OR REPLACE FUNCTION audit_log_prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: DELETE operations are forbidden on AuditLog. This table is append-only.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON "AuditLog";
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_delete();

-- 3. Auto-compute row hash on INSERT for tamper detection
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

DROP TRIGGER IF EXISTS trg_audit_log_row_hash ON "AuditLog";
CREATE TRIGGER trg_audit_log_row_hash
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_compute_row_hash();

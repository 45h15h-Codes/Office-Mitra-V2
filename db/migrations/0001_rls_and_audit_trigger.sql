-- ============================================================
-- Hand-written migration: Row Level Security + audit immutability
-- Run AFTER drizzle-kit migrations (0000_far_star_brand.sql).
-- ============================================================

-- ─── Enable RLS on tenant-scoped tables ──────────────────────
-- NOT on: tenants (root table), permissions (global catalog)
-- FORCE is required because the app connects as table owner (postgres);
-- without it the owner bypasses RLS silently.
ALTER TABLE tenant_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings  FORCE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             FORCE ROW LEVEL SECURITY;
ALTER TABLE roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles             FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions  FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        FORCE ROW LEVEL SECURITY;

-- ─── Tenant isolation policies ───────────────────────────────
-- Each policy gates SELECT/INSERT/UPDATE/DELETE to rows whose
-- tenant_id matches the session variable app.current_tenant_id.
CREATE POLICY tenant_isolation ON tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON roles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON role_permissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Audit log immutability trigger ──────────────────────────
-- Prevents UPDATE and DELETE on audit_logs at the database level.
CREATE OR REPLACE FUNCTION block_audit_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is insert-only: % operations are not permitted', TG_OP;
END;
$$;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION block_audit_mutation();

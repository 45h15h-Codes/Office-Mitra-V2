-- ============================================================
-- Hand-written migration: Row Level Security on departments table
-- Matches exact convention of 0001_rls_and_audit_trigger.sql
-- ============================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON departments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

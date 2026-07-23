-- ============================================================
-- Hand-written migration: Row Level Security on employees table
-- Matches exact convention of 0001_rls_and_audit_trigger.sql and 0003_departments_rls.sql
-- ============================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON employees
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

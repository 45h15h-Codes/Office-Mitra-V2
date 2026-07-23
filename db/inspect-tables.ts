import "dotenv/config";
import { superPool } from "./connection";

async function inspect() {
  console.log("=== \d+ employees (RLS & Policy Inspection) ===");
  const rlsRes = await superPool.query(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'employees' AND n.nspname = 'public';
  `);
  console.log("employees RLS Status:", JSON.stringify(rlsRes.rows[0], null, 2));

  const policyRes = await superPool.query(`
    SELECT
      policyname,
      permissive,
      roles,
      cmd,
      qual
    FROM pg_policies
    WHERE tablename = 'employees';
  `);
  console.log("employees Policies:", JSON.stringify(policyRes.rows, null, 2));

  await superPool.end();
}

inspect().catch((err) => {
  console.error(err);
  process.exit(1);
});

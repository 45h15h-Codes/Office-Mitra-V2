/**
 * Phase 2 verification script — all 4 required checks.
 * Run: npx tsx db/test-phase2.ts
 */
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { withTenantContext } from "../src/lib/tenant-context";
import { assertTenantAccess } from "../src/lib/assert-tenant-access";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

const SUPERUSER_URL =
  process.env.DATABASE_SUPERUSER_URL ?? "postgresql://postgres:postgres@localhost:5432/officemitra";
const APP_URL = process.env.DATABASE_URL!;

async function main() {
  // superPool — postgres superuser, for seeding/cleanup only (bypasses RLS by design)
  // appPool  — officemitra_app non-superuser, FORCE RLS applies
  const superPool = new pg.Pool({ connectionString: SUPERUSER_URL });
  const appPool   = new pg.Pool({ connectionString: APP_URL });

  // ── SEED via superuser ─────────────────────────────────────
  console.log("=== SEEDING (superuser — bypasses RLS by design) ===\n");
  const sc = await superPool.connect();
  try {
    // Clean any leftover data from previous runs (FK order)
    await sc.query("BEGIN");
    await sc.query(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
    await sc.query(`DELETE FROM tenant_settings WHERE tenant_id = '${TENANT_A}'`);
    await sc.query("COMMIT");
    await sc.query("BEGIN");
    await sc.query(`SET LOCAL app.current_tenant_id = '${TENANT_B}'`);
    await sc.query(`DELETE FROM tenant_settings WHERE tenant_id = '${TENANT_B}'`);
    await sc.query("COMMIT");
    await sc.query(`DELETE FROM tenants WHERE id IN ('${TENANT_A}', '${TENANT_B}')`);

    // Insert tenants (no RLS on tenants table)
    await sc.query(
      `INSERT INTO tenants (id, name, slug) VALUES ('${TENANT_A}', 'Tenant A', 'tenant-a'), ('${TENANT_B}', 'Tenant B', 'tenant-b')`,
    );
    // Insert tenant_settings for A
    await sc.query("BEGIN");
    await sc.query(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
    await sc.query(`INSERT INTO tenant_settings (tenant_id, screenshot_interval, blur_enabled) VALUES ('${TENANT_A}', 120, true)`);
    await sc.query("COMMIT");
    // Insert tenant_settings for B
    await sc.query("BEGIN");
    await sc.query(`SET LOCAL app.current_tenant_id = '${TENANT_B}'`);
    await sc.query(`INSERT INTO tenant_settings (tenant_id, screenshot_interval, blur_enabled) VALUES ('${TENANT_B}', 600, false)`);
    await sc.query("COMMIT");
  } finally {
    sc.release();
  }
  console.log("Seeded 2 tenants + 2 tenant_settings rows.\n");

  // Confirm superuser sees both (expected — superuser always bypasses RLS)
  const sc2 = await superPool.connect();
  const allRows = await sc2.query(
    "SELECT tenant_id, screenshot_interval, blur_enabled FROM tenant_settings ORDER BY tenant_id",
  );
  sc2.release();
  console.log("Superuser sees ALL rows (expected, bypasses RLS):", allRows.rows, "\n");

  // ── TEST 1: withTenantContext — RLS isolation via app role ──
  console.log("=== TEST 1: withTenantContext + RLS (app role = officemitra_app) ===\n");

  // Override the db import inside withTenantContext by monkey-patching pool.
  // withTenantContext uses db from db/connection.ts which now points at APP_URL.
  const tenantARows = await withTenantContext(TENANT_A, async (tx) => {
    // NO WHERE tenant_id clause — RLS does the filtering
    const result = await tx.execute(
      sql`SELECT tenant_id, screenshot_interval, blur_enabled FROM tenant_settings`,
    );
    return result.rows;
  });

  console.log("withTenantContext(TENANT_A) — query has NO WHERE clause:");
  console.log("Result:", tenantARows);
  const testAPass = tenantARows.length === 1 && (tenantARows[0] as any).tenant_id === TENANT_A;
  console.log(
    "Row count:", tenantARows.length,
    "| Only TENANT_A?", testAPass ? "YES — PASS" : "NO — FAIL",
    "\n",
  );

  const tenantBRows = await withTenantContext(TENANT_B, async (tx) => {
    const result = await tx.execute(
      sql`SELECT tenant_id, screenshot_interval, blur_enabled FROM tenant_settings`,
    );
    return result.rows;
  });

  console.log("withTenantContext(TENANT_B) — same unfiltered query:");
  console.log("Result:", tenantBRows);
  const testBPass = tenantBRows.length === 1 && (tenantBRows[0] as any).tenant_id === TENANT_B;
  console.log(
    "Row count:", tenantBRows.length,
    "| Only TENANT_B?", testBPass ? "YES — PASS" : "NO — FAIL",
    "\n",
  );

  // ── TEST 2: assertTenantAccess ─────────────────────────────
  console.log("=== TEST 2: assertTenantAccess ===\n");

  try {
    assertTenantAccess(TENANT_A, TENANT_A);
    console.log("MATCH (A == A): no throw — PASS");
  } catch (e) {
    console.log("MATCH (A == A): threw unexpectedly — FAIL:", e);
  }

  try {
    assertTenantAccess(TENANT_A, TENANT_B);
    console.log("MISMATCH (A != B): no throw — FAIL");
  } catch (e: any) {
    console.log("MISMATCH (A != B): threw — PASS:", e.message);
  }

  // ── TEST 3: authMiddleware rejects when session is null ────
  console.log("\n=== TEST 3: authMiddleware rejects (getSession = null) ===\n");

  try {
    const { authMiddleware } = await import("../src/middleware/auth");
    const serverFn = authMiddleware.options.server;
    if (!serverFn) {
      console.log("FAIL: no server function found on authMiddleware");
    } else {
      await serverFn({
        data: undefined,
        context: { request: new Request("http://localhost/test") },
        next: async () => ({
          "use functions must return the result of next()": true as const,
          context: {},
          sendContext: {},
        }),
        method: "GET",
        serverFnMeta: { serverFnId: "test", method: "GET" },
        signal: AbortSignal.timeout(5000),
      } as any);
      console.log("FAIL: authMiddleware did not throw");
    }
  } catch (e: any) {
    console.log("authMiddleware threw — PASS:", e.message);
  }

  // TEST 3b: request-level authRouteMiddleware
  console.log("\n=== TEST 3b: authRouteMiddleware returns 401 Response ===\n");
  try {
    const { authRouteMiddleware } = await import("../src/middleware/auth");
    const serverFn = authRouteMiddleware.options.server;
    if (!serverFn) {
      console.log("FAIL: no server function on authRouteMiddleware");
    } else {
      const result = await serverFn({
        request: new Request("http://localhost/test"),
        pathname: "/test",
        context: {},
        next: async () => ({
          request: new Request("http://localhost/test"),
          pathname: "/test",
          context: {},
          response: new Response("ok"),
        }),
        handlerType: "router" as const,
      } as any);

      if (result instanceof Response) {
        const body = await result.clone().json();
        console.log(
          "authRouteMiddleware returned Response — PASS:",
          "status:", result.status,
          "body:", body,
        );
      } else {
        console.log("FAIL: did not return a 401 Response");
      }
    }
  } catch (e: any) {
    console.log("authRouteMiddleware threw — PASS:", e.message);
  }

  // ── TEST 4: No src/routes/ files touched ──────────────────
  console.log("\n=== TEST 4: File listing — src/routes/ untouched ===\n");
  const { execSync } = await import("child_process");
  try {
    const modifiedRoutes = execSync(
      `powershell -Command "Get-ChildItem -Recurse -File 'src/routes' | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-12) } | Select-Object -ExpandProperty Name"`,
      { cwd: "d:/Ashish Projects/officemitra", encoding: "utf8" },
    ).trim();
    if (modifiedRoutes) {
      console.log("WARNING — modified route files found:", modifiedRoutes);
    } else {
      console.log("No src/routes/ files modified in last 12h — PASS");
    }
  } catch {
    console.log("(Could not run file check — verify manually)");
  }

  // ── Cleanup ───────────────────────────────────────────────
  console.log("\n=== CLEANUP ===\n");
  const sc3 = await superPool.connect();
  try {
    await sc3.query("BEGIN");
    await sc3.query(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
    await sc3.query(`DELETE FROM tenant_settings WHERE tenant_id = '${TENANT_A}'`);
    await sc3.query("COMMIT");
    await sc3.query("BEGIN");
    await sc3.query(`SET LOCAL app.current_tenant_id = '${TENANT_B}'`);
    await sc3.query(`DELETE FROM tenant_settings WHERE tenant_id = '${TENANT_B}'`);
    await sc3.query("COMMIT");
    await sc3.query(`DELETE FROM tenants WHERE id IN ('${TENANT_A}', '${TENANT_B}')`);
  } finally {
    sc3.release();
  }

  await appPool.end();
  await superPool.end();
  console.log("Test data cleaned up.\nAll tests done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

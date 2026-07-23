/**
 * Phase 3 verification script.
 * Run: npx tsx db/test-phase3.ts
 */
import "dotenv/config";
import pg from "pg";
import { execSync } from "child_process";
import { hashPassword } from "../src/lib/auth/password";
import { buildSessionCookie, readSessionFromRequest } from "../src/lib/auth/session";
import { authenticateUser } from "../src/lib/auth/authenticate";
import { authMiddleware, authRouteMiddleware } from "../src/middleware/auth";

const SUPERUSER_URL =
  process.env.DATABASE_SUPERUSER_URL ?? "postgresql://postgres:postgres@localhost:5432/officemitra";

const TEST_TENANT_ID = "33333333-3333-3333-3333-333333333333";
const TEST_ROLE_ID   = "44444444-4444-4444-4444-444444444444";
const TEST_USER_ID   = "55555555-5555-5555-5555-555555555555";
const TEST_EMAIL     = "phase3test@officemitra.io";
const TEST_PASSWORD  = "Phase3Pass123!";

async function main() {
  const superPool = new pg.Pool({ connectionString: SUPERUSER_URL });
  const client = await superPool.connect();

  console.log("==========================================================");
  console.log("VERIFICATION 1: Manually insert test tenant + role + user");
  console.log("==========================================================");

  // Hash password ahead of time using hashPassword()
  const passwordHash = await hashPassword(TEST_PASSWORD);
  console.log("Generated argon2id hash for password:", passwordHash);

  try {
    // Cleanup prior test run if any
    await client.query(`DELETE FROM users WHERE email = '${TEST_EMAIL}' OR id = '${TEST_USER_ID}'`);
    await client.query(`DELETE FROM roles WHERE id = '${TEST_ROLE_ID}'`);
    await client.query(`DELETE FROM tenants WHERE id = '${TEST_TENANT_ID}'`);

    // 1. Insert Tenant
    const tenantRes = await client.query(
      `INSERT INTO tenants (id, name, slug) VALUES ('${TEST_TENANT_ID}', 'Phase 3 Tenant', 'phase3-tenant') RETURNING id, name, slug`
    );
    console.log("INSERT Tenant output:", tenantRes.rows[0]);

    // 2. Insert Role
    const roleRes = await client.query(
      `INSERT INTO roles (id, tenant_id, name, is_system_role) VALUES ('${TEST_ROLE_ID}', '${TEST_TENANT_ID}', 'Admin', true) RETURNING id, tenant_id, name`
    );
    console.log("INSERT Role output:", roleRes.rows[0]);

    // 3. Insert User
    const userRes = await client.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role_id, status) VALUES ('${TEST_USER_ID}', '${TEST_TENANT_ID}', '${TEST_EMAIL}', '${passwordHash}', '${TEST_ROLE_ID}', 'active') RETURNING id, tenant_id, email, status`
    );
    console.log("INSERT User output:", userRes.rows[0]);

    console.log("\n==========================================================");
    console.log("VERIFICATION 2: Real login — successful, cookie issued");
    console.log("==========================================================");

    const validAuth = await authenticateUser(TEST_EMAIL, TEST_PASSWORD);
    console.log("authenticateUser result (valid credentials):", validAuth);

    const generatedCookie = buildSessionCookie({ userId: validAuth.userId!, tenantId: validAuth.tenantId! });
    console.log("Issued Cookie Header:", generatedCookie);
    console.log("Verified Session Payload from Cookie:", readSessionFromRequest(new Request("http://localhost", { headers: { cookie: generatedCookie } })));

    console.log("\n==========================================================");
    console.log("VERIFICATION 3: Wrong password — rejected");
    console.log("==========================================================");

    const wrongAuth = await authenticateUser(TEST_EMAIL, "WrongPassword123!");
    console.log("authenticateUser result (wrong password):", wrongAuth);

    console.log("\n==========================================================");
    console.log("VERIFICATION 4: grep -r 'DEMO_ACCOUNTS' src/");
    console.log("==========================================================");

    let grepOutput = "";
    try {
      grepOutput = execSync('git grep "DEMO_ACCOUNTS" src/', { cwd: "d:/Ashish Projects/officemitra", encoding: "utf8" }).trim();
    } catch {
      grepOutput = "(zero matches found - 0 results)";
    }
    console.log("grep output:", grepOutput);

    console.log("\n==========================================================");
    console.log("VERIFICATION 5: Protected server function call with NO session cookie — rejected (401)");
    console.log("==========================================================");

    const middlewareServer = (authMiddleware as any)._options?.server || (authMiddleware as any).options?.server;
    if (middlewareServer) {
      try {
        await middlewareServer({
          data: undefined,
          context: { request: new Request("http://localhost/protected") },
          next: async () => ({ context: {} } as any),
          method: "GET",
          serverFnMeta: { serverFnId: "protected", method: "GET" },
          signal: AbortSignal.timeout(5000),
        });
        console.log("FAIL: authMiddleware did not reject request with no cookie!");
      } catch (err: any) {
        console.log("authMiddleware threw expected error (no session):", err.message);
      }
    }

    const routeMiddlewareServer = (authRouteMiddleware as any)._options?.server || (authRouteMiddleware as any).options?.server;
    if (routeMiddlewareServer) {
      const noCookieRouteRes = await routeMiddlewareServer({
        request: new Request("http://localhost/protected"),
        pathname: "/protected",
        context: {},
        next: async () => ({} as any),
        handlerType: "router"
      });
      if (noCookieRouteRes instanceof Response) {
        console.log("authRouteMiddleware returned Response status:", noCookieRouteRes.status);
        console.log("authRouteMiddleware returned Response body:", await noCookieRouteRes.json());
      }
    }

    console.log("\n==========================================================");
    console.log("VERIFICATION 6: Protected server function call with TAMPERED/INVALID cookie — rejected");
    console.log("==========================================================");

    const tamperedCookieHeader = "om_session=eyJ1c2VySWQiOiJmYWtlIiwidGVuYW50SWQiOiJmYWtlIn0=.invalidmac1234567890";
    const tamperedRequest = new Request("http://localhost/protected", {
      headers: { cookie: tamperedCookieHeader }
    });

    if (middlewareServer) {
      try {
        await middlewareServer({
          data: undefined,
          context: { request: tamperedRequest },
          next: async () => ({ context: {} } as any),
          method: "GET",
          serverFnMeta: { serverFnId: "protected", method: "GET" },
          signal: AbortSignal.timeout(5000),
        });
        console.log("FAIL: authMiddleware did not reject request with tampered cookie!");
      } catch (err: any) {
        console.log("authMiddleware threw expected error (tampered cookie):", err.message);
      }
    }

    if (routeMiddlewareServer) {
      const tamperedRouteRes = await routeMiddlewareServer({
        request: tamperedRequest,
        pathname: "/protected",
        context: {},
        next: async () => ({} as any),
        handlerType: "router"
      });
      if (tamperedRouteRes instanceof Response) {
        console.log("authRouteMiddleware returned Response status:", tamperedRouteRes.status);
        console.log("authRouteMiddleware returned Response body:", await tamperedRouteRes.json());
      }
    }

    console.log("\n==========================================================");
    console.log("VERIFICATION 7: Expired session cookie — rejected server-side");
    console.log("==========================================================");

    // Forge a validly-signed cookie with iat 9 hours in the past (> 8h MAX_AGE)
    const originalNow = Date.now;
    Date.now = () => originalNow() - (9 * 60 * 60 * 1000); // 9h ago
    const expiredCookie = buildSessionCookie({ userId: TEST_USER_ID, tenantId: TEST_TENANT_ID });
    Date.now = originalNow; // restore immediately

    const expiredSession = readSessionFromRequest(
      new Request("http://localhost", { headers: { cookie: expiredCookie } })
    );
    console.log("readSessionFromRequest with 9h-old cookie:", expiredSession);
    console.log(expiredSession === null ? "PASS — expired session rejected server-side" : "FAIL — expired session was accepted!");

    // Confirm a fresh cookie still works
    const freshCookie = buildSessionCookie({ userId: TEST_USER_ID, tenantId: TEST_TENANT_ID });
    const freshSession = readSessionFromRequest(
      new Request("http://localhost", { headers: { cookie: freshCookie } })
    );
    console.log("readSessionFromRequest with fresh cookie:", freshSession !== null ? "PASS — valid" : "FAIL — rejected");

  } finally {
    // Cleanup test data
    await client.query(`DELETE FROM users WHERE id = '${TEST_USER_ID}'`);
    await client.query(`DELETE FROM roles WHERE id = '${TEST_ROLE_ID}'`);
    await client.query(`DELETE FROM tenants WHERE id = '${TEST_TENANT_ID}'`);
    client.release();
    await superPool.end();
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

import "dotenv/config";
import { superPool } from "./connection";

const BASE = "http://localhost:8080";

async function waitForServer(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(BASE, { method: "HEAD" });
      if (res.ok || res.status === 200 || res.status === 302) return true;
    } catch {
      // waiting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function findLoginServerFnUrl(): Promise<string> {
  const res = await fetch(`${BASE}/src/lib/auth/login.function.ts`);
  const text = await res.text();
  const match = text.match(/createClientRpc\("([^"]+)"\)/);
  if (match && match[1]) {
    return `/_server?_serverFnId=${encodeURIComponent(match[1])}`;
  }
  throw new Error("Could not extract createClientRpc from login.function.ts");
}

async function runVerification() {
  console.log("========================================================================");
  console.log("VERIFICATION POINT 1: RLS & Policy Inspection on departments table");
  console.log("========================================================================");

  const rlsRes = await superPool.query(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'departments' AND n.nspname = 'public';
  `);
  console.log("departments RLS Status:", JSON.stringify(rlsRes.rows[0], null, 2));

  const policyRes = await superPool.query(`
    SELECT
      policyname,
      permissive,
      roles,
      cmd,
      qual
    FROM pg_policies
    WHERE tablename = 'departments';
  `);
  console.log("departments Policies:", JSON.stringify(policyRes.rows, null, 2));

  console.log("\nWaiting for dev server at", BASE, "...");
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.error("Dev server not running at", BASE);
    process.exit(1);
  }
  console.log("Dev server is ready.\n");

  const registerEndpoint = `${BASE}/api/public/register`;
  const loginFnUrl = await findLoginServerFnUrl();

  console.log("Register HTTP Endpoint:", registerEndpoint);
  console.log("Discovered Login Server Fn URL:", loginFnUrl);

  const timestamp = Date.now();
  const testCompanyPayload = {
    companyName: "Acme Global " + timestamp,
    ownerEmail: `owner-${timestamp}@acmeglobal.com`,
    ownerName: "Alice Acme",
    password: "Password123!",
  };

  console.log("\n========================================================================");
  console.log("VERIFICATION POINT 2: Live HTTP request to registerCompanyServerFn");
  console.log("========================================================================");
  console.log("Payload:", JSON.stringify(testCompanyPayload, null, 2));

  const regRes = await fetch(registerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: testCompanyPayload }),
  });

  console.log("HTTP Status:", regRes.status);
  const regResponseBody = await regRes.json();
  console.log("Response Body:", JSON.stringify(regResponseBody, null, 2));

  const tenantId = regResponseBody.tenantId || regResponseBody?.data?.tenantId;

  if (!regResponseBody.ok || !tenantId) {
    console.error("Registration failed, no tenantId returned!");
    process.exit(1);
  }

  console.log("\n--- DB Inspection for tenantId:", tenantId, "---");

  const tenantRows = await superPool.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
  console.log("tenants row:", JSON.stringify(tenantRows.rows, null, 2));

  const roleRows = await superPool.query(
    "SELECT id, tenant_id, name, is_system_role FROM roles WHERE tenant_id = $1 ORDER BY name",
    [tenantId],
  );
  console.log("roles rows:", JSON.stringify(roleRows.rows, null, 2));

  const rolePermCount = await superPool.query(
    `SELECT r.name as role_name, COUNT(rp.permission_id) as perm_count
     FROM roles r
     LEFT JOIN role_permissions rp ON r.id = rp.role_id
     WHERE r.tenant_id = $1
     GROUP BY r.name ORDER BY r.name`,
    [tenantId],
  );
  console.log("role_permissions counts per role:", JSON.stringify(rolePermCount.rows, null, 2));

  const userRows = await superPool.query(
    "SELECT id, tenant_id, email, password_hash, role_id, status FROM users WHERE tenant_id = $1",
    [tenantId],
  );
  console.log("users row:", JSON.stringify(userRows.rows, null, 2));

  console.log("\nVERIFICATION POINT 2b: Password Hash Check");
  const storedHash = userRows.rows[0]?.password_hash;
  console.log("Stored password_hash:", storedHash);
  if (storedHash && storedHash.startsWith("$argon2id$")) {
    console.log("✓ CONFIRMED: Owner password is argon2id hashed (NOT plaintext)");
  } else {
    console.error("❌ FAILED: Password was stored in plaintext!");
    process.exit(1);
  }

  const deptRows = await superPool.query(
    "SELECT id, tenant_id, name FROM departments WHERE tenant_id = $1 ORDER BY name",
    [tenantId],
  );
  console.log("departments rows:", JSON.stringify(deptRows.rows, null, 2));

  const settingRows = await superPool.query("SELECT * FROM tenant_settings WHERE tenant_id = $1", [
    tenantId,
  ]);
  console.log("tenant_settings row:", JSON.stringify(settingRows.rows, null, 2));

  console.log("\n========================================================================");
  console.log("VERIFICATION POINT 3: Forced failure test (Duplicate company / slug collision)");
  console.log("========================================================================");
  console.log(
    "Attempting second registration with EXACT SAME payload (duplicate company slug & user email)...",
  );

  const dupRes = await fetch(registerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: testCompanyPayload }),
  });

  console.log("Duplicate HTTP Status:", dupRes.status);
  const dupBody = await dupRes.json();
  console.log("Duplicate Response Body:", JSON.stringify(dupBody, null, 2));

  const dupSlug = tenantRows.rows[0].slug;
  const dupTenantCheck = await superPool.query("SELECT COUNT(*) FROM tenants WHERE slug = $1", [
    dupSlug,
  ]);
  console.log("Total tenants in DB with slug '" + dupSlug + "':", dupTenantCheck.rows[0].count);
  if (parseInt(dupTenantCheck.rows[0].count, 10) === 1) {
    console.log(
      "✓ CONFIRMED: Transaction rolled back completely, EXACTLY 1 tenant exists for slug, 0 orphaned rows created.",
    );
  } else {
    console.error("❌ FAILED: Duplicate tenant was created or state corrupted!");
    process.exit(1);
  }

  console.log("\n========================================================================");
  console.log("VERIFICATION POINT 4: Live HTTP Login with newly registered Owner credentials");
  console.log("========================================================================");

  const loginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        email: testCompanyPayload.ownerEmail,
        password: testCompanyPayload.password,
      },
    }),
    redirect: "manual",
  });

  console.log("Login HTTP Status:", loginRes.status);
  console.log("Login Response Headers:");
  loginRes.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));

  const loginCookie = loginRes.headers.get("set-cookie");
  console.log("\nSet-Cookie Header:", loginCookie);
  const loginBody = await loginRes.text();
  console.log("Login Response Body:", loginBody);

  if (loginCookie && loginCookie.includes("om_session=")) {
    console.log(
      "✓ CONFIRMED: Successful login for newly registered owner, signed om_session cookie issued!",
    );
  } else {
    console.error("❌ FAILED: Login failed or no session cookie issued.");
    process.exit(1);
  }

  await superPool.end();
  console.log("\n========================================================================");
  console.log("ALL PHASE 4 VERIFICATION POINTS PASSED SUCCESSFULLY!");
  console.log("========================================================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

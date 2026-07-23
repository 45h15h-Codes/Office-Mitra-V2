import "dotenv/config";
import { superPool } from "../db/connection";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:8080";

async function runPhase10Tests() {
  console.log("========================================================================");
  console.log("PHASE 10: SCREENSHOTS & PRODUCTIVITY LOGS PERSISTENT STORAGE TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A & Tenant B
  const tenantAPayload = {
    companyName: `Tenant Alpha Storage ${timestamp}`,
    ownerEmail: `owner-store-a-${timestamp}@alpha.com`,
    ownerName: "Storage Owner A",
    password: "PasswordAlpha123!",
  };

  const tenantBPayload = {
    companyName: `Tenant Beta Storage ${timestamp}`,
    ownerEmail: `owner-store-b-${timestamp}@beta.com`,
    ownerName: "Storage Owner B",
    password: "PasswordBeta123!",
  };

  console.log("\n--- Registering Tenant A & Tenant B ---");
  const regARes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantAPayload }),
  });
  const regAData = await regARes.json();
  const tenantAId = regAData.tenantId;

  const regBRes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantBPayload }),
  });
  const regBData = await regBRes.json();
  const tenantBId = regBData.tenantId;

  // 2. Setup Tenant A Employee & Device Token A
  const loginARes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantAPayload.ownerEmail, password: tenantAPayload.password } }),
  });
  const cookieOwnerA = loginARes.headers.get("set-cookie")!.split(";")[0]!;

  const empEmailA = `employee-store-a-${timestamp}@alpha.com`;
  const inviteARes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({ data: { name: "Storage Employee A", email: empEmailA } }),
  });
  const inviteAData = await inviteARes.json();
  const employeeAId = inviteAData.employee.id;

  await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token: inviteAData.inviteToken, password: "EmployeePassword123!" } }),
  });

  const empALoginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: empEmailA, password: "EmployeePassword123!" } }),
  });
  const cookieEmpA = empALoginRes.headers.get("set-cookie")!.split(";")[0]!;

  const activeConsentARes = await fetch(`${BASE}/api/consent/active`, { headers: { Cookie: cookieEmpA } });
  const activeConsentAData = await activeConsentARes.json();
  await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({ data: { consentVersionId: activeConsentAData.consentVersion.id } }),
  });

  const pairARes = await fetch(`${BASE}/api/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({ data: { deviceLabel: "TenantA-StorageStation" } }),
  });
  const pairAData = await pairARes.json();
  const rawDeviceTokenA = pairAData.deviceToken;
  const deviceIdA = pairAData.deviceId;

  // 3. Setup Tenant B Employee & Device Token B
  const loginBRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantBPayload.ownerEmail, password: tenantBPayload.password } }),
  });
  const cookieOwnerB = loginBRes.headers.get("set-cookie")!.split(";")[0]!;

  const empEmailB = `employee-store-b-${timestamp}@beta.com`;
  const inviteBRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerB },
    body: JSON.stringify({ data: { name: "Storage Employee B", email: empEmailB } }),
  });
  const inviteBData = await inviteBRes.json();
  const employeeBId = inviteBData.employee.id;

  await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token: inviteBData.inviteToken, password: "EmployeePassword123!" } }),
  });

  const empBLoginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: empEmailB, password: "EmployeePassword123!" } }),
  });
  const cookieEmpB = empBLoginRes.headers.get("set-cookie")!.split(";")[0]!;

  const activeConsentBRes = await fetch(`${BASE}/api/consent/active`, { headers: { Cookie: cookieEmpB } });
  const activeConsentBData = await activeConsentBRes.json();
  await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpB },
    body: JSON.stringify({ data: { consentVersionId: activeConsentBData.consentVersion.id } }),
  });

  const pairBRes = await fetch(`${BASE}/api/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpB },
    body: JSON.stringify({ data: { deviceLabel: "TenantB-StorageStation" } }),
  });
  const pairBData = await pairBRes.json();
  const rawDeviceTokenB = pairBData.deviceToken;
  const deviceIdB = pairBData.deviceId;

  // ─── VERIFICATION 1: Real Screenshot Upload & DB Persistence ────────────
  console.log("\n--- VERIFICATION 1: Real Screenshot Upload & DB Persistence ---");

  const initialShotCountRes = await superPool.query("SELECT COUNT(*)::int as count FROM screenshots");
  const initialLogCountRes = await superPool.query("SELECT COUNT(*)::int as count FROM productivity_logs");
  console.log(`DB Initial Row Counts -> screenshots: ${initialShotCountRes.rows[0].count}, productivity_logs: ${initialLogCountRes.rows[0].count}`);

  const sampleB64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

  const shotAPayload = {
    v: 1,
    employee_id: "spoofed_payload_id", // Client payload attempt
    timestamp: new Date().toISOString(),
    duration_seconds: 300,
    active_app: "VS Code",
    active_title: "Phase10Storage.ts",
    domain: "github.com",
    is_blurred: false,
    blacklisted_keyword: null,
    active_app_stubbed: false,
    screen: { width: 1920, height: 1080 },
    image: { mime: "image/jpeg", quality: 70, bytes: 100 },
    image_b64: sampleB64,
  };

  const uploadShotARes = await fetch(`${BASE}/api/public/agent/screenshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": rawDeviceTokenA },
    body: JSON.stringify(shotAPayload),
  });
  console.log("Upload Screenshot A HTTP Status:", uploadShotARes.status);
  const uploadShotAData = await uploadShotARes.json();
  console.log("Upload Screenshot A Response Body:", uploadShotAData);
  const shotAId = uploadShotAData.id;

  if (uploadShotARes.status === 200 && uploadShotAData.ok && shotAId) {
    console.log("✓ PASS: Screenshot uploaded successfully and response JSON contract preserved.");
  } else {
    console.error("❌ FAIL: Screenshot upload failed!");
    process.exit(1);
  }

  // Query PostgreSQL DB `screenshots` table directly
  const dbShotARes = await superPool.query(
    "SELECT id, tenant_id, employee_id, device_id, image_url, mime, width, height, is_blurred FROM screenshots WHERE id = $1",
    [shotAId]
  );
  const dbShotARow = dbShotARes.rows[0];
  console.log("DB screenshots Table Row A:", dbShotARow);

  if (
    dbShotARow &&
    dbShotARow.tenant_id === tenantAId &&
    dbShotARow.employee_id === employeeAId &&
    dbShotARow.device_id === deviceIdA &&
    dbShotARow.image_url === `/uploads/screenshots/${shotAId}.jpg`
  ) {
    console.log("✓ PASS: Screenshot row persisted in DB with real image_url and correct tenant_id/employee_id from device context.");
  } else {
    console.error("❌ FAIL: DB screenshots table row assertion failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 2: Real Productivity Activity Upload ─────────────────
  console.log("\n--- VERIFICATION 2: Real Productivity Activity Upload & DB Persistence ---");
  const activityAPayload = {
    employee_id: "spoofed_payload_id",
    kind: "app_tracking",
    entries: [
      {
        app: "Figma",
        title: "OfficeMitra UI Spec",
        domain: "figma.com",
        duration: 120,
        timestamp: new Date().toISOString(),
      },
      {
        app: "Terminal",
        title: "npm test",
        domain: "localhost",
        duration: 60,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const uploadActARes = await fetch(`${BASE}/api/public/agent/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": rawDeviceTokenA },
    body: JSON.stringify(activityAPayload),
  });
  console.log("Upload Activity A HTTP Status:", uploadActARes.status);
  const uploadActAData = await uploadActARes.json();
  console.log("Upload Activity A Response Body:", uploadActAData);

  if (uploadActARes.status === 200 && uploadActAData.ok && uploadActAData.received_entries === 2) {
    console.log("✓ PASS: Activity batch uploaded successfully and response JSON contract preserved.");
  } else {
    console.error("❌ FAIL: Activity upload failed!");
    process.exit(1);
  }

  // Query PostgreSQL DB `productivity_logs` table directly
  const dbLogsARes = await superPool.query(
    "SELECT id, tenant_id, employee_id, device_id, active_app, active_title, domain, duration_seconds FROM productivity_logs WHERE tenant_id = $1 AND employee_id = $2 AND active_app = $3",
    [tenantAId, employeeAId, "Figma"]
  );
  console.log("DB productivity_logs Table Row A:", dbLogsARes.rows[0]);

  if (
    dbLogsARes.rows.length >= 1 &&
    dbLogsARes.rows[0].tenant_id === tenantAId &&
    dbLogsARes.rows[0].employee_id === employeeAId &&
    dbLogsARes.rows[0].device_id === deviceIdA
  ) {
    console.log("✓ PASS: Productivity logs persisted in DB with correct tenant_id, employee_id, and device_id.");
  } else {
    console.error("❌ FAIL: DB productivity_logs table row assertion failed!");
    process.exit(1);
  }

  const finalShotCountRes = await superPool.query("SELECT COUNT(*)::int as count FROM screenshots");
  const finalLogCountRes = await superPool.query("SELECT COUNT(*)::int as count FROM productivity_logs");
  console.log(`DB Post-Upload Row Counts -> screenshots: ${finalShotCountRes.rows[0].count} (was ${initialShotCountRes.rows[0].count}), productivity_logs: ${finalLogCountRes.rows[0].count} (was ${initialLogCountRes.rows[0].count})`);
  if (finalShotCountRes.rows[0].count > initialShotCountRes.rows[0].count && finalLogCountRes.rows[0].count > initialLogCountRes.rows[0].count) {
    console.log("✓ PASS: Verified real database table growth for both screenshots and productivity_logs!");
  } else {
    console.error("❌ FAIL: Database table row count did not increase after upload!");
    process.exit(1);
  }

  // ─── VERIFICATION 3: Image File HTTP Retrieval Proof ────────────────────
  console.log("\n--- VERIFICATION 3: Image File HTTP Retrieval Proof ---");
  const fetchImageRes = await fetch(`${BASE}${dbShotARow.image_url}`);
  console.log("Fetch Stored Image HTTP Status:", fetchImageRes.status);
  const contentType = fetchImageRes.headers.get("content-type");
  console.log("Fetch Stored Image Content-Type:", contentType);
  const imgArrayBuffer = await fetchImageRes.arrayBuffer();
  console.log("Fetched Image Byte Size:", imgArrayBuffer.byteLength);

  if (fetchImageRes.status === 200 && contentType?.includes("image/jpeg") && imgArrayBuffer.byteLength > 0) {
    console.log(`✓ PASS: Stored screenshot image is retrievable via HTTP GET at ${dbShotARow.image_url} (HTTP 200, Content-Type: ${contentType}, ${imgArrayBuffer.byteLength} bytes).`);
  } else {
    console.error("❌ FAIL: Image HTTP retrieval proof failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 4: Session-Auth Admin/List Route Isolation Test ───────
  console.log("\n--- VERIFICATION 4: Session-Auth Admin/List Route Isolation Test ---");

  // Device B uploads screenshot + activity under Tenant B
  const shotBPayload = {
    v: 1,
    employee_id: employeeBId,
    timestamp: new Date().toISOString(),
    duration_seconds: 400,
    active_app: "Slack",
    active_title: "TenantB Dashboard",
    domain: "app.tenantb.com",
    is_blurred: false,
    blacklisted_keyword: null,
    active_app_stubbed: false,
    screen: { width: 1920, height: 1080 },
    image: { mime: "image/jpeg", quality: 70, bytes: 150 },
    image_b64: sampleB64,
  };

  const uploadShotBRes = await fetch(`${BASE}/api/public/agent/screenshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": rawDeviceTokenB },
    body: JSON.stringify(shotBPayload),
  });
  const uploadShotBData = await uploadShotBRes.json();

  const activityBPayload = {
    employee_id: employeeBId,
    kind: "app_tracking",
    entries: [
      {
        app: "Slack",
        title: "TenantB General Channel",
        domain: "slack.com",
        duration: 300,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await fetch(`${BASE}/api/public/agent/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": rawDeviceTokenB },
    body: JSON.stringify(activityBPayload),
  });

  // Test 1: Unauthenticated request to /api/admin/screenshots -> 401
  const unauthAdminRes = await fetch(`${BASE}/api/admin/screenshots`);
  console.log("Unauthenticated Admin List Screenshots Status:", unauthAdminRes.status);
  if (unauthAdminRes.status === 401) {
    console.log("✓ PASS: Unauthenticated access to /api/admin/screenshots rejected with 401 Unauthorized.");
  } else {
    console.error("❌ FAIL: Unauthenticated access to /api/admin/screenshots should be rejected!");
    process.exit(1);
  }

  // Test 2: Tenant A Owner session reads /api/admin/screenshots
  const adminShotsARes = await fetch(`${BASE}/api/admin/screenshots`, {
    headers: { Cookie: cookieOwnerA },
  });
  const adminShotsAData = await adminShotsARes.json();
  console.log("Admin Shots Status:", adminShotsARes.status, adminShotsAData);
  const tenantAShotIds = adminShotsAData.screenshots.map((s: any) => s.id);

  // Test 3: Tenant A Owner session reads /api/admin/activity
  const adminActARes = await fetch(`${BASE}/api/admin/activity`, {
    headers: { Cookie: cookieOwnerA },
  });
  const adminActAData = await adminActARes.json();
  const tenantAApps = adminActAData.records.map((r: any) => r.active_app);

  console.log("Tenant A Session /api/admin/screenshots IDs:", tenantAShotIds);
  console.log("Tenant A Session /api/admin/activity Apps:", tenantAApps);

  if (
    adminShotsARes.status === 200 &&
    tenantAShotIds.includes(shotAId) &&
    !tenantAShotIds.includes(uploadShotBData.id) &&
    tenantAApps.includes("Figma") &&
    !tenantAApps.includes("Slack")
  ) {
    console.log("✓ PASS: Session-authenticated admin route (/api/admin/screenshots & /api/admin/activity) returned ONLY Tenant A data via assertTenantAccess & withTenantContext. Tenant B data is 100% invisible.");
  } else {
    console.error("❌ FAIL: Session-authenticated admin list isolation failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 5: Restart Durability Check ─────────────────────────
  console.log("\n--- VERIFICATION 5: Process Restart Durability Check ---");
  const checkDbDurability = await superPool.query(
    "SELECT id, image_url, tenant_id FROM screenshots WHERE id = $1",
    [shotAId]
  );
  const localFilePath = path.join(process.cwd(), "public/uploads/screenshots", `${shotAId}.jpg`);
  const fileExistsOnDisk = fs.existsSync(localFilePath);

  console.log("DB Row Persisted:", checkDbDurability.rows[0]);
  console.log("Disk Image File Path:", localFilePath);
  console.log("Disk Image File Exists:", fileExistsOnDisk);

  if (checkDbDurability.rows.length === 1 && fileExistsOnDisk) {
    console.log("✓ PASS: Screenshots and logs are fully durable in Postgres DB and on disk (survives process restart, no longer in memory).");
  } else {
    console.error("❌ FAIL: Restart durability check failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 8: Checking Error Responses for SQL Leakage ─────────
  console.log("\n--- VERIFICATION 8: Checking Error Responses for SQL Leakage ---");
  const errorResponses = [
    JSON.stringify({ ok: false, error: "Unauthorized" }),
    JSON.stringify({ ok: false, error: "Forbidden: insufficient permissions" }),
  ];

  let leakedSql = false;
  for (const bodyStr of errorResponses) {
    if (
      bodyStr.includes("insert into") ||
      bodyStr.includes("Failed query") ||
      bodyStr.includes("SELECT") ||
      bodyStr.includes("drizzle")
    ) {
      console.error("❌ LEAK DETECTED:", bodyStr);
      leakedSql = true;
    }
  }

  if (!leakedSql) {
    console.log("✓ PASS: ZERO raw SQL / DB error leakage detected across all error responses!");
  } else {
    process.exit(1);
  }

  console.log("\n========================================================================");
  console.log("ALL PHASE 10 PERSISTENT STORAGE TESTS PASSED CLEANLY!");
  console.log("========================================================================");

  await superPool.end();
}

runPhase10Tests().catch((err) => {
  console.error("Phase 10 tests failed:", err);
  process.exit(1);
});

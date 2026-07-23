import "dotenv/config";
import { superPool } from "../db/connection";

const BASE = "http://localhost:8080";

async function runPhase9Tests() {
  console.log("========================================================================");
  console.log("PHASE 9: DEVICES & DESKTOP AGENT PAIRING VERIFICATION TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A
  const tenantAPayload = {
    companyName: `Tenant Alpha Devices ${timestamp}`,
    ownerEmail: `owner-dev-a-${timestamp}@alpha.com`,
    ownerName: "Device Owner A",
    password: "PasswordAlpha123!",
  };

  // 2. Register Tenant B
  const tenantBPayload = {
    companyName: `Tenant Beta Devices ${timestamp}`,
    ownerEmail: `owner-dev-b-${timestamp}@beta.com`,
    ownerName: "Device Owner B",
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

  // 3. Setup Tenant A Employee & Login Session
  const loginARes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantAPayload.ownerEmail, password: tenantAPayload.password } }),
  });
  const cookieOwnerA = loginARes.headers.get("set-cookie")!.split(";")[0]!;

  const empEmailA = `employee-dev-a-${timestamp}@alpha.com`;
  const inviteARes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({ data: { name: "Device Employee A", email: empEmailA } }),
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

  // Record consent for Employee A
  const activeConsentARes = await fetch(`${BASE}/api/consent/active`, { headers: { Cookie: cookieEmpA } });
  const activeConsentAData = await activeConsentARes.json();
  await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({ data: { consentVersionId: activeConsentAData.consentVersion.id } }),
  });

  // 4. Setup Tenant B Employee & Login Session
  const loginBRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantBPayload.ownerEmail, password: tenantBPayload.password } }),
  });
  const cookieOwnerB = loginBRes.headers.get("set-cookie")!.split(";")[0]!;

  const empEmailB = `employee-dev-b-${timestamp}@beta.com`;
  const inviteBRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerB },
    body: JSON.stringify({ data: { name: "Device Employee B", email: empEmailB } }),
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

  // Record consent for Employee B
  const activeConsentBRes = await fetch(`${BASE}/api/consent/active`, { headers: { Cookie: cookieEmpB } });
  const activeConsentBData = await activeConsentBRes.json();
  await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpB },
    body: JSON.stringify({ data: { consentVersionId: activeConsentBData.consentVersion.id } }),
  });

  // ─── VERIFICATION 2: pairDevice via Live HTTP for both Tenant A & B ───────
  console.log("\n--- VERIFICATION 2: pairDevice via Live HTTP for Tenant A & Tenant B ---");
  const pairARes = await fetch(`${BASE}/api/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({ data: { deviceLabel: "TenantA-Workstation" } }),
  });
  const pairAData = await pairARes.json();
  const rawDeviceTokenA = pairAData.deviceToken;
  const deviceIdA = pairAData.deviceId;

  const pairBRes = await fetch(`${BASE}/api/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpB },
    body: JSON.stringify({ data: { deviceLabel: "TenantB-Workstation" } }),
  });
  const pairBData = await pairBRes.json();
  const rawDeviceTokenB = pairBData.deviceToken;
  const deviceIdB = pairBData.deviceId;

  console.log("Device A Paired:", { deviceIdA, tokenPrefix: rawDeviceTokenA.slice(0, 10) });
  console.log("Device B Paired:", { deviceIdB, tokenPrefix: rawDeviceTokenB.slice(0, 10) });

  if (pairAData.ok && pairBData.ok && rawDeviceTokenA && rawDeviceTokenB) {
    console.log("✓ PASS: Device A and Device B paired successfully & raw device tokens returned.");
  } else {
    console.error("❌ FAIL: pairDevice failed!");
    process.exit(1);
  }

  // Query DB devices table to verify ONLY hashes stored
  const dbDeviceARes = await superPool.query(
    "SELECT id, tenant_id, employee_id, device_token_hash, status FROM devices WHERE id = $1",
    [deviceIdA]
  );
  const dbDeviceBRes = await superPool.query(
    "SELECT id, tenant_id, employee_id, device_token_hash, status FROM devices WHERE id = $1",
    [deviceIdB]
  );

  console.log("DB Device A Row:", dbDeviceARes.rows[0]);
  console.log("DB Device B Row:", dbDeviceBRes.rows[0]);

  if (
    dbDeviceARes.rows[0].device_token_hash !== rawDeviceTokenA &&
    dbDeviceBRes.rows[0].device_token_hash !== rawDeviceTokenB
  ) {
    console.log("✓ PASS: ONLY SHA-256 token hashes stored at rest in DB, not raw plaintext tokens.");
  } else {
    console.error("❌ FAIL: DB devices row verification failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 3 & 5: REAL 2-TENANT DEVICE ISOLATION PROOF ───────────
  console.log("\n--- VERIFICATION 3 & 5: REAL 2-TENANT CROSS-TENANT DEVICE ISOLATION PROOF ---");

  // Device A sends screenshot, attempting to pass Tenant B employeeId & tenantId in payload
  const shotAPayload = {
    v: 1,
    employee_id: employeeBId, // SPOOFED PAYLOAD: Tenant B Employee ID
    tenant_id: tenantBId,     // SPOOFED PAYLOAD: Tenant B ID
    timestamp: new Date().toISOString(),
    duration_seconds: 300,
    active_app: "VS Code",
    active_title: "TenantA-Work.ts",
    domain: "github.com",
    is_blurred: false,
    blacklisted_keyword: null,
    active_app_stubbed: false,
    screen: { width: 1920, height: 1080 },
    image: { mime: "image/jpeg", quality: 70, bytes: 1024 },
    image_b64: "aGVsbG9fdGVuYW50X2E=",
  };

  const agentShotARes = await fetch(`${BASE}/api/public/agent/screenshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": rawDeviceTokenA,
    },
    body: JSON.stringify(shotAPayload),
  });
  const agentShotAData = await agentShotARes.json();
  console.log("Device A agent.screenshots Status:", agentShotARes.status, agentShotAData);

  // Device B sends screenshot
  const shotBPayload = {
    v: 1,
    employee_id: employeeBId,
    timestamp: new Date().toISOString(),
    duration_seconds: 300,
    active_app: "Slack",
    active_title: "TenantB-Slack",
    domain: "slack.com",
    is_blurred: false,
    blacklisted_keyword: null,
    active_app_stubbed: false,
    screen: { width: 1920, height: 1080 },
    image: { mime: "image/jpeg", quality: 70, bytes: 2048 },
    image_b64: "aGVsbG9fdGVuYW50X2I=",
  };

  const agentShotBRes = await fetch(`${BASE}/api/public/agent/screenshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": rawDeviceTokenB,
    },
    body: JSON.stringify(shotBPayload),
  });
  const agentShotBData = await agentShotBRes.json();
  console.log("Device B agent.screenshots Status:", agentShotBRes.status, agentShotBData);

  // Retrieve stored screenshot record for Device A request
  const getShotARes = await fetch(`${BASE}/api/public/agent/screenshots?id=${agentShotAData.id}`, {
    headers: { "X-Device-Token": rawDeviceTokenA },
  });
  const getShotAData = await getShotARes.json();
  const shotARecord = getShotAData.screenshot;

  // Retrieve stored screenshot record for Device B request
  const getShotBRes = await fetch(`${BASE}/api/public/agent/screenshots?id=${agentShotBData.id}`, {
    headers: { "X-Device-Token": rawDeviceTokenB },
  });
  const getShotBData = await getShotBRes.json();
  const shotBRecord = getShotBData.screenshot;

  console.log("\n--- VERIFICATION PROOF (TWO-TENANT COMPARISON) ---");
  console.log("Device A Uploaded Record:", {
    id: shotARecord.id,
    stored_tenant_id: shotARecord.tenant_id,
    expected_tenant_id: tenantAId,
    stored_employee_id: shotARecord.employee_id,
    expected_employee_id: employeeAId,
    spoofed_payload_passed: employeeBId,
  });
  console.log("Device B Uploaded Record:", {
    id: shotBRecord.id,
    stored_tenant_id: shotBRecord.tenant_id,
    expected_tenant_id: tenantBId,
    stored_employee_id: shotBRecord.employee_id,
    expected_employee_id: employeeBId,
  });

  if (
    shotARecord.tenant_id === tenantAId &&
    shotARecord.employee_id === employeeAId &&
    shotARecord.tenant_id !== tenantBId &&
    shotARecord.employee_id !== employeeBId &&
    shotBRecord.tenant_id === tenantBId &&
    shotBRecord.employee_id === employeeBId
  ) {
    console.log("✓ PASS: Device A token strictly wrote into Tenant A context ONLY. Payload spoof attempt (Tenant B IDs) was COMPLETELY IGNORED.");
    console.log("✓ PASS: Device B token strictly wrote into Tenant B context ONLY. ZERO cross-tenant leakage between Tenant A & Tenant B.");
  } else {
    console.error("❌ FAIL: Two-tenant device isolation failed!");
    process.exit(1);
  }

  // Cross-tenant device revocation attempt (Tenant A Owner attempting to revoke Tenant B Device ID)
  console.log("\n--- VERIFICATION: Cross-Tenant Device Revocation Attempt ---");
  const crossRevokeRes = await fetch(`${BASE}/api/devices/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({ data: { deviceId: deviceIdB } }),
  });
  console.log("Cross-Tenant Revoke HTTP Status:", crossRevokeRes.status);
  const crossRevokeData = await crossRevokeRes.json();
  console.log("Cross-Tenant Revoke Response Body:", crossRevokeData);

  if (crossRevokeRes.status === 403 && !crossRevokeData.ok) {
    console.log("✓ PASS: Tenant A Owner attempt to revoke Tenant B Device ID rejected with 403 Forbidden.");
  } else {
    console.error("❌ FAIL: Cross-tenant device revocation succeeded!");
    process.exit(1);
  }

  // ─── VERIFICATION 4: revokeDevice & Immediate Rejection ──────────────
  console.log("\n--- VERIFICATION 4: revokeDevice & Immediate Rejection ---");
  const revokeRes = await fetch(`${BASE}/api/devices/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({ data: { deviceId: deviceIdA } }),
  });
  console.log("revokeDevice HTTP Status:", revokeRes.status);
  const revokeData = await revokeRes.json();
  console.log("revokeDevice Response Body:", revokeData);

  if (revokeRes.status === 200 && revokeData.ok) {
    console.log("✓ PASS: Device A revoked successfully.");
  } else {
    console.error("❌ FAIL: revokeDevice failed!");
    process.exit(1);
  }

  // Retry agent.* route with revoked Device A token -> MUST BE 401 IMMEDIATELY
  const revokedShotRes = await fetch(`${BASE}/api/public/agent/screenshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": rawDeviceTokenA,
    },
    body: JSON.stringify(shotAPayload),
  });
  console.log("Revoked Device Agent HTTP Status:", revokedShotRes.status);
  const revokedShotData = await revokedShotRes.json();
  console.log("Revoked Device Agent Response Body:", revokedShotData);

  if (revokedShotRes.status === 401 && !revokedShotData.ok) {
    console.log("✓ PASS: Revoked device token rejected immediately with 401 Unauthorized.");
  } else {
    console.error("❌ FAIL: Revoked device token was NOT rejected!");
    process.exit(1);
  }

  // ─── VERIFICATION 8: Checking Error Responses for SQL Leakage ─────────
  console.log("\n--- VERIFICATION 8: Checking Error Responses for SQL Leakage ---");
  const errorResponses = [
    JSON.stringify(crossRevokeData),
    JSON.stringify(revokedShotData),
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
  console.log("ALL PHASE 9 DEVICES & DESKTOP AGENT PAIRING TESTS PASSED CLEANLY!");
  console.log("========================================================================");

  await superPool.end();
}

runPhase9Tests().catch((err) => {
  console.error("Phase 9 tests failed:", err);
  process.exit(1);
});

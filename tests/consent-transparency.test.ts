import "dotenv/config";
import { superPool } from "../db/connection";

const BASE = "http://localhost:8080";

async function runPhase8Tests() {
  console.log("========================================================================");
  console.log("PHASE 8: CONSENT & TRANSPARENCY POLICY VERIFICATION TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A
  const tenantAPayload = {
    companyName: `Tenant Alpha Consent ${timestamp}`,
    ownerEmail: `owner-consent-a-${timestamp}@alpha.com`,
    ownerName: "Consent Owner A",
    password: "PasswordAlpha123!",
  };

  console.log("\n--- Registering Tenant A ---");
  const regARes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantAPayload }),
  });
  const regAData = await regARes.json();
  const tenantAId = regAData.tenantId;

  // 2. Register Tenant B
  const tenantBPayload = {
    companyName: `Tenant Beta Consent ${timestamp}`,
    ownerEmail: `owner-consent-b-${timestamp}@beta.com`,
    ownerName: "Consent Owner B",
    password: "PasswordBeta123!",
  };

  console.log("\n--- Registering Tenant B ---");
  const regBRes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantBPayload }),
  });
  const regBData = await regBRes.json();
  const tenantBId = regBData.tenantId;

  // 3. Log in as Tenant A Owner
  const loginARes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantAPayload.ownerEmail, password: tenantAPayload.password } }),
  });
  const cookieOwnerA = loginARes.headers.get("set-cookie")!.split(";")[0]!;

  // 4. Invite & Accept new Employee under Tenant A
  console.log("\n--- Inviting & Activating Employee under Tenant A ---");
  const empEmail = `employee-consent-${timestamp}@alpha.com`;
  const inviteRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({ data: { name: "Consent Employee", email: empEmail } }),
  });
  const inviteData = await inviteRes.json();
  const inviteToken = inviteData.inviteToken;

  const acceptRes = await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token: inviteToken, password: "EmployeePassword123!" } }),
  });
  const acceptData = await acceptRes.json();
  console.log("Employee Accept Invite Result:", acceptData);

  // 5. Log in as Accepted Employee (No Consent Recorded Yet)
  console.log("\n--- Logging in as Accepted Employee ---");
  const empLoginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: empEmail, password: "EmployeePassword123!" } }),
  });
  const cookieEmpA = empLoginRes.headers.get("set-cookie")!.split(";")[0]!;
  console.log("Employee Cookie issued:", cookieEmpA);

  // ─── VERIFICATION 1: Protected Action without Consent ─────────────────
  console.log("\n--- VERIFICATION 1: Protected Action without Consent ---");
  const getEmpNoConsentRes = await fetch(`${BASE}/api/employees`, {
    headers: { Cookie: cookieEmpA },
  });
  console.log("No Consent HTTP Status:", getEmpNoConsentRes.status);
  const getEmpNoConsentData = await getEmpNoConsentRes.json();
  console.log("No Consent Response Body:", getEmpNoConsentData);

  if (getEmpNoConsentRes.status === 428 && getEmpNoConsentData.error.includes("ConsentRequired")) {
    console.log("✓ PASS: Protected action blocked with specific ConsentRequired signal (HTTP 428).");
  } else {
    console.error("❌ FAIL: Protected action was NOT blocked with ConsentRequired!");
    process.exit(1);
  }

  // Fetch active consent version for Tenant A
  const activeVersionRes = await fetch(`${BASE}/api/consent/active`, {
    headers: { Cookie: cookieEmpA },
  });
  const activeVersionData = await activeVersionRes.json();
  console.log("Active Consent Version Data:", activeVersionData);
  const v1Id = activeVersionData.consentVersion.id;

  // ─── VERIFICATION 6: Cross-Tenant Consent Attempt ──────────────────────
  console.log("\n--- VERIFICATION 6: Cross-Tenant Consent Attempt ---");
  // Fetch active consent version for Tenant B using Tenant B owner session
  const loginBRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantBPayload.ownerEmail, password: tenantBPayload.password } }),
  });
  const cookieOwnerB = loginBRes.headers.get("set-cookie")!.split(";")[0]!;
  const activeVersionBRes = await fetch(`${BASE}/api/consent/active`, {
    headers: { Cookie: cookieOwnerB },
  });
  const activeVersionBData = await activeVersionBRes.json();
  const tenantBVersionId = activeVersionBData.consentVersion.id;

  // Tenant A Employee attempts recordConsent against Tenant B's consentVersionId
  const crossConsentRes = await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({ data: { consentVersionId: tenantBVersionId } }),
  });
  console.log("Cross-Tenant Consent HTTP Status:", crossConsentRes.status);
  const crossConsentData = await crossConsentRes.json();
  console.log("Cross-Tenant Consent Response Body:", crossConsentData);

  if (crossConsentRes.status === 403 && !crossConsentData.ok) {
    console.log("✓ PASS: Cross-tenant consent recording attempt rejected with 403.");
  } else {
    console.error("❌ FAIL: Cross-tenant consent recording succeeded!");
    process.exit(1);
  }

  // ─── VERIFICATION 3: Payload EmployeeId Spoofing Check ─────────────────
  console.log("\n--- VERIFICATION 3: Record Consent with Spoofed Employee ID Payload ---");
  const spoofRecordRes = await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmpA },
    body: JSON.stringify({
      data: {
        consentVersionId: v1Id,
        employeeId: "00000000-0000-0000-0000-000000000000", // Spoofed payload ID attempt
      },
    }),
  });
  const spoofRecordData = await spoofRecordRes.json();
  console.log("Record Consent Response:", spoofRecordData);

  // ─── VERIFICATION 2 & 5: Record Consent & Retrying Protected Action + IP Check ─
  console.log("\n--- VERIFICATION 2 & 5: Retry Protected Action Post-Consent & IP Check ---");
  const retryEmpRes = await fetch(`${BASE}/api/employees`, {
    headers: { Cookie: cookieEmpA },
  });
  const retryEmpData = await retryEmpRes.json();
  console.log("Post-Consent Protected Action Response:", retryEmpData);

  if (retryEmpRes.status === 200 && retryEmpData.ok) {
    console.log("✓ PASS: Protected action succeeded post-consent.");
  } else {
    console.error("❌ FAIL: Protected action failed post-consent!");
    process.exit(1);
  }

  // Check DB row for captured IP address and session-derived employeeId
  const dbConsent = await superPool.query(
    "SELECT id, tenant_id, employee_id, consent_version_id, ip_address, accepted_at FROM employee_consents WHERE consent_version_id = $1",
    [v1Id]
  );
  console.log("DB employee_consents Row:", dbConsent.rows[0]);

  if (
    dbConsent.rows.length === 1 &&
    dbConsent.rows[0].employee_id === acceptData.employeeId &&
    dbConsent.rows[0].ip_address &&
    dbConsent.rows[0].ip_address !== "null"
  ) {
    console.log(`✓ PASS: Real IP address captured (${dbConsent.rows[0].ip_address}) & employee_id derived strictly from session.`);
  } else {
    console.error("❌ FAIL: DB consent record verification failed!");
    process.exit(1);
  }

  // ─── VERIFICATION 4: Policy Version Bump Scenario ─────────────────────
  console.log("\n--- VERIFICATION 4: Policy Version Bump Scenario ---");
  // Tenant A Admin bumps policy version to v2.0
  const bumpRes = await fetch(`${BASE}/api/consent/bump`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwnerA },
    body: JSON.stringify({
      data: {
        version: "2.0",
        policyText: "Updated Monitoring Transparency Policy v2.0: Enhanced disclosure for active application domain tracking.",
      },
    }),
  });
  const bumpData = await bumpRes.json();
  console.log("Bump Consent Version Response:", bumpData);

  // Previously-consented employee attempts protected action -> MUST BE BLOCKED AGAIN
  const postBumpEmpRes = await fetch(`${BASE}/api/employees`, {
    headers: { Cookie: cookieEmpA },
  });
  console.log("Post-Bump Protected Action HTTP Status:", postBumpEmpRes.status);
  const postBumpEmpData = await postBumpEmpRes.json();
  console.log("Post-Bump Protected Action Response Body:", postBumpEmpData);

  if (postBumpEmpRes.status === 428 && postBumpEmpData.error.includes("ConsentRequired")) {
    console.log("✓ PASS: Policy version bump caused previously-consented employee to be blocked again until re-consent.");
  } else {
    console.error("❌ FAIL: Employee was NOT re-prompted after version bump!");
    process.exit(1);
  }

  // ─── VERIFICATION 8: SQL Leakage Check ────────────────────────────────
  console.log("\n--- VERIFICATION 8: Checking Error Responses for SQL Leakage ---");
  const errorResponses = [
    JSON.stringify(getEmpNoConsentData),
    JSON.stringify(crossConsentData),
    JSON.stringify(postBumpEmpData),
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
  console.log("ALL PHASE 8 CONSENT & TRANSPARENCY TESTS PASSED CLEANLY!");
  console.log("========================================================================");

  await superPool.end();
}

runPhase8Tests().catch((err) => {
  console.error("Phase 8 tests failed:", err);
  process.exit(1);
});

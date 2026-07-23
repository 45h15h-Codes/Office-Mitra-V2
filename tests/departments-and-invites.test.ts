import "dotenv/config";
import { superPool } from "../db/connection";

const BASE = "http://localhost:8080";

async function runPhase7Tests() {
  console.log("========================================================================");
  console.log("PHASE 7: DEPARTMENTS & EMPLOYEE INVITATION LIFECYCLE TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A
  const tenantAPayload = {
    companyName: `Tenant Alpha Dept ${timestamp}`,
    ownerEmail: `owner-dept-a-${timestamp}@alpha.com`,
    ownerName: "Dept Owner A",
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
    companyName: `Tenant Beta Dept ${timestamp}`,
    ownerEmail: `owner-dept-b-${timestamp}@beta.com`,
    ownerName: "Dept Owner B",
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
  const cookieA = loginARes.headers.get("set-cookie")!.split(";")[0]!;

  // 4. Log in as Tenant B Owner
  const loginBRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: tenantBPayload.ownerEmail, password: tenantBPayload.password } }),
  });
  const cookieB = loginBRes.headers.get("set-cookie")!.split(";")[0]!;

  // ─── 1. DEPARTMENTS CRUD & ISOLATION ──────────────────────────────────
  console.log("\n--- 1. DEPARTMENTS CRUD & ISOLATION ---");
  // Create Dept A
  const createDeptARes = await fetch(`${BASE}/api/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { name: "AI Research" } }),
  });
  const createDeptAData = await createDeptARes.json();
  console.log("Create Dept A Response:", createDeptAData);
  const deptA = createDeptAData.department;

  // Create Dept B
  const createDeptBRes = await fetch(`${BASE}/api/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ data: { name: "Quantum Computing" } }),
  });
  const createDeptBData = await createDeptBRes.json();
  const deptB = createDeptBData.department;

  // GET Departments for Tenant A (expect ONLY Dept A)
  const getDeptsARes = await fetch(`${BASE}/api/departments`, { headers: { Cookie: cookieA } });
  const getDeptsAData = await getDeptsARes.json();
  const deptNamesA = getDeptsAData.departments.map((d: any) => d.name);
  console.log("Tenant A Departments:", deptNamesA);

  if (deptNamesA.includes("AI Research") && !deptNamesA.includes("Quantum Computing")) {
    console.log("✓ PASS: Departments strictly tenant-isolated on GET.");
  } else {
    console.error("❌ FAIL: Department read leaked cross-tenant!");
    process.exit(1);
  }

  // Cross-tenant Update Attempt (Tenant A updating Dept B)
  const crossUpdateDeptRes = await fetch(`${BASE}/api/departments/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { departmentId: deptB.id, name: "Hacked Dept" } }),
  });
  console.log("Cross-Update Dept Status:", crossUpdateDeptRes.status);
  const crossUpdateDeptData = await crossUpdateDeptRes.json();
  console.log("Cross-Update Dept Body:", crossUpdateDeptData);

  if (!crossUpdateDeptData.ok && (crossUpdateDeptRes.status === 404 || crossUpdateDeptRes.status === 403)) {
    console.log("✓ PASS: Cross-tenant department update attempt rejected cleanly.");
  } else {
    console.error("❌ FAIL: Cross-tenant department update succeeded!");
    process.exit(1);
  }

  // Cross-tenant Delete Attempt (Tenant A deleting Dept B)
  const crossDeleteDeptRes = await fetch(`${BASE}/api/departments/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { departmentId: deptB.id } }),
  });
  console.log("Cross-Delete Dept Status:", crossDeleteDeptRes.status);
  const crossDeleteDeptData = await crossDeleteDeptRes.json();
  console.log("Cross-Delete Dept Body:", crossDeleteDeptData);

  if (!crossDeleteDeptData.ok && (crossDeleteDeptRes.status === 404 || crossDeleteDeptRes.status === 403)) {
    console.log("✓ PASS: Cross-tenant department delete attempt rejected cleanly.");
  } else {
    console.error("❌ FAIL: Cross-tenant department delete succeeded!");
    process.exit(1);
  }

  // Update Dept A
  const updateDeptARes = await fetch(`${BASE}/api/departments/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { departmentId: deptA.id, name: "Applied AI Research" } }),
  });
  const updateDeptAData = await updateDeptARes.json();
  console.log("Update Dept A Response:", updateDeptAData);

  // Delete Dept A
  const deleteDeptARes = await fetch(`${BASE}/api/departments/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { departmentId: deptA.id } }),
  });
  const deleteDeptAData = await deleteDeptARes.json();
  console.log("Delete Dept A Response:", deleteDeptAData);
  if (deleteDeptAData.ok) {
    console.log("✓ PASS: Department CRUD operations complete.");
  }

  // ─── 2. INVITE EMPLOYEE ───────────────────────────────────────────────
  console.log("\n--- 2. INVITE EMPLOYEE ---");
  const inviteEmail = `invitee-${timestamp}@alpha.com`;
  const inviteRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { name: "Invited Ian", email: inviteEmail } }),
  });
  const inviteData = await inviteRes.json();
  console.log("Invite Employee Response:", inviteData);

  const token = inviteData.inviteToken;
  const empId = inviteData.employee.id;

  // DB State check before accept
  const dbEmpBefore = await superPool.query("SELECT id, name, email, status, user_id FROM employees WHERE id = $1", [empId]);
  console.log("DB State (Before Accept):", dbEmpBefore.rows[0]);

  if (inviteData.ok && dbEmpBefore.rows[0].status === "invited" && dbEmpBefore.rows[0].user_id === null) {
    console.log("✓ PASS: Employee created with status='invited' and userId=null.");
  } else {
    console.error("❌ FAIL: Invite state invalid!");
    process.exit(1);
  }

  // ─── 3. ACCEPT INVITE & USER CREATION ─────────────────────────────────
  console.log("\n--- 3. ACCEPT INVITE ---");
  const acceptRes = await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token, password: "InviteePassword123!" } }),
  });
  const acceptData = await acceptRes.json();
  console.log("Accept Invite Response:", acceptData);

  // DB State check after accept
  const dbEmpAfter = await superPool.query("SELECT id, name, email, status, user_id FROM employees WHERE id = $1", [empId]);
  console.log("DB State (After Accept):", dbEmpAfter.rows[0]);

  const dbUserCreated = await superPool.query("SELECT id, email, status FROM users WHERE id = $1", [acceptData.userId]);
  console.log("DB User Created:", dbUserCreated.rows[0]);

  if (
    acceptData.ok &&
    dbEmpAfter.rows[0].status === "active" &&
    dbEmpAfter.rows[0].user_id === acceptData.userId &&
    dbUserCreated.rows.length === 1
  ) {
    console.log("✓ PASS: Accept invite activated employee and linked newly created user row.");
  } else {
    console.error("❌ FAIL: Accept invite database state verification failed!");
    process.exit(1);
  }

  // ─── 4. SECOND USE OF SAME TOKEN ──────────────────────────────────────
  console.log("\n--- 4. SECOND USE OF SAME TOKEN ---");
  const secondAcceptRes = await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token, password: "AnotherPassword123!" } }),
  });
  const secondAcceptData = await secondAcceptRes.json();
  console.log("Second Accept Response Body:", secondAcceptData);

  if (!secondAcceptData.ok && secondAcceptData.error.includes("already been used")) {
    console.log("✓ PASS: Second use of token rejected with single-use enforcement.");
  } else {
    console.error("❌ FAIL: Second use of token was NOT rejected!");
    process.exit(1);
  }

  // ─── 5. EXPIRED TOKEN SIMULATION ──────────────────────────────────────
  console.log("\n--- 5. EXPIRED TOKEN TEST ---");
  // Invite another employee and backdate token expires_at in DB
  const expiredEmail = `expired-${timestamp}@alpha.com`;
  const expInviteRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { name: "Expired Eric", email: expiredEmail } }),
  });
  const expInviteData = await expInviteRes.json();
  const expToken = expInviteData.inviteToken;

  // Backdate expires_at in DB
  await superPool.query(
    "UPDATE employee_invites SET expires_at = NOW() - INTERVAL '1 day' WHERE employee_id = $1",
    [expInviteData.employee.id]
  );
  console.log("Simulated expiry by backdating expires_at = NOW() - INTERVAL '1 day' in DB.");

  const expAcceptRes = await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token: expToken, password: "Password123!" } }),
  });
  const expAcceptData = await expAcceptRes.json();
  console.log("Expired Token Accept Response Body:", expAcceptData);

  if (!expAcceptData.ok && expAcceptData.error.includes("expired")) {
    console.log("✓ PASS: Expired token rejected cleanly.");
  } else {
    console.error("❌ FAIL: Expired token was accepted!");
    process.exit(1);
  }

  // ─── 6. FULL LOGIN TEST FOR NEW INVITEE ───────────────────────────────
  console.log("\n--- 6. FULL LOGIN TEST FOR ACCEPTED INVITEE ---");
  const inviteeLoginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: inviteEmail, password: "InviteePassword123!" } }),
  });
  const inviteeLoginData = await inviteeLoginRes.json();
  const inviteeCookie = inviteeLoginRes.headers.get("set-cookie");
  console.log("Invitee Login Response:", inviteeLoginData);
  console.log("Invitee Cookie Issued:", Boolean(inviteeCookie));

  if (inviteeLoginData.ok && inviteeCookie) {
    console.log("✓ PASS: Newly activated invitee logged in successfully and real session cookie issued.");
  } else {
    console.error("❌ FAIL: Invitee login failed!");
    process.exit(1);
  }

  // ─── 8. SQL LEAKAGE INSPECTION ────────────────────────────────────────
  console.log("\n--- 8. CHECKING ALL ERROR RESPONSES FOR RAW SQL LEAKAGE ---");
  const errorResponses = [
    JSON.stringify(crossUpdateDeptData),
    JSON.stringify(secondAcceptData),
    JSON.stringify(expAcceptData),
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
  console.log("ALL PHASE 7 DEPARTMENTS & INVITATION TESTS PASSED CLEANLY!");
  console.log("========================================================================");

  await superPool.end();
}

runPhase7Tests().catch((err) => {
  console.error("Phase 7 tests failed:", err);
  process.exit(1);
});

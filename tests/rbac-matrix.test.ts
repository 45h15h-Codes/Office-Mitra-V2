import "dotenv/config";

const BASE = "http://localhost:8080";

async function runRbacTests() {
  console.log("========================================================================");
  console.log("PHASE 6: RBAC ROLES & PERMISSION MATRIX VERIFICATION TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A
  const tenantAPayload = {
    companyName: `Tenant Alpha RBAC ${timestamp}`,
    ownerEmail: `owner-rbac-a-${timestamp}@alpha.com`,
    ownerName: "RBAC Owner A",
    password: "PasswordAlpha123!",
  };

  console.log("\n--- Registering Tenant A ---");
  const regARes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantAPayload }),
  });
  const regAData = await regARes.json();
  console.log("Tenant A Register Response:", regAData);
  const tenantAId = regAData.tenantId;

  // 2. Register Tenant B
  const tenantBPayload = {
    companyName: `Tenant Beta RBAC ${timestamp}`,
    ownerEmail: `owner-rbac-b-${timestamp}@beta.com`,
    ownerName: "RBAC Owner B",
    password: "PasswordBeta123!",
  };

  console.log("\n--- Registering Tenant B ---");
  const regBRes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantBPayload }),
  });
  const regBData = await regBRes.json();
  console.log("Tenant B Register Response:", regBData);
  const tenantBId = regBData.tenantId;

  // 3. Log in as Tenant A Owner
  console.log("\n--- Logging in as Tenant A Owner ---");
  const loginARes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { email: tenantAPayload.ownerEmail, password: tenantAPayload.password },
    }),
  });
  const cookieA = loginARes.headers.get("set-cookie")!.split(";")[0]!;
  console.log("Cookie A issued:", cookieA);

  // 4. Log in as Tenant B Owner
  console.log("\n--- Logging in as Tenant B Owner ---");
  const loginBRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { email: tenantBPayload.ownerEmail, password: tenantBPayload.password },
    }),
  });
  const cookieB = loginBRes.headers.get("set-cookie")!.split(";")[0]!;
  console.log("Cookie B issued:", cookieB);

  // 5. Fetch Role Matrix for Tenant A
  console.log("\n--- Fetching Initial Matrix for Tenant A ---");
  const matrixARes = await fetch(`${BASE}/api/roles/matrix`, {
    headers: { Cookie: cookieA },
  });
  const matrixAData = await matrixARes.json();
  console.log("Tenant A Matrix Response Full:", matrixAData);
  
  const ownerRoleA = matrixAData.roles.find((r: any) => r.name === "Owner");
  const hrRoleA = matrixAData.roles.find((r: any) => r.name === "HR");

  // Fetch Matrix for Tenant B to get Tenant B's role ID
  const matrixBRes = await fetch(`${BASE}/api/roles/matrix`, {
    headers: { Cookie: cookieB },
  });
  const matrixBData = await matrixBRes.json();
  const ownerRoleB = matrixBData.roles.find((r: any) => r.name === "Owner");

  // 6. VERIFICATION 1: Update Role Permissions -> Immediate Matrix Call (Cache Invalidation Check)
  console.log("\n--- VERIFICATION 1: Update HR Role Permissions & Immediate Matrix Fetch ---");
  const newHrPerms = ["employees.view", "departments.manage"]; // Removed employees.manage from HR
  const updateHrRes = await fetch(`${BASE}/api/roles/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { roleId: hrRoleA.id, permissionCodes: newHrPerms } }),
  });
  const updateHrData = await updateHrRes.json();
  console.log("Update Role Response:", updateHrData);

  const immediateMatrixRes = await fetch(`${BASE}/api/roles/matrix`, {
    headers: { Cookie: cookieA },
  });
  const immediateMatrixData = await immediateMatrixRes.json();
  console.log("Immediate Matrix Grants for HR Role:", immediateMatrixData.matrix[hrRoleA.id]);

  const hrGrantsMatch =
    JSON.stringify(immediateMatrixData.matrix[hrRoleA.id].sort()) === JSON.stringify(newHrPerms.sort());

  if (updateHrData.ok && hrGrantsMatch) {
    console.log("✓ PASS: Immediate matrix call reflects updated grants synchronously (0 cache staleness).");
  } else {
    console.error("❌ FAIL: Immediate matrix call returned stale or incorrect grants!");
    process.exit(1);
  }

  // 7. VERIFICATION 2: Removed Permission Enforcement (403 Check)
  console.log("\n--- VERIFICATION 2: Action Requiring Removed Permission ---");
  // Remove employees.manage from Owner Role temporarily
  const ownerPermsMinusManage = matrixAData.matrix[ownerRoleA.id].filter((p: string) => p !== "employees.manage");
  console.log("Removing 'employees.manage' from Owner role...");
  await fetch(`${BASE}/api/roles/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { roleId: ownerRoleA.id, permissionCodes: ownerPermsMinusManage } }),
  });

  // Next action: attempt to create employee with Owner cookie (requires employees.manage)
  const actionRes = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { name: "Forbidden Emp", email: "forbidden@test.com" } }),
  });
  console.log("Action HTTP Status:", actionRes.status);
  const actionData = await actionRes.json();
  console.log("Action Response Body:", actionData);

  if (actionRes.status === 403 && !actionData.ok && actionData.error.includes("Forbidden")) {
    console.log("✓ PASS: Action requiring removed permission was rejected with 403 Forbidden.");
  } else {
    console.error("❌ FAIL: Action with missing permission was NOT rejected with 403!");
    process.exit(1);
  }

  // Restore Owner permissions for clean state
  await fetch(`${BASE}/api/roles/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { roleId: ownerRoleA.id, permissionCodes: matrixAData.matrix[ownerRoleA.id] } }),
  });

  // 8. VERIFICATION 3: Cross-Tenant Role Edit Attempt (Tenant A editing Tenant B's Role)
  console.log("\n--- VERIFICATION 3: Tenant A Edit Tenant B's Role ID ---");
  const crossRoleEditRes = await fetch(`${BASE}/api/roles/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { roleId: ownerRoleB.id, permissionCodes: ["employees.view"] } }),
  });
  console.log("Cross-Role Edit HTTP Status:", crossRoleEditRes.status);
  const crossRoleEditData = await crossRoleEditRes.json();
  console.log("Cross-Role Edit Response Body:", crossRoleEditData);

  // Verify Tenant B's role permissions remained untouched via Tenant B's matrix call
  const postCrossMatrixBRes = await fetch(`${BASE}/api/roles/matrix`, {
    headers: { Cookie: cookieB },
  });
  const postCrossMatrixBData = await postCrossMatrixBRes.json();
  const tenantBGrantsUnchanged =
    JSON.stringify(postCrossMatrixBData.matrix[ownerRoleB.id].sort()) ===
    JSON.stringify(matrixBData.matrix[ownerRoleB.id].sort());

  if (
    (crossRoleEditRes.status === 403 || crossRoleEditRes.status === 404) &&
    !crossRoleEditData.ok &&
    tenantBGrantsUnchanged
  ) {
    console.log("✓ PASS: Cross-tenant role edit rejected cleanly and Tenant B's DB role permissions remained 100% unchanged.");
  } else {
    console.error("❌ FAIL: Cross-tenant role edit succeeded or corrupted Tenant B's permissions!");
    process.exit(1);
  }

  // 9. VERIFICATION 5: SQL Leakage Check
  console.log("\n--- VERIFICATION 5: Checking Error Responses for SQL Leakage ---");
  const errorResponses = [
    JSON.stringify(actionData),
    JSON.stringify(crossRoleEditData),
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
  console.log("ALL PHASE 6 RBAC VERIFICATION TESTS PASSED CLEANLY!");
  console.log("========================================================================");
}

runRbacTests().catch((err) => {
  console.error("RBAC tests failed:", err);
  process.exit(1);
});

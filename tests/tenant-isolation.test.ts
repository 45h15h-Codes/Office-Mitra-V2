import "dotenv/config";

const BASE = "http://localhost:8080";

async function runIsolationTests() {
  console.log("========================================================================");
  console.log("PHASE 5: MULTI-TENANT RLS ISOLATION & EMPLOYEE CRUD VERIFICATION TEST");
  console.log("========================================================================");

  const timestamp = Date.now();

  // 1. Register Tenant A
  const tenantAPayload = {
    companyName: `Tenant Alpha ${timestamp}`,
    ownerEmail: `owner-alpha-${timestamp}@alpha.com`,
    ownerName: "Alpha Owner",
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
    companyName: `Tenant Beta ${timestamp}`,
    ownerEmail: `owner-beta-${timestamp}@beta.com`,
    ownerName: "Beta Owner",
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

  // 5. Add Employee A (Tenant A)
  console.log("\n--- Adding Employee A under Tenant A ---");
  const createARes = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { name: "Alice Alpha", email: "alice@alpha.com", status: "active" } }),
  });
  const createAData = await createARes.json();
  console.log("Create Employee A Response:", createAData);
  const empA = createAData.employee;

  // 6. Add Employee B (Tenant B)
  console.log("\n--- Adding Employee B under Tenant B ---");
  const createBRes = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ data: { name: "Bob Beta", email: "bob@beta.com", status: "active" } }),
  });
  const createBData = await createBRes.json();
  console.log("Create Employee B Response:", createBData);
  const empB = createBData.employee;

  // 7. Isolation Read Test (Tenant A GET /api/employees)
  console.log("\n--- TEST 1: Tenant A getEmployees (expect ONLY Employee A) ---");
  const getARes = await fetch(`${BASE}/api/employees`, {
    headers: { Cookie: cookieA },
  });
  const getAData = await getARes.json();
  console.log("Tenant A Employees:", getAData.employees);
  const empAIds = getAData.employees.map((e: any) => e.id);
  if (empAIds.includes(empA.id) && !empAIds.includes(empB.id)) {
    console.log("✓ PASS: Tenant A sees ONLY Employee A, ZERO Tenant B employees visible.");
  } else {
    console.error("❌ FAIL: Tenant A read leaked Tenant B data!");
    process.exit(1);
  }

  // 8. Isolation Read Test (Tenant B GET /api/employees)
  console.log("\n--- TEST 2: Tenant B getEmployees (expect ONLY Employee B) ---");
  const getBRes = await fetch(`${BASE}/api/employees`, {
    headers: { Cookie: cookieB },
  });
  const getBData = await getBRes.json();
  console.log("Tenant B Employees:", getBData.employees);
  const empBIds = getBData.employees.map((e: any) => e.id);
  if (empBIds.includes(empB.id) && !empBIds.includes(empA.id)) {
    console.log("✓ PASS: Tenant B sees ONLY Employee B, ZERO Tenant A employees visible.");
  } else {
    console.error("❌ FAIL: Tenant B read leaked Tenant A data!");
    process.exit(1);
  }

  // 9. Direct ID Fetch Isolation Test (Tenant A requests Employee B ID)
  console.log("\n--- TEST 3: Tenant A requesting Employee B ID via /api/employees/by-id ---");
  const crossIdRes = await fetch(`${BASE}/api/employees/by-id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { employeeId: empB.id } }),
  });
  console.log("Cross-ID HTTP Status:", crossIdRes.status);
  const crossIdData = await crossIdRes.json();
  console.log("Cross-ID Response Body:", crossIdData);

  if (!crossIdData.ok && (crossIdRes.status === 404 || crossIdRes.status === 403)) {
    console.log("✓ PASS: Tenant A direct request for Employee B ID rejected cleanly (404/403), 0 data leaked.");
  } else {
    console.error("❌ FAIL: Cross-tenant direct ID request leaked data!");
    process.exit(1);
  }

  // 10. Cross-Tenant WRITE Attempt Test (Tenant A attempts to UPDATE Employee B)
  console.log("\n--- TEST 4: Tenant A attempting WRITE (update) on Tenant B's Employee B ---");
  const crossUpdateRes = await fetch(`${BASE}/api/employees/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { employeeId: empB.id, name: "Hacked Name" } }),
  });
  console.log("Cross-Update HTTP Status:", crossUpdateRes.status);
  const crossUpdateData = await crossUpdateRes.json();
  console.log("Cross-Update Response Body:", crossUpdateData);

  if (!crossUpdateData.ok && (crossUpdateRes.status === 404 || crossUpdateRes.status === 403)) {
    console.log("✓ PASS: Tenant A write attempt (update) on Tenant B employee rejected cleanly (404/403).");
  } else {
    console.error("❌ FAIL: Tenant A successfully modified Tenant B's employee!");
    process.exit(1);
  }

  // 11. Cross-Tenant WRITE Attempt Test (Tenant A attempts to DELETE Employee B)
  console.log("\n--- TEST 5: Tenant A attempting WRITE (delete) on Tenant B's Employee B ---");
  const crossDeleteRes = await fetch(`${BASE}/api/employees/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ data: { employeeId: empB.id } }),
  });
  console.log("Cross-Delete HTTP Status:", crossDeleteRes.status);
  const crossDeleteData = await crossDeleteRes.json();
  console.log("Cross-Delete Response Body:", crossDeleteData);

  if (!crossDeleteData.ok && (crossDeleteRes.status === 404 || crossDeleteRes.status === 403)) {
    console.log("✓ PASS: Tenant A write attempt (delete) on Tenant B employee rejected cleanly (404/403).");
  } else {
    console.error("❌ FAIL: Tenant A successfully deleted Tenant B's employee!");
    process.exit(1);
  }

  // 12. Payload Tenant ID Spoofing Test (Tenant A passes Tenant B's tenantId in payload)
  console.log("\n--- TEST 6: Tenant A attempting payload tenantId spoofing to create under Tenant B ---");
  const spoofRes = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({
      data: {
        name: "Spoofed Employee",
        email: "spoof@test.com",
        tenantId: tenantBId, // Malicious payload attempt to spoof Tenant B
      },
    }),
  });
  const spoofData = await spoofRes.json();
  console.log("Payload Spoof Response:", spoofData);

  if (spoofData.ok && spoofData.employee.tenantId === tenantAId) {
    console.log("✓ PASS: Server function IGNORED payload tenantId spoof attempt and strictly assigned Tenant A's tenantId from session cookie.");
  } else {
    console.error("❌ FAIL: Payload tenantId spoof attempt bypassed session context!");
    process.exit(1);
  }

  // 13. Unauthenticated Request Test
  console.log("\n--- TEST 7: Unauthenticated Request (No Cookie) ---");
  const unauthRes = await fetch(`${BASE}/api/employees`);
  console.log("Unauthenticated HTTP Status:", unauthRes.status);
  const unauthData = await unauthRes.json();
  console.log("Unauthenticated Response Body:", unauthData);
  if (unauthRes.status === 401) {
    console.log("✓ PASS: Unauthenticated call rejected with 401 Unauthorized.");
  } else {
    console.error("❌ FAIL: Unauthenticated call succeeded!");
    process.exit(1);
  }

  // 14. SQL Leakage Inspection
  console.log("\n--- TEST 8: Checking all error responses for raw SQL / DB leakage ---");
  const allResponses = [
    JSON.stringify(crossIdData),
    JSON.stringify(crossUpdateData),
    JSON.stringify(crossDeleteData),
    JSON.stringify(unauthData),
  ];

  let leakedSql = false;
  for (const bodyStr of allResponses) {
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
  console.log("ALL PHASE 5 ISOLATION & WRITE PROTECTION TESTS PASSED CLEANLY!");
  console.log("========================================================================");
}

runIsolationTests().catch((err) => {
  console.error("Isolation tests failed:", err);
  process.exit(1);
});

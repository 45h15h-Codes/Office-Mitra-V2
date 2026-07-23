import "dotenv/config";
import { superPool } from "../db/connection";

const BASE = "http://localhost:8080";

async function verifyPayloadSpoof() {
  const timestamp = Date.now();

  // 1. Register Tenant
  const tenantPayload = {
    companyName: `Tenant Spoof Test ${timestamp}`,
    ownerEmail: `owner-spoof-${timestamp}@test.com`,
    ownerName: "Spoof Owner",
    password: "Password123!",
  };

  const regRes = await fetch(`${BASE}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tenantPayload }),
  });
  const regData = await regRes.json();
  const tenantId = regData.tenantId;

  // 2. Login Owner & Invite Employee
  const loginOwnerRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { email: tenantPayload.ownerEmail, password: tenantPayload.password },
    }),
  });
  const cookieOwner = loginOwnerRes.headers.get("set-cookie")!.split(";")[0]!;

  const empEmail = `employee-spoof-${timestamp}@test.com`;
  const inviteRes = await fetch(`${BASE}/api/employees/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieOwner },
    body: JSON.stringify({ data: { name: "Real Employee", email: empEmail } }),
  });
  const inviteData = await inviteRes.json();
  const realEmployeeId = inviteData.employee.id;

  // 3. Accept Invite & Login Employee
  await fetch(`${BASE}/api/public/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { token: inviteData.inviteToken, password: "EmpPassword123!" } }),
  });

  const empLoginRes = await fetch(`${BASE}/api/public/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: empEmail, password: "EmpPassword123!" } }),
  });
  const cookieEmp = empLoginRes.headers.get("set-cookie")!.split(";")[0]!;

  // 4. Get active consent version ID
  const activeRes = await fetch(`${BASE}/api/consent/active`, { headers: { Cookie: cookieEmp } });
  const activeData = await activeRes.json();
  const consentVersionId = activeData.consentVersion.id;

  // 5. CALL recordConsent FRESH WITH SPOOFED employeeId IN PAYLOAD
  const spoofedPayloadId = "11111111-2222-3333-4444-555555555555";
  console.log("Submitting recordConsent with spoofed payload employeeId:", spoofedPayloadId);

  const recordRes = await fetch(`${BASE}/api/consent/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieEmp },
    body: JSON.stringify({
      data: {
        consentVersionId,
        employeeId: spoofedPayloadId, // SPOOFED PAYLOAD ATTEMPT
      },
    }),
  });
  const recordData = await recordRes.json();
  console.log("recordConsent Response:", recordData);

  const newConsentId = recordData.consentId;

  // 6. QUERY DB ROW FOR NEW CONSENT ID
  const dbResult = await superPool.query(
    "SELECT id, tenant_id, employee_id, consent_version_id, ip_address, accepted_at FROM employee_consents WHERE id = $1",
    [newConsentId],
  );
  const dbRow = dbResult.rows[0];

  console.log("\n--- VERIFICATION PROOF ---");
  console.log("New Consent ID:", newConsentId);
  console.log("Spoofed Payload employeeId Passed:", spoofedPayloadId);
  console.log("Real Session employeeId:", realEmployeeId);
  console.log("DB Row Stored employee_id:", dbRow.employee_id);

  if (dbRow.employee_id === realEmployeeId && dbRow.employee_id !== spoofedPayloadId) {
    console.log(
      "\n✓ SUCCESS PROOF: DB column employee_id strictly matches real session employeeId, payload spoof was COMPLETELY IGNORED.",
    );
  } else {
    console.error("\n❌ VULNERABILITY DETECTED: DB column accepted spoofed payload ID!");
    process.exit(1);
  }

  await superPool.end();
}

verifyPayloadSpoof().catch((err) => {
  console.error("Spoof test failed:", err);
  process.exit(1);
});

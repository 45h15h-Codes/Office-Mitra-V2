/**
 * Seed test user for Phase 3 live HTTP testing.
 * Run: npx tsx db/seed-test-user.ts
 * Cleanup: npx tsx db/seed-test-user.ts --cleanup
 */
import "dotenv/config";
import pg from "pg";
import { hashPassword } from "../src/lib/auth/password";

const SUPERUSER_URL =
  process.env.DATABASE_SUPERUSER_URL ?? "postgresql://postgres:postgres@localhost:5432/officemitra";

const TEST_TENANT_ID = "33333333-3333-3333-3333-333333333333";
const TEST_ROLE_ID = "44444444-4444-4444-4444-444444444444";
const TEST_USER_ID = "55555555-5555-5555-5555-555555555555";
const TEST_EMAIL = "phase3test@officemitra.io";
const TEST_PASSWORD = "Phase3Pass123!";

async function main() {
  const pool = new pg.Pool({ connectionString: SUPERUSER_URL });
  const client = await pool.connect();

  const cleanup = process.argv.includes("--cleanup");

  try {
    if (cleanup) {
      await client.query(`DELETE FROM users WHERE id = '${TEST_USER_ID}'`);
      await client.query(`DELETE FROM roles WHERE id = '${TEST_ROLE_ID}'`);
      await client.query(`DELETE FROM tenants WHERE id = '${TEST_TENANT_ID}'`);
      console.log("Cleaned up test data.");
    } else {
      // Cleanup first to be idempotent
      await client.query(
        `DELETE FROM users WHERE email = '${TEST_EMAIL}' OR id = '${TEST_USER_ID}'`,
      );
      await client.query(`DELETE FROM roles WHERE id = '${TEST_ROLE_ID}'`);
      await client.query(`DELETE FROM tenants WHERE id = '${TEST_TENANT_ID}'`);

      const hash = await hashPassword(TEST_PASSWORD);

      await client.query(
        `INSERT INTO tenants (id, name, slug) VALUES ('${TEST_TENANT_ID}', 'Phase 3 Tenant', 'phase3-tenant')`,
      );
      await client.query(
        `INSERT INTO roles (id, tenant_id, name, is_system_role) VALUES ('${TEST_ROLE_ID}', '${TEST_TENANT_ID}', 'Admin', true)`,
      );
      await client.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, role_id, status) VALUES ('${TEST_USER_ID}', '${TEST_TENANT_ID}', '${TEST_EMAIL}', '${hash}', '${TEST_ROLE_ID}', 'active')`,
      );

      console.log("Seeded test user:");
      console.log("  Email:", TEST_EMAIL);
      console.log("  Password:", TEST_PASSWORD);
      console.log("  Tenant:", TEST_TENANT_ID);
      console.log("  User:", TEST_USER_ID);
      console.log(
        "\nStart dev server with `npm run dev`, then run `npx tsx db/test-phase3-http.ts`",
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

import "dotenv/config";
import { db, pool } from "./connection.js";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Testing Drizzle connection...\n");

  // Raw SQL through Drizzle
  const result = await db.execute(sql`SELECT NOW() as current_time`);
  console.log("SELECT NOW() result:", result.rows);

  // Query the placeholder table
  const tables = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  console.log("\nPublic tables:", tables.rows);

  await pool.end();
  console.log("\n✓ Connection test passed. Pool closed.");
}

main().catch((err) => {
  console.error("Connection test FAILED:", err);
  process.exit(1);
});

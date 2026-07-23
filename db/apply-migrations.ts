import "dotenv/config";
import { superPool } from "./connection";
import fs from "node:fs";
import path from "node:path";

async function applyMigrations() {
  console.log("Applying migration 0006_absent_vulture.sql...");
  const mig = fs.readFileSync(path.join(process.cwd(), "db/migrations/0006_absent_vulture.sql"), "utf-8");

  await superPool.query(mig);
  console.log("✓ Applied 0006_absent_vulture.sql (screenshots + productivity_logs + RLS)");

  await superPool.end();
}

applyMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

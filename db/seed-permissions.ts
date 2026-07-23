import "dotenv/config";
import { superDb, superPool } from "./connection";
import { permissions } from "./schema";
import { PERMISSION_CATALOG } from "../lib/permissions";
import { sql } from "drizzle-orm";

export async function seedPermissions() {
  console.log("Seeding global permissions catalog...");
  for (const perm of PERMISSION_CATALOG) {
    await superDb
      .insert(permissions)
      .values({
        code: perm.code,
        description: perm.description,
      })
      .onConflictDoUpdate({
        target: permissions.code,
        set: { description: perm.description },
      });
  }
  console.log(`✓ Seeded ${PERMISSION_CATALOG.length} permissions into global permissions catalog.`);
}

if (process.argv[1]?.includes("seed-permissions")) {
  seedPermissions()
    .then(async () => {
      await superPool.end();
    })
    .catch((err) => {
      console.error("Failed to seed permissions:", err);
      process.exit(1);
    });
}

import { db } from "../../db/connection";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../db/schema";

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executes `fn` inside a Postgres transaction with RLS scoped to `tenantId`.
 *
 * Uses SET LOCAL so the setting is automatically dropped when the transaction
 * ends — safe for connection pooling.
 *
 * Every future tenant-scoped DB call should go through this.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  return db.transaction(async (tx) => {
    // SET LOCAL can't use parameterized queries ($1) — Postgres syntax limitation.
    // UUID regex validation above prevents SQL injection.
    await tx.execute(
      sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`),
    );
    return fn(tx);
  });
}

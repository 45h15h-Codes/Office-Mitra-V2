import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { pool };

const superPool = new pg.Pool({
  connectionString: process.env.DATABASE_SUPERUSER_URL || process.env.DATABASE_URL,
});

export const superDb = drizzle(superPool, { schema });
export { superPool };


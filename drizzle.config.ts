import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    // Migrations need superuser rights (DDL, FORCE RLS, triggers)
    url: process.env.DATABASE_SUPERUSER_URL ?? process.env.DATABASE_URL!,
  },
});

/**
 * lib/auth/authenticate.ts
 *
 * Server-only authentication helper. Used by loginServerFn handler
 * and test scripts. Never import from client code.
 */
import { eq } from "drizzle-orm";
import { superDb } from "../../../db/connection";
import { users } from "../../../db/schema";
import { verifyPassword } from "./password";

import type { LoginResult } from "./login.function";

export async function authenticateUser(
  email: string,
  password: string,
): Promise<LoginResult & { userId?: string; tenantId?: string }> {
  const emailNormalized = email.trim().toLowerCase();

  const user = await superDb.query.users.findFirst({
    where: eq(users.email, emailNormalized),
  });

  if (!user || user.status !== "active") {
    return { ok: false, error: "Invalid email or password" };
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return { ok: false, error: "Invalid email or password" };
  }

  return { ok: true, userId: user.id, tenantId: user.tenantId };
}

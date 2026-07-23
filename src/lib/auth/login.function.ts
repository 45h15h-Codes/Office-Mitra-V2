import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

export const loginServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }): Promise<LoginResult> => {
    // Dynamic imports — keeps argon2, node:crypto, pg out of the client bundle.
    // TanStack Start strips the handler body from the client build,
    // but top-level static imports of Node modules still get pulled in by Vite.
    const { eq } = await import("drizzle-orm");
    const { superDb } = await import("../../../db/connection");
    const { users } = await import("../../../db/schema");
    const { verifyPassword } = await import("./password");
    const { buildSessionCookie } = await import("./session");
    const { setResponseHeader } = await import("@tanstack/react-start/server");

    const emailNormalized = data.email.trim().toLowerCase();

    const user = await superDb.query.users.findFirst({
      where: eq(users.email, emailNormalized),
    });

    if (!user || user.status !== "active") {
      return { ok: false, error: "Invalid email or password" };
    }

    const isValid = await verifyPassword(data.password, user.passwordHash);
    if (!isValid) {
      return { ok: false, error: "Invalid email or password" };
    }

    const cookieHeader = buildSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
    });

    setResponseHeader("Set-Cookie", cookieHeader);

    return { ok: true };
  });

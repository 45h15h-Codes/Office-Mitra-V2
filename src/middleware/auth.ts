import { createMiddleware } from "@tanstack/react-start";

import { readSessionFromRequest } from "@/lib/auth/session";

type Session = { userId: string; tenantId: string };

export async function getSession(request: Request): Promise<Session | null> {
  const session = readSessionFromRequest(request);
  if (!session) return null;
  return { userId: session.userId, tenantId: session.tenantId };
}

// ─── Function-level middleware ────────────────────────────────────────
// Attach to server functions via:
//   createServerFn().middleware([authMiddleware]).handler(...)
// The handler receives { context: { userId, tenantId } }.
export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    let request = (context as Record<string, unknown>).request as Request | undefined;
    if (!request) {
      try {
        const { getRequest } = await import("@tanstack/react-start/server");
        request = getRequest();
      } catch {
        // ignore
      }
    }

    const session = request ? await getSession(request) : null;

    if (!session) {
      throw new Error("Unauthorized: no valid session");
    }

    return next({ context: { userId: session.userId, tenantId: session.tenantId } });
  },
);

// ─── Request-level middleware ─────────────────────────────────────────
// Attach to file-based routes via:
//   createFileRoute(...)({ server: { middleware: [authRouteMiddleware], handlers: {...} } })
// Downstream handlers receive { context: { userId, tenantId } }.
export const authRouteMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const session = await getSession(request);

    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return next({ context: { userId: session.userId, tenantId: session.tenantId } });
  },
);

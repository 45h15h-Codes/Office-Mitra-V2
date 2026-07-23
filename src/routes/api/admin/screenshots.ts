import { createFileRoute } from "@tanstack/react-router";
import { readSessionFromRequest } from "@/lib/auth/session";
import { assertTenantAccess } from "@/lib/assert-tenant-access";
import { checkEmployeeConsent } from "@/lib/consent/consent.function";
import { checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";
import { superPool } from "../../../../db/connection";
import { screenshots } from "../../../../db/schema";
import { desc, eq } from "drizzle-orm";

const HEADERS = {
  "content-type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/admin/screenshots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readSessionFromRequest(request);
          if (!session) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: HEADERS,
            });
          }

          assertTenantAccess(session.tenantId, session.tenantId);

          const hasConsent = await checkEmployeeConsent(superPool, session.tenantId, session.userId);
          if (!hasConsent) {
            return new Response(
              JSON.stringify({ ok: false, error: "ConsentRequired: Monitoring policy consent required" }),
              { status: 428, headers: HEADERS },
            );
          }

          const allowed = await withTenantContext(session.tenantId, async (tx) => {
            return checkPermission(tx, session.userId, session.tenantId, "screenshots.view");
          });
          if (!allowed) {
            return new Response(
              JSON.stringify({ ok: false, error: "Forbidden: insufficient permissions" }),
              { status: 403, headers: HEADERS }
            );
          }

          const result = await withTenantContext(session.tenantId, async (tx) => {
            return tx
              .select()
              .from(screenshots)
              .where(eq(screenshots.tenantId, session.tenantId))
              .orderBy(desc(screenshots.capturedAt))
              .limit(100);
          });

          return new Response(
            JSON.stringify({
              ok: true,
              total: result.length,
              screenshots: result,
            }),
            { status: 200, headers: HEADERS }
          );
        } catch (err: any) {
          const status = err?.status ?? 400;
          const message = err?.message ?? "Failed to list screenshots";
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status,
            headers: HEADERS,
          });
        }
      },
    },
  },
});

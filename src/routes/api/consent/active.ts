import { createFileRoute } from "@tanstack/react-router";
import { getActiveConsentVersionServerFn } from "@/lib/consent/consent.function";

export const Route = createFileRoute("/api/consent/active")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await getActiveConsentVersionServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to fetch active consent policy" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        try {
          const result = await getActiveConsentVersionServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to fetch active consent policy" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

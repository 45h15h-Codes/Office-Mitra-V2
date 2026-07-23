import { createFileRoute } from "@tanstack/react-router";
import { getRolePermissionMatrixServerFn } from "@/lib/roles/roles.function";

export const Route = createFileRoute("/api/roles/matrix")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const result = await getRolePermissionMatrixServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to fetch matrix" }), {
            status: isAuthErr ? 401 : 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request }) => {
        try {
          const result = await getRolePermissionMatrixServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to fetch matrix" }), {
            status: isAuthErr ? 401 : 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

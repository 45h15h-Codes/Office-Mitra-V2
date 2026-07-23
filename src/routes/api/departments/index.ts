import { createFileRoute } from "@tanstack/react-router";
import { getDepartmentsServerFn, createDepartmentServerFn } from "@/lib/departments/departments.function";

export const Route = createFileRoute("/api/departments/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const result = await getDepartmentsServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to retrieve departments" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await createDepartmentServerFn({ data: body.data ?? body, request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to create department" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

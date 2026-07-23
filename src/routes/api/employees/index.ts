import { createFileRoute } from "@tanstack/react-router";
import { getEmployeesServerFn, createEmployeeServerFn } from "@/lib/employees/employees.function";

export const Route = createFileRoute("/api/employees/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const result = await getEmployeesServerFn({ request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("ConsentRequired") ? 428 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to retrieve employees" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await createEmployeeServerFn({ data: body.data ?? body, request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("ConsentRequired") ? 428 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to create employee" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

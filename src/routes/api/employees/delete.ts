import { createFileRoute } from "@tanstack/react-router";
import { deleteEmployeeServerFn } from "@/lib/employees/employees.function";

export const Route = createFileRoute("/api/employees/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await deleteEmployeeServerFn({ data: body.data ?? body, request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 404,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Employee not found or forbidden" }), {
            status: isAuthErr ? 401 : 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

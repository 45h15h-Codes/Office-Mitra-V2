import { createFileRoute } from "@tanstack/react-router";
import { registerCompanyServerFn } from "@/lib/auth/register-company.function";

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await registerCompanyServerFn({ data: body.data ?? body });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: err.message || "Registration error" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { loginServerFn } from "@/lib/auth/login.function";

export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await loginServerFn({ data: body.data ?? body });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 401,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: err.message || "Login failed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

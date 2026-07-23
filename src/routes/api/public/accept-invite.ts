import { createFileRoute } from "@tanstack/react-router";
import { acceptInviteServerFn } from "@/lib/employees/invite.function";

export const Route = createFileRoute("/api/public/accept-invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await acceptInviteServerFn({ data: body.data ?? body } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: err.message || "Failed to accept invite" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

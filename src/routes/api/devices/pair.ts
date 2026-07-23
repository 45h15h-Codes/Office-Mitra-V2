import { createFileRoute } from "@tanstack/react-router";
import { pairDeviceServerFn } from "@/lib/devices/devices.function";

export const Route = createFileRoute("/api/devices/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const result = await pairDeviceServerFn({ data: body.data ?? body, request } as any);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : result.error.includes("Forbidden") ? 403 : 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const isAuthErr = err.message?.includes("Unauthorized");
          return new Response(JSON.stringify({ ok: false, error: isAuthErr ? "Unauthorized" : "Failed to pair device" }), {
            status: isAuthErr ? 401 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

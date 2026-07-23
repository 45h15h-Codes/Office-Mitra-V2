import { createFileRoute } from "@tanstack/react-router";
import { authenticateDeviceRequest } from "@/lib/devices/devices.function";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token, Authorization",
  "Cache-Control": "no-store",
};

const BLACKLIST = {
  version: 1,
  updated_at: "2026-07-17T00:00:00Z",
  keywords: [
    "WhatsApp",
    "Signal",
    "Telegram",
    "1Password",
    "Bitwarden",
    "Banking",
    "Chase",
    "HDFC",
    "Personal Gmail",
    "Health",
    "Therapy",
  ],
};

export const Route = createFileRoute("/api/public/agent/blacklist")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const deviceCtx = await authenticateDeviceRequest(request);
        if (!deviceCtx) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
        return new Response(JSON.stringify(BLACKLIST), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});

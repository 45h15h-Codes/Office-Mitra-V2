import { createFileRoute } from "@tanstack/react-router";
import { authenticateDeviceRequest } from "@/lib/devices/devices.function";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token, Authorization",
  "Cache-Control": "no-store",
};

type LabelValue = "Productive" | "Unproductive" | "Neutral" | "Unclassified";

type AppLabel = {
  app_name: string;
  label: LabelValue;
  updated_at: string;
};

const DEFAULT_LABELS: AppLabel[] = [
  { app_name: "VS Code", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Visual Studio Code", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Code", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Google Chrome", label: "Neutral", updated_at: new Date().toISOString() },
  { app_name: "Firefox", label: "Neutral", updated_at: new Date().toISOString() },
  { app_name: "Microsoft Edge", label: "Neutral", updated_at: new Date().toISOString() },
  { app_name: "Slack", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Microsoft Teams", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Zoom", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Figma", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Notion", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "YouTube", label: "Unproductive", updated_at: new Date().toISOString() },
  { app_name: "WhatsApp", label: "Unproductive", updated_at: new Date().toISOString() },
  { app_name: "Telegram", label: "Unproductive", updated_at: new Date().toISOString() },
  { app_name: "Terminal", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "PowerShell", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Notepad", label: "Neutral", updated_at: new Date().toISOString() },
  { app_name: "Excel", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Word", label: "Productive", updated_at: new Date().toISOString() },
  { app_name: "Outlook", label: "Productive", updated_at: new Date().toISOString() },
];

const labels: Map<string, AppLabel> = new Map(
  DEFAULT_LABELS.map((l) => [l.app_name.toLowerCase(), l]),
);

const VALID_LABELS: LabelValue[] = ["Productive", "Unproductive", "Neutral", "Unclassified"];

function normalize(name: string) {
  return name.trim().toLowerCase();
}

export const Route = createFileRoute("/api/public/agent/app-labels")({
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

        const url = new URL(request.url);
        const appName = url.searchParams.get("app_name");

        if (appName) {
          const entry = labels.get(normalize(appName));
          const label: LabelValue = entry?.label ?? "Unclassified";
          return new Response(JSON.stringify({ ok: true, app_name: appName, label }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const all = Array.from(labels.values()).sort((a, b) =>
          a.app_name.localeCompare(b.app_name),
        );
        return new Response(JSON.stringify({ ok: true, count: all.length, labels: all }), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS },
        });
      },

      POST: async ({ request }) => {
        const deviceCtx = await authenticateDeviceRequest(request);
        if (!deviceCtx) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "bad json" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const now = new Date().toISOString();
        const updates: AppLabel[] = [];

        if (Array.isArray(body.labels)) {
          for (const item of body.labels as Record<string, unknown>[]) {
            const name = typeof item.app_name === "string" ? item.app_name.trim() : null;
            const lbl = typeof item.label === "string" ? item.label : null;
            if (!name || !lbl || !VALID_LABELS.includes(lbl as LabelValue)) continue;
            const entry: AppLabel = { app_name: name, label: lbl as LabelValue, updated_at: now };
            labels.set(normalize(name), entry);
            updates.push(entry);
          }
        } else {
          const name = typeof body.app_name === "string" ? body.app_name.trim() : null;
          const lbl = typeof body.label === "string" ? body.label : null;
          if (!name || !lbl || !VALID_LABELS.includes(lbl as LabelValue)) {
            return new Response(
              JSON.stringify({ ok: false, error: "app_name and valid label required" }),
              { status: 400, headers: { "content-type": "application/json", ...CORS } },
            );
          }
          const entry: AppLabel = { app_name: name, label: lbl as LabelValue, updated_at: now };
          labels.set(normalize(name), entry);
          updates.push(entry);
        }

        return new Response(
          JSON.stringify({ ok: true, updated: updates.length, entries: updates }),
          { status: 200, headers: { "content-type": "application/json", ...CORS } },
        );
      },
    },
  },
});

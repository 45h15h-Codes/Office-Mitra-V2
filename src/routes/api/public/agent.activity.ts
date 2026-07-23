import { createFileRoute } from "@tanstack/react-router";
import { authenticateDeviceRequest } from "@/lib/devices/devices.function";
import { withTenantContext } from "@/lib/tenant-context";
import { superPool } from "../../../../db/connection";
import crypto from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token, Authorization",
  "Cache-Control": "no-store",
};

function makeId() {
  return `act_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

export const Route = createFileRoute("/api/public/agent/activity")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      // POST — receives a batch from tracker.cjs OR activity.cjs and writes to productivity_logs DB table
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

        const kind =
          body.kind === "input_activity"
            ? "input_activity"
            : Array.isArray(body.entries)
              ? "app_tracking"
              : "unknown";
        const entries = Array.isArray(body.entries) ? (body.entries as Record<string, unknown>[]) : [];
        const batchId = makeId();

        const { productivityLogs } = await import("../../../../db/schema");

        await withTenantContext(deviceCtx.tenantId, async (tx) => {
          if (entries.length > 0) {
            for (const entry of entries) {
              const activeApp =
                typeof entry.app === "string"
                  ? entry.app
                  : typeof entry.active_app === "string"
                    ? entry.active_app
                    : "unknown";
              const activeTitle =
                typeof entry.title === "string"
                  ? entry.title
                  : typeof entry.active_title === "string"
                    ? entry.active_title
                    : "";
              const domain = typeof entry.domain === "string" ? entry.domain : null;
              const durationSec =
                typeof entry.duration_seconds === "number"
                  ? entry.duration_seconds
                  : typeof entry.duration === "number"
                    ? entry.duration
                    : 0;
              const timestamp =
                typeof entry.timestamp === "string"
                  ? new Date(entry.timestamp)
                  : typeof entry.startMs === "number"
                    ? new Date(entry.startMs)
                    : new Date();

              await tx.insert(productivityLogs).values({
                tenantId: deviceCtx.tenantId,
                employeeId: deviceCtx.employeeId, // Strictly derived from device context
                deviceId: deviceCtx.deviceId,
                activeApp,
                activeTitle,
                domain,
                durationSeconds: durationSec,
                timestamp,
              });
            }
          } else if (typeof body.active_app === "string") {
            await tx.insert(productivityLogs).values({
              tenantId: deviceCtx.tenantId,
              employeeId: deviceCtx.employeeId,
              deviceId: deviceCtx.deviceId,
              activeApp: body.active_app,
              activeTitle: typeof body.active_title === "string" ? body.active_title : "",
              domain: typeof body.domain === "string" ? body.domain : null,
              durationSeconds: typeof body.duration_seconds === "number" ? body.duration_seconds : 0,
              timestamp: typeof body.timestamp === "string" ? new Date(body.timestamp) : new Date(),
            });
          }
        });

        // Exact response contract expected by Electron client
        return new Response(
          JSON.stringify({
            ok: true,
            id: batchId,
            received_entries: entries.length,
            kind,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          },
        );
      },

      // GET — device-authenticated inspection for single activity record
      GET: async ({ request }) => {
        const deviceCtx = await authenticateDeviceRequest(request);
        if (!deviceCtx) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        try {
          const res = await withTenantContext(deviceCtx.tenantId, async () => {
            return superPool.query(
              "SELECT id, tenant_id, employee_id, device_id, active_app, active_title, domain, duration_seconds, timestamp, created_at FROM productivity_logs WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 50",
              [deviceCtx.tenantId]
            );
          });

          return new Response(
            JSON.stringify({
              ok: true,
              total: res.rows.length,
              records: res.rows,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json", ...CORS },
            },
          );
        } catch (err: any) {
          console.error("agent.activity GET error:", err);
          return new Response(JSON.stringify({ ok: false, error: "Failed to retrieve productivity logs" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});

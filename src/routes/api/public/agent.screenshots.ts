import { createFileRoute } from "@tanstack/react-router";
import { authenticateDeviceRequest } from "@/lib/devices/devices.function";
import { withTenantContext } from "@/lib/tenant-context";
import { superPool } from "../../../../db/connection";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Fail-Mode, X-Device-Token, Authorization",
};

let failMode: { kind: "off" } | { kind: "always" } | { kind: "next"; n: number } = { kind: "off" };

export const Route = createFileRoute("/api/public/agent/screenshots")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      // GET — strictly device-authenticated retrieval of a specific screenshot by ID
      GET: async ({ request }) => {
        const deviceCtx = await authenticateDeviceRequest(request);
        if (!deviceCtx) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        try {
          if (!id) {
            return new Response(JSON.stringify({ ok: false, error: "Screenshot ID is required" }), {
              status: 400,
              headers: { "content-type": "application/json", ...CORS },
            });
          }

          const res = await withTenantContext(deviceCtx.tenantId, async () => {
            return superPool.query(
              "SELECT id, tenant_id, employee_id, device_id, image_url, mime, width, height, captured_at, is_blurred, blacklisted_keyword, duration_seconds, created_at FROM screenshots WHERE id = $1 AND tenant_id = $2",
              [id, deviceCtx.tenantId]
            );
          });

          const shot = res.rows[0];
          if (!shot) {
            return new Response(JSON.stringify({ ok: false, error: "Screenshot not found or belongs to another tenant" }), {
              status: 404,
              headers: { "content-type": "application/json", ...CORS },
            });
          }

          return new Response(JSON.stringify({ ok: true, screenshot: shot }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        } catch (err: any) {
          console.error("agent.screenshots GET error:", err);
          return new Response(JSON.stringify({ ok: false, error: "Failed to retrieve screenshot" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
      },

      POST: async ({ request }) => {
        // Device authentication check
        const deviceCtx = await authenticateDeviceRequest(request);
        if (!deviceCtx) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const url = new URL(request.url);
        const fail = url.searchParams.get("fail") ?? request.headers.get("x-fail-mode");
        if (fail === "always") failMode = { kind: "always" };
        else if (fail === "off") failMode = { kind: "off" };
        else if (fail?.startsWith("next=")) {
          const n = Number(fail.slice(5));
          if (Number.isFinite(n) && n > 0) failMode = { kind: "next", n };
        }

        const shouldFail =
          failMode.kind === "always" || (failMode.kind === "next" && failMode.n > 0);
        if (failMode.kind === "next" && failMode.n > 0) {
          failMode = { kind: "next", n: failMode.n - 1 };
        }

        if (shouldFail) {
          return new Response(JSON.stringify({ ok: false, error: "simulated upstream outage" }), {
            status: 503,
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

        const b64 = typeof body.image_b64 === "string" ? body.image_b64 : "";
        const bytes = Math.floor((b64.length * 3) / 4);
        const id = crypto.randomUUID();

        // Save image buffer to persistent disk file under public/uploads/screenshots/
        const uploadDir = path.join(process.cwd(), "public/uploads/screenshots");
        fs.mkdirSync(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, `${id}.jpg`);
        if (b64) {
          fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
        } else {
          fs.writeFileSync(filePath, Buffer.from(""));
        }

        const imageUrl = `/uploads/screenshots/${id}.jpg`;
        const screenObj = (body.screen as { width: number; height: number }) ?? { width: 0, height: 0 };
        const capturedAt = typeof body.timestamp === "string" ? new Date(body.timestamp) : new Date();

        const { screenshots, productivityLogs } = await import("../../../../db/schema");

        await withTenantContext(deviceCtx.tenantId, async (tx) => {
          // Insert screenshot row into database
          await tx.insert(screenshots).values({
            id,
            tenantId: deviceCtx.tenantId,
            employeeId: deviceCtx.employeeId, // Strictly derived from device context
            deviceId: deviceCtx.deviceId,
            imageUrl,
            mime: "image/jpeg",
            width: screenObj.width || 0,
            height: screenObj.height || 0,
            capturedAt,
            isBlurred: body.is_blurred === true,
            blacklistedKeyword: typeof body.blacklisted_keyword === "string" ? body.blacklisted_keyword : null,
            durationSeconds: typeof body.duration_seconds === "number" ? body.duration_seconds : 0,
          });

          // Insert accompanying productivity log if active_app is present
          if (typeof body.active_app === "string") {
            await tx.insert(productivityLogs).values({
              tenantId: deviceCtx.tenantId,
              employeeId: deviceCtx.employeeId,
              deviceId: deviceCtx.deviceId,
              activeApp: body.active_app,
              activeTitle: typeof body.active_title === "string" ? body.active_title : "",
              domain: typeof body.domain === "string" ? body.domain : null,
              durationSeconds: typeof body.duration_seconds === "number" ? body.duration_seconds : 0,
              timestamp: capturedAt,
            });
          }
        });

        // Exact response contract expected by Electron client
        return new Response(JSON.stringify({ ok: true, id, received_bytes: bytes }), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});

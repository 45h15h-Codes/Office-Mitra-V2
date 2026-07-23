import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { authMiddleware } from "@/middleware/auth";
import { checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";
import { superPool } from "../../../db/connection";

const pairDeviceSchema = z.object({
  deviceLabel: z.string().optional(),
});

const revokeDeviceSchema = z.object({
  deviceId: z.string().uuid("Invalid device ID"),
});

export type PairDeviceResult =
  | { ok: true; deviceToken: string; deviceId: string }
  | { ok: false; error: string };

export type RevokeDeviceResult =
  | { ok: true; deviceId: string }
  | { ok: false; error: string };

export type DeviceContext = {
  tenantId: string;
  employeeId: string;
  deviceId: string;
};

export function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export const pairDeviceServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => pairDeviceSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<PairDeviceResult> => {
    const { tenantId, userId } = context;
    const { employees, devices } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        // Derive employee from authenticated session user
        const [emp] = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)))
          .limit(1);

        if (!emp) {
          return { ok: false, error: "Employee record not found for authenticated user" };
        }

        // Generate high-entropy raw token & SHA-256 hash
        const rawToken = `dtk_${crypto.randomBytes(32).toString("hex")}`;
        const tokenHash = hashDeviceToken(rawToken);

        const [newDevice] = await tx
          .insert(devices)
          .values({
            tenantId,
            employeeId: emp.id,
            deviceTokenHash: tokenHash,
            status: "active",
            deviceLabel: data.deviceLabel?.trim() ?? null,
          })
          .returning();

        return { ok: true, deviceToken: rawToken, deviceId: newDevice.id };
      });
    } catch (err: any) {
      console.error("pairDeviceServerFn failed:", err);
      return { ok: false, error: "Failed to pair device" };
    }
  });

export const revokeDeviceServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => revokeDeviceSchema.parse(data))
  .handler(async ({ data, context }): Promise<RevokeDeviceResult> => {
    const { tenantId, userId } = context;
    const { devices } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "devices.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const [existing] = await tx
          .select({ id: devices.id })
          .from(devices)
          .where(and(eq(devices.id, data.deviceId), eq(devices.tenantId, tenantId)))
          .limit(1);

        if (!existing) {
          return { ok: false, error: "Forbidden: Device not found or belongs to another tenant" };
        }

        await tx
          .update(devices)
          .set({ status: "revoked" })
          .where(and(eq(devices.id, data.deviceId), eq(devices.tenantId, tenantId)));

        return { ok: true, deviceId: data.deviceId };
      });
    } catch (err: any) {
      console.error("revokeDeviceServerFn failed:", err);
      return { ok: false, error: "Failed to revoke device" };
    }
  });

export async function authenticateDeviceRequest(request: Request): Promise<DeviceContext | null> {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const headerToken = request.headers.get("x-device-token");
  const queryToken = url.searchParams.get("device_token");

  const rawToken = headerToken || bearerToken || queryToken;
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashDeviceToken(rawToken);

  try {
    const result = await superPool.query(
      "SELECT id, tenant_id, employee_id, status FROM devices WHERE device_token_hash = $1",
      [tokenHash]
    );

    const dev = result.rows[0];
    if (!dev || dev.status !== "active") {
      return null;
    }

    // Update last_seen_at asynchronously
    superPool
      .query("UPDATE devices SET last_seen_at = NOW() WHERE id = $1", [dev.id])
      .catch(() => {});

    return {
      tenantId: dev.tenant_id,
      employeeId: dev.employee_id,
      deviceId: dev.id,
    };
  } catch (err) {
    console.error("authenticateDeviceRequest error:", err);
    return null;
  }
}

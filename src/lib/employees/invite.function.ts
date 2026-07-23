import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { authMiddleware } from "@/middleware/auth";
import { checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";

const inviteEmployeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  departmentId: z.string().uuid().optional().nullable(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type InviteEmployeeResult =
  | { ok: true; employee: any; inviteToken: string; inviteLink: string }
  | { ok: false; error: string };

export type AcceptInviteResult =
  | { ok: true; userId: string; employeeId: string }
  | { ok: false; error: string };

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const inviteEmployeeServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => inviteEmployeeSchema.parse(data))
  .handler(async ({ data, context }): Promise<InviteEmployeeResult> => {
    const { tenantId, userId } = context;
    const { employees, employeeInvites } = await import("../../../db/schema");

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h expiry

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "employees.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const [newEmp] = await tx
          .insert(employees)
          .values({
            tenantId,
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            departmentId: data.departmentId || null,
            status: "invited",
            userId: null,
          })
          .returning();

        await tx.insert(employeeInvites).values({
          tenantId,
          employeeId: newEmp.id,
          tokenHash,
          expiresAt,
          usedAt: null,
        });

        const baseUrl = process.env.APP_URL || "http://localhost:8080";
        const inviteLink = `${baseUrl}/invite?token=${token}`;

        return {
          ok: true,
          employee: newEmp,
          inviteToken: token,
          inviteLink,
        };
      });
    } catch (err: any) {
      console.error("inviteEmployeeServerFn failed:", err);
      return { ok: false, error: "Failed to create employee invite" };
    }
  });

export const acceptInviteServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => acceptInviteSchema.parse(data))
  .handler(async ({ data }): Promise<AcceptInviteResult> => {
    const { superDb } = await import("../../../db/connection");
    const { employeeInvites, employees, users, roles } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { hashPassword } = await import("../auth/password");

    const tokenHash = hashToken(data.token);

    try {
      // 1. Lookup invite by token hash
      const [invite] = await superDb
        .select()
        .from(employeeInvites)
        .where(eq(employeeInvites.tokenHash, tokenHash))
        .limit(1);

      if (!invite) {
        return { ok: false, error: "Invalid or expired invite token" };
      }

      if (invite.usedAt !== null) {
        return { ok: false, error: "Invite token has already been used" };
      }

      if (new Date(invite.expiresAt) < new Date()) {
        return { ok: false, error: "Invite token has expired" };
      }

      // 2. Execute activation inside tenant context
      return await withTenantContext(invite.tenantId, async (tx) => {
        // Fetch target employee
        const [emp] = await tx
          .select()
          .from(employees)
          .where(and(eq(employees.id, invite.employeeId), eq(employees.tenantId, invite.tenantId)))
          .limit(1);

        if (!emp) {
          return { ok: false, error: "Employee record not found" };
        }

        // Fetch Employee role for tenant
        const [employeeRole] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.tenantId, invite.tenantId), eq(roles.name, "Employee")))
          .limit(1);

        const roleId = employeeRole?.id;
        if (!roleId) {
          return { ok: false, error: "System role for tenant not found" };
        }

        // Hash password
        const passwordHash = await hashPassword(data.password);

        // Create user
        const [newUser] = await tx
          .insert(users)
          .values({
            tenantId: invite.tenantId,
            email: emp.email,
            passwordHash,
            roleId,
            status: "active",
          })
          .returning();

        // Update employee record
        await tx
          .update(employees)
          .set({
            userId: newUser.id,
            status: "active",
          })
          .where(and(eq(employees.id, emp.id), eq(employees.tenantId, invite.tenantId)));

        // Mark invite token as used
        await tx
          .update(employeeInvites)
          .set({ usedAt: new Date() })
          .where(eq(employeeInvites.id, invite.id));

        return {
          ok: true,
          userId: newUser.id,
          employeeId: emp.id,
        };
      });
    } catch (err: any) {
      console.error("acceptInviteServerFn failed:", err);
      return { ok: false, error: "Failed to accept invite" };
    }
  });

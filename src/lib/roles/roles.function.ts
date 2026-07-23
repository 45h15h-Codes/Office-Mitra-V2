import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/middleware/auth";
import { invalidatePermissionCache, checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";

const updateRolePermissionsSchema = z.object({
  roleId: z.string().uuid("Invalid role ID"),
  permissionCodes: z.array(z.string()),
});

export type RoleItem = {
  id: string;
  name: string;
  isSystemRole: boolean;
};

export type PermissionItem = {
  id: string;
  code: string;
  category: string;
  description: string;
};

export type RolePermissionMatrixResult =
  | {
      ok: true;
      roles: RoleItem[];
      permissions: PermissionItem[];
      matrix: Record<string, string[]>;
    }
  | { ok: false; error: string };

export type UpdateRolePermissionsResult =
  | { ok: true; roleId: string; permissionCodes: string[] }
  | { ok: false; error: string };

export const getRolePermissionMatrixServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RolePermissionMatrixResult> => {
    const { tenantId, userId } = context;
    const { roles, permissions, rolePermissions } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "roles.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const tenantRoles = await tx
          .select({
            id: roles.id,
            name: roles.name,
            isSystemRole: roles.isSystemRole,
          })
          .from(roles)
          .where(eq(roles.tenantId, tenantId));

        const allPermissions = await tx
          .select({
            id: permissions.id,
            code: permissions.code,
            description: permissions.description,
          })
          .from(permissions);

        const allGrants = await tx
          .select({
            roleId: rolePermissions.roleId,
            permCode: permissions.code,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(eq(rolePermissions.tenantId, tenantId));

        const matrix: Record<string, string[]> = {};
        for (const r of tenantRoles) {
          matrix[r.id] = [];
        }
        for (const g of allGrants) {
          if (matrix[g.roleId]) {
            matrix[g.roleId].push(g.permCode);
          }
        }

        return {
          ok: true,
          roles: tenantRoles as RoleItem[],
          permissions: allPermissions as PermissionItem[],
          matrix,
        };
      });
    } catch (err: any) {
      console.error("getRolePermissionMatrixServerFn failed stack:", err.stack);
      return { ok: false, error: err?.message || "Failed to fetch role permission matrix" };
    }
  });

export const updateRolePermissionsServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => updateRolePermissionsSchema.parse(data))
  .handler(async ({ data, context }): Promise<UpdateRolePermissionsResult> => {
    const { tenantId, userId } = context;
    const { roles, permissions, rolePermissions } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "roles.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        // Cross-tenant verification: verify target role belongs to caller's tenantId
        const [targetRole] = await tx
          .select({ id: roles.id, tenantId: roles.tenantId })
          .from(roles)
          .where(and(eq(roles.id, data.roleId), eq(roles.tenantId, tenantId)))
          .limit(1);

        if (!targetRole) {
          return { ok: false, error: "Forbidden: Target role not found or belongs to another tenant" };
        }

        // Fetch system permissions matching codes
        const dbPerms = await tx.select({ id: permissions.id, code: permissions.code }).from(permissions);
        const permMap = new Map(dbPerms.map((p: { id: string; code: string }) => [p.code, p.id]));

        // Replace role_permissions rows in transaction
        await tx
          .delete(rolePermissions)
          .where(and(eq(rolePermissions.roleId, data.roleId), eq(rolePermissions.tenantId, tenantId)));

        const newRows = data.permissionCodes
          .map((code) => permMap.get(code))
          .filter((pId): pId is string => Boolean(pId))
          .map((pId) => ({
            roleId: data.roleId,
            permissionId: pId,
            tenantId,
          }));

        if (newRows.length > 0) {
          await tx.insert(rolePermissions).values(newRows);
        }

        // SYNCHRONOUS Cache Invalidation within same request
        invalidatePermissionCache(tenantId, data.roleId);

        return {
          ok: true,
          roleId: data.roleId,
          permissionCodes: data.permissionCodes,
        };
      });
    } catch (err: any) {
      console.error("updateRolePermissionsServerFn failed:", err);
      return { ok: false, error: "Failed to update role permissions" };
    }
  });

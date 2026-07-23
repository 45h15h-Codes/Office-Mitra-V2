export interface PermissionDefinition {
  code: string;
  category: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { code: "employees.view", category: "employees", description: "View employee directory and profiles" },
  { code: "employees.manage", category: "employees", description: "Create, edit, and terminate employee records" },
  { code: "screenshots.view", category: "activity", description: "View employee desktop activity screenshots" },
  { code: "attendance.approve", category: "attendance", description: "Approve or reject leave and attendance requests" },
  { code: "departments.manage", category: "organization", description: "Create and manage company departments" },
  { code: "roles.manage", category: "organization", description: "Manage organization roles and permission assignments" },
  { code: "billing.view", category: "billing", description: "View subscription plan and billing invoices" },
  { code: "billing.manage", category: "billing", description: "Modify subscription plan and billing payment methods" },
  { code: "settings.view", category: "settings", description: "View tenant-wide operational settings" },
  { code: "settings.manage", category: "settings", description: "Modify tenant-wide operational settings" },
  { code: "devices.manage", category: "security", description: "Register, view, and revoke desktop monitoring devices" },
  { code: "reports.view", category: "analytics", description: "Access workforce productivity analytics and reports" },
  { code: "audit.view", category: "security", description: "View organization security audit logs" },
];

// In-memory permission cache: key `${tenantId}:${roleId}` -> Set of permission codes
const permissionCache = new Map<string, Set<string>>();

export function invalidatePermissionCache(tenantId: string, roleId?: string): void {
  if (roleId) {
    permissionCache.delete(`${tenantId}:${roleId}`);
  } else {
    for (const key of permissionCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        permissionCache.delete(key);
      }
    }
  }
}

export async function getRolePermissions(
  tx: any,
  tenantId: string,
  roleId: string
): Promise<Set<string>> {
  const cacheKey = `${tenantId}:${roleId}`;
  if (permissionCache.has(cacheKey)) {
    return permissionCache.get(cacheKey)!;
  }

  const { rolePermissions, permissions } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  const rows = await tx
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

  const permCodes = new Set<string>(rows.map((r: { code: string }) => r.code));
  permissionCache.set(cacheKey, permCodes);
  return permCodes;
}

export async function checkPermission(
  tx: any,
  userId: string,
  tenantId: string,
  permissionCode: string
): Promise<boolean> {
  const { users } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  const [user] = await tx
    .select({ roleId: users.roleId })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!user || !user.roleId) return false;

  const rolePerms = await getRolePermissions(tx, tenantId, user.roleId);
  return rolePerms.has(permissionCode);
}

export function requirePermission(permissionCode: string) {
  return createMiddleware()
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      const { tenantId, userId } = context;
      const allowed = await withTenantContext(tenantId, async (tx) => {
        return checkPermission(tx, userId, tenantId, permissionCode);
      });

      if (!allowed) {
        throw new Error(`Forbidden: Insufficient permissions (${permissionCode})`);
      }

      return next({ context });
    });
}

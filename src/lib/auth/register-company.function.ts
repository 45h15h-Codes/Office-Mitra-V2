import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const registerCompanySchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  ownerEmail: z.string().email("Invalid email address"),
  ownerName: z.string().min(1, "Owner name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type RegisterCompanyResult = { ok: true; tenantId: string } | { ok: false; error: string };

export const registerCompanyServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerCompanySchema.parse(data))
  .handler(async ({ data }): Promise<RegisterCompanyResult> => {
    const { superDb } = await import("../../../db/connection");
    const { tenants, roles, permissions, rolePermissions, users, departments, tenantSettings } =
      await import("../../../db/schema");
    const { hashPassword } = await import("./password");

    const companyNameClean = data.companyName.trim();
    const ownerEmailClean = data.ownerEmail.trim().toLowerCase();
    const slug = companyNameClean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    try {
      const result = await superDb.transaction(async (tx) => {
        // a. Insert tenant
        const [tenant] = await tx
          .insert(tenants)
          .values({
            name: companyNameClean,
            slug: slug || `tenant-${Date.now()}`,
            status: "active",
            planId: "free",
          })
          .returning();

        // b. Insert default roles
        const roleDefs = [
          { name: "Owner", isSystemRole: true },
          { name: "Admin", isSystemRole: true },
          { name: "HR", isSystemRole: true },
          { name: "Manager", isSystemRole: true },
          { name: "Employee", isSystemRole: true },
        ];

        const insertedRoles = await tx
          .insert(roles)
          .values(
            roleDefs.map((r) => ({
              tenantId: tenant.id,
              name: r.name,
              isSystemRole: r.isSystemRole,
            })),
          )
          .returning();

        const roleMap = new Map(insertedRoles.map((r) => [r.name, r.id]));
        const ownerRoleId = roleMap.get("Owner")!;

        // c. Wire up role_permissions
        const allPermissions = await tx.query.permissions.findMany();
        const permMap = new Map(allPermissions.map((p) => [p.code, p.id]));

        const roleAssignments: Record<string, string[]> = {
          Owner: allPermissions.map((p) => p.code),
          Admin: allPermissions.map((p) => p.code),
          HR: ["employees.view", "employees.manage", "attendance.approve", "departments.manage"],
          Manager: ["employees.view", "screenshots.view", "attendance.approve", "reports.view"],
          Employee: ["employees.view"],
        };

        const rolePermRows: { roleId: string; permissionId: string; tenantId: string }[] = [];
        for (const [roleName, permCodes] of Object.entries(roleAssignments)) {
          const rId = roleMap.get(roleName);
          if (!rId) continue;
          for (const code of permCodes) {
            const pId = permMap.get(code);
            if (pId) {
              rolePermRows.push({ roleId: rId, permissionId: pId, tenantId: tenant.id });
            }
          }
        }

        if (rolePermRows.length > 0) {
          await tx.insert(rolePermissions).values(rolePermRows);
        }

        // d. Hash password & insert owner user
        const passwordHash = await hashPassword(data.password);
        await tx.insert(users).values({
          tenantId: tenant.id,
          email: ownerEmailClean,
          passwordHash,
          roleId: ownerRoleId,
          status: "active",
        });

        // e. Insert default departments
        const defaultDepts = ["Engineering", "Sales & Marketing", "Human Resources"];
        await tx
          .insert(departments)
          .values(defaultDepts.map((name) => ({ tenantId: tenant.id, name })));

        // f. Insert default tenant settings
        await tx.insert(tenantSettings).values({
          tenantId: tenant.id,
          screenshotInterval: 300,
          blurEnabled: false,
          workingHoursStart: "09:00",
          workingHoursEnd: "18:00",
        });

        // g. Insert default v1 consent policy
        const { consentVersions } = await import("../../../db/schema");
        await tx.insert(consentVersions).values({
          tenantId: tenant.id,
          version: "1.0",
          policyText: "Default Monitoring Transparency Policy: OfficeMitra records desktop activity, application usage, and timesheets during working hours to maintain workforce productivity analytics.",
        });

        return tenant.id;
      });

      return { ok: true, tenantId: result };
    } catch (err: any) {
      console.error("registerCompanyServerFn failed:", err);
      const isDuplicate =
        err.code === "23505" ||
        err.cause?.code === "23505" ||
        err.message?.includes("duplicate key") ||
        err.message?.includes("unique constraint");

      if (isDuplicate) {
        return { ok: false, error: "Company name already taken" };
      }
      return { ok: false, error: "Registration failed, please try again" };
    }
  });

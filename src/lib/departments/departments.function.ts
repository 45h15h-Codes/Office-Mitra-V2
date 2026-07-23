import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/middleware/auth";
import { checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";

const createDepartmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
});

const updateDepartmentSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID"),
  name: z.string().min(1, "Department name is required"),
});

const deleteDepartmentSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID"),
});

export type DepartmentRecord = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
};

export type GetDepartmentsResult = { ok: true; departments: DepartmentRecord[] } | { ok: false; error: string };
export type CreateDepartmentResult = { ok: true; department: DepartmentRecord } | { ok: false; error: string };
export type UpdateDepartmentResult = { ok: true; department: DepartmentRecord } | { ok: false; error: string };
export type DeleteDepartmentResult = { ok: true; deletedId: string } | { ok: false; error: string };

export const getDepartmentsServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GetDepartmentsResult> => {
    const { tenantId, userId } = context;
    const { departments } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const deptList = await tx
          .select()
          .from(departments)
          .where(eq(departments.tenantId, tenantId));

        return { ok: true, departments: deptList as DepartmentRecord[] };
      });
    } catch (err: any) {
      console.error("getDepartmentsServerFn failed:", err);
      return { ok: false, error: "Failed to retrieve departments" };
    }
  });

export const createDepartmentServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => createDepartmentSchema.parse(data))
  .handler(async ({ data, context }): Promise<CreateDepartmentResult> => {
    const { tenantId, userId } = context;
    const { departments } = await import("../../../db/schema");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "departments.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const [newDept] = await tx
          .insert(departments)
          .values({
            tenantId,
            name: data.name.trim(),
          })
          .returning();

        return { ok: true, department: newDept as DepartmentRecord };
      });
    } catch (err: any) {
      console.error("createDepartmentServerFn failed:", err);
      return { ok: false, error: "Failed to create department" };
    }
  });

export const updateDepartmentServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => updateDepartmentSchema.parse(data))
  .handler(async ({ data, context }): Promise<UpdateDepartmentResult> => {
    const { tenantId, userId } = context;
    const { departments } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "departments.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const [updatedDept] = await tx
          .update(departments)
          .set({ name: data.name.trim() })
          .where(and(eq(departments.id, data.departmentId), eq(departments.tenantId, tenantId)))
          .returning();

        if (!updatedDept) {
          return { ok: false, error: "Department not found or forbidden" };
        }

        return { ok: true, department: updatedDept as DepartmentRecord };
      });
    } catch (err: any) {
      console.error("updateDepartmentServerFn failed:", err);
      return { ok: false, error: "Department not found or forbidden" };
    }
  });

export const deleteDepartmentServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => deleteDepartmentSchema.parse(data))
  .handler(async ({ data, context }): Promise<DeleteDepartmentResult> => {
    const { tenantId, userId } = context;
    const { departments } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "departments.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const [deletedDept] = await tx
          .delete(departments)
          .where(and(eq(departments.id, data.departmentId), eq(departments.tenantId, tenantId)))
          .returning();

        if (!deletedDept) {
          return { ok: false, error: "Department not found or forbidden" };
        }

        return { ok: true, deletedId: deletedDept.id };
      });
    } catch (err: any) {
      console.error("deleteDepartmentServerFn failed:", err);
      return { ok: false, error: "Department not found or forbidden" };
    }
  });

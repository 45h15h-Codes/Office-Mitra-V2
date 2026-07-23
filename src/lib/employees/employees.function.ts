import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/middleware/auth";
import { checkPermission } from "@/lib/permissions";

const createEmployeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  departmentId: z.string().uuid().optional().nullable(),
  status: z.enum(["invited", "active", "inactive"]).optional(),
});

const getEmployeeByIdSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
});

export type EmployeeRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  departmentId: string | null;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
};

export type GetEmployeesResult = { ok: true; employees: EmployeeRecord[] } | { ok: false; error: string };
export type CreateEmployeeResult = { ok: true; employee: EmployeeRecord } | { ok: false; error: string };
export type GetEmployeeByIdResult = { ok: true; employee: EmployeeRecord } | { ok: false; error: string };

export const getEmployeesServerFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GetEmployeesResult> => {
    const { tenantId, userId } = context;
    const { withTenantContext } = await import("../tenant-context");
    const { employees } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const { checkEmployeeConsent } = await import("../consent/consent.function");
        const hasConsent = await checkEmployeeConsent(tx, tenantId, userId);
        if (!hasConsent) {
          return { ok: false, error: "ConsentRequired: Monitoring policy consent required" };
        }

        const allowed = await checkPermission(tx, userId, tenantId, "employees.view");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const rows = await tx.query.employees.findMany({
          where: eq(employees.tenantId, tenantId),
          orderBy: (e, { desc }) => [desc(e.createdAt)],
        });

        return { ok: true, employees: rows as EmployeeRecord[] };
      });
    } catch (err: any) {
      console.error("getEmployeesServerFn failed:", err);
      return { ok: false, error: "Failed to retrieve employees" };
    }
  });

export const createEmployeeServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => createEmployeeSchema.parse(data))
  .handler(async ({ data, context }): Promise<CreateEmployeeResult> => {
    const { tenantId, userId } = context;
    const { withTenantContext } = await import("../tenant-context");
    const { employees } = await import("../../../db/schema");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "employees.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const [newEmp] = await tx
          .insert(employees)
          .values({
            tenantId,
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            departmentId: data.departmentId || null,
            status: data.status || "invited",
          })
          .returning();

        return { ok: true, employee: newEmp as EmployeeRecord };
      });
    } catch (err: any) {
      console.error("createEmployeeServerFn failed:", err);
      return { ok: false, error: "Failed to create employee" };
    }
  });

export const getEmployeeByIdServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => getEmployeeByIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<GetEmployeeByIdResult> => {
    const { tenantId, userId } = context;
    const { withTenantContext } = await import("../tenant-context");
    const { employees } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "employees.view");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const emp = await tx.query.employees.findFirst({
          where: and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)),
        });

        if (!emp) {
          return { ok: false, error: "Employee not found" };
        }

        return { ok: true, employee: emp as EmployeeRecord };
      });
    } catch (err: any) {
      console.error("getEmployeeByIdServerFn failed:", err);
      return { ok: false, error: "Employee not found" };
    }
  });

const updateEmployeeSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  name: z.string().min(1).optional(),
  status: z.enum(["invited", "active", "inactive"]).optional(),
  tenantId: z.string().optional(), // Payload tenantId, if passed, IS IGNORED
});

const deleteEmployeeSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  tenantId: z.string().optional(), // Payload tenantId, if passed, IS IGNORED
});

export type UpdateEmployeeResult = { ok: true; employee: EmployeeRecord } | { ok: false; error: string };
export type DeleteEmployeeResult = { ok: true; deletedId: string } | { ok: false; error: string };

export const updateEmployeeServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => updateEmployeeSchema.parse(data))
  .handler(async ({ data, context }): Promise<UpdateEmployeeResult> => {
    // SECURITY: tenantId comes ONLY from authenticated session context, payload tenantId ignored
    const { tenantId, userId } = context;
    const { withTenantContext } = await import("../tenant-context");
    const { employees } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "employees.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const updateData: Record<string, any> = {};
        if (data.name) updateData.name = data.name.trim();
        if (data.status) updateData.status = data.status;

        const [updatedEmp] = await tx
          .update(employees)
          .set(updateData)
          .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
          .returning();

        if (!updatedEmp) {
          return { ok: false, error: "Employee not found or forbidden" };
        }

        return { ok: true, employee: updatedEmp as EmployeeRecord };
      });
    } catch (err: any) {
      console.error("updateEmployeeServerFn failed:", err);
      return { ok: false, error: "Employee not found or forbidden" };
    }
  });

export const deleteEmployeeServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => deleteEmployeeSchema.parse(data))
  .handler(async ({ data, context }): Promise<DeleteEmployeeResult> => {
    // SECURITY: tenantId comes ONLY from authenticated session context, payload tenantId ignored
    const { tenantId, userId } = context;
    const { withTenantContext } = await import("../tenant-context");
    const { employees } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "employees.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: insufficient permissions" };
        }

        const [deletedEmp] = await tx
          .delete(employees)
          .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
          .returning();

        if (!deletedEmp) {
          return { ok: false, error: "Employee not found or forbidden" };
        }

        return { ok: true, deletedId: deletedEmp.id };
      });
    } catch (err: any) {
      console.error("deleteEmployeeServerFn failed:", err);
      return { ok: false, error: "Employee not found or forbidden" };
    }
  });


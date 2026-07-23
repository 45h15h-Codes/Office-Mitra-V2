import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/middleware/auth";
import { checkPermission } from "@/lib/permissions";
import { withTenantContext } from "@/lib/tenant-context";

const recordConsentSchema = z.object({
  consentVersionId: z.string().uuid("Invalid consent version ID"),
});

const bumpConsentVersionSchema = z.object({
  version: z.string().min(1, "Version is required"),
  policyText: z.string().min(1, "Policy text is required"),
});

export type ConsentVersionRecord = {
  id: string;
  tenantId: string;
  version: string;
  policyText: string;
  createdAt: Date;
};

export type ActiveConsentResult = { ok: true; consentVersion: ConsentVersionRecord } | { ok: false; error: string };
export type RecordConsentResult = { ok: true; consentId: string } | { ok: false; error: string };
export type BumpConsentResult = { ok: true; consentVersion: ConsentVersionRecord } | { ok: false; error: string };

export async function checkEmployeeConsent(
  tx: any,
  tenantId: string,
  userId: string
): Promise<boolean> {
  const { employees, consentVersions, employeeConsents } = await import("../../../db/schema");
  const { eq, and, desc } = await import("drizzle-orm");

  // Fetch employee record for user
  const [emp] = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)))
    .limit(1);

  if (!emp) {
    // Non-employee accounts (e.g. system owner prior to invite) pass consent gate
    return true;
  }

  // Fetch latest active consent version
  const [latestVersion] = await tx
    .select({ id: consentVersions.id })
    .from(consentVersions)
    .where(eq(consentVersions.tenantId, tenantId))
    .orderBy(desc(consentVersions.createdAt))
    .limit(1);

  if (!latestVersion) {
    return true;
  }

  // Check if employee accepted latest consent version
  const [consent] = await tx
    .select({ id: employeeConsents.id })
    .from(employeeConsents)
    .where(
      and(
        eq(employeeConsents.tenantId, tenantId),
        eq(employeeConsents.employeeId, emp.id),
        eq(employeeConsents.consentVersionId, latestVersion.id)
      )
    )
    .limit(1);

  return Boolean(consent);
}

export function requireConsent() {
  return createMiddleware()
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      const { tenantId, userId } = context;
      const hasConsent = await withTenantContext(tenantId, async (tx) => {
        return checkEmployeeConsent(tx, tenantId, userId);
      });

      if (!hasConsent) {
        throw new Error("ConsentRequired: Monitoring policy consent required");
      }

      return next({ context });
    });
}

export const getActiveConsentVersionServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ActiveConsentResult> => {
    const { tenantId } = context;
    const { consentVersions } = await import("../../../db/schema");
    const { eq, desc } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        let [latest] = await tx
          .select()
          .from(consentVersions)
          .where(eq(consentVersions.tenantId, tenantId))
          .orderBy(desc(consentVersions.createdAt))
          .limit(1);

        if (!latest) {
          // Seed fallback if missing
          [latest] = await tx
            .insert(consentVersions)
            .values({
              tenantId,
              version: "1.0",
              policyText:
                "Default Monitoring Transparency Policy: OfficeMitra records desktop activity, application usage, and timesheets during working hours to maintain workforce productivity analytics.",
            })
            .returning();
        }

        return { ok: true, consentVersion: latest as ConsentVersionRecord };
      });
    } catch (err: any) {
      console.error("getActiveConsentVersionServerFn failed:", err);
      return { ok: false, error: "Failed to fetch active consent version" };
    }
  });

export const recordConsentServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => recordConsentSchema.parse(data))
  .handler(async ({ data, context, request }): Promise<RecordConsentResult> => {
    // SECURITY: employeeId comes ONLY from authenticated session user, NEVER from client input
    const { tenantId, userId } = context;
    const { employees, consentVersions, employeeConsents } = await import("../../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        // Derive employee record from session userId
        const [emp] = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.tenantId, tenantId)))
          .limit(1);

        if (!emp) {
          return { ok: false, error: "Employee record not found for user" };
        }

        // Cross-tenant check: verify target consentVersionId belongs to caller's tenantId
        const [targetVersion] = await tx
          .select({ id: consentVersions.id })
          .from(consentVersions)
          .where(and(eq(consentVersions.id, data.consentVersionId), eq(consentVersions.tenantId, tenantId)))
          .limit(1);

        if (!targetVersion) {
          return { ok: false, error: "Forbidden: Invalid consent version for tenant" };
        }

        // Extract real IP from request headers (x-forwarded-for or x-real-ip)
        const rawReq = request || (context as any)?.request;
        const headers = rawReq?.headers;
        const xForwarded = headers?.get ? headers.get("x-forwarded-for") : null;
        const xReal = headers?.get ? headers.get("x-real-ip") : null;
        const ipAddress = xForwarded ? xForwarded.split(",")[0].trim() : xReal || "127.0.0.1";

        const [newConsent] = await tx
          .insert(employeeConsents)
          .values({
            tenantId,
            employeeId: emp.id,
            consentVersionId: targetVersion.id,
            ipAddress,
          })
          .returning();

        return { ok: true, consentId: newConsent.id };
      });
    } catch (err: any) {
      console.error("recordConsentServerFn failed:", err);
      return { ok: false, error: "Failed to record consent" };
    }
  });

export const bumpConsentVersionServerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => bumpConsentVersionSchema.parse(data))
  .handler(async ({ data, context }): Promise<BumpConsentResult> => {
    const { tenantId, userId } = context;
    const { consentVersions } = await import("../../../db/schema");

    try {
      return await withTenantContext(tenantId, async (tx) => {
        const allowed = await checkPermission(tx, userId, tenantId, "settings.manage");
        if (!allowed) {
          return { ok: false, error: "Forbidden: Insufficient permissions" };
        }

        const [newVersion] = await tx
          .insert(consentVersions)
          .values({
            tenantId,
            version: data.version.trim(),
            policyText: data.policyText.trim(),
          })
          .returning();

        return { ok: true, consentVersion: newVersion as ConsentVersionRecord };
      });
    } catch (err: any) {
      console.error("bumpConsentVersionServerFn failed:", err);
      return { ok: false, error: "Failed to bump consent version" };
    }
  });

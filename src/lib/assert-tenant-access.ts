/**
 * Guard: throws 403-equivalent if the resource's tenant doesn't match
 * the requesting user's tenant.
 *
 * Use this for cross-tenant access checks OUTSIDE of RLS
 * (e.g. validating a URL param before even hitting the DB).
 */
export function assertTenantAccess(
  resourceTenantId: string,
  requestTenantId: string,
): void {
  if (resourceTenantId !== requestTenantId) {
    throw new Error(
      `Forbidden: tenant mismatch (resource=${resourceTenantId}, request=${requestTenantId})`,
    );
  }
}

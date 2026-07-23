import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRolePermissionMatrixServerFn, updateRolePermissionsServerFn } from "@/lib/roles/roles.function";
import { Shield, Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/roles")({
  component: RolesPage,
});

function RolesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["role-permission-matrix"],
    queryFn: () => getRolePermissionMatrixServerFn(),
  });

  const [localMatrix, setLocalMatrix] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (data?.ok) {
      setLocalMatrix(data.matrix);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (variables: { roleId: string; permissionCodes: string[] }) =>
      updateRolePermissionsServerFn({ data: variables }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["role-permission-matrix"] });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data || !data.ok) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load roles & permissions matrix: {error?.message || (data as any)?.error}
      </div>
    );
  }

  const { roles, permissions } = data;

  const togglePermission = (roleId: string, permCode: string) => {
    const current = localMatrix[roleId] || [];
    const next = current.includes(permCode)
      ? current.filter((c) => c !== permCode)
      : [...current, permCode];

    setLocalMatrix((prev) => ({ ...prev, [roleId]: next }));
    updateMutation.mutate({ roleId, permissionCodes: next });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Roles & Permissions Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage granular access control grants per tenant role.
          </p>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="p-4 w-72">Permission</th>
                <th className="p-4">Category</th>
                {roles.map((role) => (
                  <th key={role.id} className="p-4 text-center">
                    <div>{role.name}</div>
                    {role.isSystemRole && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono">
                        System
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissions.map((perm) => (
                <tr key={perm.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-mono text-xs font-medium text-foreground">
                    {perm.code}
                    <div className="text-[11px] font-sans font-normal text-muted-foreground mt-0.5">
                      {perm.description}
                    </div>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground capitalize">{perm.category}</td>
                  {roles.map((role) => {
                    const isGranted = (localMatrix[role.id] || []).includes(perm.code);
                    return (
                      <td key={role.id} className="p-4 text-center">
                        <button
                          onClick={() => togglePermission(role.id, perm.code)}
                          disabled={updateMutation.isPending}
                          className={`h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors ${
                            isGranted
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {isGranted && <Check className="h-4 w-4" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

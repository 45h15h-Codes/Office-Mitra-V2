import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDepartmentsServerFn,
  createDepartmentServerFn,
  updateDepartmentServerFn,
  deleteDepartmentServerFn,
  type DepartmentRecord,
} from "@/lib/departments/departments.function";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building, Loader2 } from "lucide-react";

export const Route = createFileRoute("/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; dept: DepartmentRecord | null }>({ open: false, dept: null });
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["departments"],
    queryFn: () => getDepartmentsServerFn(),
  });

  const createMutation = useMutation({
    mutationFn: (newName: string) => createDepartmentServerFn({ data: { name: newName } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["departments"] });
        setDialog({ open: false, dept: null });
        setName("");
      } else {
        setErrorMsg(res.error);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: { id: string; name: string }) =>
      updateDepartmentServerFn({ data: { departmentId: variables.id, name: variables.name } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["departments"] });
        setDialog({ open: false, dept: null });
        setName("");
      } else {
        setErrorMsg(res.error);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartmentServerFn({ data: { departmentId: id } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["departments"] });
      }
    },
  });

  const openCreateDialog = () => {
    setName("");
    setErrorMsg("");
    setDialog({ open: true, dept: null });
  };

  const openEditDialog = (dept: DepartmentRecord) => {
    setName(dept.name);
    setErrorMsg("");
    setDialog({ open: true, dept });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (dialog.dept) {
      updateMutation.mutate({ id: dialog.dept.id, name: name.trim() });
    } else {
      createMutation.mutate(name.trim());
    }
  };

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
        Failed to load departments: {error?.message || (data as any)?.error}
      </div>
    );
  }

  const depts = data.departments;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Organization</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Departments</h1>
          <p className="text-sm text-muted-foreground">{depts.length} departments active in organization.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-1">
          <Plus className="h-4 w-4" /> New department
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {depts.map((d) => (
          <Card key={d.id} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" /> {d.name}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(d)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete department ${d.name}?`)) {
                      deleteMutation.mutate(d.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Created {new Date(d.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}

        {depts.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
            No departments created yet. Click "New department" to add one.
          </div>
        )}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, dept: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.dept ? "Edit department" : "Create department"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {errorMsg && <div className="text-sm text-destructive font-medium">{errorMsg}</div>}
            <div className="space-y-2">
              <Label htmlFor="dept-name">Department Name</Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering, Sales, Marketing"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, dept: null })}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {dialog.dept ? "Save changes" : "Create department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

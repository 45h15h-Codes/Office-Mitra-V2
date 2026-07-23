import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore, ROLE_LABEL, type Role } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, User, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/employees")({ component: EmployeesPage });

export type DBEmployee = {
  id: string;
  tenantId: string;
  userId: string | null;
  departmentId: string | null;
  name: string;
  email: string;
  status: string;
  createdAt: string;
};

async function fetchEmployees(): Promise<DBEmployee[]> {
  const res = await fetch("/api/employees");
  if (!res.ok) throw new Error("Failed to fetch employees");
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to fetch employees");
  return data.employees;
}

async function createEmployee(payload: { name: string; email: string; departmentId?: string | null; status?: string }): Promise<DBEmployee> {
  const res = await fetch("/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: payload }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to create employee");
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to create employee");
  return data.employee;
}

function EmployeesPage() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<DBEmployee | null>(null);

  const { data: dbEmployees = [], isLoading, isError, error } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const rows = useMemo(() => dbEmployees.filter((e) => {
    if (deptFilter !== "all" && e.departmentId !== deptFilter) return false;
    if (q && !(e.name + e.email).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [dbEmployees, q, deptFilter]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">People</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {dbEmployees.length} employees · {state.departments.length} departments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 h-9 w-56" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {state.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Add employee</Button>
        </div>
      </div>

      {isError && (
        <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {(error as Error)?.message || "Failed to load employees from database."}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">
                    Loading employees from database…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">
                    No employees found in database.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e) => {
                  const dept = state.departments.find((d) => d.id === e.departmentId);
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => setViewing(e)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-xs font-semibold">
                            {initials(e.name)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{e.name}</div>
                            <div className="text-[11px] text-muted-foreground">{e.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{dept?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-xs ${e.status === "active" ? "text-[oklch(0.55_0.16_155)]" : "text-muted-foreground"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${e.status === "active" ? "bg-[oklch(0.68_0.16_155)]" : "bg-muted-foreground"}`} />
                          {e.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <EmployeeProfileDialog employee={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function EmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { state } = useStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setName("");
      setEmail("");
      setDepartmentId("none");
      setError(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create employee");
    },
  });

  const save = () => {
    if (!name.trim() || !email.trim()) return;
    setError(null);
    mutation.mutate({
      name: name.trim(),
      email: email.trim(),
      departmentId: departmentId === "none" ? null : departmentId,
      status: "active",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input id="employee-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input id="employee-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select Department —</SelectItem>
                {state.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="employee-submit-btn" onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeProfileDialog({ employee, onClose }: { employee: DBEmployee | null; onClose: () => void }) {
  const { state } = useStore();
  if (!employee) return null;
  const dept = state.departments.find((d) => d.id === employee.departmentId);
  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground grid place-items-center font-semibold">{initials(employee.name)}</div>
          <div>{employee.name}<div className="text-xs font-normal text-muted-foreground">{employee.email}</div></div>
        </DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Email" value={employee.email} />
          <Info label="Department" value={dept?.name ?? "—"} />
          <Info label="Created" value={new Date(employee.createdAt).toLocaleDateString()} />
          <Info label="Status" value={employee.status} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-sm">{value}</div></div>
  );
}

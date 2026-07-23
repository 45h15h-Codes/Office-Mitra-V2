import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { getEmployeeAnalytics, subordinatesOf } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpRight, Users, Clock, Zap, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/my-team")({ component: MyTeamPage });

function MyTeamPage() {
  const { state, currentUser } = useStore();
  const navigate = useNavigate();

  // Admins can act as a dept head of any department for viewing;
  // dept_head is scoped to their own department.
  const head =
    currentUser?.role === "dept_head"
      ? currentUser
      : currentUser
        ? currentUser
        : null;

  const subs = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "dept_head") return subordinatesOf(currentUser, state.employees);
    // Admin / HR / Super Admin: show everyone as if managing all
    if (["super_admin", "admin", "hr"].includes(currentUser.role)) {
      return state.employees.filter((e) => e.id !== currentUser.id);
    }
    return [];
  }, [currentUser, state.employees]);

  const rows = useMemo(
    () => subs.map((e) => ({ emp: e, a: getEmployeeAnalytics(e, state.tasks, 30) })),
    [subs, state.tasks],
  );

  const dept = head ? state.departments.find((d) => d.id === head.departmentId) : null;

  const teamKpis = useMemo(() => {
    const n = rows.length || 1;
    const attendance = Math.round(rows.reduce((s, r) => s + r.a.summary.attendancePct, 0) / n);
    const productivity = Math.round(rows.reduce((s, r) => s + r.a.summary.productivityPct, 0) / n);
    const hours = +rows.reduce((s, r) => s + r.a.summary.totalHours, 0).toFixed(0);
    const done = rows.reduce((s, r) => s + r.a.summary.tasksCompleted, 0);
    const assigned = rows.reduce((s, r) => s + r.a.summary.tasksAssigned, 0);
    const overdue = rows.reduce((s, r) => s + r.a.summary.tasksOverdue, 0);
    return { attendance, productivity, hours, done, assigned, overdue, size: rows.length };
  }, [rows]);

  if (!currentUser) return null;

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Department head view</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {dept ? dept.name : "My team"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {teamKpis.size} subordinate{teamKpis.size === 1 ? "" : "s"} · Rolling 30-day window
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={Users} label="Team size" value={String(teamKpis.size)} sub="reports" />
        <Kpi icon={Clock} label="Team hours" value={`${teamKpis.hours}h`} sub="last 30 days" />
        <Kpi icon={Zap} label="Avg productivity" value={`${teamKpis.productivity}%`} sub="focus ratio" />
        <Kpi icon={CheckCircle2} label="Tasks done" value={`${teamKpis.done}/${teamKpis.assigned}`} sub="completion" />
        <Kpi icon={AlertCircle} label="Overdue" value={String(teamKpis.overdue)} sub="tasks past due" />
        <Kpi icon={Users} label="Attendance" value={`${teamKpis.attendance}%`} sub="avg present" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Subordinates</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Productivity</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead className="text-right">Drill down</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ emp, a }) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/analytics", search: { employeeId: emp.id, days: 30 } })}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {emp.photo ? (
                        <img src={emp.photo} className="h-8 w-8 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground grid place-items-center text-xs font-semibold">
                          {emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium">{emp.name}</div>
                        <div className="text-[11px] text-muted-foreground">{emp.designation}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Progress value={a.summary.attendancePct} className="h-1.5 w-24" />
                      <span className="text-xs text-muted-foreground">{a.summary.attendancePct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{a.summary.totalHours}h</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <Progress value={a.summary.productivityPct} className="h-1.5 w-24" />
                      <span className="text-xs text-muted-foreground">{a.summary.productivityPct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.summary.tasksCompleted}/{a.summary.tasksAssigned}
                  </TableCell>
                  <TableCell>
                    {a.summary.tasksOverdue > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">{a.summary.tasksOverdue}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button asChild variant="ghost" size="sm" className="h-8">
                      <Link to="/analytics" search={{ employeeId: emp.id, days: 30 }}>
                        View <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    No subordinates in your department yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="text-xl font-semibold mt-2">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}
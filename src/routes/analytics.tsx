import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { getEmployeeAnalytics, visibleEmployeesFor } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ListTodo,
} from "lucide-react";

const searchSchema = z.object({
  employeeId: fallback(z.string(), "").default(""),
  days: fallback(z.number(), 30).default(30),
});

export const Route = createFileRoute("/analytics")({
  validateSearch: zodValidator(searchSchema),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { state, currentUser } = useStore();
  const { employeeId, days } = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics" });

  const visible = useMemo(
    () => visibleEmployeesFor(currentUser, state.employees),
    [currentUser, state.employees],
  );
  const selectedId =
    employeeId && visible.some((e) => e.id === employeeId)
      ? employeeId
      : (currentUser?.role === "employee" ? currentUser.id : visible[0]?.id ?? "");
  const emp = visible.find((e) => e.id === selectedId);
  const dept = state.departments.find((d) => d.id === emp?.departmentId);

  const data = useMemo(
    () => (emp ? getEmployeeAnalytics(emp, state.tasks, days) : null),
    [emp, state.tasks, days],
  );

  if (!emp || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No employees available to view.</div>
    );
  }

  const setEmp = (id: string) =>
    navigate({ search: (p: { employeeId: string; days: number }) => ({ ...p, employeeId: id }) });
  const setDays = (d: number) =>
    navigate({ search: (p: { employeeId: string; days: number }) => ({ ...p, days: d }) });

  const trend = data.records
    .filter((r) => r.status === "present")
    .slice(-Math.min(30, data.records.length))
    .map((r) => ({
      date: r.date.slice(5),
      productive: r.productive,
      neutral: r.neutral,
      unproductive: r.unproductive,
    }));

  const kpis = [
    { icon: CalendarDays, label: "Attendance", value: `${data.summary.attendancePct}%`, sub: `${data.summary.presentDays}/${data.summary.workingDays} working days` },
    { icon: Clock, label: "Total hours", value: `${data.summary.totalHours}h`, sub: `${data.summary.avgHoursPerDay}h avg/day` },
    { icon: Zap, label: "Productivity", value: `${data.summary.productivityPct}%`, sub: `${data.summary.focusHours}h focus` },
    { icon: CheckCircle2, label: "Tasks done", value: `${data.summary.tasksCompleted}/${data.summary.tasksAssigned}`, sub: `${data.summary.onTimePct}% on time` },
    { icon: AlertCircle, label: "Overdue", value: String(data.summary.tasksOverdue), sub: `${data.summary.tasksInProgress} in progress` },
    { icon: TrendingUp, label: "Leaves", value: String(data.summary.leaveDays), sub: `${data.summary.absentDays} absent` },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Employee analytics</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{emp.name}</h1>
          <p className="text-sm text-muted-foreground">
            {emp.designation}{dept ? ` · ${dept.name}` : ""} · Last {days} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedId} onValueChange={setEmp}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {visible.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 h-9 ${days === d ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {d === 7 ? "7d" : d === 30 ? "30d" : "90d"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                <k.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="text-xl font-semibold mt-2">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Productivity trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="p1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.19 130)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.19 130)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="date" fontSize={10} tick={{ fill: "oklch(0.6 0 0)" }} />
                <YAxis fontSize={10} tick={{ fill: "oklch(0.6 0 0)" }} />
                <Tooltip contentStyle={{ background: "oklch(0.2 0 0)", border: "1px solid oklch(0.3 0 0)", fontSize: 12 }} />
                <Area type="monotone" dataKey="productive" stackId="1" stroke="oklch(0.82 0.19 130)" fill="url(#p1)" />
                <Area type="monotone" dataKey="neutral" stackId="1" stroke="oklch(0.72 0.16 45)" fill="oklch(0.72 0.16 45)" fillOpacity={0.3} />
                <Area type="monotone" dataKey="unproductive" stackId="1" stroke="oklch(0.6 0.22 27)" fill="oklch(0.6 0.22 27)" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Task breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.taskBreakdown} dataKey="count" nameKey="stage" outerRadius={80} innerRadius={45}>
                  {data.taskBreakdown.map((s) => (
                    <Cell key={s.stage} fill={s.tone} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "oklch(0.2 0 0)", border: "1px solid oklch(0.3 0 0)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] -mt-4">
              {data.taskBreakdown.map((s) => (
                <div key={s.stage} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.tone }} />
                  <span className="text-muted-foreground">{s.stage}</span>
                  <span className="ml-auto">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance calendar</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(20px,1fr))] gap-1">
              {data.records.map((r) => (
                <div
                  key={r.date}
                  title={`${r.date} · ${r.status}${r.hours ? ` · ${r.hours}h` : ""}`}
                  className="aspect-square rounded-sm"
                  style={{ background: statusColor(r) }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-3">
              <Legend color="oklch(0.68 0.16 155)" label="Present" />
              <Legend color="oklch(0.72 0.16 45)" label="Leave" />
              <Legend color="oklch(0.6 0.22 27)" label="Absent" />
              <Legend color="oklch(0.3 0 0)" label="Weekend" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Leaves by type</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.leaves}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
                <XAxis dataKey="type" fontSize={10} tick={{ fill: "oklch(0.6 0 0)" }} />
                <YAxis fontSize={10} tick={{ fill: "oklch(0.6 0 0)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "oklch(0.2 0 0)", border: "1px solid oklch(0.3 0 0)", fontSize: 12 }} />
                <Bar dataKey="count" fill="oklch(0.82 0.19 130)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><ListTodo className="h-4 w-4" /> Assigned tasks</CardTitle>
          <Badge variant="secondary" className="text-[10px]">{data.summary.tasksAssigned} total</Badge>
        </CardHeader>
        <CardContent>
          <TaskList employeeId={emp.id} />
        </CardContent>
      </Card>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function statusColor(r: { status: string; productive: number; hours: number }): string {
  if (r.status === "weekend") return "oklch(0.3 0 0)";
  if (r.status === "absent") return "oklch(0.6 0.22 27)";
  if (r.status === "leave") return "oklch(0.72 0.16 45)";
  const intensity = Math.min(1, r.productive / 6);
  return `oklch(${0.5 + 0.25 * intensity} 0.16 155)`;
}

function TaskList({ employeeId }: { employeeId: string }) {
  const { state } = useStore();
  const tasks = state.tasks.filter((t) => t.assigneeId === employeeId);
  if (tasks.length === 0) return <div className="text-xs text-muted-foreground py-6 text-center">No tasks assigned.</div>;
  return (
    <div className="divide-y divide-border">
      {tasks.map((t) => {
        const overdue = t.stage !== "completed" && new Date(t.dueDate) < new Date();
        return (
          <div key={t.id} className="py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{t.title}</div>
              <div className="text-[11px] text-muted-foreground">Due {new Date(t.dueDate).toLocaleDateString()}</div>
            </div>
            <Badge variant="secondary" className="text-[10px] capitalize">{t.stage.replace("_", " ")}</Badge>
            <Badge variant="outline" className="text-[10px] capitalize">{t.priority}</Badge>
            {overdue && <span className="text-[10px] text-destructive">Overdue</span>}
          </div>
        );
      })}
    </div>
  );
}
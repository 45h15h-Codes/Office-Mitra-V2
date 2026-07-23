import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Zap,
  AlertTriangle,
  Users,
  MoreHorizontal,
  Play,
  Pause,
  RefreshCcw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { overviewQueryOptions } from "@/routes/index";
import { formatDistanceToNow } from "date-fns";

const routeApi = getRouteApi("/");

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hours: Clock,
  productive: Zap,
  active: Users,
  idle: AlertTriangle,
};

const toneClass: Record<string, string> = {
  productive: "bg-[oklch(0.82_0.19_130)]",
  neutral: "bg-[oklch(0.72_0.16_45)]",
  unproductive: "bg-[oklch(0.6_0.22_27)]",
};

const statusClass: Record<string, string> = {
  active: "bg-[oklch(0.82_0.19_130)]",
  idle: "bg-[oklch(0.78_0.16_75)]",
  meeting: "bg-[oklch(0.55_0.14_250)]",
  offline: "bg-muted-foreground/40",
};

const RANGE_LABELS: Record<string, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

const TEAM_LABELS: Record<string, string> = {
  all: "All teams",
  engineering: "Engineering",
  design: "Design",
  product: "Product",
  data: "Data",
  qa: "QA",
};

export function Overview() {
  const { range, team } = routeApi.useLoaderDeps();
  const navigate = useNavigate({ from: "/" });
  const { data, isFetching, refetch } = useSuspenseQuery(overviewQueryOptions(range, team));

  const setRange = (r: string) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, range: r }) });
  const setTeam = (t: string) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, team: t }) });

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {RANGE_LABELS[range]} · {TEAM_LABELS[team]}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Workspace overview</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "bg-[oklch(0.72_0.16_45)] animate-pulse" : "bg-[oklch(0.68_0.16_155)]"}`} />
            {isFetching ? "Refreshing…" : `Updated ${formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["day", "week", "month"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 h-8 transition-colors ${
                  r === range
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {r === "day" ? "Daily" : r === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEAM_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-1">
            <Play className="h-3.5 w-3.5" /> Start tracker
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.kpis.map((k) => {
          const Icon = KPI_ICONS[k.key] ?? Clock;
          return (
            <Card key={k.key} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {k.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">{k.value}</div>
                  <div
                    className={`flex items-center gap-0.5 text-xs font-medium ${
                      k.up ? "text-[oklch(0.55_0.16_155)]" : "text-destructive"
                    }`}
                  >
                    {k.up ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {k.delta}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                Activity by {range === "day" ? "hour" : range === "week" ? "day" : "week"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Stacked by category · {RANGE_LABELS[range]} · {TEAM_LABELS[team]}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.82_0.19_130)]" /> Productive</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.72_0.16_45)]" /> Neutral</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.6_0.22_27)]" /> Unproductive</span>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.008 95)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.015 260)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.5 0.015 260)" tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "oklch(0.955 0.006 95)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.008 95)", fontSize: 12 }}
                />
                <Bar dataKey="productive" stackId="a" fill="oklch(0.82 0.19 130)" />
                <Bar dataKey="neutral" stackId="a" fill="oklch(0.72 0.16 45)" />
                <Bar dataKey="unproductive" stackId="a" fill="oklch(0.6 0.22 27)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Focus index</CardTitle>
            <p className="text-xs text-muted-foreground">
              Deep-work minutes · {RANGE_LABELS[range]}
            </p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="focus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.19 130)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.82 0.19 130)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.008 95)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.015 260)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.5 0.015 260)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.008 95)", fontSize: 12 }} />
                <Area type="monotone" dataKey="productive" stroke="oklch(0.5 0.16 140)" fill="url(#focus)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Team live */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Team — live</CardTitle>
              <p className="text-xs text-muted-foreground">
                {data.team_live.length} member{data.team_live.length === 1 ? "" : "s"} · {TEAM_LABELS[team]}
              </p>
            </div>
            <Button variant="ghost" size="sm">View all</Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-12 px-6 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border bg-muted/40">
              <div className="col-span-4">Member</div>
              <div className="col-span-3">Working on</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2">
                {range === "day" ? "Today" : range === "week" ? "Week" : "Month"}
              </div>
              <div className="col-span-2">Productive</div>
            </div>
            {data.team_live.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No members match this filter.
              </div>
            )}
            {data.team_live.map((m) => (
              <div
                key={m.name}
                className="grid grid-cols-12 items-center px-6 py-3 text-sm border-b border-border last:border-0 hover:bg-muted/30"
              >
                <div className="col-span-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-semibold">
                    {m.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-medium leading-tight">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.role}</div>
                  </div>
                </div>
                <div className="col-span-3 text-muted-foreground truncate">{m.project}</div>
                <div className="col-span-1">
                  <span className="inline-flex items-center gap-1.5 text-xs capitalize">
                    <span className={`h-2 w-2 rounded-full ${statusClass[m.status]}`} />
                    {m.status}
                  </span>
                </div>
                <div className="col-span-2 tabular-nums">{m.hours}</div>
                <div className="col-span-2 flex items-center gap-2">
                  <Progress value={m.productive} className="h-1.5" />
                  <span className="text-xs tabular-nums w-8 text-right">{m.productive}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Signals</CardTitle>
              <p className="text-xs text-muted-foreground">Anomalies & policy events</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.alerts.map((a, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-md border border-border bg-card">
                <div
                  className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                    a.tone === "err"
                      ? "bg-destructive/10 text-destructive"
                      : a.tone === "warn"
                        ? "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.5_0.14_75)]"
                        : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{a.who}</div>
                    <div className="text-[10px] text-muted-foreground">{a.t}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.msg}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Apps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top apps & sites</CardTitle>
            <p className="text-xs text-muted-foreground">Share of tracked time · {RANGE_LABELS[range]}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.apps.map((a) => (
              <div key={a.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium leading-tight">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.cat}</div>
                  </div>
                  <div className="tabular-nums text-sm">{a.pct}%</div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${toneClass[a.tone]}`} style={{ width: `${a.pct * 2.5}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Projects budget */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Projects — hours vs. budget</CardTitle>
              <p className="text-xs text-muted-foreground">{RANGE_LABELS[range]}</p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Pause className="h-3 w-3" />
              {data.projects.filter((p) => p.tracked > p.budget).length} over budget
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.projects.map((p) => {
              const pct = Math.min(120, (p.tracked / p.budget) * 100);
              const over = p.tracked > p.budget;
              return (
                <div key={p.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium">{p.name}</div>
                    <div className={`tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
                      {p.tracked}h / {p.budget}h
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden relative">
                    <div
                      className={`h-full ${over ? "bg-destructive" : "bg-[oklch(0.55_0.14_250)]"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
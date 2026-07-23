import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Tag,
  RefreshCcw,
  Save,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  BarChart3,
  Settings2,
  User,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/productivity")({
  component: ProductivityPage,
});

// ---------- types ----------
type LabelValue = "Productive" | "Unproductive" | "Neutral" | "Unclassified";

type AppLabel = {
  app_name: string;
  label: LabelValue;
  updated_at: string;
};

type ActivityEntry = {
  app: string;
  duration_seconds: number;
  domain?: string;
};

type ActivityRecord = {
  id: string;
  received_at: string;
  employee_id: string;
  kind: string;
  entry_count: number;
  entries: ActivityEntry[];
};

// ---------- helpers ----------
const LABEL_META: Record<
  LabelValue,
  { color: string; icon: React.ElementType; bg: string }
> = {
  Productive: {
    color: "text-emerald-400",
    icon: TrendingUp,
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  Unproductive: {
    color: "text-red-400",
    icon: TrendingDown,
    bg: "bg-red-500/10 border-red-500/20",
  },
  Neutral: {
    color: "text-amber-400",
    icon: Minus,
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  Unclassified: {
    color: "text-slate-400",
    icon: HelpCircle,
    bg: "bg-slate-500/10 border-slate-500/20",
  },
};

function fmtDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function LabelBadge({ label }: { label: LabelValue }) {
  const meta = LABEL_META[label];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${meta.bg} ${meta.color}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ---------- component ----------
function ProductivityPage() {
  const [tab, setTab] = useState("report");

  // ---- labels state ----
  const [appLabels, setAppLabels] = useState<AppLabel[]>([]);
  const [labelsDirty, setLabelsDirty] = useState<
    Map<string, LabelValue>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppLabel, setNewAppLabel] = useState<LabelValue>("Neutral");

  // ---- activity state ----
  const [activityRecords, setActivityRecords] = useState<ActivityRecord[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<string>("all");

  // ---- fetch labels ----
  const fetchLabels = useCallback(async () => {
    try {
      const r = await fetch("/api/public/agent/app-labels");
      const body = (await r.json()) as { labels: AppLabel[] };
      setAppLabels(body.labels ?? []);
    } catch {
      // ignore
    }
  }, []);

  // ---- fetch activity ----
  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const r = await fetch("/api/public/agent/activity?limit=200&kind=app_tracking");
      const body = (await r.json()) as { records: ActivityRecord[] };
      setActivityRecords(body.records ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  useEffect(() => {
    void fetchLabels();
    void fetchActivity();
  }, [fetchLabels, fetchActivity]);

  // ---- save dirty labels ----
  async function saveLabels() {
    if (labelsDirty.size === 0) return;
    setSaving(true);
    try {
      const payload = Array.from(labelsDirty.entries()).map(
        ([app_name, label]) => ({ app_name, label }),
      );
      await fetch("/api/public/agent/app-labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labels: payload }),
      });
      setLabelsDirty(new Map());
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      await fetchLabels();
    } finally {
      setSaving(false);
    }
  }

  // ---- add new app label ----
  async function addLabel() {
    if (!newAppName.trim()) return;
    await fetch("/api/public/agent/app-labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_name: newAppName.trim(), label: newAppLabel }),
    });
    setNewAppName("");
    await fetchLabels();
  }

  const employees = useMemo(() => {
    const set = new Set(activityRecords.map((r) => r.employee_id).filter(Boolean));
    return Array.from(set).sort();
  }, [activityRecords]);

  const filteredRecords = useMemo(() => {
    if (selectedEmp === "all") return activityRecords;
    return activityRecords.filter((r) => r.employee_id === selectedEmp);
  }, [activityRecords, selectedEmp]);

  // ---- compute report from activity + labels ----
  const report = (() => {
    // flatten all app_tracking entries, preferring domain over generic app when domain exists
    const byKey = new Map<string, { seconds: number; label: LabelValue; isDomain: boolean }>();
    for (const rec of filteredRecords) {
      if (rec.kind !== "app_tracking") continue;
      for (const e of rec.entries) {
        const key = e.domain ? e.domain : (e.app || "unknown");
        const isDomain = Boolean(e.domain);
        const labelEntry = appLabels.find(
          (l) => l.app_name.toLowerCase() === key.toLowerCase() || (!isDomain && l.app_name.toLowerCase() === (e.app || "").toLowerCase())
        );
        const label: LabelValue = labelEntry?.label ?? "Unclassified";
        const existing = byKey.get(key) ?? { seconds: 0, label, isDomain };
        byKey.set(key, {
          seconds: existing.seconds + (e.duration_seconds ?? 0),
          label,
          isDomain,
        });
      }
    }

    // group by label
    const grouped: Record<LabelValue, { app: string; seconds: number; isDomain: boolean }[]> = {
      Productive: [],
      Unproductive: [],
      Neutral: [],
      Unclassified: [],
    };
    for (const [key, { seconds, label, isDomain }] of byKey.entries()) {
      grouped[label].push({ app: key, seconds, isDomain });
    }
    for (const key of Object.keys(grouped) as LabelValue[]) {
      grouped[key].sort((a, b) => b.seconds - a.seconds);
    }

    const totalSeconds = Array.from(byKey.values()).reduce(
      (s, v) => s + v.seconds,
      0,
    );
    const labelTotals: Record<LabelValue, number> = {
      Productive: 0,
      Unproductive: 0,
      Neutral: 0,
      Unclassified: 0,
    };
    for (const [, { seconds, label }] of byKey.entries()) {
      labelTotals[label] += seconds;
    }

    return { grouped, totalSeconds, labelTotals };
  })();

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Productivity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Classify apps/domains and view time-block reports.
          </p>
        </div>
        {employees.length > 0 && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedEmp} onValueChange={setSelectedEmp}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Filter Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees ({activityRecords.length} records)</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp} value={emp}>
                    {emp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="report">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Report
          </TabsTrigger>
          <TabsTrigger value="labels">
            <Settings2 className="w-4 h-4 mr-1.5" />
            App Labels
          </TabsTrigger>
        </TabsList>

        {/* ---- REPORT TAB ---- */}
        <TabsContent value="report" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Total tracked:{" "}
              <strong>{fmtDuration(report.totalSeconds)}</strong> across{" "}
              {activityRecords.length} batches
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchActivity()}
              disabled={loadingActivity}
            >
              <RefreshCcw
                className={`w-3 h-3 mr-1.5 ${loadingActivity ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          {/* summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(
              ["Productive", "Unproductive", "Neutral", "Unclassified"] as LabelValue[]
            ).map((lbl) => {
              const meta = LABEL_META[lbl];
              const Icon = meta.icon;
              const pct =
                report.totalSeconds > 0
                  ? Math.round(
                      (report.labelTotals[lbl] / report.totalSeconds) * 100,
                    )
                  : 0;
              return (
                <Card key={lbl} className={`p-4 border ${meta.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                    <span className={`text-xs font-medium ${meta.color}`}>
                      {lbl}
                    </span>
                  </div>
                  <p className="text-xl font-bold">
                    {fmtDuration(report.labelTotals[lbl])}
                  </p>
                  <p className="text-xs text-muted-foreground">{pct}% of total</p>
                </Card>
              );
            })}
          </div>

          {/* per-label app breakdown */}
          {(
            ["Productive", "Unproductive", "Neutral", "Unclassified"] as LabelValue[]
          )
            .filter((lbl) => report.grouped[lbl].length > 0)
            .map((lbl) => (
              <Card key={lbl} className="p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <LabelBadge label={lbl} />
                  <span className="text-muted-foreground font-normal">
                    — {report.grouped[lbl].length} apps,{" "}
                    {fmtDuration(report.labelTotals[lbl])} total
                  </span>
                </h3>
                <div className="space-y-1">
                  {report.grouped[lbl].map(({ app, seconds, isDomain }) => (
                    <div
                      key={app}
                      className="flex items-center justify-between text-sm py-0.5"
                    >
                      <span className={`truncate max-w-xs flex items-center gap-1.5 ${isDomain ? "font-mono text-emerald-400 text-xs" : ""}`}>
                        {isDomain ? <Globe className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : null}
                        {app}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground text-xs flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {fmtDuration(seconds)}
                        </span>
                        {/* mini bar */}
                        <div className="w-24 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{
                              width: `${report.totalSeconds > 0 ? Math.round((seconds / report.totalSeconds) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

          {activityRecords.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No activity data yet.</p>
              <p className="text-xs mt-1">
                Run Electron agent — data appears after first 5-min batch upload.
              </p>
            </Card>
          )}
        </TabsContent>

        {/* ---- APP LABELS TAB ---- */}
        <TabsContent value="labels" className="space-y-4 mt-4">
          {/* add new */}
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Tag className="w-4 h-4" /> Add / update app label
            </h3>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-48">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  App name (exact, case-insensitive)
                </Label>
                <Input
                  placeholder="e.g. VS Code"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addLabel()}
                />
              </div>
              <div className="w-44">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Label
                </Label>
                <Select
                  value={newAppLabel}
                  onValueChange={(v) => setNewAppLabel(v as LabelValue)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "Productive",
                        "Unproductive",
                        "Neutral",
                        "Unclassified",
                      ] as LabelValue[]
                    ).map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => void addLabel()} disabled={!newAppName.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </Card>

          {/* existing labels table */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                All app labels ({appLabels.length})
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchLabels()}
                >
                  <RefreshCcw className="w-3 h-3 mr-1.5" />
                  Refresh
                </Button>
                {labelsDirty.size > 0 && (
                  <Button size="sm" onClick={() => void saveLabels()} disabled={saving}>
                    {saveOk ? (
                      <CheckCircle2 className="w-3 h-3 mr-1.5 text-emerald-400" />
                    ) : (
                      <Save className="w-3 h-3 mr-1.5" />
                    )}
                    {saving ? "Saving…" : `Save ${labelsDirty.size} change${labelsDirty.size > 1 ? "s" : ""}`}
                  </Button>
                )}
              </div>
            </div>
            <Separator />
            <div className="space-y-1 max-h-[500px] overflow-auto pr-1">
              {appLabels.map((entry) => {
                const current = labelsDirty.get(entry.app_name) ?? entry.label;
                const isDirty = labelsDirty.has(entry.app_name);
                return (
                  <div
                    key={entry.app_name}
                    className={`flex items-center justify-between py-1.5 px-2 rounded text-sm ${isDirty ? "bg-primary/5 border border-primary/20" : ""}`}
                  >
                    <span className="truncate max-w-xs">{entry.app_name}</span>
                    <Select
                      value={current}
                      onValueChange={(v) => {
                        const next = new Map(labelsDirty);
                        if (v === entry.label) {
                          next.delete(entry.app_name);
                        } else {
                          next.set(entry.app_name, v as LabelValue);
                        }
                        setLabelsDirty(next);
                      }}
                    >
                      <SelectTrigger className="w-36 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          [
                            "Productive",
                            "Unproductive",
                            "Neutral",
                            "Unclassified",
                          ] as LabelValue[]
                        ).map((l) => (
                          <SelectItem key={l} value={l} className="text-xs">
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

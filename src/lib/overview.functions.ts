import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const rangeSchema = z.enum(["day", "week", "month"]);
const teamSchema = z.enum(["all", "engineering", "design", "product", "data", "qa"]);

const inputSchema = z.object({
  range: rangeSchema.default("day"),
  team: teamSchema.default("all"),
});

export type OverviewInput = z.infer<typeof inputSchema>;

export type OverviewData = {
  generatedAt: string;
  range: "day" | "week" | "month";
  team: OverviewInput["team"];
  kpis: {
    key: string;
    label: string;
    value: string;
    delta: string;
    up: boolean;
    hint: string;
  }[];
  activity: { bucket: string; productive: number; neutral: number; unproductive: number }[];
  team_live: {
    name: string;
    role: string;
    team: string;
    project: string;
    status: "active" | "idle" | "meeting" | "offline";
    productive: number;
    hours: string;
  }[];
  apps: { name: string; cat: string; pct: number; tone: "productive" | "neutral" | "unproductive" }[];
  projects: { name: string; tracked: number; budget: number }[];
  alerts: { t: string; who: string; msg: string; tone: "info" | "warn" | "err" }[];
};

// Deterministic PRNG so re-fetches on the same key return the same shape,
// but different range/team combos yield different, believable numbers.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TEAM_MEMBERS = [
  { name: "Priya Shah", role: "Frontend", team: "engineering", project: "Atlas redesign" },
  { name: "Marco Alvarez", role: "Backend", team: "engineering", project: "Billing API" },
  { name: "Lena Okoro", role: "Product Design", team: "design", project: "Onboarding v3" },
  { name: "Jack Nguyen", role: "QA Engineer", team: "qa", project: "Release 4.2" },
  { name: "Sofia Bianchi", role: "Product Manager", team: "product", project: "Roadmap Q3" },
  { name: "Dev Patel", role: "Data Engineer", team: "data", project: "Warehouse migration" },
  { name: "Amara Diallo", role: "Design Systems", team: "design", project: "Tokens 2.0" },
  { name: "Ben Kowalski", role: "SRE", team: "engineering", project: "Incident response" },
  { name: "Iris Tanaka", role: "Analyst", team: "data", project: "Retention model" },
  { name: "Owen Reyes", role: "Frontend", team: "engineering", project: "Atlas redesign" },
];

const APPS = [
  { name: "VS Code", cat: "Development", tone: "productive" as const },
  { name: "Figma", cat: "Design", tone: "productive" as const },
  { name: "Slack", cat: "Communication", tone: "neutral" as const },
  { name: "Google Meet", cat: "Meetings", tone: "neutral" as const },
  { name: "Notion", cat: "Docs", tone: "productive" as const },
  { name: "Linear", cat: "Project", tone: "productive" as const },
  { name: "YouTube", cat: "Media", tone: "unproductive" as const },
  { name: "Twitter / X", cat: "Social", tone: "unproductive" as const },
];

const PROJECTS = [
  { name: "Atlas redesign", budget: 240 },
  { name: "Billing API v2", budget: 120 },
  { name: "Onboarding v3", budget: 80 },
  { name: "Warehouse migration", budget: 200 },
  { name: "Tokens 2.0", budget: 60 },
];

function buildData({ range, team }: OverviewInput): OverviewData {
  // Bucket to the current minute so the dashboard updates on refetch.
  const now = new Date();
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const rand = mulberry32(seedFrom(`${range}:${team}:${minuteBucket}`));
  const jitter = (base: number, spread: number) => Math.round(base + (rand() - 0.5) * spread);

  const teamScale = team === "all" ? 1 : 0.22 + rand() * 0.12;
  const totalMembers = Math.round(212 * (team === "all" ? 1 : teamScale));
  const activeMembers = Math.round(totalMembers * (0.6 + rand() * 0.2));

  const rangeScale = range === "day" ? 1 : range === "week" ? 5.4 : 22.1;

  const buckets =
    range === "day"
      ? Array.from({ length: 11 }, (_, i) => String(7 + i).padStart(2, "0"))
      : range === "week"
        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        : Array.from({ length: 4 }, (_, i) => `W${i + 1}`);

  const activity = buckets.map((bucket, i) => {
    const dayShape =
      range === "day"
        ? [0.2, 0.55, 0.9, 1, 1.05, 0.55, 0.85, 0.95, 0.9, 0.75, 0.4][i] ?? 0.5
        : range === "week"
          ? [0.9, 1, 1.05, 0.95, 0.85, 0.35, 0.25][i] ?? 0.6
          : [0.9, 1.0, 1.05, 0.7][i] ?? 0.8;
    const base = 120 * teamScale * dayShape * (range === "day" ? 1 : rangeScale / buckets.length);
    return {
      bucket,
      productive: jitter(base, base * 0.15),
      neutral: jitter(base * 0.28, base * 0.1),
      unproductive: jitter(base * 0.12, base * 0.08),
    };
  });

  const totalHours = activity.reduce((s, a) => s + a.productive + a.neutral + a.unproductive, 0);
  const productiveHours = activity.reduce((s, a) => s + a.productive, 0);
  const productivePct = (productiveHours / totalHours) * 100;

  const trackedLabel =
    totalHours >= 1000 ? `${(totalHours / 1000).toFixed(1)}k h` : `${Math.round(totalHours)} h`;

  const kpis = [
    {
      key: "hours",
      label:
        range === "day"
          ? "Tracked hours today"
          : range === "week"
            ? "Tracked hours this week"
            : "Tracked hours this month",
      value: trackedLabel,
      delta: `${rand() > 0.35 ? "+" : "-"}${(rand() * 9 + 1).toFixed(1)}%`,
      up: rand() > 0.35,
      hint: range === "day" ? "vs. yesterday" : range === "week" ? "vs. last week" : "vs. last month",
    },
    {
      key: "productive",
      label: "Productive time",
      value: `${productivePct.toFixed(1)}%`,
      delta: `${rand() > 0.4 ? "+" : "-"}${(rand() * 3).toFixed(1)} pts`,
      up: rand() > 0.4,
      hint: team === "all" ? "org average" : `${team} average`,
    },
    {
      key: "active",
      label: "Active members",
      value: `${activeMembers} / ${totalMembers}`,
      delta: `${Math.round((activeMembers / totalMembers) * 100)}%`,
      up: true,
      hint: "currently tracking",
    },
    {
      key: "idle",
      label: "Idle alerts",
      value: String(jitter(range === "day" ? 17 : range === "week" ? 84 : 312, 6)),
      delta: `${rand() > 0.5 ? "+" : "-"}${Math.round(rand() * 8) + 1}`,
      up: rand() < 0.4,
      hint: range === "day" ? "last 4 hours" : "vs. previous period",
    },
  ];

  const filteredMembers = TEAM_MEMBERS.filter((m) => team === "all" || m.team === team).slice(0, 6);
  const teamLive = filteredMembers.map((m) => {
    const productive = Math.round(60 + rand() * 38);
    const hrs = range === "day" ? 5 + rand() * 3 : range === "week" ? 28 + rand() * 12 : 130 + rand() * 40;
    const h = Math.floor(hrs);
    const mins = Math.round((hrs - h) * 60);
    const statuses: OverviewData["team_live"][number]["status"][] = [
      "active", "active", "active", "idle", "meeting", "offline",
    ];
    return {
      ...m,
      status: statuses[Math.floor(rand() * statuses.length)] ?? "active",
      productive,
      hours: `${h}h ${String(mins).padStart(2, "0")}m`,
    };
  });

  // apps: distribute 100% across the filtered app list
  const rawWeights = APPS.map(() => rand() * 100 + 5);
  const sum = rawWeights.reduce((s, v) => s + v, 0);
  const apps = APPS.map((a, i) => ({
    ...a,
    pct: Math.round((rawWeights[i]! / sum) * 100),
  }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 7);

  const projects = PROJECTS.slice(0, 4).map((p) => ({
    ...p,
    tracked: Math.round(p.budget * (0.4 + rand() * 0.9) * (range === "month" ? 1 : range === "week" ? 0.5 : 0.15)),
  }));

  const alertPool: OverviewData["alerts"] = [
    { t: "2m ago", who: "Marco A.", msg: "Left tracker idle for 22 minutes", tone: "warn" },
    { t: "18m ago", who: "Design team", msg: "Onboarding v3 crossed 70% of budgeted hours", tone: "warn" },
    { t: "41m ago", who: "Warehouse migration", msg: "Project is over budget by 5%", tone: "err" },
    { t: "1h ago", who: "Policy", msg: "Screenshot cadence lowered to 10 min for Design", tone: "info" },
    { t: "2h ago", who: "Priya S.", msg: "Focus block completed — 2h 15m uninterrupted", tone: "info" },
    { t: "3h ago", who: "Billing API", msg: "Burn-rate exceeded plan by 12%", tone: "err" },
  ];
  const alerts = alertPool.slice(0, 4);

  return {
    generatedAt: now.toISOString(),
    range,
    team,
    kpis,
    activity,
    team_live: teamLive,
    apps,
    projects,
    alerts,
  };
}

export const getOverview = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => buildData(data));
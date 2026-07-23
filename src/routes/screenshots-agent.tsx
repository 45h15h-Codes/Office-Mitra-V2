import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Play,
  Square,
  RefreshCcw,
  AlertTriangle,
  Wifi,
  WifiOff,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/screenshots-agent")({
  component: ScreenshotAgentPage,
});

// ---------- types ----------
type LogEntry = {
  ts: string;
  kind:
    | "boot"
    | "blacklist"
    | "capture"
    | "upload"
    | "queue"
    | "scheduler"
    | "warn"
    | "error";
  data: Record<string, unknown>;
};

type UploadPayload = {
  v: 1;
  employee_id: string;
  timestamp: string;
  duration_seconds: number;
  active_app: string;
  active_title: string;
  active_app_stubbed: true;
  screen: { width: number; height: number };
  image: { mime: "image/jpeg"; quality: number; bytes: number };
  image_b64: string;
};

type Capture = {
  id: string;
  ts: string;
  app: string;
  bytes: number;
  dataUrl: string;
  uploaded: boolean;
};

// ---------- mock active-app pool ----------
const APP_POOL = [
  { app: "Google Chrome", title: "OmERP — Overview" },
  { app: "VS Code", title: "main.cjs — omerp" },
  { app: "Figma", title: "Dashboard v3" },
  { app: "Slack", title: "#engineering" },
  { app: "WhatsApp", title: "Family group" },
  { app: "Chase Banking", title: "Account summary" },
  { app: "Personal Gmail", title: "Inbox" },
  { app: "Terminal", title: "npm run dev" },
];

// ---------- helpers ----------
function nowIso() {
  return new Date().toISOString();
}

async function renderMockScreenshot(
  width: number,
  height: number,
  label: string,
  quality: number,
): Promise<{ blob: Blob; dataUrl: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // gradient bg
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#0b0f10");
  g.addColorStop(1, "#1a2124");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // noise
  const img = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 24) | 0;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // fake window chrome
  ctx.fillStyle = "rgba(210,255,80,0.85)";
  ctx.fillRect(40, 40, width - 80, 44);
  ctx.fillStyle = "#0b0f10";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(label, 56, 70);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(new Date().toLocaleString(), 56, height - 40);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality / 100),
  );
  const dataUrl: string = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.readAsDataURL(blob);
  });
}

// ---------- component ----------
function ScreenshotAgentPage() {
  const { currentUser } = useStore();
  const employeeId = currentUser?.id ?? "emp-local";

  const [running, setRunning] = useState(false);
  const [intervalSec, setIntervalSec] = useState(10);
  const [jitterSec, setJitterSec] = useState(3);
  const [quality, setQuality] = useState(70);
  const [maxKB, setMaxKB] = useState(300);
  const [failMode, setFailMode] = useState<"off" | "always" | "next=3">("off");
  const [forceApp, setForceApp] = useState<string>("__random__");

  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [blacklistSource, setBlacklistSource] = useState<"remote" | "local" | "none">("none");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [queue, setQueue] = useState<UploadPayload[]>([]);
  const [lastPayload, setLastPayload] = useState<UploadPayload | null>(null);

  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  const LOCAL_FALLBACK = useMemo(
    () => [
      "WhatsApp",
      "Signal",
      "Telegram",
      "1Password",
      "Banking",
      "Chase",
      "Personal Gmail",
    ],
    [],
  );

  const pushLog = useCallback((entry: Omit<LogEntry, "ts">) => {
    setLogs((prev) => [{ ts: nowIso(), ...entry }, ...prev].slice(0, 200));
  }, []);

  const refreshBlacklist = useCallback(async () => {
    try {
      const r = await fetch("/api/public/agent/blacklist", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { keywords?: string[] };
      if (!Array.isArray(body.keywords) || !body.keywords.length)
        throw new Error("empty remote list");
      setBlacklist(body.keywords);
      setBlacklistSource("remote");
      pushLog({ kind: "blacklist", data: { source: "remote", count: body.keywords.length } });
    } catch (err) {
      setBlacklist(LOCAL_FALLBACK);
      setBlacklistSource("local");
      pushLog({
        kind: "warn",
        data: {
          where: "refreshBlacklist",
          message: String(err),
          fallback: "local",
          count: LOCAL_FALLBACK.length,
        },
      });
    }
  }, [LOCAL_FALLBACK, pushLog]);

  useEffect(() => {
    pushLog({
      kind: "boot",
      data: {
        employee_id: employeeId,
        interval_sec: intervalSec,
        jitter_sec: jitterSec,
        note: "browser simulator — mirrors electron/main.cjs",
      },
    });
    void refreshBlacklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- capture cycle ----
  const pickActive = useCallback(() => {
    if (forceApp !== "__random__") {
      const found = APP_POOL.find((a) => a.app === forceApp);
      if (found) return found;
    }
    return APP_POOL[Math.floor(Math.random() * APP_POOL.length)];
  }, [forceApp]);

  const matchedKeyword = useCallback(
    (active: { app: string; title: string }) => {
      const hay = `${active.app} ${active.title}`.toLowerCase();
      return blacklist.find((k) => hay.includes(k.toLowerCase()));
    },
    [blacklist],
  );

  const uploadOnce = useCallback(
    async (payload: UploadPayload) => {
      const url =
        failMode === "off"
          ? "/api/public/agent/screenshots"
          : `/api/public/agent/screenshots?fail=${encodeURIComponent(failMode)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { id: string; received_bytes: number };
    },
    [failMode],
  );

  const drainQueue = useCallback(async () => {
    setQueue((prev) => prev.slice()); // trigger read
    const snapshot = queueRef.current.slice();
    for (const item of snapshot) {
      try {
        const res = await uploadOnce(item);
        pushLog({
          kind: "queue",
          data: { action: "drain-ok", server_id: res.id, ts: item.timestamp },
        });
        queueRef.current = queueRef.current.filter((q) => q !== item);
        setQueue(queueRef.current.slice());
      } catch (err) {
        pushLog({
          kind: "queue",
          data: { action: "drain-fail", message: String(err), ts: item.timestamp },
        });
        break;
      }
    }
  }, [pushLog, uploadOnce]);

  const queueRef = useRef<UploadPayload[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const enqueue = useCallback(
    (payload: UploadPayload) => {
      queueRef.current = [...queueRef.current, payload];
      setQueue(queueRef.current.slice());
      pushLog({
        kind: "queue",
        data: {
          action: "enqueue",
          size: queueRef.current.length,
          ts: payload.timestamp,
        },
      });
    },
    [pushLog],
  );

  const tick = useCallback(async () => {
    const now = Date.now();
    const duration = Math.round((now - lastTickRef.current) / 1000);
    lastTickRef.current = now;
    const active = pickActive();
    const hit = matchedKeyword(active);

    if (hit) {
      pushLog({
        kind: "capture",
        data: {
          status: "skipped",
          reason: "blacklisted",
          matched_keyword: hit,
          app: active.app,
          title: active.title,
          duration_seconds: duration,
          screenshot: null,
        },
      });
    } else {
      // render + compress; ratchet quality if oversize
      const width = 1280;
      const height = 800;
      let q = quality;
      let rendered = await renderMockScreenshot(width, height, `${active.app} — ${active.title}`, q);
      while (rendered.blob.size > maxKB * 1024 && q > 30) {
        q -= 10;
        rendered = await renderMockScreenshot(width, height, `${active.app} — ${active.title}`, q);
      }
      const b64 = await blobToBase64(rendered.blob);
      const payload: UploadPayload = {
        v: 1,
        employee_id: employeeId,
        timestamp: nowIso(),
        duration_seconds: duration,
        active_app: active.app,
        active_title: active.title,
        active_app_stubbed: true,
        screen: { width, height },
        image: { mime: "image/jpeg", quality: q, bytes: rendered.blob.size },
        image_b64: b64,
      };
      setLastPayload(payload);
      setCaptures((prev) =>
        [
          {
            id: payload.timestamp,
            ts: payload.timestamp,
            app: active.app,
            bytes: rendered.blob.size,
            dataUrl: rendered.dataUrl,
            uploaded: false,
          },
          ...prev,
        ].slice(0, 8),
      );
      pushLog({
        kind: "capture",
        data: {
          status: "captured",
          app: active.app,
          title: active.title,
          bytes: rendered.blob.size,
          quality: q,
        },
      });
      try {
        const res = await uploadOnce(payload);
        pushLog({
          kind: "upload",
          data: {
            status: "ok",
            bytes: rendered.blob.size,
            server_id: res.id,
          },
        });
        setCaptures((prev) =>
          prev.map((c) => (c.id === payload.timestamp ? { ...c, uploaded: true } : c)),
        );
      } catch (err) {
        pushLog({
          kind: "upload",
          data: { status: "fail", message: String(err), queued: true },
        });
        enqueue(payload);
      }
    }

    await drainQueue();

    // schedule next
    const jitterMs = (Math.random() * 2 - 1) * jitterSec * 1000;
    const delay = Math.max(2000, intervalSec * 1000 + jitterMs);
    pushLog({ kind: "scheduler", data: { next_tick_in_ms: Math.round(delay) } });
    timerRef.current = window.setTimeout(tick, delay);
  }, [
    drainQueue,
    employeeId,
    enqueue,
    intervalSec,
    jitterSec,
    matchedKeyword,
    maxKB,
    pickActive,
    pushLog,
    quality,
    uploadOnce,
  ]);

  useEffect(() => {
    if (!running) return;
    lastTickRef.current = Date.now();
    timerRef.current = window.setTimeout(tick, 500);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [running, tick]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Camera className="w-5 h-5" /> Screenshot agent — browser simulator
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Mirrors <code>electron/main.cjs</code>: jittered capture loop, remote
            blacklist with local fallback, JPEG compression with quality ratchet,
            mock upload, and on-failure retry queue. Payload shape is identical.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            {blacklistSource === "remote" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            blacklist: {blacklistSource} ({blacklist.length})
          </Badge>
          <Button size="sm" variant="outline" onClick={() => void refreshBlacklist()}>
            <RefreshCcw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          {running ? (
            <Button size="sm" variant="destructive" onClick={() => setRunning(false)}>
              <Square className="w-3 h-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => setRunning(true)}>
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          )}
        </div>
      </header>

      <Card className="p-4 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Interval (s)">
          <Input type="number" min={2} value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value) || 10)} />
        </Field>
        <Field label="Jitter ± (s)">
          <Input type="number" min={0} value={jitterSec} onChange={(e) => setJitterSec(Number(e.target.value) || 0)} />
        </Field>
        <Field label="JPEG quality">
          <Input type="number" min={30} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value) || 70)} />
        </Field>
        <Field label="Max size (KB)">
          <Input type="number" min={50} value={maxKB} onChange={(e) => setMaxKB(Number(e.target.value) || 300)} />
        </Field>
        <Field label="Force active app">
          <Select value={forceApp} onValueChange={setForceApp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__random__">Random</SelectItem>
              {APP_POOL.map((a) => (
                <SelectItem key={a.app} value={a.app}>{a.app}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Upload fail mode">
          <Select value={failMode} onValueChange={(v) => setFailMode(v as typeof failMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">off (200)</SelectItem>
              <SelectItem value="next=3">next 3 fail (503)</SelectItem>
              <SelectItem value="always">always fail (503)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-4 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent captures</h2>
            <div className="flex gap-2">
              <Badge variant="secondary">queue: {queue.length}</Badge>
              <Button size="sm" variant="ghost" onClick={() => { setCaptures([]); }}>
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          </div>
          {captures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No captures yet — press Start.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {captures.map((c) => (
                <div key={c.id} className="rounded-md border border-border overflow-hidden bg-muted/30">
                  <img src={c.dataUrl} alt={c.app} className="w-full aspect-[16/10] object-cover" />
                  <div className="p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="truncate">{c.app}</span>
                      <span className={c.uploaded ? "text-emerald-500" : "text-amber-500"}>{c.uploaded ? "uploaded" : "queued"}</span></div>
                    <div className="text-muted-foreground">{(c.bytes / 1024).toFixed(1)} KB · {new Date(c.ts).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Separator />
          <div>
            <h3 className="font-medium text-sm mb-2">Last upload payload (raw JSON)</h3>
            <pre className="text-[11px] bg-muted/40 rounded p-3 overflow-auto max-h-72">
{lastPayload
  ? JSON.stringify(
      { ...lastPayload, image_b64: `${lastPayload.image_b64.slice(0, 48)}… (${lastPayload.image_b64.length} chars)` },
      null,
      2,
    )
  : "// waiting for first non-blacklisted tick"}
            </pre>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Agent log</h2>
            <Button size="sm" variant="ghost" onClick={() => setLogs([])}>Clear</Button>
          </div>
          <div className="max-h-[600px] overflow-auto space-y-1 font-mono text-[11px]">
            {logs.map((l, i) => (
              <div key={i} className="border-b border-border/40 py-1">
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground">{l.ts.slice(11, 19)}</span>
                  <KindTag kind={l.kind} />
                </div>
                <pre className="whitespace-pre-wrap break-all text-foreground/90">{JSON.stringify(l.data)}</pre>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-muted-foreground text-center py-6">no events yet</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4 text-sm text-muted-foreground flex gap-3 items-start">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
        <div>
          This page uses a mock canvas render — real desktop capture requires the
          Electron build (<code>electron/main.cjs</code>). All other behavior
          (blacklist matching, JPEG quality ratchet, jittered scheduler, upload
          retry queue, payload shape) is identical between the two.
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KindTag({ kind }: { kind: LogEntry["kind"] }) {
  const color: Record<LogEntry["kind"], string> = {
    boot: "bg-slate-500/20 text-slate-300",
    blacklist: "bg-purple-500/20 text-purple-300",
    capture: "bg-emerald-500/20 text-emerald-300",
    upload: "bg-lime-500/20 text-lime-300",
    queue: "bg-amber-500/20 text-amber-300",
    scheduler: "bg-blue-500/20 text-blue-300",
    warn: "bg-orange-500/20 text-orange-300",
    error: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${color[kind]}`}>
      {kind}
    </span>
  );
}
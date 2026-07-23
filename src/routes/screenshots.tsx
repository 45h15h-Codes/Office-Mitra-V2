import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  Camera,
  RefreshCcw,
  Clock,
  Monitor,
  AppWindow,
  AlertTriangle,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  X,
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

export const Route = createFileRoute("/screenshots")({
  head: () => ({ meta: [{ title: "Screenshots — OfficeMitra" }] }),
  component: ScreenshotsPage,
});

type ScreenshotMeta = {
  id: string;
  received_at: string;
  employee_id: string;
  timestamp: string;
  active_app: string;
  active_title: string;
  domain?: string;
  is_blurred?: boolean;
  blacklisted_keyword?: string | null;
  active_app_stubbed: boolean;
  screen: { width: number; height: number };
  image: { mime: string; quality: number; bytes: number };
  duration_seconds: number;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtBytes(b: number) {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(1)} KB`;
}

// ---------- Lightbox ----------
function Lightbox({
  shotId,
  shots,
  onClose,
  onPrev,
  onNext,
}: {
  shotId: string;
  shots: ScreenshotMeta[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const meta = shots.find((s) => s.id === shotId);

  useEffect(() => {
    setLoading(true);
    setImgSrc(null);
    fetch(`/api/public/agent/screenshots?id=${encodeURIComponent(shotId)}`)
      .then((r) => r.json())
      .then((body: { screenshot?: { image_b64: string } }) => {
        const b64 = body.screenshot?.image_b64 ?? "";
        setImgSrc(b64 ? `data:image/jpeg;base64,${b64}` : null);
      })
      .catch(() => setImgSrc(null))
      .finally(() => setLoading(false));
  }, [shotId]);

  const idx = shots.findIndex((s) => s.id === shotId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between mb-3 text-white/80 text-sm">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="font-medium text-white">{meta?.active_app ?? "—"}</p>
              {meta?.domain && (
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                  {meta.domain}
                </Badge>
              )}
              <span className="text-xs text-white/50 bg-white/10 px-1.5 py-0.5 rounded">
                👤 {meta?.employee_id}
              </span>
            </div>
            <p className="text-xs text-white/60 max-w-lg truncate">
              {meta?.active_title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs">{fmtTime(meta?.timestamp ?? "")}</span>
            <span className="text-xs">
              {fmtBytes(meta?.image.bytes ?? 0)}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* image */}
        <div className="relative bg-black rounded-lg overflow-hidden min-h-64 flex items-center justify-center">
          {loading && (
            <div className="text-white/40 text-sm">Loading…</div>
          )}
          {!loading && !imgSrc && (
            <div className="flex flex-col items-center gap-2 text-white/40 py-12">
              <ImageOff className="w-10 h-10" />
              <p className="text-sm">Empty image (Windows capture bug)</p>
              <p className="text-xs">Run as Administrator or use packaged .exe</p>
            </div>
          )}
          {!loading && imgSrc && (
            <img
              src={imgSrc}
              alt={meta?.active_app}
              className="w-full rounded-lg"
            />
          )}
        </div>

        {/* nav */}
        <div className="flex items-center justify-between mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-white/70 hover:text-white hover:bg-white/10"
            disabled={idx <= 0}
            onClick={onPrev}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Newer
          </Button>
          <span className="text-white/40 text-xs">
            {idx + 1} / {shots.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-white/70 hover:text-white hover:bg-white/10"
            disabled={idx >= shots.length - 1}
            onClick={onNext}
          >
            Older <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- main page ----------
function ScreenshotsPage() {
  const [shots, setShots] = useState<ScreenshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<string>("all");

  const fetchShots = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/public/agent/screenshots?limit=100");
      const body = (await r.json()) as { screenshots: ScreenshotMeta[]; total: number };
      setShots(body.screenshots ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchShots();
    // auto-refresh every 30s while page is open
    const t = setInterval(() => void fetchShots(), 30_000);
    return () => clearInterval(t);
  }, [fetchShots]);

  const employees = useMemo(() => {
    const set = new Set(shots.map((s) => s.employee_id).filter(Boolean));
    return Array.from(set).sort();
  }, [shots]);

  const filteredShots = useMemo(() => {
    if (selectedEmp === "all") return shots;
    return shots.filter((s) => s.employee_id === selectedEmp);
  }, [shots, selectedEmp]);

  const selectedIdx = filteredShots.findIndex((s) => s.id === selectedId);

  function navigate(delta: number) {
    const next = filteredShots[selectedIdx + delta];
    if (next) setSelectedId(next.id);
  }

  return (
    <div className="p-6 space-y-5">
      {selectedId && (
        <Lightbox
          shotId={selectedId}
          shots={filteredShots}
          onClose={() => setSelectedId(null)}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
        />
      )}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Camera className="w-5 h-5" /> Screenshots
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time screen captures with app & domain attribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {employees.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="Filter Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees ({shots.length})</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp} value={emp}>
                      {emp} ({shots.filter((s) => s.employee_id === emp).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Badge variant="outline">{filteredShots.length} stored</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchShots()}
            disabled={loading}
          >
            <RefreshCcw className={`w-3 h-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {filteredShots.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Camera className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No screenshots found</p>
          <p className="text-sm mt-1">
            {shots.length > 0
              ? "No screenshots match the selected employee filter."
              : "Run `npx electron .`, give consent, and wait ~7 minutes for the first capture."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-amber-500 text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>
              If images appear blank, run Electron as Administrator (Windows capture permission issue).
            </span>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredShots.map((shot) => {
            const isEmpty = shot.image.bytes === 0;
            return (
              <Card
                key={shot.id}
                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all group flex flex-col"
                onClick={() => setSelectedId(shot.id)}
              >
                {/* thumbnail placeholder */}
                <div className="bg-muted/40 aspect-video flex items-center justify-center relative overflow-hidden shrink-0">
                  {isEmpty ? (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                      <ImageOff className="w-8 h-8" />
                      <span className="text-xs">Empty</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                      <Camera className="w-8 h-8 group-hover:opacity-60 transition-opacity" />
                      <span className="text-xs">Click to view</span>
                    </div>
                  )}
                  {isEmpty && (
                    <Badge
                      variant="outline"
                      className="absolute top-2 right-2 text-[10px] border-amber-500/50 text-amber-500"
                    >
                      bytes:0
                    </Badge>
                  )}
                  {shot.is_blurred && (
                    <Badge
                      variant="outline"
                      className="absolute top-2 left-2 text-[10px] border-orange-500/80 bg-orange-500/10 text-orange-400 font-mono"
                    >
                      🔒 BLURRED{shot.blacklisted_keyword ? `: ${shot.blacklisted_keyword}` : ""}
                    </Badge>
                  )}
                  <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    {shot.employee_id}
                  </div>
                </div>

                {/* meta */}
                <div className="p-3 space-y-1.5 text-xs flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-medium truncate">
                      <AppWindow className="w-3 h-3 shrink-0 text-primary" />
                      <span className="truncate">{shot.active_app}</span>
                    </div>
                    {shot.domain ? (
                      <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] truncate">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{shot.domain}</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground/70 text-[11px] truncate" title={shot.active_title}>
                        {shot.active_title || "No window title"}
                      </div>
                    )}
                  </div>

                  <div className="pt-1.5 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtTime(shot.timestamp)}
                    </span>
                    <span>{fmtBytes(shot.image.bytes)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {shots.some((s) => s.image.bytes === 0) && (
        <Card className="p-3 flex items-start gap-2 text-sm border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Some screenshots show <strong>0 bytes</strong> — this is a Windows
            desktop capture permission issue (error 170). Fix: run{" "}
            <code>npx electron .</code> from an Administrator PowerShell, or
            test with the packaged <code>.exe</code> (Phase 6).
          </p>
        </Card>
      )}
    </div>
  );
}

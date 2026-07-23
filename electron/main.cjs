/**
 * OmERP Screenshot Agent — Electron main process
 *
 * Responsibilities (spec):
 *   1. Capture the full screen on a jittered interval (default 5–10 min ± 1 min).
 *   2. Look up the currently-active window/app name.
 *      → Uses `active-win` if installed (Phase 2). Falls back to a stubbed value
 *        and logs [STUB] so it's obvious in the logs.
 *   3. Load a blacklist from a remote endpoint with a local JSON fallback
 *      (electron/blacklist.json) so it can be updated without rebuilding.
 *   4. If the active app matches the blacklist → skip the capture and log
 *      { app, duration_seconds, screenshot: null }.
 *   5. Otherwise → JPEG-compress (~q70, target < 300KB) and POST to the
 *      upload endpoint with timestamp + employee_id + app context.
 *   6. On upload failure → enqueue on disk (userData/queue/*.json) and retry
 *      on the next tick. Never crash.
 *
 * This file is intentionally self-contained. Drop it into an Electron shell:
 *   package.json → "main": "electron/main.cjs"
 *   npm i -D electron
 *   npx electron .
 *
 * Config is read from env / CLI so ops can tune without a rebuild:
 *   OMERP_UPLOAD_URL         (default http://localhost:8080/api/public/agent/screenshots)
 *   OMERP_BLACKLIST_URL      (default http://localhost:8080/api/public/agent/blacklist)
 *   OMERP_EMPLOYEE_ID        (default "emp-local")
 *   OMERP_INTERVAL_MIN       (default 7)
 *   OMERP_JITTER_MIN         (default 1)
 *   OMERP_JPEG_QUALITY       (default 70)
 *   OMERP_MAX_BYTES          (default 307200 — ~300KB)
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, desktopCapturer, screen, nativeImage } = require("electron");

// IPC handlers (renderer → main)
// Skill ref: electron/examples/processes/ipc-communication.md
//   ipcMain.handle() → request-response; ipcMain.on() → one-way
function registerIpc() {
  ipcMain.handle("get-monitoring-status", () => ({ on: monitoringOn, consent: consentGiven }));

  // Phase 5: consent — renderer sends agreed payload; we write userData/consent.json
  ipcMain.handle("give-consent", async (_evt, payload) => {
    try {
      await fsp.writeFile(
        CONSENT_FILE,
        JSON.stringify({ ...payload, saved_at: new Date().toISOString() }),
      );
      consentGiven = true;
      log("consent", { action: "given", timestamp: payload?.timestamp ?? null, file: CONSENT_FILE });

      // Navigate back to dashboard now that consent is stored
      const isDev = !app.isPackaged;
      if (isDev) {
        mainWindow?.loadURL("http://localhost:8081/");
      } else {
        mainWindow?.loadFile(require("path").join(__dirname, "../dist/index.html"));
      }

      // POST consent to backend (non-blocking, best-effort)
      fetch(CFG.uploadUrl.replace(/\/screenshots$/, "/consent"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employee_id: CFG.employeeId, ...payload }),
      }).catch(() => {});

      return { ok: true };
    } catch (err) {
      log("error", { where: "give-consent", message: String(err) });
      return { ok: false, error: String(err) };
    }
  });

  // Phase 5: renderer can toggle monitoring (mirrors tray menu)
  ipcMain.handle("set-monitoring", (_evt, on) => {
    monitoringOn = Boolean(on);
    tray?.setContextMenu(buildTrayMenu());
    broadcastMonitoringState();
    log("ipc", { action: "set-monitoring", monitoring: monitoringOn });
    return { ok: true, monitoring: monitoringOn };
  });
}
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const tracker = require("./tracker.cjs");
const activity = require("./activity.cjs");
const sharp = require("sharp");
const CFG = {
  uploadUrl:
    process.env.OMERP_UPLOAD_URL ||
    "http://localhost:8081/api/public/agent/screenshots",
  blacklistUrl:
    process.env.OMERP_BLACKLIST_URL ||
    "http://localhost:8081/api/public/agent/blacklist",
  employeeId: process.env.OMERP_EMPLOYEE_ID || "emp-local",
  intervalMin: Number(process.env.OMERP_INTERVAL_MIN || 0.1),
  jitterMin: Number(process.env.OMERP_JITTER_MIN || 0.5),
  jpegQuality: Number(process.env.OMERP_JPEG_QUALITY || 70),
  maxBytes: Number(process.env.OMERP_MAX_BYTES || 300 * 1024),
  blacklistRefreshMs: 5 * 60 * 1000,
  deviceToken: process.env.OMERP_DEVICE_TOKEN || "",
  workStart: process.env.OMERP_WORK_START || "09:00", // default 9 AM
  workEnd: process.env.OMERP_WORK_END || "18:30",   // default 6:30 PM
};

// Phase 5 — consent state
const CONSENT_FILE = path.join(
  app.getPath ? app.getPath("userData") : os.tmpdir(),
  "consent.json",
);
let consentGiven = false;

// Phase 5 — working hours check
function isInWorkingHours() {
  const now = new Date();
  const [sh, sm] = CFG.workStart.split(":").map(Number);
  const [eh, em] = CFG.workEnd.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return nowMins >= startMins && nowMins < endMins;
}

// Phase 5 — push monitoring state to renderer (used by tray toggle + IPC set-monitoring)
function broadcastMonitoringState() {
  try {
    mainWindow?.webContents?.send("monitoring-changed", { on: monitoringOn, consent: consentGiven });
  } catch { /* window may not be ready */ }
}

// ---------- logging ----------
function log(kind, payload) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    kind,
    ...payload,
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

// ---------- active window — Phase 2 (delegates to tracker.cjs) ----------
// tracker.cjs polls active-win every 3s and logs transitions.
// getCurrentApp() returns the last known app without re-polling.
async function getActiveApp() {
  return tracker.getCurrentApp();
}

// ---------- blacklist (remote + local fallback) ----------
const LOCAL_BLACKLIST_PATH = path.join(__dirname, "blacklist.json");
let blacklistKeywords = [];
let blacklistSource = "none";

function loadLocalBlacklist() {
  try {
    const raw = fs.readFileSync(LOCAL_BLACKLIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    blacklistKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    blacklistSource = "local";
    log("blacklist", { source: "local", count: blacklistKeywords.length });
  } catch (err) {
    log("error", { where: "loadLocalBlacklist", message: String(err) });
    blacklistKeywords = [];
  }
}

async function refreshBlacklist() {
  try {
    const res = await fetch(CFG.blacklistUrl, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body?.keywords) && body.keywords.length) {
      blacklistKeywords = body.keywords;
      blacklistSource = "remote";
      log("blacklist", {
        source: "remote",
        count: blacklistKeywords.length,
        url: CFG.blacklistUrl,
      });
      return;
    }
    throw new Error("empty or malformed remote blacklist");
  } catch (err) {
    log("warn", {
      where: "refreshBlacklist",
      message: String(err),
      fallback: "local",
    });
    if (blacklistSource !== "local") loadLocalBlacklist();
  }
}

function isBlacklisted({ app: appName, title }) {
  const hay = `${appName} ${title}`.toLowerCase();
  return blacklistKeywords.find((kw) => hay.includes(String(kw).toLowerCase()));
}

// ---------- capture ----------
async function captureFullScreenJpeg() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });
  const src =
    sources.find((s) => s.display_id === String(primary.id)) || sources[0];
  if (!src) throw new Error("no screen source available");

  // Electron NativeImage supports JPEG encoding with a quality knob.
  // We ratchet quality down if we blow past the max-bytes budget.
  // Known Windows issue: desktopCapturer can return empty thumbnails
  // (error 170 / "Failed to assign the desktop to the current thread").
  if (!src.thumbnail || src.thumbnail.isEmpty()) {
    throw new Error(
      "empty desktop thumbnail (Windows capture permission / thread 170) — try Admin once or packaged .exe",
    );
  }
  let quality = CFG.jpegQuality;
  let buf = src.thumbnail.toJPEG(quality);
  while (buf.byteLength > CFG.maxBytes && quality > 30) {
    quality -= 10;
    buf = src.thumbnail.toJPEG(quality);
  }
  if (buf.byteLength === 0) {
    throw new Error("JPEG encode produced 0 bytes");
  }
  return { buffer: buf, quality, width, height };
}

// ---------- upload queue (disk-persisted) ----------
const QUEUE_DIR = path.join(
  app.getPath ? app.getPath("userData") : os.tmpdir(),
  "omerp-screenshot-queue",
);

async function ensureQueueDir() {
  await fsp.mkdir(QUEUE_DIR, { recursive: true });
}

async function enqueue(payload) {
  await ensureQueueDir();
  const file = path.join(
    QUEUE_DIR,
    `${payload.timestamp.replace(/[:.]/g, "-")}-${Math.random()
      .toString(36)
      .slice(2, 8)}.json`,
  );
  await fsp.writeFile(file, JSON.stringify(payload));
  log("queue", { action: "enqueue", file, size: payload.image_b64.length });
}

async function drainQueue() {
  await ensureQueueDir();
  const files = (await fsp.readdir(QUEUE_DIR)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const full = path.join(QUEUE_DIR, f);
    try {
      const payload = JSON.parse(await fsp.readFile(full, "utf8"));
      await uploadOnce(payload);
      await fsp.unlink(full);
      log("queue", { action: "drain-ok", file: f });
    } catch (err) {
      log("queue", { action: "drain-fail", file: f, message: String(err) });
      return; // stop; try again next tick
    }
  }
}

async function uploadOnce(payload) {
  const headers = { "content-type": "application/json" };
  if (CFG.deviceToken) {
    headers["x-device-token"] = CFG.deviceToken;
  }
  const res = await fetch(CFG.uploadUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`upload HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

async function uploadWithRetry(payload) {
  try {
    const r = await uploadOnce(payload);
    log("upload", {
      status: "ok",
      bytes: Math.floor((payload.image_b64.length * 3) / 4),
      server_id: r?.id ?? null,
    });
  } catch (err) {
    log("upload", { status: "fail", message: String(err), queued: true });
    await enqueue(payload);
  }
}

// ---------- main loop ----------
let lastTickAt = Date.now();

function nextDelayMs() {
  const base = CFG.intervalMin * 60 * 1000;
  const jitter = (Math.random() * 2 - 1) * CFG.jitterMin * 60 * 1000;
  return Math.max(30_000, base + jitter);
}

async function tick() {
  const now = Date.now();
  const durationSec = Math.round((now - lastTickAt) / 1000);
  lastTickAt = now;

  // Phase 5 guards — spec rules 2 & 3: no capture when monitoring OFF,
  // no consent given, or outside working hours.
  if (!consentGiven) {
    log("capture", { status: "skipped", reason: "no-consent" });
    setTimeout(tick, nextDelayMs());
    return;
  }
  if (!monitoringOn) {
    log("capture", { status: "skipped", reason: "monitoring-off" });
    setTimeout(tick, nextDelayMs());
    return;
  }
  if (!isInWorkingHours()) {
    log("capture", {
      status: "skipped",
      reason: "outside-working-hours",
      window: `${CFG.workStart}–${CFG.workEnd}`,
    });
    setTimeout(tick, nextDelayMs());
    return;
  }

  const active = await getActiveApp();
  const hit = isBlacklisted(active);

  try {
    const shot = await captureFullScreenJpeg();
    let finalBuf = shot.buffer;
    if (hit) {
      finalBuf = await sharp(shot.buffer)
        .blur(45)
        .jpeg({ quality: shot.quality })
        .toBuffer();
    }

    const payload = {
      v: 1,
      employee_id: CFG.employeeId,
      timestamp: new Date().toISOString(),
      duration_seconds: durationSec,
      active_app: active.app,
      active_title: active.title,
      domain: active.domain ?? null,
      is_blurred: Boolean(hit),
      blacklisted_keyword: hit ?? null,
      active_app_stubbed: active.stub === true,
      screen: { width: shot.width, height: shot.height },
      image: {
        mime: "image/jpeg",
        quality: shot.quality,
        bytes: finalBuf.byteLength,
      },
      image_b64: finalBuf.toString("base64"),
    };
    log("capture", {
      status: hit ? "captured-blurred" : "captured",
      app: active.app,
      title: active.title,
      matched_keyword: hit ?? null,
      bytes: finalBuf.byteLength,
      quality: shot.quality,
    });
    await uploadWithRetry(payload);
  } catch (err) {
    log("error", { where: "capture", message: String(err) });
  }

  await drainQueue().catch((err) =>
    log("error", { where: "drainQueue", message: String(err) }),
  );

  const delay = nextDelayMs();
  log("scheduler", { next_tick_in_ms: delay });
  setTimeout(tick, delay);
}

// ---------- BrowserWindow + Tray (Phase 0) ----------
let mainWindow = null;
let tray = null;
let monitoringOn = true;

// ponytail: 1x1 PNG resized to 16x16 — replace with a real icon file when branding is ready
function makeTrayIcon() {
  return nativeImage
    .createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    )
    .resize({ width: 16, height: 16 });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Show App", click: () => mainWindow?.show() },
    {
      // Phase 5: toggle is now REAL — gates tick(), activity, and tracker data upload
      label: `Monitoring: ${monitoringOn ? "ON ✓" : "OFF ✗"}`,
      click: () => {
        monitoringOn = !monitoringOn;
        tray.setContextMenu(buildTrayMenu());
        broadcastMonitoringState(); // push to renderer
        log("tray", { monitoring: monitoringOn });
      },
    },
    {
      label: `Hours: ${CFG.workStart}–${CFG.workEnd}`,
      enabled: false, // informational only
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createWindow(initialPath) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: require("path").join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false, // never enable — security rule from spec
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    // Load directly to the correct route so no race condition with did-finish-load
    mainWindow.loadURL(`http://localhost:8081${initialPath || ""}`);
  } else {
    mainWindow.loadFile(
      require("path").join(__dirname, "../dist/index.html"),
      initialPath ? { hash: initialPath } : undefined,
    );
  }

  // Minimize to tray instead of closing
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip("OfficeMitra Monitor");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => mainWindow?.show());
}

// ---------- boot ----------
// Helps desktopCapturer on some Windows setups (empty thumbnail / error 170).
app.commandLine.appendSwitch("enable-features", "DesktopCaptureCroppingDetection");

app.whenReady().then(async () => {
  // ── Phase 5: consent check BEFORE window creation ──
  // Read userData/consent.json first so we can open the right URL directly.
  // This avoids any did-finish-load race conditions.
  let initialPath = "/";
  try {
    await fsp.access(CONSENT_FILE);
    consentGiven = true;
    log("consent", { action: "loaded", file: CONSENT_FILE });
  } catch {
    consentGiven = false;
    initialPath = "/consent";
    log("consent", { action: "missing", opening: "/consent" });
  }

  createWindow(initialPath);   // opens /consent on first run, / on subsequent
  createTray();
  registerIpc();
  tracker.start();            // Phase 2: active-window polling
  activity.start();           // Phase 3: mouse/keyboard counts only (no key content)
  loadLocalBlacklist();       // seed immediately
  await refreshBlacklist();   // then try remote
  setInterval(refreshBlacklist, CFG.blacklistRefreshMs);

  log("boot", {
    cfg: { ...CFG, blacklistUrl: CFG.blacklistUrl },
    consent: consentGiven,
    initialPath,
    workHours: `${CFG.workStart}–${CFG.workEnd}`,
    inWorkingHours: isInWorkingHours(),
  });

  await tracker.ready;
  setTimeout(tick, 1_000);
});


app.on("window-all-closed", () => {
  // Keep running in tray — quit only via tray menu "Quit"
  // ponytail: macOS would need app.quit() here if we ever target it
});

app.on("before-quit", () => {
  tracker.stop(); // flush final batch before exit
  activity.stop(); // flush final activity interval
});
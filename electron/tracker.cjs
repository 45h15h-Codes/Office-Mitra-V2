/**
 * electron/tracker.cjs  — Phase 2: Active Window / App Tracking
 *
 * What it does:
 *   - Polls the active window every 3 seconds using `active-win`
 *   - On app change: closes previous entry (app, title, start, end, duration)
 *     and opens a new one. Does NOT log every poll, only transitions.
 *   - For browser windows, attempts to extract domain from the window title.
 *     NOTE: this is approximate — browsers don't expose full URLs via title.
 *     Documented limitation: title format varies ("Google - Chrome" vs "google.com – Chrome").
 *   - Batches entries in memory, flushes to backend every BATCH_INTERVAL_MS.
 *   - Exposes getCurrentApp() so Phase 1 blacklist check always gets a real value.
 *
 * Config (env):
 *   OMERP_UPLOAD_URL   — same base URL, tracker POSTs to /activity
 *   OMERP_EMPLOYEE_ID  — same employee tag
 *   OMERP_TRACKER_POLL_MS   (default 3000)
 *   OMERP_TRACKER_BATCH_MS  (default 300000 — 5 min)
 */

"use strict";



// ---------- config ----------
const POLL_MS = Number(process.env.OMERP_TRACKER_POLL_MS || 3000);
const BATCH_MS = Number(process.env.OMERP_TRACKER_BATCH_MS || 5 * 60 * 1000);
const BASE_URL =
  process.env.OMERP_UPLOAD_URL ||
  "http://localhost:8081/api/public/agent/screenshots";
const ACTIVITY_URL = BASE_URL.replace(/\/screenshots$/, "/activity");
const EMPLOYEE_ID = process.env.OMERP_EMPLOYEE_ID || "emp-local";
const DEVICE_TOKEN = process.env.OMERP_DEVICE_TOKEN || "";

// ---------- browser domain extraction ----------
// ponytail: title-based domain extraction — approximate by design.
// Full URLs are not exposed by OS/browsers without accessibility/extensions.
// We check common platform keywords first, then extract domain patterns from title string.
const BROWSER_NAMES = ["chrome", "firefox", "edge", "safari", "opera", "brave"];

const PLATFORM_DOMAINS = [
  { kw: "youtube", domain: "youtube.com" },
  { kw: "netflix", domain: "netflix.com" },
  { kw: "hotstar", domain: "hotstar.com" },
  { kw: "prime video", domain: "primevideo.com" },
  { kw: "whatsapp", domain: "whatsapp.com" },
  { kw: "telegram", domain: "telegram.org" },
  { kw: "discord", domain: "discord.com" },
  { kw: "github", domain: "github.com" },
  { kw: "figma", domain: "figma.com" },
  { kw: "chatgpt", domain: "chatgpt.com" },
  { kw: "claude", domain: "claude.ai" },
  { kw: "gemini", domain: "gemini.google.com" },
  { kw: "copilot", domain: "copilot.microsoft.com" },
  { kw: "perplexity", domain: "perplexity.ai" },
  { kw: "openai", domain: "openai.com" },
  { kw: "slack", domain: "slack.com" },
  { kw: "gmail", domain: "mail.google.com" },
  { kw: "google docs", domain: "docs.google.com" },
  { kw: "google sheets", domain: "docs.google.com" },
  { kw: "notion", domain: "notion.so" },
  { kw: "jira", domain: "atlassian.net" },
  { kw: "canva", domain: "canva.com" },
  { kw: "linkedin", domain: "linkedin.com" },
  { kw: "stackoverflow", domain: "stackoverflow.com" },
  { kw: "reddit", domain: "reddit.com" },
  { kw: "amazon", domain: "amazon.com" },
  { kw: "flipkart", domain: "flipkart.com" },
  { kw: "x - ", domain: "x.com" },
  { kw: "twitter", domain: "twitter.com" },
  { kw: "facebook", domain: "facebook.com" },
  { kw: "instagram", domain: "instagram.com" },
  { kw: "localhost", domain: "localhost" },
];

function extractDomain(appName, title) {
  if (!title) return null;
  const appLower = (appName || "").toLowerCase();
  const isB = BROWSER_NAMES.some((b) => appLower.includes(b));
  
  const titleLower = title.toLowerCase();
  // 1. Check known keywords (works across both browsers and dedicated apps like Slack/Figma)
  for (const item of PLATFORM_DOMAINS) {
    if (titleLower.includes(item.kw)) {
      return item.domain;
    }
  }

  if (!isB) return null;

  // 2. Try splitting on separator (` - `, ` – `, ` | `) and check if segment has a domain pattern
  const parts = title.split(/\s[–|\-]\s/);
  for (const seg of parts) {
    const trimmed = seg.trim();
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/.*)?$/.test(trimmed)) {
      return trimmed.split('/')[0];
    }
  }

  return null;
}

// ---------- state ----------
let activeWin = null; // the active-win module
let current = null;   // { app, title, domain, startMs }
let batch = [];       // completed entries waiting to upload
let pollTimer = null;
let batchTimer = null;

// ---------- logging ----------
function log(kind, payload) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), kind, ...payload }));
}

// ---------- public: what Phase 1 uses for blacklist check ----------
function getCurrentApp() {
  if (!current) return { app: "unknown", title: "", domain: null, stub: !activeWin };
  return {
    app: current.app,
    title: current.title,
    domain: current.domain,
    stub: !activeWin,
  };
}

// ---------- transition logic ----------
function closeEntry(endMs) {
  if (!current) return;
  const entry = {
    employee_id: EMPLOYEE_ID,
    app: current.app,
    title: current.title,
    domain: current.domain,
    start: new Date(current.startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    duration_seconds: Math.round((endMs - current.startMs) / 1000),
  };
  batch.push(entry);
  log("tracker", {
    action: "transition",
    app: entry.app,
    duration_seconds: entry.duration_seconds,
    domain: entry.domain ?? null,
  });
}

async function poll() {
  const nowMs = Date.now();
  let appName = "unknown";
  let title = "";

  if (activeWin) {
    try {
      const win = await activeWin();
      if (win) {
        appName = win.owner?.name || "unknown";
        title = win.title || "";
      }
    } catch (err) {
      log("error", { where: "tracker.poll", message: String(err) });
    }
  } else {
    // stub — Phase 2 requires active-win installed
    appName = "[STUB] unknown";
    title = "";
  }

  // Only record a transition if the app actually changed
  if (!current || current.app !== appName) {
    closeEntry(nowMs);
    current = {
      app: appName,
      title,
      domain: extractDomain(appName, title),
      startMs: nowMs,
    };
  } else {
    // Same app: just update the title (browser tabs change)
    current.title = title;
    current.domain = extractDomain(appName, title);
  }
}

// ---------- batch upload ----------
async function flushBatch() {
  if (batch.length === 0) return;
  const toSend = batch.splice(0); // drain atomically
  try {
    const headers = { "content-type": "application/json" };
    if (DEVICE_TOKEN) {
      headers["x-device-token"] = DEVICE_TOKEN;
    }
    const res = await fetch(ACTIVITY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ employee_id: EMPLOYEE_ID, entries: toSend }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log("tracker", { action: "batch-upload-ok", count: toSend.length });
  } catch (err) {
    // Put entries back — don't lose data
    batch.unshift(...toSend);
    log("tracker", {
      action: "batch-upload-fail",
      count: toSend.length,
      message: String(err),
    });
  }
}

// ---------- start / stop ----------
// ready resolves only after active-win import settles (success or stub).
// main.cjs must await this before the first screenshot tick to avoid app:"unknown".
let readyResolve;
const ready = new Promise((r) => {
  readyResolve = r;
});

function start() {
  // Dynamically require active-win (ESM package, needs special handling in CJS)
  // active-win >= v9 is pure ESM; we use dynamic import() to bridge the gap.
  import("active-win")
    .then((mod) => {
      activeWin = mod.default || mod.activeWin || mod;
      log("tracker", { action: "start", activeWin: "real", pollMs: POLL_MS });
    })
    .catch(() => {
      activeWin = null;
      log("tracker", {
        action: "start",
        activeWin: "stub",
        hint: "npm i active-win — Phase 2 tracking will use stub values until installed",
      });
    })
    .finally(() => {
      readyResolve();
      // Start polling only after active-win is resolved (or stubbed).
      pollTimer = setInterval(poll, POLL_MS);
      batchTimer = setInterval(flushBatch, BATCH_MS);
      // Immediate first poll so getCurrentApp() has a real value ASAP.
      poll().catch(() => {});
      log("tracker", {
        action: "polling-started",
        pollMs: POLL_MS,
        batchMs: BATCH_MS,
      });
    });
}

function stop() {
  clearInterval(pollTimer);
  clearInterval(batchTimer);
  // Close open entry before flush so we don't lose the last session.
  closeEntry(Date.now());
  current = null;
  flushBatch().catch(() => {});
}

module.exports = { start, stop, getCurrentApp, ready };

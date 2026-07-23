/**
 * electron/activity.cjs — Phase 3: Mouse & Keyboard Activity
 *
 * SECURITY (non-negotiable):
 *   - Keystroke COUNT only. Never store typed content or which button was used.
 *   - Handlers below only do `++` on counters. They ignore event payload fields.
 *
 * Per 1-minute interval:
 *   - mouse_moves  (throttled: max 10 samples/sec)
 *   - mouse_clicks (exact count)
 *   - key_presses  (COUNT ONLY)
 *   - idle         true if zero activity for IDLE_MS (default 5 min)
 *   - score        activity score 0–100 (formula documented below)
 *
 * Activity score formula (document explicitly per spec):
 *   score = min(100, key_presses * 0.4 + mouse_clicks * 2 + mouse_moves * 0.1)
 *
 * Config (env):
 *   OMERP_UPLOAD_URL            same base; POSTs to /activity
 *   OMERP_EMPLOYEE_ID
 *   OMERP_ACTIVITY_INTERVAL_MS  (default 60000 — 1 min)
 *   OMERP_ACTIVITY_IDLE_MS      (default 300000 — 5 min)
 *   OMERP_ACTIVITY_MOVE_HZ      (default 10 — max mouse-move samples/sec)
 */

"use strict";

const INTERVAL_MS = Number(process.env.OMERP_ACTIVITY_INTERVAL_MS || 60_000);
const IDLE_MS = Number(process.env.OMERP_ACTIVITY_IDLE_MS || 5 * 60_000);
const MOVE_HZ = Number(process.env.OMERP_ACTIVITY_MOVE_HZ || 10);
const MOVE_MIN_GAP_MS = Math.floor(1000 / Math.max(1, MOVE_HZ));

const BASE_URL =
  process.env.OMERP_UPLOAD_URL ||
  "http://localhost:8081/api/public/agent/screenshots";
const ACTIVITY_URL = BASE_URL.replace(/\/screenshots$/, "/activity");
const EMPLOYEE_ID = process.env.OMERP_EMPLOYEE_ID || "emp-local";

// ---------- score formula ----------
// score = min(100, key_presses * 0.4 + mouse_clicks * 2 + mouse_moves * 0.1)
function computeScore({ key_presses, mouse_clicks, mouse_moves }) {
  return Math.min(
    100,
    Math.round(key_presses * 0.4 + mouse_clicks * 2 + mouse_moves * 0.1),
  );
}

// ---------- state ----------
let uiohook = null;
let intervalTimer = null;
let lastMoveSampleAt = 0;
let lastAnyActivityAt = Date.now();
let continuousIdle = false;

// Counters for the current 1-minute bucket (never hold key content)
let bucket = {
  mouse_moves: 0,
  mouse_clicks: 0,
  key_presses: 0,
  startMs: Date.now(),
};

let batch = [];

function log(kind, payload) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), kind, ...payload }),
  );
}

function resetBucket(nowMs) {
  bucket = {
    mouse_moves: 0,
    mouse_clicks: 0,
    key_presses: 0,
    startMs: nowMs,
  };
}

// ---------- hooks (counts only) ----------
// IMPORTANT: handlers ignore the event payload entirely (count only).
function onKeydown() {
  // COUNT ONLY — never inspect which button was pressed
  bucket.key_presses += 1;
  lastAnyActivityAt = Date.now();
  continuousIdle = false;
}

function onMousedown() {
  bucket.mouse_clicks += 1;
  lastAnyActivityAt = Date.now();
  continuousIdle = false;
}

function onMousemove() {
  const now = Date.now();
  // Throttle: max MOVE_HZ samples per second
  if (now - lastMoveSampleAt < MOVE_MIN_GAP_MS) return;
  lastMoveSampleAt = now;
  bucket.mouse_moves += 1;
  lastAnyActivityAt = now;
  continuousIdle = false;
}

// ---------- interval close ----------
function closeInterval() {
  const nowMs = Date.now();
  const idleForMs = nowMs - lastAnyActivityAt;
  const zeroInBucket =
    bucket.key_presses === 0 &&
    bucket.mouse_clicks === 0 &&
    bucket.mouse_moves === 0;

  // Idle if no activity for IDLE_MS continuous threshold
  if (idleForMs >= IDLE_MS) continuousIdle = true;

  const entry = {
    type: "input_activity",
    employee_id: EMPLOYEE_ID,
    start: new Date(bucket.startMs).toISOString(),
    end: new Date(nowMs).toISOString(),
    interval_seconds: Math.round((nowMs - bucket.startMs) / 1000),
    mouse_moves: bucket.mouse_moves,
    mouse_clicks: bucket.mouse_clicks,
    key_presses: bucket.key_presses,
    idle: continuousIdle || (zeroInBucket && idleForMs >= IDLE_MS),
    score: computeScore(bucket),
    // score formula: min(100, key_presses*0.4 + mouse_clicks*2 + mouse_moves*0.1)
  };

  batch.push(entry);
  log("activity", {
    action: "interval",
    mouse_moves: entry.mouse_moves,
    mouse_clicks: entry.mouse_clicks,
    key_presses: entry.key_presses,
    idle: entry.idle,
    score: entry.score,
  });

  resetBucket(nowMs);
  // Flush activity intervals alongside Phase 2 batches (same endpoint shape)
  flushBatch().catch(() => {});
}

async function flushBatch() {
  if (batch.length === 0) return;
  const toSend = batch.splice(0);
  try {
    const res = await fetch(ACTIVITY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employee_id: EMPLOYEE_ID,
        kind: "input_activity",
        entries: toSend,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log("activity", { action: "batch-upload-ok", count: toSend.length });
  } catch (err) {
    batch.unshift(...toSend);
    log("activity", {
      action: "batch-upload-fail",
      count: toSend.length,
      message: String(err),
    });
  }
}

// ---------- start / stop ----------
function start() {
  try {
    // uiohook-napi: { uIOhook, UiohookKey } — we only need the hook instance
    const mod = require("uiohook-napi");
    uiohook = mod.uIOhook || mod.default?.uIOhook || mod;
  } catch (err) {
    log("activity", {
      action: "start",
      status: "stub",
      message: String(err),
      hint: "npm i uiohook-napi — Phase 3 hooks inactive until installed",
    });
    intervalTimer = setInterval(closeInterval, INTERVAL_MS);
    return;
  }

  // Register count-only listeners. Never log the event object.
  uiohook.on("keydown", onKeydown);
  uiohook.on("mousedown", onMousedown);
  uiohook.on("mousemove", onMousemove);

  try {
    uiohook.start();
    log("activity", {
      action: "start",
      status: "real",
      intervalMs: INTERVAL_MS,
      idleMs: IDLE_MS,
      moveHz: MOVE_HZ,
      score_formula:
        "min(100, key_presses*0.4 + mouse_clicks*2 + mouse_moves*0.1)",
    });
  } catch (err) {
    log("activity", {
      action: "start",
      status: "hook-fail",
      message: String(err),
    });
  }

  intervalTimer = setInterval(closeInterval, INTERVAL_MS);
}

function stop() {
  clearInterval(intervalTimer);
  intervalTimer = null;
  try {
    if (uiohook) {
      uiohook.removeListener("keydown", onKeydown);
      uiohook.removeListener("mousedown", onMousedown);
      uiohook.removeListener("mousemove", onMousemove);
      uiohook.stop();
    }
  } catch {
    // ignore stop errors
  }
  closeInterval();
  flushBatch().catch(() => {});
}

module.exports = {
  start,
  stop,
  computeScore, // exported for unit-style smoke tests
  // score formula reference for consumers
  SCORE_FORMULA: "min(100, key_presses*0.4 + mouse_clicks*2 + mouse_moves*0.1)",
};

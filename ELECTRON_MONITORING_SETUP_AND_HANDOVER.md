# Electron Workforce Monitoring System — Setup, Architecture & AI Agent Handover Guide

This document is a **comprehensive, self-contained implementation and troubleshooting guide** designed for any AI agent or software engineer tasked with building, installing, or porting the **OfficeMitra Electron Workforce Monitoring** feature into another full-stack web application (e.g., TanStack Start, Next.js, Vite + Node.js).

It synthesizes the exact architecture, code modules, configuration patterns, real-world Windows gotchas, and troubleshooting lessons learned during the construction of the OfficeMitra desktop monitoring agent.

---

Table of Contents

1. [Executive Summary &amp; Core Capabilities](#1-executive-summary--core-capabilities)
2. [System Architecture &amp; Data Flow](#2-system-architecture--data-flow)
3. [Environment Setup &amp; Required NPM Packages](#3-environment-setup--required-npm-packages)
4. [Detailed Feature Implementation Guide](#4-detailed-feature-implementation-guide)
   - [4.1 Preload IPC Bridge (`electron/preload.cjs`)](#41-preload-ipc-bridge-electronpreloadcjs)
   - [4.2 Active Window &amp; Main Domain Tracker (`electron/tracker.cjs`)](#42-active-window--main-domain-tracker-electrontrackercjs)
   - [4.3 Main Electron Process &amp; Privacy-Guarded Capture Loop (`electron/main.cjs`)](#43-main-electron-process--privacy-guarded-capture-loop-electronmaincjs)
   - [4.4 Transparency Notice &amp; Consent Screen (`src/routes/consent.tsx`)](#44-transparency-notice--consent-screen-srcroutesconsenttsx)
   - [4.5 Backend APIs (`agent.screenshots.ts`, `agent.activity.ts`, `agent.app-labels.ts`)](#45-backend-apis-agentscreenshotsts-agentactivityts-agentapp-labelsts)
   - [4.6 Dashboards: Screenshots &amp; Productivity with Employee &amp; Domain Filters](#46-dashboards-screenshots--productivity-with-employee--domain-filters)
5. [Real-World Issues Encountered &amp; Root-Cause Resolutions](#5-real-world-issues-encountered--root-cause-resolutions)
6. [AI Agent Handover &amp; Execution Checklist](#6-ai-agent-handover--execution-checklist)

---

## 1. Executive Summary & Core Capabilities

The OfficeMitra Monitoring System is a hybrid **Web + Desktop Electron application** that runs on employee workstations during configured working hours (`09:00` – `18:30` by default). It provides workforce productivity visibility while strictly enforcing employee privacy, transparency, and data protection.

### Core Capabilities:

- **Zero-Capture Before Consent:** No screenshots, window titles, or activity counts are recorded until the user explicitly checks the transparency agreement and clicks **"I understand and agree — start monitoring"** on the `/consent` page.
- **Main Website Domain Tracking (Privacy-First):** Desktop OS APIs (`active-win`) only expose window titles (`YouTube - Google Chrome`). To classify web traffic without recording private query parameters or exact chat paths (`https://chatgpt.com/c/private-chat-id`), our tracker extracts the **Main Website Domain** (`chatgpt.com`, `youtube.com`, `github.com`) using a hybrid keyword dictionary (`PLATFORM_DOMAINS`) and regex parser.
- **Automatic Gaussian Blur (`sharp`) for Sensitive Apps (Anti-Bypass + Privacy Guard):** If an employee opens a blacklisted/sensitive application (`WhatsApp`, `Telegram`, `Banking`, `Personal Gmail`), skipping screenshots entirely creates a loophole where an employee could leave WhatsApp open all day to evade monitoring. Instead, our agent **captures the screen, applies a heavy Gaussian Blur (`sharp(shot.buffer).blur(45)`)**, and tags the payload as `is_blurred: true`. The duration is recorded for KPI classification, but private chat text and banking details become 100% unreadable.
- **Offline Resilience & Disk Queue:** If the local backend (`http://localhost:8081`) or cloud server is unreachable, screenshots are queued as JSON files inside `app.getPath("userData")/omerp-screenshot-queue` and automatically drained once connectivity returns.
- **Input Sampling (Non-Intrusive):** Uses `uiohook-napi` to sample mouse move distance, mouse clicks, and total keypress counts per minute. **Keystroke content (what the user types) is NEVER recorded or transmitted.**

---

## 2. System Architecture & Data Flow

```mermaid
graph TD
    subgraph "Employee Workstation (Electron Agent)"
        UI["Renderer (Vite / TanStack Start UI)\nhttp://localhost:8081"]
        Preload["preload.cjs\n(contextBridge.electronAPI)"]
        Main["main.cjs\n(Electron Master Process)"]
        Tracker["tracker.cjs\n(active-win 3s poll)"]
        Activity["activity.cjs\n(uiohook-napi input counts)"]
        Sharp["sharp\n(Gaussian Blur Image Processor)"]
        Queue["Local Disk Queue\n(~/.config/omerp-screenshot-queue/*.json)"]

        UI <-->|contextBridge / IPC| Preload
        Preload <-->|ipcRenderer / ipcMain| Main
        Tracker -->|getCurrentApp() & domain| Main
        Activity -->|batch input counts| Main
        Main -->|desktopCapturer.getSources| Sharp
        Sharp -->|if sensitive / hit -> blur(45)| Main
        Main -->|if network fail| Queue
        Queue -->|retry drain| Main
    end

    subgraph "Backend Server (TanStack Start API / Node.js)"
        API_Shots["POST /api/public/agent/screenshots\n(Stores screenshot + domain + is_blurred)"]
        API_Act["POST /api/public/agent/activity\n(Stores app & domain duration transitions)"]
        API_Labels["GET/POST /api/public/agent/app-labels\n(Productive / Unproductive / Neutral)"]
        Dashboard["Dashboard UI (/screenshots & /productivity)\nFilters by Employee & Domain"]

        Main -->|HTTP POST JSON| API_Shots
        Tracker -->|HTTP POST JSON| API_Act
        Activity -->|HTTP POST JSON| API_Act
        Dashboard <--> API_Shots & API_Act & API_Labels
    end
```

---

## 3. Environment Setup & Required NPM Packages

When porting this agent to a new project, verify or install these exact package dependencies in `package.json`:

### Production Dependencies (`dependencies`):

```bash
npm install active-win@^8.2.1 sharp@^0.33.0 uiohook-napi@^1.5.5 lucide-react
```

* **`active-win`**: Queries Windows Win32 / macOS / Linux window managers for active app name and window title string.
* **`sharp`**: High-performance C++ image processing library used for fast buffer manipulation (`.blur(45).jpeg()`).
* **`uiohook-napi`**: Native system-wide input hook to count mouse events and total keyboard keypresses per minute without capturing text.

### Development Dependencies (`devDependencies`):

```bash
npm install -D electron@^33.0.0 concurrently@^10.0.0 wait-on@^9.0.0
```

### Script configuration in `package.json`:

```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "electron:dev": "concurrently --kill-others-on-fail \"npm run dev\" \"npx wait-on http://localhost:8081 -t 30000 && npx electron .\"",
  "electron:build": "vite build && electron-builder build --win"
}
```

---

## 4. Detailed Feature Implementation Guide

### 4.1 Preload IPC Bridge (`electron/preload.cjs`)

Electron requires secure isolation between the Node.js backend (`main.cjs`) and the browser renderer. `preload.cjs` exposes specific, safe channels via `contextBridge`:

```javascript
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getMonitoringStatus: () => ipcRenderer.invoke("get-monitoring-status"),
  setMonitoringStatus: (on) => ipcRenderer.invoke("set-monitoring-status", on),
  giveConsent: (payload) => ipcRenderer.invoke("give-consent", payload),
  onMonitoringChanged: (cb) => {
    const l = (_e, state) => cb(state);
    ipcRenderer.on("monitoring-changed", l);
    return () => ipcRenderer.removeListener("monitoring-changed", l);
  },
});
```

---

### 4.2 Active Window & Main Domain Tracker (`electron/tracker.cjs`)

The tracker polls `active-win` every 3 seconds. When the active window changes, it closes the previous transition interval and emits the duration. To resolve browser URL opacity, it runs a keyword matching dictionary against `PLATFORM_DOMAINS` followed by regex fallback.

#### Key Implementation Snippet (`tracker.cjs`):

```javascript
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
  for (const item of PLATFORM_DOMAINS) {
    if (titleLower.includes(item.kw)) {
      return item.domain;
    }
  }

  if (!isB) return null;

  // IMPORTANT: Hyphen inside character class must be escaped `\-` to avoid Range out of order errors!
  const parts = title.split(/\s[–|\-]\s/);
  for (const seg of parts) {
    const trimmed = seg.trim();
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/.*)?$/.test(trimmed)) {
      return trimmed.split('/')[0];
    }
  }
  return null;
}
```

---

### 4.3 Main Electron Process & Privacy-Guarded Capture Loop (`electron/main.cjs`)

`main.cjs` manages the application lifecycle, tray icon, IPC listeners, and the core `tick()` monitoring loop.

#### Core Boot & Consent Check Logic:

```javascript
app.whenReady().then(async () => {
  loadConsent(); // reads userData/consent.json
  loadLocalBlacklist();
  createTray();
  await createWindow(); // create BrowserWindow first!

  // If consent is missing, navigate to /consent. Do NOT start tracker or activity hooks yet!
  if (!consentGiven) {
    if (mainWindow) mainWindow.loadURL("http://localhost:8081/consent");
  } else {
    tracker.start();
    activity.start();
  }

  // Start the tick loop regardless; tick() checks consentGiven before taking action
  setTimeout(tick, 5000);
});

ipcMain.handle("give-consent", async (_evt, payload) => {
  consentGiven = Boolean(payload && payload.agreed);
  fs.writeFileSync(CONSENT_FILE, JSON.stringify({ agreed: consentGiven, timestamp: new Date().toISOString() }));
  broadcastMonitoringState();
  if (consentGiven) {
    tracker.start();
    activity.start();
  }
});
```

#### Core `tick()` Capture & Automatic Gaussian Blur Logic:

```javascript
async function tick() {
  if (!consentGiven || !monitoringOn || !isInWorkingHours()) {
    setTimeout(tick, nextDelayMs());
    return;
  }

  const active = await getActiveApp();
  const hit = isBlacklisted(active); // checks if window title/app matches WhatsApp, Banking, Gmail, etc.

  try {
    const shot = await captureFullScreenJpeg();
    let finalBuf = shot.buffer;

    // ANTI-BYPASS & PRIVACY GUARD:
    // If blacklisted/sensitive window is active, do NOT skip (otherwise employee evades monitoring).
    // Instead, apply heavy Gaussian Blur (radius 45) so private text is unreadable, but activity is recorded!
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
      image: { mime: "image/jpeg", quality: shot.quality, bytes: finalBuf.byteLength },
      image_b64: finalBuf.toString("base64"),
    };

    await uploadWithRetry(payload);
  } catch (err) {
    log("error", { where: "capture", message: String(err) });
  }

  await drainQueue().catch(() => {});
  setTimeout(tick, nextDelayMs());
}
```

---

### 4.4 Transparency Notice & Consent Screen (`src/routes/consent.tsx`)

The `/consent` page clearly explains what is collected (periodic full-screen images, active app, **main website domains like `chatgpt.com` or `youtube.com` without exact full URLs**, and input counts) vs what is never collected (keystroke content, exact private URLs, outside-working-hours data).

When agreed:

```javascript
async function handleAgree() {
  if (!checked) return;
  setSaving(true);
  const payload = { agreed: true, timestamp: new Date().toISOString(), version: 1 };
  if (isElectron) {
    await window.electronAPI.giveConsent(payload);
  }
  setTimeout(() => void navigate({ to: "/" }), 1500);
}
```

---

### 4.5 Backend APIs (`agent.screenshots.ts`, `agent.activity.ts`, `agent.app-labels.ts`)

In local dev mode, these endpoints store payloads in-memory (`const store: StoredScreenshot[] = []`).

#### StoredScreenshot Schema (`agent.screenshots.ts`):

```typescript
type StoredScreenshot = {
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
  image_b64: string;
  duration_seconds: number;
};
```

---

### 4.6 Dashboards: Screenshots & Productivity with Employee & Domain Filters

#### Screenshots Page (`screenshots.tsx`):

- Includes a top-level **Employee Filter Dropdown** (`All Employees`, `emp-local`, `emp-101`).
- Displays a `[bytes:0]` warning badge if Windows desktopCapturer permissions returned empty frames.
- Displays a prominent `[🔒 BLURRED: WhatsApp]` badge whenever `shot.is_blurred === true`.
- Displays the **Employee ID Badge** (`👤 emp-local`) on every card.

#### Productivity KPI Page (`productivity.tsx`):

- Aggregates activity records into time blocks.
- **Domain Preference Rule:** When iterating activity entries, if `e.domain` (`youtube.com`) is present, the KPI categorization engine checks `appLabels` for `youtube.com` first, before falling back to generic `e.app` (`Google Chrome`). This ensures YouTube is classified as `Unproductive` while GitHub is classified as `Productive`, even when both run inside Chrome.
- Displays domain items inside breakdown lists with a `Globe` icon (`<Globe className="w-3.5 h-3.5 text-emerald-400" />`) and `font-mono` styling.

---

## 5. Real-World Issues Encountered & Root-Cause Resolutions

When porting or debugging this system, these exact 5 critical issues will likely surface. Use this lookup table and technical breakdown to resolve them instantly:

| #           | Error / Symptom                                                                                                         | Exact Technical Root Cause                                                                                                                                                                                                                                          | Exact Resolution Implemented                                                                                                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Blank screen / app crash on startup when consent is false (`loadURL of undefined` or `ERR_CONNECTION_REFUSED`)      | **Boot Race Condition:** In early versions, `main.cjs` checked `if (!consentGiven) mainWindow.loadURL("/consent")` *before* `createWindow()` completed, or before the Vite dev server on port `8081` finished starting.                             | **1.** Use `concurrently` + `wait-on http://localhost:8081` in `package.json` so Electron never launches until port 8081 is listening.**2.** Inside `app.whenReady()`, await `createWindow()` *first*, and only then invoke `if (!consentGiven) mainWindow.loadURL(...)`.                                                     |
| **2** | Screenshots show`bytes:0` or throw `empty desktop thumbnail (Windows capture permission / thread 170)`              | **Windows OS Permission / Thread Limitations:** On Windows 10/11, `desktopCapturer.getSources({ types: ['screen'] })` often returns empty thumbnails (`isEmpty() === true`) when called from a standard, non-elevated terminal session.                   | **1.** In `main.cjs`, check `if (!src.thumbnail                                                                                                                                                                                                                                                                                                 |
| **3** | App crash during`tracker.cjs` execution:`SyntaxError: Invalid regular expression: /\s[–-\|]\s/: Range out of order` | **Character Class Hyphen Range Error:** Inside regex character class `[...]`, an unescaped hyphen `-` between `–` (en-dash, U+2013) and `\|` (pipe, U+007C) attempts to create a character range from U+2013 down to U+007C, which is invalid syntax. | Escape the hyphen inside the regex character class or place it at the boundary:`const parts = title.split(/\s[–\|\-]\s/);`                                                                                                                                                                                                                            |
| **4** | Employee bypasses monitoring completely by leaving WhatsApp/Banking open (`status: "skipped"`)                        | **Blacklist Evasion Loophole:** If the agent simply skips (`screenshot: null`) whenever a blacklisted window is active, an uncooperative employee can leave WhatsApp active all day to prevent any screenshots or time tracking from occurring.             | **Automatic Gaussian Blur & Attribution:** Require `sharp`. When `hit = isBlacklisted(active)` matches, **do not skip**. Capture the screen, run `sharp(shot.buffer).blur(45).jpeg().toBuffer()`, set `is_blurred: true`, and upload. The duration is tracked and classified as Unproductive, while chat text remains 100% private. |
| **5** | All web activity grouped under generic`Google Chrome` / `Microsoft Edge` with inaccurate KPI scoring                | **Browser URL Privacy & Sandbox Barrier:** Desktop window managers (`GetForegroundWindow`) cannot access internal browser address bars (`https://...`). They only receive the window title (`YouTube - Chrome`).                                        | **Domain Dictionary & Regex Pipeline:** Implement `PLATFORM_DOMAINS` inside `tracker.cjs` containing 30+ keywords (`youtube`, `chatgpt`, `github`, `slack`, `netflix`). Inject `domain` into all activity and screenshot payloads. In `productivity.tsx`, group and classify by `domain` whenever `isDomain === true`.      |

---

## 6. AI Agent Handover & Execution Checklist

If an AI Agent is tasked with setting up or debugging this system in a new repository, it MUST execute the following step-by-step checklist without skipping steps:

- [ ] **Step 1: Check Dependencies & Scripts**

  - Run `npm i active-win@^8.2.1 sharp@^0.33.0 uiohook-napi@^1.5.5 lucide-react`.
  - Verify `package.json` contains `wait-on` inside `"electron:dev": "concurrently --kill-others-on-fail \"npm run dev\" \"npx wait-on http://localhost:8081 -t 30000 && npx electron .\""`.
- [ ] **Step 2: Verify Preload & IPC Registration**

  - Check `electron/preload.cjs` exposes `getMonitoringStatus`, `setMonitoringStatus`, `giveConsent`, and `onMonitoringChanged`.
  - Check `electron/main.cjs` registers `ipcMain.handle("give-consent", ...)` and broadcasts updates via `webContents.send("monitoring-changed", ...)`.
- [ ] **Step 3: Verify Tracker Domain & Regex Safety**

  - Check `electron/tracker.cjs` contains `PLATFORM_DOMAINS` array and verifies that the hyphen inside `title.split(/\s[–|\-]\s/)` is escaped as `\-`.
- [ ] **Step 4: Verify Main Loop Consent & Sharp Blurring**

  - Check `tick()` inside `main.cjs`:
    1. Returns early if `!consentGiven`, `!monitoringOn`, or `!isInWorkingHours()`.
    2. Calls `const hit = isBlacklisted(active)`.
    3. If `hit` is truthy, applies `sharp(shot.buffer).blur(45).jpeg({ quality: shot.quality }).toBuffer()` and attaches `is_blurred: Boolean(hit)` and `blacklisted_keyword: hit`.
- [ ] **Step 5: Verify Frontend Routes & Type Safety**

  - Check `src/routes/consent.tsx` explicitly lists `Active app & Main Website Domain` under `What IS collected` and redirects to `/` after IPC save.
  - Check `agent.screenshots.ts` and `screenshots.tsx` include `is_blurred?: boolean; blacklisted_keyword?: string | null;` in `StoredScreenshot` / `ScreenshotMeta`.
  - Run `npx tsc --noEmit` to ensure zero TypeScript errors.
- [ ] **Step 6: End-to-End Verification Run**

  - Launch the full suite: `npm run electron:dev`.
  - Verify `/consent` appears on clean startup. Check the box and agree.
  - Open a blacklisted app/window (e.g., set window title containing `WhatsApp`).
  - Check terminal logs for `{"status":"captured-blurred","app":"...","matched_keyword":"WhatsApp"}`.
  - Open `http://localhost:8081/screenshots` and confirm the `[🔒 BLURRED: WhatsApp]` badge renders cleanly.

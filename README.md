# OfficeMitra V2 — Enterprise Multi-Tenant Workforce Management & Monitoring System

OfficeMitra V2 is a comprehensive, production-ready enterprise multi-tenant workforce management, employee productivity, and desktop monitoring platform. Built on top of **TanStack Start**, **React 19**, **Drizzle ORM**, **PostgreSQL with Row-Level Security (RLS)**, and an **Electron Desktop Monitoring Agent**, it provides organizations with end-to-end operational visibility while placing strict emphasis on employee privacy, consent transparency, and data isolation.

---

## 🚀 Key Features

### 🏢 Multi-Tenant Architecture & Strict Row-Level Security (RLS)
- **Hardened Tenant Isolation**: Every database table enforcing tenant boundaries uses PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) with session-based runtime context.
- **Tenant Onboarding & Registration**: Automated tenant provisioning with dedicated default roles, initial department scaffolding, and isolated configuration settings.

### 🛡️ Fine-Grained RBAC & Dynamic Permission Matrix
- **Customizable System & Custom Roles**: System roles (`Super Admin`, `HR Manager`, `Department Lead`, `Employee`) alongside custom tenant-created roles.
- **Granular Permission Catalog**: Global permission catalog mapped via `role_permissions` junction table to control access to employee management, screenshot viewing, productivity analytics, department settings, and device management.

### 💻 Privacy-Guarded Desktop Monitoring Agent (Electron)
- **Zero-Capture Before Consent**: Desktop agent will not collect window titles, screenshots, or activity counts until the employee explicitly accepts the transparency agreement on the `/consent` portal.
- **Privacy-Preserving Main Domain Classifier**: Extracts high-level domain boundaries (e.g., `chatgpt.com`, `github.com`, `youtube.com`) rather than recording private URLs or full text input.
- **Automated Gaussian Blur for Sensitive Apps (`sharp`)**: Blacklisted or sensitive applications (e.g., `WhatsApp`, `Telegram`, banking applications) trigger an automatic **45px Gaussian Blur filter** before storage, preserving time-tracking KPIs without compromising private personal communications.
- **Non-Intrusive Input Sampling (`uiohook-napi`)**: Samples active mouse movement distance, clicks, and keypress counts per minute. **Keystrokes content (what is typed) is NEVER logged or transmitted.**
- **Offline Resilient Queue**: If the network connection drops, screenshots and activity logs are queued in local encrypted disk storage (`~/.config/omerp-screenshot-queue`) and automatically drained upon reconnection.

### 👥 Department & Employee Lifecycle Management
- **Invite-Driven Employee Provisioning**: Secure, tokenized invitation URLs (`/invite?token=...`) with configurable expiration windows.
- **Department Association & Soft Soft-Delete Guarding**: Reassign or manage department structures with foreign-key safety constraints.

### 📜 Policy Transparency & Versioned Consent
- **Dynamic Policy Bumping**: Super Admins can update policy documentation version strings. Employees are immediately prompted to re-accept updated transparency terms before monitoring resumes.
- **Verifiable Audit Records**: Accepts consent records linked to IP address, employee ID, and active consent version.

### 📊 Real-Time Analytics & Monitoring Dashboards
- **Interactive Screenshot Gallery**: Filter screenshots by date range, department, employee, and blur state.
- **Productivity & App Label Analytics**: Categorize application usage by productivity ratings (Productive, Unproductive, Neutral) with interactive charts (`Recharts`).

---

## 🛠️ Tech Stack

### Web Framework & UI
- **Framework**: [TanStack Start](https://tanstack.com/start) (Full-stack SSR React Framework powered by Nitro & Vite)
- **Routing**: [TanStack Router](https://tanstack.com/router) (File-based, type-safe routing)
- **React**: React 19
- **Styling**: Tailwind CSS v4, `tw-animate-css`
- **UI Components**: Radix UI Primitives, Shadcn UI patterns, Lucide Icons, Sonner toasts
- **Data Visualization**: Recharts, Date-fns, DND Kit

### Database & Security Layer
- **Database**: PostgreSQL 16+
- **ORM & Migrations**: [Drizzle ORM](https://orm.drizzle.team/) & Drizzle Kit
- **Driver**: `pg` (node-postgres) with dual-pool architecture (Superuser for migrations / App user with enforced RLS for runtime)
- **Authentication & Hashes**: Argon2 password hashing, HTTP-Only session cookies

### Desktop Agent (Electron)
- **Desktop Runtime**: Electron v43
- **Window & Domain Tracking**: `active-win`
- **Input Activity Counter**: `uiohook-napi`
- **Privacy Image Processing**: `sharp` (High-performance C++ image processing for Gaussian blur)
- **Packager**: `electron-builder` (NSIS installer for Windows)

---

## 📋 Prerequisites

Before setting up the project locally, ensure you have installed:

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` v10+ or `bun`
- **PostgreSQL**: `v16.x` running locally or via Docker
- **C++ Build Tools** (Required for native node modules `uiohook-napi` & `argon2`):
  - **Windows**: Windows Build Tools (`npm install --global --production windows-build-tools` or Visual Studio C++ Desktop workload)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `python3`, `libpq-dev`

---

## ⚙️ Environment Configuration

Copy the example environment file `.env.example` to create `.env`:

```bash
cp .env.example .env
```

### Environment Variables Reference

| Variable | Description | Example / Required Format |
| :--- | :--- | :--- |
| `DATABASE_URL` | Application runtime pool connection string (**Non-superuser role with RLS enforcement**) | `postgresql://app_user:app_password@localhost:5432/officemitra` |
| `DATABASE_SUPERUSER_URL` | Superuser pool connection string (**Used exclusively by `drizzle-kit` for DDL, RLS policies, and triggers**) | `postgresql://postgres:postgres_password@localhost:5432/officemitra` |
| `SESSION_SECRET` | Secret key used for signing session cookies (Minimum 32 characters) | `random-32-char-string-secret-key-12345` |

---

## 🏁 Getting Started (Local Development)

### 1. Clone the Repository
```bash
git clone https://github.com/45h15h-Codes/Office-Mitra-V2.git
cd Office-Mitra-V2
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Provisioning & Migrations

#### Step 3.1: Start PostgreSQL (Docker option)
If you don't have PostgreSQL installed natively, launch a container:
```bash
docker run --name officemitra-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=officemitra \
  -p 5432:5432 \
  -d postgres:16
```

#### Step 3.2: Run Database Migrations
Apply Drizzle schema migrations to initialize tables and RLS security policies:
```bash
npx drizzle-kit push
```

---

### 4. Running the Web Application Server

Launch the TanStack Start development server:
```bash
npm run dev
```
The web dashboard will be available at **`http://localhost:8081`** (or configured Vite port).

---

### 5. Running the Electron Desktop Monitoring Agent

To run the web app alongside the desktop monitoring agent in development mode:
```bash
npm run electron:dev
```
This command starts the Vite dev server and launches Electron once the local port is ready.

---

## 🏗️ System Architecture & Data Flow

```mermaid
graph TD
    subgraph "Employee Workstation (Electron Desktop Agent)"
        UI["Renderer (Vite / TanStack Start UI)\nhttp://localhost:8081"]
        Preload["preload.cjs\n(contextBridge.electronAPI)"]
        Main["main.cjs\n(Electron Master Process)"]
        Tracker["tracker.cjs\n(active-win 3s poll)"]
        Activity["activity.cjs\n(uiohook-napi input counts)"]
        BlurEngine["sharp\n(Gaussian Blur Privacy Filter)"]
        Queue["Local Disk Queue\n(~/.config/omerp-screenshot-queue/*.json)"]

        UI <-->|contextBridge / IPC| Preload
        Preload <-->|ipcRenderer / ipcMain| Main
        Tracker -->|getCurrentApp() & domain| Main
        Activity -->|batch input counts| Main
        Main -->|desktopCapturer.getSources| BlurEngine
        BlurEngine -->|if sensitive / hit -> blur(45)| Main
        Main -->|if offline| Queue
        Queue -->|retry drain on network restored| Main
    end

    subgraph "Backend Application & Storage Layer"
        APIs["TanStack Start API Routes\n(/api/public/agent.*)"]
        PG["PostgreSQL 16 (Row-Level Security)"]
        
        Main -->|POST /api/public/agent.screenshots| APIs
        Main -->|POST /api/public/agent.activity| APIs
        APIs <-->|Drizzle ORM (tenant context)| PG
    end
```

---

## 🗄️ Database Schema & Architecture

```
tenants (Organizations)
├── id (uuid, PK)
├── name (text)
├── slug (text, unique)
├── status (active | suspended | deleted)
└── plan_id (text)

tenant_settings (Monitoring & Working Hours Config)
├── tenant_id (uuid, PK → tenants.id)
├── screenshot_interval (integer, default: 300s)
├── blur_enabled (boolean)
├── working_hours_start (text, default: "09:00")
└── working_hours_end (text, default: "18:00")

users (Authentication Accounts)
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants.id)
├── email (text, unique)
├── password_hash (text)
├── role_id (uuid, FK → roles.id)
└── status (active | suspended | invited)

roles & permissions (RBAC Catalog)
├── roles (id, tenant_id, name, is_system_role)
├── permissions (id, code, description)
└── role_permissions (role_id, permission_id, tenant_id)

employees & employee_invites
├── employees (id, tenant_id, user_id, department_id, name, email, status)
└── employee_invites (id, tenant_id, employee_id, token_hash, expires_at, used_at)

consent_versions & employee_consents
├── consent_versions (id, tenant_id, version, policy_text)
└── employee_consents (id, tenant_id, employee_id, consent_version_id, accepted_at, ip_address)

monitoring_telemetry
├── devices (id, tenant_id, employee_id, device_token_hash, status, device_label, last_seen_at)
├── screenshots (id, tenant_id, employee_id, device_id, image_url, is_blurred, duration_seconds)
└── productivity_logs (id, tenant_id, employee_id, device_id, active_app, active_title, domain, duration_seconds)
```

---

## 📂 Directory Structure

```
├── db/
│   ├── schema.ts                   # Comprehensive Drizzle ORM PostgreSQL schema
│   └── migrations/                 # DDL migration scripts generated by drizzle-kit
├── electron/
│   ├── main.cjs                    # Master Electron process, capture loop, queue & auto-updater
│   ├── preload.cjs                 # Secure ContextBridge IPC bindings
│   ├── tracker.cjs                 # Active window polling & main domain parser
│   ├── activity.cjs                # Non-intrusive input listener (uiohook-napi)
│   └── blacklist.json              # App blacklist definitions for automatic blurring
├── src/
│   ├── routes/                     # TanStack Start file-based routes
│   │   ├── __root.tsx              # Root app layout & provider wrapper
│   │   ├── index.tsx               # Overview dashboard
│   │   ├── login.tsx               # Auth login page
│   │   ├── consent.tsx             # Transparency agreement & consent acceptance screen
│   │   ├── employees.tsx           # Employee directory & management
│   │   ├── departments.tsx         # Department structure & team allocation
│   │   ├── screenshots.tsx         # Screenshot gallery dashboard
│   │   ├── productivity.tsx        # Application usage & domain productivity charts
│   │   ├── roles.tsx               # Role & permission matrix editor
│   │   └── api/                    # Server functions & REST endpoint handlers
│   │       ├── admin/              # Admin endpoints (screenshots, activity)
│   │       ├── public/             # Agent telemetry ingestion APIs
│   │       ├── employees/          # Employee CRUD & invite APIs
│   │       └── consent/            # Consent acceptance & policy bump APIs
│   ├── lib/                        # Core backend functions, auth, tenant context & RLS wrappers
│   ├── components/                 # Reusable UI components & Shadcn primitives
│   └── middleware/                 # Auth session & tenant verification middleware
├── tests/                          # Automated integration test suite
│   ├── tenant-isolation.test.ts
│   ├── rbac-matrix.test.ts
│   ├── departments-and-invites.test.ts
│   ├── consent-transparency.test.ts
│   ├── devices-pairing.test.ts
│   ├── persistent-storage.test.ts
│   └── verify-payload-spoof.ts
├── drizzle.config.ts               # Drizzle Kit migration configuration
├── vite.config.ts                  # Vite + TanStack Start builder config
└── package.json                    # Project dependencies & scripts
```

---

## 🧪 Automated Testing

OfficeMitra includes a comprehensive backend integration test suite covering critical security boundaries:

### Available Tests
1. **Tenant Isolation Test**: Verifies strict RLS cross-tenant read/write blocking.
2. **RBAC Matrix Test**: Validates role permission evaluation and system vs. custom role privileges.
3. **Departments & Invites Test**: Checks invitation token hashing, expiry, and employee creation flow.
4. **Consent Transparency Test**: Asserts zero telemetry collection prior to consent verification.
5. **Devices Pairing Test**: Verifies device token hash generation and device pairing safety.
6. **Persistent Storage Test**: Tests database persistence and RLS connection pooling.
7. **Payload Spoof Protection Test**: Confirms agent payload validation and anti-tampering guards.

### Running the Test Suite
```bash
npm run test
```

---

## 🛠️ Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `vite dev` | Starts the web app development server |
| `npm run build` | `vite build` | Compiles production assets for web & API |
| `npm run preview` | `vite preview` | Previews the production web build locally |
| `npm run test` | `npx tsx tests/...` | Executes all 7 backend integration tests |
| `npm run electron:dev` | `concurrently ...` | Runs dev web server + Electron desktop agent concurrently |
| `npm run electron:build` | `vite build; electron-builder ...` | Packages the Electron Windows installer (.exe / NSIS) |
| `npm run lint` | `eslint .` | Runs ESLint check across the codebase |
| `npm run format` | `prettier --write .` | Formats all files with Prettier |

---

## 📦 Production Deployment & Desktop Packaging

### 1. Web & API Server Deployment (Docker / VPS)

Build the production web bundle:
```bash
npm run build
```

Run in production mode:
```bash
NODE_ENV=production node dist/server.index.js
```

### 2. Desktop Packaging (Windows NSIS Installer)

To compile the Electron desktop agent into a standalone Windows installer (`.exe`):
```bash
npm run electron:build
```
The output installer binaries will be generated inside the `dist-electron/` or `dist/` directory.

---

## ❓ Troubleshooting & FAQs

### 1. `active-win` or `uiohook-napi` Compilation Error
**Symptom**: `Error: Cannot find module '../build/Release/uiohook.node'`
**Solution**: Rebuild native modules against your current Node.js / Electron header version:
```bash
npx electron-rebuild -f -w uiohook-napi
```

### 2. Database RLS Permission Denied
**Symptom**: `ERROR: permission denied for table tenants`
**Solution**: Ensure your runtime connection URL (`DATABASE_URL`) uses a valid database user that has been granted table privileges, and ensure session tenant context is initialized via `SET LOCAL app.current_tenant_id` before querying RLS-protected tables.

### 3. Screenshot Blurring Fails (`sharp` error)
**Symptom**: `Error: Input buffer contains unsupported image format`
**Solution**: Verify native `sharp` bindings match your operating system architecture. Clean `node_modules` and re-install:
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 📄 License

This project is proprietary software under copyright. All rights reserved.

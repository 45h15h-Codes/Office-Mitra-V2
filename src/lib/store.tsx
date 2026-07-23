import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "super_admin" | "admin" | "hr" | "dept_head" | "employee";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr: "HR",
  dept_head: "Department Head",
  employee: "Employee",
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  departmentId: string | null;
  role: Role;
  photo?: string;
  joiningDate: string;
  salary: number;
  address: string;
  status: "active" | "inactive";
  documents: EmployeeDoc[];
};

export type EmployeeDoc = {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  version: number;
  size?: string;
};

export type Department = {
  id: string;
  name: string;
  description: string;
  headId: string | null;
  createdAt: string;
};

export type TaskStage = "todo" | "in_progress" | "review" | "completed";
export const STAGES: { id: TaskStage; label: string; tone: string }[] = [
  { id: "todo", label: "To Do", tone: "oklch(0.72 0.16 45)" },
  { id: "in_progress", label: "In Progress", tone: "oklch(0.55 0.14 250)" },
  { id: "review", label: "Review", tone: "oklch(0.78 0.16 75)" },
  { id: "completed", label: "Completed", tone: "oklch(0.68 0.16 155)" },
];

export type Priority = "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  title: string;
  description: string;
  stage: TaskStage;
  priority: Priority;
  assigneeId: string | null;
  departmentId: string | null;
  dueDate: string;
  createdAt: string;
  history: TaskEvent[];
};

export type TaskEvent = {
  at: string;
  actor: string;
  message: string;
};

export type Session = { userId: string; role: Role } | null;

type State = {
  employees: Employee[];
  departments: Department[];
  tasks: Task[];
  session: Session;
};

const KEY = "omerp_state_v1";

function seed(): State {
  const deptEng: Department = { id: "d-eng", name: "Engineering", description: "Builds the platform.", headId: "e-1", createdAt: iso(-120) };
  const deptHr: Department = { id: "d-hr", name: "Human Resources", description: "People operations.", headId: "e-4", createdAt: iso(-200) };
  const deptDesign: Department = { id: "d-design", name: "Design", description: "Product design & brand.", headId: "e-5", createdAt: iso(-90) };
  const deptOps: Department = { id: "d-ops", name: "Operations", description: "Business operations.", headId: "e-6", createdAt: iso(-300) };

  const employees: Employee[] = [
    mk("e-0", "Root Owner", "super@omerp.io", "super_admin", "Founder", null, iso(-500)),
    mk("e-1", "John Smith", "john@omerp.io", "dept_head", "Engineering Lead", "d-eng", iso(-400)),
    mk("e-2", "Alex Chen", "alex@omerp.io", "employee", "Senior Engineer", "d-eng", iso(-180)),
    mk("e-3", "Rahul Verma", "rahul@omerp.io", "employee", "Backend Engineer", "d-eng", iso(-160)),
    mk("e-4", "Priya Sharma", "priya@omerp.io", "hr", "HR Manager", "d-hr", iso(-320)),
    mk("e-5", "Kevin Park", "kevin@omerp.io", "dept_head", "Design Lead", "d-design", iso(-260)),
    mk("e-6", "Maria Lopez", "maria@omerp.io", "admin", "Operations Admin", "d-ops", iso(-360)),
    mk("e-7", "Sara Ito", "sara@omerp.io", "employee", "Product Designer", "d-design", iso(-100)),
    mk("e-8", "David Kim", "david@omerp.io", "employee", "QA Engineer", "d-eng", iso(-70)),
    mk("e-9", "Nadia Ali", "nadia@omerp.io", "employee", "Recruiter", "d-hr", iso(-40)),
  ];

  const tasks: Task[] = [
    tk("t-1", "Kickoff Q2 roadmap", "todo", "high", "e-1", "d-eng", 5),
    tk("t-2", "Auth refactor to OAuth", "in_progress", "urgent", "e-2", "d-eng", 3),
    tk("t-3", "Design system tokens v2", "in_progress", "medium", "e-5", "d-design", 7),
    tk("t-4", "Offer letter template revamp", "review", "medium", "e-4", "d-hr", 2),
    tk("t-5", "Hire 2 senior engineers", "todo", "high", "e-9", "d-hr", 14),
    tk("t-6", "Publish incident retro", "completed", "low", "e-1", "d-eng", -1),
    tk("t-7", "QA regression sweep", "review", "high", "e-8", "d-eng", 1),
    tk("t-8", "Payroll cycle Feb", "completed", "urgent", "e-6", "d-ops", -3),
    tk("t-9", "Onboarding docs update", "todo", "medium", "e-9", "d-hr", 6),
    tk("t-10", "Marketing landing hero", "in_progress", "low", "e-7", "d-design", 4),
  ];

  return {
    employees,
    departments: [deptEng, deptHr, deptDesign, deptOps],
    tasks,
    session: null,
  };
}

function iso(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

function mk(id: string, name: string, email: string, role: Role, designation: string, departmentId: string | null, joiningDate: string): Employee {
  return {
    id, name, email, role, designation, departmentId, joiningDate,
    phone: "+1 " + Math.floor(2000000000 + Math.random() * 999999999),
    salary: 60000 + Math.floor(Math.random() * 80000),
    address: "—",
    status: "active",
    documents: [
      { id: crypto.randomUUID(), name: "Offer Letter.pdf", type: "Offer Letter", uploadedAt: joiningDate, version: 1, size: "148 KB" },
      { id: crypto.randomUUID(), name: "Resume.pdf", type: "Resume", uploadedAt: joiningDate, version: 1, size: "302 KB" },
    ],
  };
}

function tk(id: string, title: string, stage: TaskStage, priority: Priority, assigneeId: string, departmentId: string, dueOffset: number): Task {
  const created = iso(-Math.floor(Math.random() * 20) - 1);
  return {
    id, title, stage, priority, assigneeId, departmentId,
    description: title + " — full scope tracked in linked spec.",
    dueDate: iso(dueOffset),
    createdAt: created,
    history: [
      { at: created, actor: "system", message: "Task created" },
      ...(stage !== "todo" ? [{ at: iso(-1), actor: "system", message: `Moved to ${stage.replace("_", " ")}` }] : []),
    ],
  };
}

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return JSON.parse(raw) as State;
  } catch {
    return seed();
  }
}

function save(s: State) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

type Ctx = {
  state: State;
  setState: (updater: (s: State) => State) => void;
  currentUser: Employee | null;
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
  resetSeed: () => void;
};

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<State>(() => seed());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStateRaw(load());
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);

  const value = useMemo<Ctx>(() => ({
    state,
    setState: (updater) => setStateRaw((s) => updater(s)),
    currentUser: state.session ? state.employees.find((e) => e.id === state.session!.userId) ?? null : null,
    login: (email, password) => {
      if (password !== "demo1234") return { ok: false, error: "Incorrect password. Use demo1234." };
      const emp = state.employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
      if (!emp) return { ok: false, error: "No account with that email." };
      setStateRaw((s) => ({ ...s, session: { userId: emp.id, role: emp.role } }));
      return { ok: true };
    },
    logout: () => setStateRaw((s) => ({ ...s, session: null })),
    resetSeed: () => { const s = seed(); setStateRaw(s); save(s); },
  }), [state]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}



export function canAccess(role: Role | undefined, path: string): boolean {
  if (!role) return false;
  const admin = role === "super_admin" || role === "admin";
  const hr = role === "hr";
  const map: Record<string, Role[]> = {
    "/employees": ["super_admin", "admin", "hr"],
    "/departments": ["super_admin", "admin", "hr", "dept_head"],
    "/hr": ["super_admin", "admin", "hr"],
    "/tasks": ["super_admin", "admin", "hr", "dept_head", "employee"],
    "/policies": ["super_admin", "admin", "hr"],
    "/settings": ["super_admin", "admin"],
    "/reports": ["super_admin", "admin", "hr", "dept_head"],
    "/analytics": ["super_admin", "admin", "hr", "dept_head", "employee"],
    "/my-team": ["super_admin", "admin", "dept_head"],
    "/screenshots-agent": ["super_admin", "admin"],
  };
  return admin || hr || (map[path]?.includes(role) ?? true);
}

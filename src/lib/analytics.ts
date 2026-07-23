import type { Employee, Task } from "@/lib/store";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type AttendanceStatus = "present" | "absent" | "leave" | "weekend" | "holiday";

export type DayRecord = {
  date: string;
  status: AttendanceStatus;
  hours: number;
  productive: number;
  neutral: number;
  unproductive: number;
};

export type EmployeeAnalytics = {
  employeeId: string;
  days: number;
  records: DayRecord[];
  summary: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    workingDays: number;
    attendancePct: number;
    totalHours: number;
    avgHoursPerDay: number;
    productivityPct: number;
    focusHours: number;
    tasksAssigned: number;
    tasksCompleted: number;
    tasksInProgress: number;
    tasksOverdue: number;
    onTimePct: number;
  };
  leaves: { type: string; count: number }[];
  taskBreakdown: { stage: string; count: number; tone: string }[];
};

const LEAVE_TYPES = ["Casual", "Sick", "Earned", "Comp-off"];

export function getEmployeeAnalytics(
  employee: Employee,
  tasks: Task[],
  days: number,
): EmployeeAnalytics {
  const rand = mulberry32(hash(employee.id + ":" + days));
  const records: DayRecord[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let present = 0, absent = 0, leave = 0, working = 0;
  let totalHours = 0, prodSum = 0, neutSum = 0, unprodSum = 0;
  const leaveCounts: Record<string, number> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const iso = d.toISOString().slice(0, 10);
    let status: AttendanceStatus = "present";
    let hours = 0, productive = 0, neutral = 0, unproductive = 0;

    if (dow === 0 || dow === 6) {
      status = "weekend";
    } else {
      working++;
      const r = rand();
      if (r < 0.04) {
        status = "absent";
        absent++;
      } else if (r < 0.12) {
        status = "leave";
        leave++;
        const t = LEAVE_TYPES[Math.floor(rand() * LEAVE_TYPES.length)];
        leaveCounts[t] = (leaveCounts[t] ?? 0) + 1;
      } else {
        status = "present";
        present++;
        hours = +(6 + rand() * 4).toFixed(1);
        productive = +(hours * (0.55 + rand() * 0.35)).toFixed(1);
        const remain = +(hours - productive).toFixed(1);
        neutral = +(remain * (0.4 + rand() * 0.4)).toFixed(1);
        unproductive = +(remain - neutral).toFixed(1);
        totalHours += hours;
        prodSum += productive;
        neutSum += neutral;
        unprodSum += unproductive;
      }
    }

    records.push({ date: iso, status, hours, productive, neutral, unproductive });
  }

  const empTasks = tasks.filter((t) => t.assigneeId === employee.id);
  const completed = empTasks.filter((t) => t.stage === "completed").length;
  const inProgress = empTasks.filter((t) => t.stage === "in_progress" || t.stage === "review").length;
  const overdue = empTasks.filter(
    (t) => t.stage !== "completed" && new Date(t.dueDate) < new Date(),
  ).length;
  const onTime = empTasks.length === 0 ? 0 : Math.round(((empTasks.length - overdue) / empTasks.length) * 100);

  return {
    employeeId: employee.id,
    days,
    records,
    summary: {
      presentDays: present,
      absentDays: absent,
      leaveDays: leave,
      workingDays: working,
      attendancePct: working === 0 ? 0 : Math.round((present / working) * 100),
      totalHours: +totalHours.toFixed(1),
      avgHoursPerDay: present === 0 ? 0 : +(totalHours / present).toFixed(1),
      productivityPct:
        totalHours === 0 ? 0 : Math.round((prodSum / (prodSum + neutSum + unprodSum)) * 100),
      focusHours: +prodSum.toFixed(1),
      tasksAssigned: empTasks.length,
      tasksCompleted: completed,
      tasksInProgress: inProgress,
      tasksOverdue: overdue,
      onTimePct: onTime,
    },
    leaves: LEAVE_TYPES.map((t) => ({ type: t, count: leaveCounts[t] ?? 0 })),
    taskBreakdown: [
      { stage: "To Do", count: empTasks.filter((t) => t.stage === "todo").length, tone: "oklch(0.72 0.16 45)" },
      { stage: "In Progress", count: empTasks.filter((t) => t.stage === "in_progress").length, tone: "oklch(0.55 0.14 250)" },
      { stage: "Review", count: empTasks.filter((t) => t.stage === "review").length, tone: "oklch(0.78 0.16 75)" },
      { stage: "Completed", count: completed, tone: "oklch(0.68 0.16 155)" },
    ],
  };
}

export function visibleEmployeesFor(
  currentUser: Employee | null,
  employees: Employee[],
): Employee[] {
  if (!currentUser) return [];
  if (currentUser.role === "super_admin" || currentUser.role === "admin" || currentUser.role === "hr") {
    return employees;
  }
  if (currentUser.role === "dept_head") {
    return employees.filter((e) => e.departmentId === currentUser.departmentId);
  }
  return employees.filter((e) => e.id === currentUser.id);
}

export function subordinatesOf(head: Employee, employees: Employee[]): Employee[] {
  return employees.filter((e) => e.departmentId === head.departmentId && e.id !== head.id);
}
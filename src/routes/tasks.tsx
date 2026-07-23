import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, STAGES, type Task, type TaskStage, type Priority } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Clock, User as UserIcon, Trash2 } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/tasks")({ component: TasksPage });

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-[oklch(0.72_0.16_45)]/15 text-[oklch(0.5_0.16_45)]",
  high: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.5_0.16_75)]",
  urgent: "bg-destructive/15 text-destructive",
};

function TasksPage() {
  const { state, setState, currentUser } = useStore();
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [dept, setDept] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sortBy, setSortBy] = useState<"due" | "priority" | "created">("due");
  const [detail, setDetail] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filtered = useMemo(() => {
    let t = state.tasks.slice();
    if (q) t = t.filter((x) => (x.title + x.description).toLowerCase().includes(q.toLowerCase()));
    if (assignee !== "all") t = t.filter((x) => x.assigneeId === assignee);
    if (dept !== "all") t = t.filter((x) => x.departmentId === dept);
    if (priority !== "all") t = t.filter((x) => x.priority === priority);
    const priOrder: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    t.sort((a, b) => sortBy === "due" ? +new Date(a.dueDate) - +new Date(b.dueDate)
      : sortBy === "priority" ? priOrder[a.priority] - priOrder[b.priority]
      : +new Date(b.createdAt) - +new Date(a.createdAt));
    return t;
  }, [state.tasks, q, assignee, dept, priority, sortBy]);

  const onDragEnd = (e: DragEndEvent) => {
    const id = e.active.id as string;
    const overStage = e.over?.id as TaskStage | undefined;
    if (!overStage) return;
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.stage === overStage) return;
    const actor = currentUser?.name ?? "you";
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => t.id === id ? {
        ...t, stage: overStage,
        history: [...t.history, { at: new Date().toISOString(), actor, message: `Moved to ${STAGES.find((s) => s.id === overStage)?.label}` }],
      } : t),
    }));
  };

  const deleteTask = (id: string) => {
    if (!confirm("Delete this task?")) return;
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    setDetail(null);
  };

  return (
    <div className="p-6 space-y-4 max-w-[1800px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Workflow</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Task board</h1>
          <p className="text-sm text-muted-foreground">Drag cards between stages · {filtered.length} of {state.tasks.length} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="pl-8 h-9 w-52" /></div>
          <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="Assignee" /></SelectTrigger><SelectContent><SelectItem value="all">All assignees</SelectItem>{state.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select>
          <Select value={dept} onValueChange={setDept}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="Department" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{state.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
          <Select value={priority} onValueChange={setPriority}><SelectTrigger className="h-9 w-32"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{(["urgent", "high", "medium", "low"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "due" | "priority" | "created")}><SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due">Sort: Due date</SelectItem><SelectItem value="priority">Sort: Priority</SelectItem><SelectItem value="created">Sort: Created</SelectItem></SelectContent></Select>
          <Button onClick={() => setCreating(true)} className="gap-1"><Plus className="h-4 w-4" /> New task</Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const items = filtered.filter((t) => t.stage === stage.id);
            return <Column key={stage.id} stage={stage.id} label={stage.label} tone={stage.tone} items={items} onOpen={setDetail} />;
          })}
        </div>
      </DndContext>

      <TaskDetailDialog task={detail} onClose={() => setDetail(null)} onDelete={deleteTask} />
      <TaskCreateDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Column({ stage, label, tone, items, onOpen }: { stage: TaskStage; label: string; tone: string; items: Task[]; onOpen: (t: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={`rounded-lg border ${isOver ? "border-accent bg-accent/5" : "border-border bg-card"} min-h-[500px] flex flex-col`}>
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: tone }} /><span className="text-sm font-medium">{label}</span></div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{items.length}</span>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {items.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpen(t)} />)}
        {items.length === 0 && <div className="text-[11px] text-muted-foreground text-center py-6">Drop tasks here</div>}
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { state } = useStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const assignee = state.employees.find((e) => e.id === task.assigneeId);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 } : undefined;
  const overdue = new Date(task.dueDate) < new Date() && task.stage !== "completed";
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={onOpen}
      className="bg-background border border-border rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-accent transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug flex-1">{task.title}</div>
        <Badge className={`${PRIORITY_COLOR[task.priority]} text-[10px] uppercase border-0`}>{task.priority}</Badge>
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">{assignee ? <><div className="h-5 w-5 rounded-full bg-accent text-accent-foreground grid place-items-center text-[9px] font-semibold">{assignee.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div><span>{assignee.name.split(" ")[0]}</span></> : <><UserIcon className="h-3 w-3" /> Unassigned</>}</div>
        <div className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : ""}`}><Clock className="h-3 w-3" /> {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      </div>
    </div>
  );
}

function TaskDetailDialog({ task, onClose, onDelete }: { task: Task | null; onClose: () => void; onDelete: (id: string) => void }) {
  const { state, setState, currentUser } = useStore();
  if (!task) return null;
  const assignee = state.employees.find((e) => e.id === task.assigneeId);
  const dept = state.departments.find((d) => d.id === task.departmentId);

  const update = (patch: Partial<Task>, msg: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? {
      ...t, ...patch,
      history: [...t.history, { at: new Date().toISOString(), actor: currentUser?.name ?? "you", message: msg }],
    } : t) }));
  };

  const currentTask = state.tasks.find((t) => t.id === task.id) ?? task;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="pr-8">{currentTask.title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 text-sm text-muted-foreground">{currentTask.description}</div>
          <div><Label className="text-xs">Stage</Label>
            <Select value={currentTask.stage} onValueChange={(v) => update({ stage: v as TaskStage }, `Moved to ${STAGES.find((s) => s.id === v)?.label}`)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Priority</Label>
            <Select value={currentTask.priority} onValueChange={(v) => update({ priority: v as Priority }, `Priority set to ${v}`)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{(["urgent", "high", "medium", "low"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Assignee</Label><div className="text-sm mt-2">{assignee?.name ?? "—"}</div></div>
          <div><Label className="text-xs">Department</Label><div className="text-sm mt-2">{dept?.name ?? "—"}</div></div>
          <div><Label className="text-xs">Due date</Label><div className="text-sm mt-2">{new Date(currentTask.dueDate).toLocaleDateString()}</div></div>
          <div><Label className="text-xs">Created</Label><div className="text-sm mt-2">{formatDistanceToNow(new Date(currentTask.createdAt), { addSuffix: true })}</div></div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2 mb-2">Activity timeline</div>
          <div className="border rounded-md divide-y max-h-56 overflow-auto">
            {currentTask.history.slice().reverse().map((h, i) => (
              <div key={i} className="px-3 py-2 text-xs flex items-center justify-between">
                <div><span className="font-medium">{h.actor}</span> {h.message}</div>
                <div className="text-muted-foreground text-[10px]">{formatDistanceToNow(new Date(h.at), { addSuffix: true })}</div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(currentTask.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setState, currentUser } = useStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));

  const create = () => {
    if (!title.trim()) return;
    const t: Task = {
      id: "t-" + crypto.randomUUID().slice(0, 8),
      title, description, priority,
      stage: "todo",
      assigneeId: assigneeId || null,
      departmentId: departmentId || null,
      dueDate: new Date(dueDate).toISOString(),
      createdAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), actor: currentUser?.name ?? "you", message: "Task created" }],
    };
    setState((s) => ({ ...s, tasks: [t, ...s.tasks] }));
    setTitle(""); setDescription(""); setPriority("medium"); setAssigneeId(""); setDepartmentId("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label className="text-xs">Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{(["urgent", "high", "medium", "low"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs">Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div><Label className="text-xs">Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{state.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger><SelectContent>{state.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create}>Create task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

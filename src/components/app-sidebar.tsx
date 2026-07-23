import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Activity,
  Clock,
  Users,
  FolderKanban,
  Camera,
  BarChart3,
  Settings,
  ShieldCheck,
  KanbanSquare,
  Building2,
  UserCog,
  BadgeCheck,
  LineChart,
  UsersRound,
  TrendingUp,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { useStore, ROLE_LABEL, canAccess } from "@/lib/store";
import { LogOut } from "lucide-react";

const workspace = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Tasks", url: "/tasks", icon: KanbanSquare },
  { title: "Live activity", url: "/activity", icon: Activity },
  { title: "Timesheets", url: "/timesheets", icon: Clock },
  { title: "Screenshots", url: "/screenshots", icon: Camera },
  { title: "Capture agent", url: "/screenshots-agent", icon: Camera },
];

const manage = [
  { title: "Employees", url: "/employees", icon: UserCog },
  { title: "Departments", url: "/departments", icon: Building2 },
  { title: "Team", url: "/team", icon: Users },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Productivity", url: "/productivity", icon: TrendingUp },
];

const insights = [
  { title: "Employee analytics", url: "/analytics", icon: LineChart },
  { title: "My team", url: "/my-team", icon: UsersRound },
];

const hr = [
  { title: "HR Console", url: "/hr", icon: BadgeCheck },
];

const system = [
  { title: "Policies", url: "/policies", icon: ShieldCheck },
  { title: "Settings", url: "/settings", icon: Settings },
];

function Section({
  label,
  items,
  currentPath,
}: {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[];
  currentPath: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase tracking-wider text-[10px]">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = currentPath === item.url;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link to={item.url} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { currentUser, logout } = useStore();
  const role = currentUser?.role;
  const filter = (items: { url: string }[]) => items.filter((i) => canAccess(role, i.url));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
            O
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-foreground">OmERP</span>
            <span className="text-[10px] text-sidebar-foreground/60">Workforce Intelligence</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <Section label="Workspace" items={filter(workspace) as typeof workspace} currentPath={currentPath} />
        <Section label="Manage" items={filter(manage) as typeof manage} currentPath={currentPath} />
        {filter(insights).length > 0 && (
          <Section label="Insights" items={filter(insights) as typeof insights} currentPath={currentPath} />
        )}
        {filter(hr).length > 0 && <Section label="HR" items={filter(hr) as typeof hr} currentPath={currentPath} />}
        <Section label="System" items={filter(system) as typeof system} currentPath={currentPath} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {currentUser ? (
          <div className="flex items-center gap-2 px-2 py-2">
            {currentUser.photo ? (
              <img src={currentUser.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold">
                {currentUser.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
            )}
            <div className="flex flex-col leading-tight flex-1 min-w-0">
              <span className="text-xs font-medium text-sidebar-foreground truncate">{currentUser.name}</span>
              <span className="text-[10px] text-sidebar-foreground/60">{ROLE_LABEL[currentUser.role]}</span>
            </div>
            <button onClick={logout} className="h-7 w-7 rounded hover:bg-sidebar-accent grid place-items-center" title="Sign out">
              <LogOut className="h-3.5 w-3.5 text-sidebar-foreground/70" />
            </button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
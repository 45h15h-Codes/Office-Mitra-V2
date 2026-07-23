// TanStack Router Root Route (Phase 9 Devices Added)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Bell, Search } from "lucide-react";
import { StoreProvider, useStore, ROLE_LABEL } from "@/lib/store";
import { Route as LoginRoute } from "./login";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OmERP — Workforce Intelligence" },
      { name: "description", content: "Real-time visibility into how work happens across remote, hybrid, and field teams." },
      { name: "author", content: "OmERP" },
      { property: "og:title", content: "OmERP — Workforce Intelligence" },
      { property: "og:description", content: "Real-time visibility into how work happens across your teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isStandalonePage = path === "/login" || path === "/consent" || path === "/invite";

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <AuthGate>
          {isStandalonePage ? <Outlet /> : <AppShell />}
        </AuthGate>
      </StoreProvider>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser } = useStore();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  // Allow /login, /consent, and /invite without auth — public standalone routes
  const isPublicRoute = path === "/login" || path === "/consent" || path === "/invite";
  if (!currentUser && !isPublicRoute) {
    return <LoginPageInline />;
  }
  return <>{children}</>;
}

function LoginPageInline() {
  const Comp = (LoginRoute.options as { component: React.ComponentType }).component;
  return <Comp />;
}

function AppShell() {
  const { currentUser } = useStore();
  return (
    <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center gap-3 border-b border-border bg-card/60 backdrop-blur px-4 sticky top-0 z-30">
              <SidebarTrigger />
              <div className="hidden md:flex items-center gap-2 px-3 h-9 rounded-md bg-muted text-muted-foreground text-sm w-80">
                <Search className="h-4 w-4" />
                <span>Search people, projects, activities…</span>
                <kbd className="ml-auto text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {currentUser && (
                  <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-[oklch(0.68_0.16_155)] animate-pulse" />
                    Signed in as <span className="font-medium text-foreground">{currentUser.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wider">{ROLE_LABEL[currentUser.role]}</span>
                  </div>
                )}
                <button className="relative h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-destructive" />
                </button>
              </div>
            </header>
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
  );
}

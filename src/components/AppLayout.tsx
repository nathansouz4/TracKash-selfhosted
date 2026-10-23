import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CreditCard,
  Eye,
  EyeOff,
  LayoutDashboard,
  Link2,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  TrendingUp,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { TrackashLogo } from "@/components/brand";
import { SyncProgress } from "@/components/SyncProgress";
import { Button } from "@/components/ui/button";
import {
  cardsQuery,
  connectionsQuery,
  flowQuery,
  investmentsQuery,
  overviewQuery,
} from "@/functions/queries";
import { usePrivacyMode, useThemePreference } from "@/hooks/use-preferences";
import { useStartSync, useSyncCompletion, useSyncStatus } from "@/hooks/use-sync";
import { todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/cash-flow", label: "Fluxo", icon: ArrowLeftRight },
  { to: "/cards", label: "Cartões", icon: CreditCard },
  { to: "/investments", label: "Investimentos", icon: TrendingUp },
  { to: "/connections", label: "Conexões", icon: Link2 },
] as const;

const THEME_LABEL = {
  system: "Tema do sistema",
  dark: "Tema escuro",
  light: "Tema claro",
} as const;

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

/** Pages that work without synced data: they stay reachable during the first sync. */
const ALWAYS_AVAILABLE = ["/connections", "/settings"];

export function AppLayout({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const status = useSyncStatus();
  const sync = useStartSync();
  const privacy = usePrivacyMode();
  const theme = useThemePreference();
  useSyncCompletion();

  const ThemeIcon = theme.theme === "dark" ? Moon : theme.theme === "light" ? Sun : Monitor;
  const navigating = useRouterState({ select: (s) => s.status === "pending" });
  const syncing = status.data?.running || sync.isPending;
  // Nothing synced yet and a sync on its way: show it instead of empty dashboards.
  const firstSync =
    status.data != null &&
    status.data.lastSuccessAt == null &&
    (status.data.running || status.data.lastRun?.status === "error") &&
    !ALWAYS_AVAILABLE.some((path) => pathname.startsWith(path));

  // Opening the app brings the data up to date when the last sync is old.
  useEffect(() => {
    sync.mutate({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Once the first page is up, warm every tab in the background: switching tabs
  // then reads from the cache.
  useEffect(() => {
    const month = todayIso().slice(0, 7);
    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery(overviewQuery);
      void queryClient.prefetchQuery(flowQuery(month));
      void queryClient.prefetchQuery(cardsQuery(month, null));
      void queryClient.prefetchQuery(investmentsQuery);
      void queryClient.prefetchQuery(connectionsQuery);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left bg-brand transition-[transform,opacity] duration-500 ease-out",
            navigating ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
          )}
        />
        <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Trackash — início" className="shrink-0">
            <TrackashLogo />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Seções">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive(pathname, item.to) && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label={privacy.hidden ? "Mostrar valores" : "Ocultar valores"}
              onClick={privacy.toggle}
            >
              {privacy.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconButton>
            <IconButton label={`${THEME_LABEL[theme.theme]} — alternar`} onClick={theme.cycle}>
              <ThemeIcon className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={
                syncing ? (status.data?.progress?.label ?? "Sincronizando…") : "Sincronizar agora"
              }
              onClick={() => sync.mutate({ auto: false })}
              disabled={syncing}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </IconButton>
            <div className="ml-1 flex items-center gap-1 border-l pl-2 sm:ml-2 sm:gap-2 sm:pl-3">
              <Link
                to="/settings"
                aria-label="Configurações"
                title="Configurações"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive(pathname, "/settings") && "bg-secondary text-foreground",
                )}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-[96rem] gap-1 overflow-x-auto px-4 pb-2 lg:hidden"
          aria-label="Seções"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground",
                isActive(pathname, item.to) && "bg-secondary text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8">
        {firstSync ? (
          <section className="mx-auto mt-10 max-w-xl rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-bold tracking-tight">Carregando seus dados</h1>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              O Trackash está buscando contas, cartões e investimentos na Pluggy e gravando tudo no
              banco local desta máquina. Os painéis aparecem assim que terminar.
            </p>
            <SyncProgress
              status={status.data}
              onRetry={() => sync.mutate({ auto: false })}
              retrying={sync.isPending}
              actions={
                <Button variant="outline" asChild>
                  <Link to="/connections">Revisar conexões</Link>
                </Button>
              }
            />
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

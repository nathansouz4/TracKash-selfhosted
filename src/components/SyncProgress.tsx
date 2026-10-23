import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { getSyncStatus } from "@/functions/sync.functions";
import { cn } from "@/lib/utils";

type SyncStatus = Awaited<ReturnType<typeof getSyncStatus>>;

/** What a running (or failed) sync is doing, for the setup and the first load. */
export function SyncProgress({
  status,
  onRetry,
  retrying,
  actions,
}: {
  status: SyncStatus | undefined;
  onRetry?: () => void;
  retrying?: boolean;
  actions?: ReactNode;
}) {
  const failed = !status?.running && status?.lastRun?.status === "error";
  const progress = status?.progress;
  const share = progress && progress.total > 0 ? progress.step / progress.total : 0;

  if (failed) {
    return (
      <div className="space-y-4" role="alert">
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">A sincronização não terminou</p>
            <p className="mt-1 text-muted-foreground">{status?.lastRun?.error}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <Button onClick={onRetry} disabled={retrying}>
              <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} />
              Tentar de novo
            </Button>
          ) : null}
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-brand" aria-hidden="true" />
        <p className="text-sm font-medium">{progress?.label ?? "Sincronizando com a Pluggy…"}</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        aria-label="Progresso da sincronização"
      >
        <div
          className={cn(
            "h-full rounded-full bg-brand transition-[width] duration-700 ease-out",
            !progress && "w-1/3 animate-pulse",
          )}
          style={progress ? { width: `${Math.max(share * 100, 4)}%` } : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        A primeira carga traz até 2 anos de transações e pode levar alguns minutos. Pode deixar esta
        tela aberta.
      </p>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { syncStatusQuery } from "@/functions/queries";
import { startSync } from "@/functions/sync.functions";

// A sync runs in the background on the server; the screens poll its status
// (every second while it runs, see syncStatusQuery).

export function useSyncStatus() {
  return useQuery(syncStatusQuery);
}

/** Starts a sync. `auto`: only if the last one is old (opening the app). */
export function useStartSync() {
  const queryClient = useQueryClient();
  const start = useServerFn(startSync);
  return useMutation({
    mutationFn: (options: { auto: boolean } = { auto: false }) => start({ data: options }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: syncStatusQuery.queryKey }),
    onError: (error) => toast.error(error.message, { id: "sync" }),
  });
}

/**
 * Mounted once by the app shell: when a sync finishes, refreshes every dashboard
 * and says how it went.
 */
export function useSyncCompletion() {
  const queryClient = useQueryClient();
  const { data } = useSyncStatus();
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (data.running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    const run = data.lastRun;
    if (run?.status === "success") {
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      void queryClient.invalidateQueries({ queryKey: ["app"] });
      const s = run.stats;
      toast.success(
        s
          ? `Sincronizado: ${s.accounts} contas, ${s.transactions} transações, ${s.investments} investimentos.`
          : "Sincronizado.",
        { id: "sync" },
      );
    } else if (run?.status === "error") {
      toast.error(run.error ?? "Falha na sincronização.", { id: "sync" });
    }
  }, [data, queryClient]);
}

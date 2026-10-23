import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clock, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConnectionAccounts, InstitutionPicker } from "@/components/ConnectionDetails";
import { InstitutionAvatar, PageHeader, SectionCard } from "@/components/dashboard";
import { AddConnectionForm, ItemIdInstructions } from "@/components/setup/PluggyForms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteConnection } from "@/functions/connections.functions";
import { connectionsQuery } from "@/functions/queries";
import { useStartSync, useSyncStatus } from "@/hooks/use-sync";
import { formatDateTimeBR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/connections")({
  loader: ({ context }) => context.queryClient.ensureQueryData(connectionsQuery),
  component: ConnectionsPage,
});

const STATUS_LABELS: Record<string, string> = {
  UPDATED: "Atualizada",
  UPDATING: "Atualizando",
  LOGIN_ERROR: "Erro de login",
  OUTDATED: "Desatualizada",
  WAITING_USER_INPUT: "Aguardando ação",
};

function ConnectionsPage() {
  const { data } = useSuspenseQuery(connectionsQuery);
  const queryClient = useQueryClient();
  const sync = useStartSync();
  const status = useSyncStatus();
  const syncing = Boolean(status.data?.running) || sync.isPending;
  const deleteFn = useServerFn(deleteConnection);

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { itemId: id } }),
    onSuccess: async () => {
      toast.success("Conexão removida, com todos os dados importados dela.");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      await queryClient.invalidateQueries({ queryKey: ["app"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Bancos conectados pelo Meu Pluggy. A Pluggy atualiza cada conexão automaticamente a cada 24h."
        actions={
          <Button
            onClick={() => sync.mutate({ auto: false })}
            disabled={syncing || data.items.length === 0}
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item) => (
          <div key={item.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <InstitutionAvatar name={item.name} imageUrl={item.imageUrl} className="h-11 w-11" />
              <span
                className={cn(
                  "mt-1 h-2.5 w-2.5 rounded-full",
                  item.status === "UPDATED" ? "bg-positive" : "bg-warning",
                )}
                title={item.status ? (STATUS_LABELS[item.status] ?? item.status) : "Sem status"}
                aria-hidden="true"
              />
            </div>
            <p className="mt-4 font-semibold">{item.name}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {item.lastUpdatedAt ? formatDateTimeBR(item.lastUpdatedAt) : "Ainda não sincronizada"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.accounts} contas · {item.investments} investimentos
              {item.status && item.status !== "UPDATED" ? (
                <Badge variant="outline" className="ml-2">
                  {STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              ) : null}
            </p>
            <div className="mt-4 border-t pt-3">
              <ConnectionAccounts accounts={item.accountList} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <InstitutionPicker itemId={item.id} locked={item.institutionLocked} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover {item.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Contas, transações, faturas, investimentos e o histórico de desempenho
                      importados desta conexão serão apagados do Trackash. Nada muda no banco nem no
                      Meu Pluggy.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(item.id)}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}

        <SectionCard
          icon={Plus}
          title="Nova conexão"
          className={cn(data.items.length === 0 && "sm:col-span-2 lg:col-span-3")}
          bodyClassName="p-5"
        >
          <div className="space-y-4">
            <ItemIdInstructions />
            <AddConnectionForm />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        icon={History}
        title="Histórico de sincronizações"
        className="mt-6"
        bodyClassName="px-5 py-3"
      >
        {data.runs.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="flex items-center gap-2">
                  {formatDateTimeBR(run.startedAt)}
                  <Badge
                    variant={
                      run.status === "success"
                        ? "secondary"
                        : run.status === "error"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {run.status === "success"
                      ? "ok"
                      : run.status === "error"
                        ? "erro"
                        : "em andamento"}
                  </Badge>
                </span>
                <span className="text-muted-foreground">
                  {run.error ??
                    (run.stats
                      ? `${run.stats["items"] ?? 0} conexões · ${run.stats["accounts"] ?? 0} contas · ${
                          run.stats["transactions"] ?? 0
                        } transações · ${run.stats["investments"] ?? 0} investimentos`
                      : "")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

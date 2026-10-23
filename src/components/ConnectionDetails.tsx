import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CreditCard, Eye, EyeOff, Landmark, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getInstitutionOptions,
  setAccountIgnore,
  setConnectionInstitution,
} from "@/functions/connections.functions";
import { cn } from "@/lib/utils";

type AccountItem = {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  name: string;
  last4: string | null;
  ignored: boolean;
  ignoredBy: "auto" | "user" | null;
};

/** Accounts of one connection, each of which can be ignored everywhere in the app. */
export function ConnectionAccounts({ accounts }: { accounts: AccountItem[] }) {
  const queryClient = useQueryClient();
  const ignoreFn = useServerFn(setAccountIgnore);
  const mutation = useMutation({
    mutationFn: (v: { accountId: string; ignored: boolean }) => ignoreFn({ data: v }),
    onSuccess: async (_, v) => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(
        v.ignored ? "Conta ignorada em todo o app." : "Conta voltou a ser considerada.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  if (accounts.length === 0) {
    return <p className="text-xs text-muted-foreground">Sincronize para ver as contas.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {accounts.map((a) => {
        const Icon = a.type === "CREDIT" ? CreditCard : Landmark;
        return (
          <li
            key={a.id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
              a.ignored && "bg-muted/60",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate font-medium",
                  a.ignored && "text-muted-foreground line-through",
                )}
              >
                {a.name}
                {a.last4 ? <span className="text-muted-foreground"> ·{a.last4}</span> : null}
              </p>
              {a.ignored ? (
                <p className="text-muted-foreground">
                  {a.ignoredBy === "auto"
                    ? "Ignorada: cartão duplicado em outra conexão"
                    : "Ignorada por você"}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ accountId: a.id, ignored: !a.ignored })}
              title={
                a.ignored ? "Voltar a considerar esta conta" : "Ignorar esta conta em todo o app"
              }
            >
              {a.ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {a.ignored ? "Usar" : "Ignorar"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Lets the owner pick the institution of a connection (name + logo from Pluggy's catalog). */
export function InstitutionPicker({ itemId, locked }: { itemId: string; locked: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const optionsFn = useServerFn(getInstitutionOptions);
  const setFn = useServerFn(setConnectionInstitution);
  const options = useQuery({
    queryKey: ["institution-options"],
    queryFn: () => optionsFn(),
    enabled: open,
    staleTime: 24 * 60 * 60_000,
  });
  const mutation = useMutation({
    mutationFn: (connectorId: number | null) => setFn({ data: { itemId, connectorId } }),
    onSuccess: async (r) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(
        r.name ? `Conexão agora aparece como ${r.name}.` : "Detecção automática reativada.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Alterar banco
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <label
        className="flex items-center gap-1.5 text-xs font-medium"
        htmlFor={`institution-${itemId}`}
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        Banco desta conexão
      </label>
      <select
        id={`institution-${itemId}`}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        disabled={options.isLoading || mutation.isPending}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === "auto") mutation.mutate(null);
          else if (v) mutation.mutate(Number(v));
        }}
      >
        <option value="" disabled>
          {options.isLoading ? "Carregando instituições…" : "Escolha a instituição"}
        </option>
        {locked ? <option value="auto">Detectar automaticamente</option> : null}
        {(options.data ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 self-end px-2 text-xs"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </Button>
      {locked ? (
        <Badge variant="outline" className="self-start">
          definido por você
        </Badge>
      ) : null}
    </div>
  );
}

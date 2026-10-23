import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  Landmark,
  Link2,
  RefreshCw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { B3ImportButton } from "@/components/B3ImportButton";
import { TrackashLogo } from "@/components/brand";
import { InstitutionAvatar } from "@/components/dashboard";
import { ExternalLink, FormError, Instructions, Note } from "@/components/setup/parts";
import {
  AddConnectionForm,
  ItemIdInstructions,
  MeuPluggyInstructions,
  PluggyCredentialsForm,
  PluggyCredentialsInstructions,
} from "@/components/setup/PluggyForms";
import { SyncProgress } from "@/components/SyncProgress";
import { Button } from "@/components/ui/button";
import { deleteConnection } from "@/functions/connections.functions";
import { connectionsQuery, syncStatusQuery } from "@/functions/queries";
import { appStateQuery, finishSetup, savePluggyCredentials } from "@/functions/setup.functions";
import { useStartSync } from "@/hooks/use-sync";
import { resumeStep, SETUP_STEPS, stepReachable, type SetupStep } from "@/lib/setup";
import { cn } from "@/lib/utils";

// First-run setup: a step-by-step guide from zero to the first sync. Shown until
// the owner finishes it; afterwards keys change in Configurações and connections
// in Conexões.

export const Route = createFileRoute("/setup")({
  loader: async ({ context: { queryClient } }) => {
    const state = await queryClient.fetchQuery(appStateQuery);
    if (state.setupCompleted) throw redirect({ to: "/" });
  },
  component: SetupPage,
});

const STEPS: Record<
  SetupStep,
  { title: string; subtitle: string; icon: LucideIcon; optional?: true }
> = {
  welcome: { title: "Boas-vindas", subtitle: "Como funciona", icon: Sparkles },
  "meu-pluggy": { title: "Meu Pluggy", subtitle: "Conecte seus bancos", icon: Landmark },
  credentials: { title: "Credenciais", subtitle: "Client ID e Secret", icon: KeyRound },
  connections: { title: "Conexões", subtitle: "IDs dos itens", icon: Link2 },
  b3: { title: "Extrato da B3", subtitle: "Renda variável", icon: FileSpreadsheet, optional: true },
  sync: { title: "Primeira carga", subtitle: "Sincronização", icon: RefreshCw },
};

function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-brand-soft blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-8 flex justify-center">
          <TrackashLogo className="scale-125" />
        </div>
        {children}
      </div>
    </div>
  );
}

function SetupPage() {
  const { data: state } = useSuspenseQuery(appStateQuery);
  const progress = { credentials: state.credentials, connections: state.connections };
  const [picked, setPicked] = useState<SetupStep | null>(null);
  // A step that is no longer reachable (e.g. the last connection was removed) falls back.
  const current = picked && stepReachable(picked, progress) ? picked : resumeStep(progress);
  const go = (step: SetupStep) => setPicked(step);

  const done: Record<SetupStep, boolean> = {
    welcome: current !== "welcome" || state.credentials,
    "meu-pluggy": state.credentials || state.connections > 0,
    credentials: state.credentials,
    connections: state.connections > 0,
    b3: current === "sync",
    sync: false,
  };

  return (
    <SetupShell>
      <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Etapas da configuração">
          <ol className="space-y-1">
            {SETUP_STEPS.map((id, index) => {
              const step = STEPS[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={!stepReachable(id, progress)}
                    onClick={() => go(id)}
                    aria-current={current === id ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                      current === id ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        done[id] && "border-brand bg-brand text-white",
                      )}
                    >
                      {done[id] ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{step.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {step.subtitle}
                        {step.optional ? " · opcional" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          {current === "welcome" ? (
            <WelcomeStep next={() => go("meu-pluggy")} />
          ) : current === "meu-pluggy" ? (
            <MeuPluggyStep next={() => go("credentials")} />
          ) : current === "credentials" ? (
            <CredentialsStep configured={state.credentials} next={() => go("connections")} />
          ) : current === "connections" ? (
            <ConnectionsStep next={() => go("b3")} />
          ) : current === "b3" ? (
            <B3Step next={() => go("sync")} />
          ) : (
            <SyncStep back={() => go("connections")} />
          )}
        </section>
      </div>
    </SetupShell>
  );
}

function StepBody({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      <div className="space-y-5">{children}</div>
    </>
  );
}

function WelcomeStep({ next }: { next: () => void }) {
  return (
    <StepBody
      title="Bem-vindo ao Trackash"
      description="Seu painel financeiro pessoal: gastos, fluxo de caixa, cartões e desempenho dos investimentos, com os dados do Open Finance brasileiro."
    >
      <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Tudo fica nesta máquina.</strong> O Trackash busca os
          dados na Pluggy (somente leitura) e grava em um banco SQLite local, na pasta{" "}
          <code className="font-mono text-xs">data/</code> do projeto. Não há conta, login nem
          servidor de terceiros no meio: o app só responde aqui, em localhost.
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Você vai precisar de (cerca de 10 minutos):</p>
        <Instructions>
          <li>
            Uma conta no <strong>Meu Pluggy</strong> com seus bancos conectados (grátis, até 5
            conexões).
          </li>
          <li>
            Uma conta de desenvolvedor no <strong>dashboard da Pluggy</strong>, para o Client ID e o
            Client Secret (grátis).
          </li>
          <li>
            Opcional: o <strong>extrato de movimentação da B3</strong> (.xlsx), para preço médio,
            resultado e proventos de ações e FIIs.
          </li>
        </Instructions>
      </div>
      <Button onClick={next}>Começar</Button>
    </StepBody>
  );
}

function MeuPluggyStep({ next }: { next: () => void }) {
  return (
    <StepBody
      title="Conecte seus bancos no Meu Pluggy"
      description="O Meu Pluggy é quem fala com os bancos pelo Open Finance. O Trackash lê dele, nunca dos bancos diretamente."
    >
      <MeuPluggyInstructions />
      <Note>
        O plano pessoal permite até 5 conexões, e a Pluggy atualiza cada uma automaticamente a cada
        24 horas.
      </Note>
      <Button onClick={next}>Já conectei meus bancos</Button>
    </StepBody>
  );
}

function CredentialsStep({ configured, next }: { configured: boolean; next: () => void }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(savePluggyCredentials);
  return (
    <StepBody
      title="Credenciais da Pluggy"
      description="Com elas o Trackash lê as suas conexões pela API da Pluggy. Elas são testadas antes de salvar e ficam só no banco local."
    >
      <PluggyCredentialsInstructions />
      {configured ? (
        <p className="flex items-center gap-2 text-sm font-medium text-positive">
          <Check className="h-4 w-4" aria-hidden="true" />
          Credenciais salvas e testadas.
        </p>
      ) : null}
      <PluggyCredentialsForm
        configured={configured}
        submit={(data) => saveFn({ data })}
        onSaved={async () => {
          toast.success("Credenciais da Pluggy salvas.");
          await queryClient.invalidateQueries({ queryKey: appStateQuery.queryKey });
          next();
        }}
        actions={
          configured ? (
            <Button type="button" variant="ghost" onClick={next}>
              Continuar
            </Button>
          ) : null
        }
      />
    </StepBody>
  );
}

function ConnectionsStep({ next }: { next: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(connectionsQuery);
  const deleteFn = useServerFn(deleteConnection);
  const remove = useMutation({
    mutationFn: (itemId: string) => deleteFn({ data: { itemId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      await queryClient.invalidateQueries({ queryKey: ["app"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const items = data?.items ?? [];

  return (
    <StepBody
      title="Informe as conexões"
      description="Cada banco conectado no Meu Pluggy vira um item na sua aplicação da Pluggy. Informe o ID de cada um: são eles que o Trackash sincroniza."
    >
      <ItemIdInstructions />
      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
              <InstitutionAvatar name={item.name} imageUrl={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{item.id}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${item.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <AddConnectionForm />
      <div className="border-t pt-4">
        <Button onClick={next} disabled={items.length === 0}>
          Continuar
        </Button>
      </div>
    </StepBody>
  );
}

function B3Step({ next }: { next: () => void }) {
  const [imported, setImported] = useState<string | null>(null);
  return (
    <StepBody
      title="Extrato da B3 (opcional)"
      description="A Pluggy mostra a posição atual de ações, FIIs, ETFs e BDRs, mas não o histórico de compras. O extrato de movimentação da B3 completa o preço médio, o resultado e os proventos."
    >
      <Instructions>
        <li>
          Entre na{" "}
          <ExternalLink href="https://www.investidor.b3.com.br">
            Área do Investidor da B3
          </ExternalLink>
          .
        </li>
        <li>
          Abra <strong>Extratos → Movimentação</strong>, escolha o maior período disponível e
          exporte em Excel (.xlsx).
        </li>
        <li>Envie o arquivo abaixo. Pode enviar vários períodos: nada é duplicado.</li>
      </Instructions>
      {imported ? (
        <p className="flex items-center gap-2 text-sm font-medium text-positive">
          <Check className="h-4 w-4" aria-hidden="true" />
          {imported}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <B3ImportButton
          onImported={(result) =>
            setImported(`${result.rowsInserted} lançamentos importados de ${result.rowsRead}.`)
          }
        />
        <Button variant={imported ? "default" : "ghost"} onClick={next}>
          {imported ? "Continuar" : "Pular por enquanto"}
        </Button>
      </div>
      <Note>Dá para importar (ou atualizar) depois, na aba Investimentos.</Note>
    </StepBody>
  );
}

function SyncStep({ back }: { back: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const finishFn = useServerFn(finishSetup);
  const status = useQuery(syncStatusQuery);
  const retry = useStartSync();
  const [started, setStarted] = useState(false);
  const finish = useMutation({
    mutationFn: () => finishFn(),
    onSuccess: async () => {
      setStarted(true);
      await queryClient.invalidateQueries({ queryKey: syncStatusQuery.queryKey });
    },
  });

  const running = status.data?.running ?? false;
  const succeeded =
    started && !running && status.data?.lastRun?.status === "success" && !finish.isPending;

  async function openDashboard() {
    await queryClient.invalidateQueries({ queryKey: ["app"] });
    await queryClient.invalidateQueries({ queryKey: ["finance"] });
    await navigate({ to: "/", replace: true });
  }

  if (succeeded) {
    const stats = status.data?.lastRun?.stats;
    return (
      <StepBody
        title="Dados carregados"
        description="Seus painéis estão prontos. O Trackash atualiza os dados sozinho quando você abre o app (se a última carga tiver mais de 6 horas) e pelo botão de sincronizar no topo."
      >
        {stats ? (
          <p className="text-sm text-muted-foreground">
            {stats.items} conexões · {stats.accounts} contas · {stats.transactions} transações ·{" "}
            {stats.investments} investimentos
          </p>
        ) : null}
        <Button onClick={openDashboard}>Abrir o painel</Button>
      </StepBody>
    );
  }

  if (started || running) {
    return (
      <StepBody
        title="Carregando seus dados"
        description="Buscando contas, cartões, faturas e investimentos na Pluggy e gravando no banco local."
      >
        <SyncProgress
          status={status.data}
          onRetry={() => retry.mutate({ auto: false })}
          retrying={retry.isPending}
          actions={
            <Button variant="outline" onClick={back}>
              Revisar conexões
            </Button>
          }
        />
      </StepBody>
    );
  }

  return (
    <StepBody
      title="Primeira carga"
      description="Tudo pronto para buscar seus dados. A primeira sincronização traz até 2 anos de transações e o histórico dos investimentos, e pode levar alguns minutos."
    >
      <Instructions>
        <li>Rode o Trackash ao menos uma vez por dia para ter um bom histórico da carteira.</li>
        <li>
          Pelo terminal, <code className="font-mono text-xs">npm run sync</code> faz a mesma carga
          (bom para agendar).
        </li>
      </Instructions>
      <FormError error={finish.error} />
      <Button onClick={() => finish.mutate()} disabled={finish.isPending}>
        {finish.isPending ? "Iniciando…" : "Concluir e sincronizar"}
      </Button>
    </StepBody>
  );
}

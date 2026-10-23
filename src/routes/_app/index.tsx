import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CreditCard,
  Landmark,
  LineChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { DonutChart, MonthlyColumns, ValueArea } from "@/components/charts";
import {
  ChartCard,
  EmptyState,
  InstitutionAvatar,
  Money,
  PageHeader,
  SectionCard,
  Segmented,
  Sensitive,
  StatTile,
  UsageMeter,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { overviewQuery } from "@/functions/queries";
import {
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  formatPercent,
  formatSignedPercent,
  monthLongLabel,
  monthShortLabel,
} from "@/lib/format";
import { CLASS_COLOR_ORDER } from "@/lib/investments";
import { deltaTone } from "@/lib/tone";

export const Route = createFileRoute("/_app/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useSuspenseQuery(overviewQuery);
  const [allocationView, setAllocationView] = useState<"class" | "institution">("class");

  if (data.connections === 0) return <Onboarding />;

  const spendingChange =
    data.spendingLastMonth > 0 ? data.spendingThisMonth / data.spendingLastMonth - 1 : null;
  const allocation = allocationView === "class" ? data.allocation : data.allocationByInstitution;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={
          data.lastSync
            ? `Última sincronização: ${formatDateTimeBR(data.lastSync.startedAt)}${
                data.lastSync.status === "error" ? " (com erro)" : ""
              }`
            : "Ainda não sincronizado: use o botão de sincronizar no topo."
        }
      />

      <section className="mb-6 rounded-2xl border bg-gradient-to-br from-brand-soft via-card to-card p-6 shadow-xs">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Wallet className="h-4 w-4 text-brand" aria-hidden="true" />
          Patrimônio
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          <Money value={data.netWorth} className="sensitive-strong" />
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>
            Contas <Money value={data.cash} className="font-medium text-foreground" />
          </span>
          <span>
            Investimentos <Money value={data.invested} className="font-medium text-foreground" />
          </span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard icon={Landmark} title="Contas bancárias" value={<Money value={data.cash} />}>
          <ul className="divide-y">
            {data.institutions.map((inst) => (
              <li key={inst.name}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-subtle">
                    <InstitutionAvatar name={inst.name} imageUrl={inst.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inst.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {inst.accounts.length} {inst.accounts.length === 1 ? "conta" : "contas"} ·{" "}
                        {formatPercent(inst.share)}
                      </p>
                    </div>
                    <Money
                      value={inst.total}
                      tone={inst.total < 0 ? "negative" : "positive"}
                      className="text-sm font-semibold"
                    />
                  </summary>
                  <ul className="bg-subtle px-5 pb-2">
                    {inst.accounts.map((a) => (
                      <li key={a.id} className="flex justify-between gap-3 py-1.5 pl-12 text-xs">
                        <span className="truncate text-muted-foreground">
                          {a.subtype === "SAVINGS_ACCOUNT" ? "Poupança" : "Conta corrente"}
                          {a.last4 ? ` ·${a.last4}` : ""}
                        </span>
                        <Money value={a.balance} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
            {data.institutions.length === 0 ? (
              <li className="px-5 py-4 text-sm text-muted-foreground">Nenhuma conta bancária.</li>
            ) : null}
          </ul>
        </SectionCard>

        <SectionCard
          icon={CreditCard}
          title="Cartões de crédito"
          value={<Money value={data.openBills} tone="negative" />}
          subtitle="Soma das faturas abertas"
          actions={
            <Link
              to="/cards"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Analisar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {data.cardUsage != null ? (
            <div className="border-b px-5 py-3">
              <div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatPercent(data.cardUsage)} do limite usado (
                  <Sensitive>{formatBRL(data.cardDebt)}</Sensitive>)
                </span>
                <span>
                  Limite: <Sensitive>{formatBRL(data.cardLimit)}</Sensitive>
                </span>
              </div>
              <UsageMeter ratio={data.cardUsage} label="Uso do limite dos cartões" />
            </div>
          ) : null}
          <ul className="divide-y">
            {data.cards.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <InstitutionAvatar name={c.institution} imageUrl={c.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.last4 ? `•••• ${c.last4}` : c.institution}
                    {c.nextDue ? ` · vence ${formatDateBR(c.nextDue).slice(0, 5)}` : ""}
                  </p>
                </div>
                <Money value={c.openBill} tone="negative" className="text-sm font-semibold" />
              </li>
            ))}
            {data.cards.length === 0 ? (
              <li className="px-5 py-4 text-sm text-muted-foreground">Nenhum cartão.</li>
            ) : null}
          </ul>
        </SectionCard>

        <SectionCard
          icon={TrendingUp}
          title="Investimentos"
          value={<Money value={data.invested} tone="positive" />}
          subtitle={
            <>
              {data.investmentsCount} ativos · proventos em 12 meses:{" "}
              <Sensitive>{formatBRL(data.dividends12m)}</Sensitive>
            </>
          }
          actions={
            <Segmented
              label="Agrupar investimentos por"
              value={allocationView}
              onChange={setAllocationView}
              options={[
                { value: "class", label: "Classes" },
                { value: "institution", label: "Instituições" },
              ]}
            />
          }
          bodyClassName="px-5 py-4"
        >
          {allocation.length > 0 ? (
            <DonutChart
              data={allocation}
              centerLabel="Investido"
              colorOrder={allocationView === "class" ? CLASS_COLOR_ORDER : undefined}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum investimento nas conexões.</p>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <ChartCard
          icon={LineChart}
          className="lg:col-span-3"
          title="Evolução do saldo em contas"
          description="Saldo no fim de cada mês, reconstruído a partir das movimentações."
          table={{
            columns: ["Mês", "Saldo"],
            rows: data.balanceHistory.map((b) => [monthShortLabel(b.month), formatBRL(b.value)]),
          }}
        >
          <ValueArea
            monthly
            data={data.balanceHistory.map((b) => ({ date: b.month, value: b.value }))}
            valueLabel="Saldo"
          />
        </ChartCard>

        <div className="grid gap-4 lg:col-span-2">
          <StatTile
            icon={BarChart3}
            label="Gastos no mês"
            value={<Money value={data.spendingThisMonth} />}
            delta={
              spendingChange == null
                ? undefined
                : {
                    text: `${formatSignedPercent(spendingChange)} vs mês anterior`,
                    tone: deltaTone(spendingChange, false),
                  }
            }
            hint={
              <>
                Média dos 11 meses anteriores:{" "}
                <Sensitive>{formatBRL(data.spendingAverage)}</Sensitive>
              </>
            }
          />
          <StatTile
            icon={CalendarClock}
            label="Despesas futuras"
            value={<Money value={data.pendingTotal} />}
            hint="Lançamentos pendentes que ainda vão entrar na fatura ou na conta."
          />
        </div>
      </div>

      <ChartCard
        icon={BarChart3}
        className="mt-4"
        title="Gastos por mês"
        description={`${monthLongLabel(data.month)} até agora. Pagamento de fatura e transferências entre contas suas não contam.`}
        actions={
          <Link
            to="/cash-flow"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Ver fluxo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
        table={{
          columns: ["Mês", "Gastos"],
          rows: data.spending.map((s) => [monthShortLabel(s.month), formatBRL(s.total)]),
        }}
      >
        <MonthlyColumns data={data.spending} valueLabel="Gastos" />
      </ChartCard>
    </>
  );
}

function Onboarding() {
  return (
    <>
      <PageHeader title="Bem-vindo ao Trackash" />
      <EmptyState
        title="Conecte seus bancos para começar"
        action={
          <Button asChild>
            <Link to="/connections">Adicionar conexão</Link>
          </Button>
        }
      >
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
          <li>
            Conecte os bancos no <span className="font-medium text-foreground">Meu Pluggy</span>{" "}
            (meu.pluggy.ai).
          </li>
          <li>
            No dashboard da Pluggy, abra Aplicações → sua aplicação → Demo e copie o ID de cada item
            conectado via MeuPluggy.
          </li>
          <li>Cole cada ID em Conexões e clique em sincronizar.</li>
        </ol>
      </EmptyState>
    </>
  );
}

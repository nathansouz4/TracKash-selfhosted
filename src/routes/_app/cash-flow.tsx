import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Layers,
  Scale,
  Store,
  Tags,
} from "lucide-react";
import { DonutChart, MonthlyColumns, RankedBars } from "@/components/charts";
import { ChartCard, Money, PageHeader, Sensitive, StatTile } from "@/components/dashboard";
import { MonthNav, TransactionList } from "@/components/transactions";
import { flowQuery } from "@/functions/queries";
import { isValidMonth, todayIso } from "@/lib/dates";
import {
  formatBRL,
  formatPercent,
  formatSignedPercent,
  monthLongLabel,
  monthShortLabel,
} from "@/lib/format";
import { deltaTone } from "@/lib/tone";

/** Adds each item's share of the group total (what the donut needs). */
function withShares<T extends { label: string; total: number }>(items: T[]) {
  const sum = items.reduce((s, i) => s + i.total, 0);
  return items.map((i) => ({ label: i.label, total: i.total, share: sum > 0 ? i.total / sum : 0 }));
}

export const Route = createFileRoute("/_app/cash-flow")({
  validateSearch: (search: Record<string, unknown>): { month?: string } =>
    isValidMonth(search["month"]) ? { month: search["month"] } : {},
  loaderDeps: ({ search }) => ({ month: search.month ?? todayIso().slice(0, 7) }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(flowQuery(deps.month)),
  component: CashFlowPage,
});

function CashFlowPage() {
  const search = Route.useSearch();
  const month = search.month ?? todayIso().slice(0, 7);
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(flowQuery(month));
  const goTo = (m: string) => navigate({ search: { month: m } });

  const change = data.average6m > 0 ? data.total / data.average6m - 1 : null;
  const share = (value: number) => formatPercent(data.total > 0 ? value / data.total : 0);

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        description="Tudo o que entrou e saiu: cartões, Pix, boletos e débitos. Pagamento de fatura e transferências entre contas suas não contam como gasto."
        actions={<MonthNav month={month} onChange={goTo} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={ArrowDownLeft}
          label="Entradas"
          value={<Money value={data.income} tone="positive" />}
          hint="Salário, Pix recebidos, proventos…"
        />
        <StatTile
          icon={ArrowUpRight}
          label="Gastos"
          value={<Money value={data.total} />}
          delta={
            change == null
              ? undefined
              : {
                  text: `${formatSignedPercent(change)} vs média de 6 meses`,
                  tone: deltaTone(change, false),
                }
          }
        />
        <StatTile
          icon={Scale}
          label="Saldo do mês"
          value={<Money value={data.net} tone={data.net >= 0 ? "positive" : "negative"} />}
          hint="Entradas menos gastos"
        />
        <StatTile
          icon={CalendarClock}
          label="Despesas futuras"
          value={<Money value={data.pendingTotal} />}
          hint="Lançamentos ainda pendentes"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          icon={Tags}
          title="Gastos por categoria"
          description={monthLongLabel(month)}
          table={{
            columns: ["Categoria", "Valor", "Lançamentos"],
            rows: data.byCategory.map((c) => [c.label, formatBRL(c.total), c.count]),
          }}
        >
          {data.byCategory.length ? (
            <DonutChart data={withShares(data.byCategory)} centerLabel="Gastos" />
          ) : (
            <p className="text-sm text-muted-foreground">Sem gastos neste mês.</p>
          )}
        </ChartCard>

        <ChartCard
          icon={Layers}
          title="Por conta e cartão"
          description="De onde o dinheiro saiu."
          table={{
            columns: ["Conta", "Valor", "Lançamentos"],
            rows: data.byAccount.map((c) => [c.label, formatBRL(c.total), c.count]),
          }}
        >
          {data.byAccount.length ? (
            <DonutChart data={withShares(data.byAccount)} centerLabel="Gastos" />
          ) : (
            <p className="text-sm text-muted-foreground">Sem gastos neste mês.</p>
          )}
        </ChartCard>

        <ChartCard
          icon={CalendarClock}
          title="Despesas futuras"
          description={
            <>
              Pendentes por categoria · total <Sensitive>{formatBRL(data.pendingTotal)}</Sensitive>
            </>
          }
          table={{
            columns: ["Categoria", "Valor"],
            rows: data.pending.map((c) => [c.label, formatBRL(c.total)]),
          }}
        >
          {data.pending.length ? (
            <DonutChart data={withShares(data.pending)} centerLabel="Pendente" />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum lançamento pendente.</p>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <ChartCard
          icon={BarChart3}
          className="lg:col-span-3"
          title="Gastos nos últimos 12 meses"
          description="Clique numa coluna para abrir o mês."
          table={{
            columns: ["Mês", "Gastos"],
            rows: data.series.map((s) => [monthShortLabel(s.month), formatBRL(s.total)]),
          }}
        >
          <MonthlyColumns
            data={data.series}
            highlight={month}
            valueLabel="Gastos"
            onSelect={goTo}
          />
        </ChartCard>
        <ChartCard
          icon={Store}
          className="lg:col-span-2"
          title="Onde você mais gastou"
          table={{
            columns: ["Estabelecimento / destino", "Valor", "Lançamentos"],
            rows: data.byMerchant.map((c) => [c.label, formatBRL(c.total), c.count]),
          }}
        >
          {data.byMerchant.length ? (
            <RankedBars
              data={data.byMerchant}
              valueLabel="Gastos por estabelecimento"
              secondary={(r) => share(r.total)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem gastos neste mês.</p>
          )}
        </ChartCard>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold first-letter:uppercase">
        Lançamentos de {monthLongLabel(month)}
      </h2>
      <TransactionList items={data.transactions} accounts={data.accounts} />
    </>
  );
}

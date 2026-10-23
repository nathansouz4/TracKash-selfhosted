import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Briefcase,
  CalendarRange,
  ChevronDown,
  Coins,
  Factory,
  Gauge,
  HeartPulse,
  Landmark,
  LineChart,
  PieChart,
  PiggyBank,
  Receipt,
  Search,
  ShieldAlert,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { B3ImportButton } from "@/components/B3ImportButton";
import {
  DonutChart,
  MonthlyColumns,
  ScoreRadar,
  StackedMonthlyColumns,
  ValueArea,
  type SeriesDef,
} from "@/components/charts";
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
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setPositionLiquidity } from "@/functions/dashboard.functions";
import { investmentsQuery } from "@/functions/queries";
import {
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  formatNumber,
  formatPercent,
  formatSignedBRL,
  formatSignedPercent,
  monthLongLabel,
  monthShortLabel,
} from "@/lib/format";
import { BUCKET_COLOR_ORDER, CLASS_COLOR_ORDER, rateLabel } from "@/lib/investments";
import { healthLabel, type HealthDimension, type PortfolioHealth } from "@/lib/portfolio-health";
import { deltaTone } from "@/lib/tone";
import { cn } from "@/lib/utils";

const EQUITY_CLASS_ORDER = ["Ações", "FIIs", "ETFs", "BDRs"] as const;

const VIEWS = [
  { value: "overview", label: "Visão geral" },
  { value: "equities", label: "Renda variável" },
  { value: "income", label: "Proventos" },
  { value: "fixed", label: "Renda fixa" },
  { value: "positions", label: "Posições" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export const Route = createFileRoute("/_app/investments")({
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    VIEWS.some((v) => v.value === search["view"]) ? { view: search["view"] as View } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(investmentsQuery),
  component: InvestmentsPage,
});

type Data = ReturnType<typeof useInvestments>;
function useInvestments() {
  return useSuspenseQuery(investmentsQuery).data;
}

const INCOME_SERIES: SeriesDef[] = [
  { key: "Rendimentos", label: "Rendimentos (FIIs)", color: "var(--cat-1)" },
  { key: "Dividendos", label: "Dividendos", color: "var(--cat-2)" },
  { key: "JCP", label: "JCP", color: "var(--cat-3)" },
  { key: "Outros", label: "Outros", color: "var(--cat-4)" },
];

function InvestmentsPage() {
  const data = useInvestments();
  const { view = "overview" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  if (data.positions.length === 0) {
    return (
      <>
        <PageHeader title="Investimentos" />
        <EmptyState title="Nenhum investimento encontrado">
          Sincronize as conexões. Se a instituição não expõe investimentos via Open Finance, eles
          não aparecem aqui.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Investimentos"
        description="Distribuição, desempenho, renda variável e proventos da carteira."
        actions={<B3ImportButton />}
      />
      <div className="mb-6 overflow-x-auto">
        <Segmented<View>
          label="Seção"
          value={view}
          onChange={(v) => navigate({ search: v === "overview" ? {} : { view: v } })}
          options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
        />
      </div>
      {view === "overview" ? <OverviewView data={data} /> : null}
      {view === "equities" ? <EquitiesView data={data} /> : null}
      {view === "income" ? <IncomeView data={data} /> : null}
      {view === "fixed" ? <FixedIncomeView data={data} /> : null}
      {view === "positions" ? <PositionsView data={data} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const HEALTH_AXES: { key: HealthDimension; label: string }[] = [
  { key: "diversification", label: "Diversificação" },
  { key: "liquidity", label: "Liquidez" },
  { key: "return", label: "Retorno" },
  { key: "efficiency", label: "Eficiência" },
  { key: "protection", label: "Proteção" },
];

/** "BANCO EXEMPLO S.A. - SOCIEDADE DE CREDITO..." -> "BANCO EXEMPLO S.A." */
const shortName = (name: string) => name.split(" - ")[0]!.trim();

/** One line explaining each score, from the facts behind it. */
function healthReasons(h: PortfolioHealth): Record<HealthDimension, string> {
  const f = h.facts;
  const pct = (v: number | null | undefined) => formatPercent(v ?? 0);
  return {
    diversification: `${f.effectiveClasses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} classes efetivas${
      f.top ? ` · maior exposição: ${shortName(f.top.label)} (${pct(f.top.share)})` : ""
    }`,
    protection: `${pct(f.defensiveShare)} em renda fixa${
      f.fgcCoveredShare != null
        ? ` · ${pct(f.fgcCoveredShare)} dela coberta pelo FGC ou Tesouro`
        : ""
    }${f.maxDrawdown != null ? ` · pior queda ${formatPercent(f.maxDrawdown)}` : " · histórico ainda curto"}`,
    efficiency:
      [
        f.avgCdiRate != null
          ? `renda fixa a ${f.avgCdiRate.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% do CDI`
          : null,
        f.equityIncomeYield != null
          ? `proventos de ${pct(f.equityIncomeYield)} ao ano na renda variável`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "sem dados de rendimento",
    return:
      f.returnBasis === "twr"
        ? `${formatSignedPercent(f.returnValue)} ao ano (rentabilidade ponderada no tempo)`
        : f.returnBasis === "cost"
          ? `${formatSignedPercent(f.returnValue)} sobre o valor aplicado`
          : "sem dados de custo",
    liquidity: `${pct(f.liquidShare)} resgatável em até 2 dias`,
  };
}

function HealthCard({ health }: { health: PortfolioHealth }) {
  const reasons = healthReasons(health);
  const ratio = health.overall / 1000;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <SectionCard
      icon={HeartPulse}
      title="Saúde da carteira"
      className="mt-4"
      bodyClassName="grid gap-6 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden="true">
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="var(--chart-grid)"
              strokeWidth="6"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="var(--cat-1)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${circumference * ratio} ${circumference}`}
              transform="rotate(-90 32 32)"
            />
            <text
              x="32"
              y="36.5"
              textAnchor="middle"
              className="fill-foreground text-[13px] font-bold tabular"
            >
              {health.overall}
            </text>
          </svg>
          <div>
            <p className="text-lg font-semibold">{healthLabel(health.overall)}</p>
            <p className="text-sm text-muted-foreground">
              {formatNumber(health.overall)} de 1.000 pontos
            </p>
          </div>
        </div>
        <ScoreRadar
          label="Saúde da carteira por dimensão"
          data={HEALTH_AXES.map((a) => ({ axis: a.label, score: health.scores[a.key] }))}
        />
      </div>
      <div className="space-y-4 lg:pt-2">
        {HEALTH_AXES.map((a) => (
          <div key={a.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{a.label}</span>
              <span className="tabular text-muted-foreground">{health.scores[a.key]}/100</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--cat-1)]"
                style={{ width: `${health.scores[a.key]}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{reasons[a.key]}</p>
          </div>
        ))}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Notas de 0 a 100 por regras simples sobre os seus dados (classes, FGC, taxas, proventos,
          prazos de resgate). Liquidez da renda fixa: ajuste em Posições. Não é recomendação.
        </p>
      </div>
    </SectionCard>
  );
}

function OverviewView({ data }: { data: Data }) {
  const [allocationView, setAllocationView] = useState<"bucket" | "class" | "institution">(
    "bucket",
  );
  const { risk, concentration } = data;
  const twr = data.series.map((p) => ({ date: p.date, value: p.index - 1 }));
  const allocation =
    allocationView === "bucket"
      ? data.distribution
      : allocationView === "class"
        ? data.allocation
        : data.allocationByInstitution;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Briefcase}
          label="Patrimônio investido"
          value={<Money value={data.total} tone="positive" />}
          hint={`${data.positions.length} ativos`}
        />
        <StatTile
          icon={Coins}
          label="Resultado da renda variável"
          value={
            <Sensitive
              className={cn(data.equities.profit >= 0 ? "text-positive" : "text-negative")}
            >
              {formatSignedBRL(data.equities.profit)}
            </Sensitive>
          }
          delta={
            data.equities.profitPct == null
              ? undefined
              : {
                  text: formatSignedPercent(data.equities.profitPct),
                  tone: deltaTone(data.equities.profitPct, true),
                }
          }
          hint="Sobre o preço médio de compra (extrato B3)"
        />
        <StatTile
          icon={PiggyBank}
          label="Renda passiva"
          value={
            <>
              <Money value={data.equities.incomeMonthlyAvg} />
              <span className="text-sm font-medium text-muted-foreground"> /mês</span>
            </>
          }
          hint={
            <>
              Proventos em 12 meses: <Sensitive>{formatBRL(data.equities.income12m)}</Sensitive>
            </>
          }
        />
        <StatTile
          icon={TrendingUp}
          label="Rentabilidade (TWR)"
          value={formatSignedPercent(risk.cumulativeReturn)}
          hint={
            risk.days > 0
              ? `Desde ${formatDateBR(data.series[0]?.date)}, sem efeito de aportes`
              : "Precisa de 2+ dias de sincronização"
          }
        />
      </div>

      <HealthCard health={data.health} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={PieChart}
          title="Distribuição da carteira"
          bodyClassName="px-5 py-4"
          actions={
            <Segmented
              label="Agrupar por"
              value={allocationView}
              onChange={setAllocationView}
              options={[
                { value: "bucket", label: "Tipo" },
                { value: "class", label: "Classes" },
                { value: "institution", label: "Instituições" },
              ]}
            />
          }
        >
          <DonutChart
            data={allocation}
            centerLabel="Investido"
            colorOrder={
              allocationView === "bucket"
                ? BUCKET_COLOR_ORDER
                : allocationView === "class"
                  ? CLASS_COLOR_ORDER
                  : undefined
            }
          />
        </SectionCard>
        <ChartCard
          icon={LineChart}
          title="Evolução do patrimônio"
          description="Investimentos das conexões, uma fotografia por dia de sincronização."
          table={{
            columns: ["Data", "Valor", "Aportes líquidos"],
            rows: data.series.map((p) => [
              formatDateBR(p.date),
              formatBRL(p.value),
              formatBRL(p.flow),
            ]),
          }}
        >
          <ValueArea
            data={data.series.map((p) => ({ date: p.date, value: p.value }))}
            valueLabel="Patrimônio"
          />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          icon={TrendingUp}
          className="lg:col-span-2"
          title="Rentabilidade acumulada (TWR)"
          description="Retorno ponderado no tempo: aportes e resgates não contam como ganho."
          table={{
            columns: ["Data", "Acumulado"],
            rows: twr.map((p) => [formatDateBR(p.date), formatSignedPercent(p.value)]),
          }}
        >
          <ValueArea
            data={twr}
            valueLabel="Acumulado"
            formatValue={formatSignedPercent}
            formatTick={(v) => formatPercent(v)}
          />
        </ChartCard>
        <SectionCard
          icon={ShieldAlert}
          title="Risco e concentração"
          bodyClassName="space-y-3 px-5 py-4 text-sm"
        >
          <Metric
            label="Retorno anualizado"
            value={formatSignedPercent(risk.annualizedReturn)}
            note={risk.annualizedReturn == null ? "a partir de 90 dias de histórico" : undefined}
          />
          <Metric
            label="Volatilidade anualizada"
            value={formatPercent(risk.annualizedVolatility)}
            note={risk.annualizedVolatility == null ? "a partir de 10 observações" : undefined}
          />
          <Metric label="Maior queda (drawdown)" value={formatSignedPercent(risk.maxDrawdown)} />
          <div className="border-t" />
          <Metric
            label="Nº efetivo de ativos"
            value={formatNumber(concentration.effectiveCount)}
            note="1 / índice de Herfindahl"
          />
          <Metric
            label={`Peso dos ${concentration.topCount} maiores`}
            value={formatPercent(concentration.topShare)}
          />
        </SectionCard>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Variable income
// ---------------------------------------------------------------------------

function EquitiesView({ data }: { data: Data }) {
  const e = data.equities;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "value",
    dir: "desc",
  });
  const holdings = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? e.holdings.filter((h) =>
          `${h.ticker} ${h.name} ${h.assetClass} ${h.sector}`.toLowerCase().includes(q),
        )
      : e.holdings;
    return sortHoldings(rows, sort.key, sort.dir);
  }, [e.holdings, query, sort]);
  const sortBy = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ticker" ? "asc" : "desc" },
    );
  const header = (key: SortKey, label: string, className?: string) => (
    <SortableHead label={label} sortKey={key} sort={sort} onSort={sortBy} className={className} />
  );
  const ranked = e.holdings.filter((h) => h.profitPct != null);
  const winners = [...ranked].sort((a, b) => b.profitPct! - a.profitPct!).slice(0, 3);
  const losers = [...ranked].sort((a, b) => a.profitPct! - b.profitPct!).slice(0, 3);

  if (e.holdings.length === 0) {
    return (
      <EmptyState
        title="Nenhuma posição em renda variável"
        action={<B3ImportButton variant="default" />}
      >
        Sincronize a corretora ou importe o extrato de movimentação da B3.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Briefcase}
          label="Valor de mercado"
          value={<Money value={e.marketValue} />}
          hint={`${e.holdings.filter((h) => h.value != null).length} ativos`}
        />
        <StatTile
          icon={Receipt}
          label="Custo (preço médio)"
          value={<Money value={e.cost} />}
          hint={
            e.costCoverage < 0.999
              ? `Custo conhecido para ${formatPercent(e.costCoverage)} da carteira`
              : "Do extrato da B3"
          }
        />
        <StatTile
          icon={Coins}
          label="Resultado"
          value={
            <Sensitive className={cn(e.profit >= 0 ? "text-positive" : "text-negative")}>
              {formatSignedBRL(e.profit)}
            </Sensitive>
          }
          delta={
            e.profitPct == null
              ? undefined
              : { text: formatSignedPercent(e.profitPct), tone: deltaTone(e.profitPct, true) }
          }
          hint={
            <>
              Realizado (vendas e frações): <Sensitive>{formatSignedBRL(e.realized)}</Sensitive>
            </>
          }
        />
        <StatTile
          icon={PiggyBank}
          label="Yield on cost (12m)"
          value={formatPercent(e.yieldOnCost12m)}
          hint={`Dividend yield a mercado: ${formatPercent(e.dividendYield12m)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard icon={PieChart} title="Por classe" bodyClassName="px-5 py-4">
          <DonutChart
            data={e.byClass}
            centerLabel="Renda variável"
            colorOrder={EQUITY_CLASS_ORDER}
          />
        </SectionCard>
        <ChartCard
          icon={Factory}
          title="Ações por setor"
          table={{
            columns: ["Setor", "Valor", "%"],
            rows: e.bySector.map((s) => [s.label, formatBRL(s.total), formatPercent(s.share)]),
          }}
        >
          <DonutChart data={e.bySector} centerLabel="Ações" />
        </ChartCard>
        <ChartCard
          icon={Landmark}
          title="FIIs por segmento"
          table={{
            columns: ["Segmento", "Valor", "%"],
            rows: e.byFiiSegment.map((s) => [s.label, formatBRL(s.total), formatPercent(s.share)]),
          }}
        >
          <DonutChart data={e.byFiiSegment} centerLabel="FIIs" />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard icon={Gauge} title="Concentração" bodyClassName="space-y-3 px-5 py-4 text-sm">
          <Metric
            label="Nº efetivo de ativos"
            value={formatNumber(e.effectiveCount)}
            note="1 / Herfindahl — quanto maior, mais diversificado"
          />
          <Metric label="Peso dos 5 maiores" value={formatPercent(e.top5Share)} />
          <Metric
            label="Maior posição"
            value={
              e.holdings[0]
                ? `${e.holdings[0].ticker} · ${formatPercent(e.holdings[0].weight)}`
                : "—"
            }
          />
          <Metric
            label="Setor mais pesado (ações)"
            value={
              e.bySector[0] ? `${e.bySector[0].label} · ${formatPercent(e.bySector[0].share)}` : "—"
            }
          />
        </SectionCard>
        <SectionCard
          icon={Trophy}
          title="Destaques de resultado"
          bodyClassName="grid grid-cols-2 gap-4 px-5 py-4 text-sm"
        >
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Maiores altas
            </p>
            {winners.map((h) => (
              <p key={h.ticker} className="flex justify-between gap-2 py-0.5">
                <span className="font-medium">{h.ticker}</span>
                <span className="tabular text-positive">{formatSignedPercent(h.profitPct)}</span>
              </p>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Maiores baixas
            </p>
            {losers.map((h) => (
              <p key={h.ticker} className="flex justify-between gap-2 py-0.5">
                <span className="font-medium">{h.ticker}</span>
                <span
                  className={cn(
                    "tabular",
                    (h.profitPct ?? 0) < 0 ? "text-negative" : "text-positive",
                  )}
                >
                  {formatSignedPercent(h.profitPct)}
                </span>
              </p>
            ))}
          </div>
        </SectionCard>
        <ChartCard
          icon={BarChart3}
          title="Aportes em renda variável"
          description="Compras por mês (extrato B3)."
          table={{
            columns: ["Mês", "Aportes"],
            rows: e.purchases.map((p) => [monthLongLabel(p.month), formatBRL(p.total)]),
          }}
        >
          <MonthlyColumns data={e.purchases} valueLabel="Aportes" height={180} />
        </ChartCard>
      </div>

      <section className="mt-6 rounded-2xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Briefcase className="h-4 w-4 text-brand" aria-hidden="true" />
              Ativos de renda variável
            </h2>
            <B3Status b3={e.b3} />
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              className="pl-9"
              aria-label="Filtrar ativos"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="tabular">
            <TableHeader>
              <TableRow>
                {header("ticker", "Ativo", "pl-5")}
                {header("quantity", "Qtd")}
                {header("avgPrice", "Preço médio")}
                {header("price", "Cotação")}
                {header("value", "Valor")}
                {header("profitPct", "Resultado")}
                {header("proventos12m", "Proventos 12m")}
                {header("yieldOnCost12m", "YoC")}
                {header("weight", "Peso", "pr-5")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h) => (
                <TableRow key={h.ticker}>
                  <TableCell className="pl-5">
                    <p className="font-semibold">
                      {h.ticker}
                      {h.outsideConnections ? (
                        <Badge
                          variant="outline"
                          className="ml-2"
                          title="Consta no extrato da B3, mas em uma corretora não conectada"
                        >
                          fora das conexões
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.assetClass} · {h.sector}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Sensitive>{formatNumber(h.quantity)}</Sensitive>
                  </TableCell>
                  <TableCell className="text-right">
                    <Sensitive>{h.avgPrice == null ? "—" : formatBRL(h.avgPrice)}</Sensitive>
                  </TableCell>
                  <TableCell className="text-right">
                    {h.price == null ? "—" : formatBRL(h.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={h.value} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      (h.profit ?? 0) > 0 && "text-positive",
                      (h.profit ?? 0) < 0 && "text-negative",
                    )}
                  >
                    <Sensitive>{h.profit == null ? "—" : formatSignedBRL(h.profit)}</Sensitive>
                    <span className="block text-xs">{formatSignedPercent(h.profitPct)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={h.proventos12m} />
                  </TableCell>
                  <TableCell className="text-right">{formatPercent(h.yieldOnCost12m)}</TableCell>
                  <TableCell className="pr-5 text-right">{formatPercent(h.weight)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}

type Holding = Data["equities"]["holdings"][number];
type SortKey =
  | "ticker"
  | "quantity"
  | "avgPrice"
  | "price"
  | "value"
  | "profitPct"
  | "proventos12m"
  | "yieldOnCost12m"
  | "weight";

/** Sorts by one column; empty values always go last. */
function sortHoldings(rows: Holding[], key: SortKey, dir: "asc" | "desc"): Holding[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "string" && typeof y === "string") return sign * x.localeCompare(y);
    return sign * (Number(x) - Number(y));
  });
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string | undefined;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(sortKey === "ticker" ? "text-left" : "text-right", className)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function B3Status({ b3 }: { b3: Data["equities"]["b3"] }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {b3
        ? `Extrato B3 importado em ${formatDateTimeBR(b3.importedAt)} · cobre ${formatDateBR(b3.periodStart)} a ${formatDateBR(b3.periodEnd)} · ${b3.totalMovements} lançamentos`
        : "Importe o extrato de movimentação da B3 para ver preço médio e proventos."}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Income (proventos)
// ---------------------------------------------------------------------------

/**
 * Donut slices of the largest items as shares of `total`, with whatever else was
 * received folded into "Outros" (the palette has 8 slots).
 */
function topSlices(items: { label: string; total: number }[], total: number, keep = 7) {
  const head = items.slice(0, keep);
  const rest = total - head.reduce((sum, i) => sum + i.total, 0);
  return [...head, ...(rest > 0.005 ? [{ label: "Outros", total: rest }] : [])].map((i) => ({
    label: i.label,
    total: i.total,
    share: total > 0 ? i.total / total : 0,
  }));
}

function IncomeView({ data }: { data: Data }) {
  const e = data.equities;
  if (e.incomeTotal === 0) {
    return (
      <EmptyState title="Nenhum provento encontrado" action={<B3ImportButton variant="default" />}>
        Importe o extrato de movimentação da B3 (Área do Investidor → Extratos → Movimentação →
        exportar em Excel).
      </EmptyState>
    );
  }
  const typesInUse = INCOME_SERIES.filter((s) =>
    e.incomeByMonth.some((m) => Number(m[s.key as keyof typeof m]) > 0),
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Coins}
          label="Proventos em 12 meses"
          value={<Money value={e.income12m} tone="positive" />}
        />
        <StatTile
          icon={CalendarRange}
          label="Média mensal (12m)"
          value={<Money value={e.incomeMonthlyAvg} />}
          hint="Sua renda passiva atual"
        />
        <StatTile
          icon={PiggyBank}
          label="Total recebido"
          value={<Money value={e.incomeTotal} />}
          hint={e.firstProvento ? `Desde ${formatDateBR(e.firstProvento)}` : undefined}
        />
        <StatTile
          icon={Gauge}
          label="Yield on cost (12m)"
          value={formatPercent(e.yieldOnCost12m)}
          hint={`Dividend yield a mercado: ${formatPercent(e.dividendYield12m)}`}
        />
      </div>

      <ChartCard
        icon={BarChart3}
        className="mt-4"
        title="Proventos por mês"
        description="Últimos 24 meses, por tipo. Fonte: extrato da B3 (+ lançamentos recentes da Pluggy)."
        table={{
          columns: ["Mês", ...typesInUse.map((s) => s.label), "Total"],
          rows: e.incomeByMonth.map((m) => [
            monthShortLabel(m.month),
            ...typesInUse.map((s) => formatBRL(Number(m[s.key as keyof typeof m]))),
            formatBRL(m.total),
          ]),
        }}
      >
        <StackedMonthlyColumns data={e.incomeByMonth} series={typesInUse} />
      </ChartCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          icon={Trophy}
          title="Maiores pagadores (12m)"
          description="Participação de cada ativo nos proventos dos últimos 12 meses."
          table={{
            columns: ["Ativo", "Proventos", "Participação"],
            rows: e.topPayers12m.map((p) => [
              p.label,
              formatBRL(p.total),
              formatPercent(e.income12m > 0 ? p.total / e.income12m : 0),
            ]),
          }}
        >
          <DonutChart data={topSlices(e.topPayers12m, e.income12m)} centerLabel="12 meses" />
        </ChartCard>
        <SectionCard icon={PieChart} title="Composição (12m)" bodyClassName="space-y-5 px-5 py-4">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Por tipo
            </p>
            <DonutChart
              data={e.incomeByType12m}
              centerLabel="12 meses"
              colorOrder={INCOME_SERIES.map((s) => s.key)}
              size={150}
            />
          </div>
          <div className="border-t pt-4">
            <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Por classe
            </p>
            <DonutChart
              data={e.incomeByClass12m}
              centerLabel="12 meses"
              colorOrder={EQUITY_CLASS_ORDER}
              size={150}
            />
          </div>
        </SectionCard>
        <ChartCard
          icon={CalendarRange}
          title="Por ano"
          description="Quanto de tudo o que você já recebeu veio de cada ano."
          table={{
            columns: ["Ano", "Proventos"],
            rows: e.incomeByYear.map((y) => [y.label, formatBRL(y.total)]),
          }}
        >
          <DonutChart
            data={e.incomeByYear}
            centerLabel="Total"
            colorOrder={e.incomeByYear.map((y) => y.label)}
          />
        </ChartCard>
      </div>

      <SectionCard icon={Receipt} title="Últimos proventos" className="mt-4">
        <div className="max-h-[28rem] overflow-auto">
          <Table className="tabular">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="pl-5">Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="pr-5 text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.recentIncome.map((p, i) => (
                <TableRow key={`${p.date}-${p.ticker}-${i}`}>
                  <TableCell className="pl-5">{formatDateBR(p.date)}</TableCell>
                  <TableCell className="font-medium">{p.ticker}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.type}</Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Money value={p.amount} tone="positive" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fixed income
// ---------------------------------------------------------------------------

function FixedIncomeView({ data }: { data: Data }) {
  const f = data.fixedIncome;
  const fixed = data.positions
    .filter((p) => p.bucket === "Renda fixa")
    .sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const next = fixed.find((p) => p.dueDate);

  if (f.count === 0) return <EmptyState title="Nenhum título de renda fixa" />;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Landmark}
          label="Renda fixa"
          value={<Money value={f.total} />}
          hint={`${f.count} títulos`}
        />
        <StatTile
          icon={Gauge}
          label="Taxa média ponderada"
          value={f.avgCdiRate == null ? "—" : `${formatNumber(f.avgCdiRate)}% CDI`}
          hint={`${formatPercent(f.cdiShare)} da renda fixa é pós-fixada no CDI`}
        />
        <StatTile
          icon={Coins}
          label="Rendimento acumulado"
          value={
            <Sensitive className="text-positive">
              {formatSignedBRL(fixed.reduce((s, p) => s + (p.profit ?? 0), 0))}
            </Sensitive>
          }
          hint="Saldo bruto menos o valor aplicado"
        />
        <StatTile
          icon={CalendarRange}
          label="Próximo vencimento"
          value={next?.dueDate ? formatDateBR(next.dueDate) : "—"}
          hint={next ? <Sensitive>{formatBRL(next.balance)}</Sensitive> : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          icon={CalendarRange}
          title="Escada de vencimentos"
          description="Quanto vence em cada ano."
          table={{
            columns: ["Ano", "Valor"],
            rows: f.maturityLadder.map((m) => [m.label, formatBRL(m.total)]),
          }}
        >
          <DonutChart data={f.maturityLadder} centerLabel="Renda fixa" />
        </ChartCard>
        <ChartCard
          icon={TrendingUp}
          title="Por taxa contratada"
          table={{
            columns: ["Taxa", "Valor"],
            rows: f.byRate.map((m) => [m.label, formatBRL(m.total)]),
          }}
        >
          <DonutChart data={f.byRate} centerLabel="Renda fixa" />
        </ChartCard>
        <ChartCard
          icon={Landmark}
          title="Por emissor"
          description="Atenção ao limite de R$ 250 mil por emissor coberto pelo FGC."
          table={{
            columns: ["Emissor", "Valor"],
            rows: f.byIssuer.map((m) => [m.label, formatBRL(m.total)]),
          }}
        >
          <DonutChart data={f.byIssuer} centerLabel="Renda fixa" />
        </ChartCard>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// All positions
// ---------------------------------------------------------------------------

const LIQUIDITY_LABEL: Record<string, string> = {
  daily: "liquidez diária",
  market: "D+2",
  maturity: "liquidez no vencimento",
};

/** The owner's liquidity for a fixed income position (Pluggy doesn't report it). */
function LiquiditySelect({
  id,
  value,
  automatic,
}: {
  id: string;
  value: "daily" | "maturity" | null;
  automatic: string;
}) {
  const queryClient = useQueryClient();
  const setFn = useServerFn(setPositionLiquidity);
  const mutation = useMutation({
    mutationFn: (liquidity: "daily" | "maturity" | null) => setFn({ data: { id, liquidity } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance"] }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <select
      aria-label="Liquidez da posição"
      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
      value={value ?? ""}
      disabled={mutation.isPending}
      onChange={(e) =>
        mutation.mutate(e.target.value === "" ? null : (e.target.value as "daily" | "maturity"))
      }
    >
      <option value="">Automática ({LIQUIDITY_LABEL[automatic]})</option>
      <option value="daily">Diária</option>
      <option value="maturity">No vencimento</option>
    </select>
  );
}

function PositionsView({ data }: { data: Data }) {
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = q
      ? data.positions.filter((p) =>
          `${p.name} ${p.code ?? ""} ${p.assetClass} ${p.institution ?? ""} ${p.issuer ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : data.positions;
    const map = new Map<string, typeof rows>();
    for (const p of rows) map.set(p.assetClass, [...(map.get(p.assetClass) ?? []), p]);
    return [...map.entries()]
      .map(([label, items]) => ({ label, items, total: items.reduce((s, i) => s + i.balance, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [data.positions, filter]);
  // Groups start collapsed; a search opens every group that has a match.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const searching = filter.trim() !== "";
  const isOpen = (label: string) => searching || expanded.has(label);
  const toggle = (label: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const allOpen = groups.every((g) => expanded.has(g.label));

  return (
    <section className="rounded-2xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Briefcase className="h-4 w-4 text-brand" aria-hidden="true" />
          Carteira ({data.positions.length} ativos)
        </h2>
        <button
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.label)))}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          disabled={searching}
        >
          {allOpen || searching ? "Recolher tudo" : "Expandir tudo"}
        </button>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome, emissor ou classe"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
            aria-label="Filtrar posições"
          />
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.label}>
          <button
            type="button"
            onClick={() => toggle(group.label)}
            aria-expanded={isOpen(group.label)}
            disabled={searching}
            className="flex w-full items-center gap-2 border-b bg-subtle px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                !isOpen(group.label) && "-rotate-90",
              )}
              aria-hidden="true"
            />
            <span className="flex-1">
              {group.label} ({group.items.length})
            </span>
            <Sensitive>{formatBRL(group.total)}</Sensitive>
            <span className="w-12 text-right normal-case">
              {formatPercent(data.total > 0 ? group.total / data.total : 0)}
            </span>
          </button>
          {isOpen(group.label) ? (
            <ul className="divide-y">
              {group.items.map((p) => (
                <li key={p.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-subtle">
                      <InstitutionAvatar
                        name={p.institution ?? "?"}
                        imageUrl={p.imageUrl}
                        className="h-8 w-8"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.code ?? p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            p.institution,
                            rateLabel(p),
                            p.dueDate ? `vence ${formatDateBR(p.dueDate)}` : null,
                            p.type === "FIXED_INCOME" ? LIQUIDITY_LABEL[p.liquidityResolved] : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <Money value={p.balance} className="text-sm font-semibold" />
                        <p className="text-xs text-muted-foreground">{formatPercent(p.weight)}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 bg-subtle px-5 py-3 text-xs sm:grid-cols-4">
                      <Detail label="Nome" value={p.name} wide />
                      <Detail
                        label="Aplicado"
                        value={<Sensitive>{formatBRL(p.invested)}</Sensitive>}
                      />
                      <Detail
                        label="Resultado"
                        value={
                          <Sensitive
                            className={cn(
                              (p.profit ?? 0) > 0 && "text-positive",
                              (p.profit ?? 0) < 0 && "text-negative",
                            )}
                          >
                            {formatSignedBRL(p.profit)} ({formatSignedPercent(p.returnPct)})
                          </Sensitive>
                        }
                      />
                      {p.issuer ? <Detail label="Emissor" value={p.issuer} /> : null}
                      {p.type === "FIXED_INCOME" ? (
                        <Detail
                          label="Liquidez"
                          value={
                            <LiquiditySelect
                              id={p.id}
                              value={p.liquidity}
                              automatic={p.liquidityAuto}
                            />
                          }
                        />
                      ) : null}
                      {p.quantity != null ? (
                        <Detail
                          label="Quantidade"
                          value={<Sensitive>{formatNumber(p.quantity)}</Sensitive>}
                        />
                      ) : null}
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {note ? <span className="block text-xs">{note}</span> : null}
      </span>
      <span className="tabular shrink-0 font-semibold">{value}</span>
    </div>
  );
}

function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}

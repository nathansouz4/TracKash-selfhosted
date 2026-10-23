import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  CreditCard,
  Gauge,
  Receipt,
  Repeat,
  Store,
  Tags,
} from "lucide-react";
import { DonutChart, MonthlyColumns } from "@/components/charts";
import {
  ChartCard,
  EmptyState,
  InstitutionAvatar,
  Money,
  PageHeader,
  SectionCard,
  Sensitive,
  StatTile,
  UsageMeter,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MonthNav, TransactionList } from "@/components/transactions";
import { cardsQuery } from "@/functions/queries";
import { isValidMonth, todayIso } from "@/lib/dates";
import {
  formatBRL,
  formatDateBR,
  formatPercent,
  formatSignedPercent,
  monthLongLabel,
  monthShortLabel,
} from "@/lib/format";
import { deltaTone } from "@/lib/tone";
import { cn } from "@/lib/utils";

type CardsSearch = { month?: string; card?: string };

/**
 * Donut slices as shares of the month's total: the largest `keep` items, and
 * whatever else was spent folded into "Outros".
 */
function slicesOfTotal(items: { label: string; total: number }[], total: number, keep = 8) {
  const head = items.slice(0, keep);
  const rest = total - head.reduce((s, i) => s + i.total, 0);
  const slices = rest > 0.005 ? [...head, { label: "Outros", total: rest }] : head;
  return slices.map((i) => ({
    label: i.label,
    total: i.total,
    share: total > 0 ? i.total / total : 0,
  }));
}

export const Route = createFileRoute("/_app/cards")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    ...(isValidMonth(search["month"]) ? { month: search["month"] } : {}),
    ...(typeof search["card"] === "string" && /^[\w-]{1,64}$/.test(search["card"])
      ? { card: search["card"] }
      : {}),
  }),
  loaderDeps: ({ search }) => ({
    month: search.month ?? todayIso().slice(0, 7),
    card: search.card ?? null,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(cardsQuery(deps.month, deps.card)),
  component: CardsPage,
});

function CardsPage() {
  const search = Route.useSearch();
  const month = search.month ?? todayIso().slice(0, 7);
  const card = search.card ?? null;
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(cardsQuery(month, card));

  const setSearch = (next: CardsSearch) =>
    navigate({
      search: (prev: CardsSearch) => {
        const merged = { ...prev, ...next };
        return {
          ...(merged.month ? { month: merged.month } : {}),
          ...(merged.card ? { card: merged.card } : {}),
        };
      },
    });

  if (data.cards.length === 0) {
    return (
      <>
        <PageHeader title="Cartões" />
        <EmptyState title="Nenhum cartão de crédito encontrado">
          Sincronize suas conexões. Os cartões aparecem aqui assim que a Pluggy os retornar.
        </EmptyState>
      </>
    );
  }

  const change = data.average6m > 0 ? data.total / data.average6m - 1 : null;
  const upcoming = data.installments.reduce((s, i) => s + i.total, 0);
  const selectedName = data.cards.find((c) => c.id === data.cardId)?.name;

  return (
    <>
      <PageHeader
        title="Cartões"
        description="Faturas, uso do limite e para onde vai o dinheiro do cartão."
        actions={<MonthNav month={month} onChange={(m) => setSearch({ month: m })} />}
      />

      <div
        className="mb-4 flex gap-3 overflow-x-auto pb-1"
        role="radiogroup"
        aria-label="Escolher cartão"
      >
        <CardChip
          active={data.cardId == null}
          onClick={() => setSearch({ card: "" })}
          title="Todos os cartões"
          subtitle={`${data.cards.length} cartões · faturas abertas`}
          amount={data.cards.reduce((s, c) => s + c.openBill, 0)}
        />
        {data.cards.map((c) => (
          <CardChip
            key={c.id}
            active={data.cardId === c.id}
            onClick={() => setSearch({ card: c.id })}
            title={c.name}
            subtitle={[
              c.last4 ? `•••• ${c.last4}` : c.institution,
              c.nextDue ? `vence ${formatDateBR(c.nextDue).slice(0, 5)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            amount={c.openBill}
            imageUrl={c.imageUrl}
            institution={c.institution}
            usage={c.usage}
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Receipt}
          label="Fatura aberta"
          value={<Money value={data.openBills} tone="negative" />}
          hint={
            data.nextDue
              ? `Fecha ${formatDateBR(data.nextClose).slice(0, 5)} · vence ${formatDateBR(data.nextDue).slice(0, 5)}`
              : "Soma das faturas abertas de todos os cartões"
          }
        />
        <StatTile
          icon={Gauge}
          label="Limite utilizado"
          value={data.usage == null ? "—" : formatPercent(data.usage)}
          hint={
            data.limit > 0 ? (
              <div className="space-y-2">
                <UsageMeter ratio={data.usage ?? 0} label="Uso do limite" />
                <span>
                  Usado <Sensitive>{formatBRL(data.used)}</Sensitive> de{" "}
                  <Sensitive>{formatBRL(data.limit)}</Sensitive> (fatura aberta + parcelas futuras)
                </span>
              </div>
            ) : undefined
          }
        />
        <StatTile
          icon={CreditCard}
          label={`Gasto no cartão em ${monthShortLabel(month)}`}
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
          icon={Repeat}
          label="Parcelas a vencer"
          value={<Money value={upcoming} />}
          hint={
            <>
              Próximo mês: <Sensitive>{formatBRL(data.installments[0]?.total ?? 0)}</Sensitive>
            </>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          icon={Receipt}
          title="Histórico de faturas"
          description="Total de cada fatura fechada, pelo mês de vencimento."
          table={{
            columns: ["Cartão", "Vencimento", "Total"],
            rows: data.bills.map((b) => [b.card, formatDateBR(b.dueDate), formatBRL(b.total)]),
          }}
        >
          {data.bills.length ? (
            <MonthlyColumns data={data.billSeries} highlight="" valueLabel="Fatura" />
          ) : (
            <p className="text-sm text-muted-foreground">
              A Pluggy ainda não retornou faturas fechadas.
            </p>
          )}
        </ChartCard>
        <ChartCard
          icon={BarChart3}
          title="Gastos no cartão por mês"
          description="Compras pela data da compra, líquidas de estornos. Clique para abrir o mês."
          table={{
            columns: ["Mês", "Gastos"],
            rows: data.series.map((s) => [monthShortLabel(s.month), formatBRL(s.total)]),
          }}
        >
          <MonthlyColumns
            data={data.series}
            highlight={month}
            valueLabel="Gastos"
            onSelect={(m) => setSearch({ month: m })}
          />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          icon={Tags}
          title="Por categoria"
          description={monthLongLabel(month)}
          table={{
            columns: ["Categoria", "Valor", "Compras"],
            rows: data.byCategory.map((c) => [c.label, formatBRL(c.total), c.count]),
          }}
        >
          {data.byCategory.length ? (
            <DonutChart data={slicesOfTotal(data.byCategory, data.total)} centerLabel="No cartão" />
          ) : (
            <p className="text-sm text-muted-foreground">Sem compras neste mês.</p>
          )}
        </ChartCard>
        <ChartCard
          icon={Store}
          title="Onde mais usou"
          description={monthLongLabel(month)}
          table={{
            columns: ["Estabelecimento", "Valor", "Compras"],
            rows: data.byMerchant.map((c) => [c.label, formatBRL(c.total), c.count]),
          }}
        >
          {data.byMerchant.length ? (
            <DonutChart
              data={slicesOfTotal(data.byMerchant, data.total, 7)}
              centerLabel="No cartão"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem compras neste mês.</p>
          )}
        </ChartCard>
        <ChartCard
          icon={CalendarClock}
          title="Parcelamentos futuros"
          description="Parcelas que ainda vão cair nas próximas faturas."
          table={{
            columns: ["Mês", "Parcelas"],
            rows: data.installments.map((i) => [monthLongLabel(i.month), formatBRL(i.total)]),
          }}
        >
          {upcoming > 0 ? (
            <MonthlyColumns
              data={data.installments}
              highlight=""
              valueLabel="Parcelas"
              height={200}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma compra parcelada em aberto.</p>
          )}
        </ChartCard>
      </div>

      <SectionCard
        icon={Repeat}
        title="Compras parceladas"
        className="mt-4"
        subtitle={
          data.plans.length ? (
            <>
              {data.plans.length} parcelamentos em andamento · restam{" "}
              <Sensitive>
                {formatBRL(data.plans.reduce((s, p) => s + p.remainingAmount, 0))}
              </Sensitive>
            </>
          ) : undefined
        }
      >
        {data.plans.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Nenhuma compra parcelada em andamento.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <Table className="tabular">
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="pl-5">Compra</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead className="text-right">Valor da parcela</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                  <TableHead className="pr-5 text-right">Termina em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="max-w-64 pl-5">
                      <p className="truncate font-medium">{p.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.card}
                        {p.purchaseDate ? ` · comprado em ${formatDateBR(p.purchaseDate)}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {p.current}/{p.total}
                        </Badge>
                        <div
                          className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${(p.current / p.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={p.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      {p.remaining > 0 ? (
                        <>
                          <Money value={p.remainingAmount} />
                          <span className="block text-xs text-muted-foreground">
                            {p.remaining} {p.remaining === 1 ? "parcela" : "parcelas"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">última parcela</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-right">{monthShortLabel(p.endMonth)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <h2 className="mt-8 mb-3 text-lg font-semibold first-letter:uppercase">
        Compras de {monthLongLabel(month)}
        {selectedName ? ` · ${selectedName}` : ""}
      </h2>
      <TransactionList items={data.transactions} emptyText="Nenhuma compra neste mês." />
    </>
  );
}

function CardChip({
  active,
  onClick,
  title,
  subtitle,
  amount,
  imageUrl,
  institution,
  usage,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  amount: number;
  imageUrl?: string | null;
  institution?: string;
  usage?: number | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex min-w-56 flex-auto shrink-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-brand/50",
        active && "border-brand ring-1 ring-brand",
      )}
    >
      <div className="flex items-center gap-3">
        {institution ? (
          <InstitutionAvatar name={institution} imageUrl={imageUrl ?? null} className="h-8 w-8" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <CreditCard className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Money value={amount} tone="negative" className="text-lg font-bold" />
      {usage != null ? <UsageMeter ratio={usage} label={`Uso do limite de ${title}`} /> : null}
    </button>
  );
}

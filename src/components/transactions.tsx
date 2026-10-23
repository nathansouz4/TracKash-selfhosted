import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Money, Segmented } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths, todayIso } from "@/lib/dates";
import { monthLongLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TransactionItem = {
  id: string;
  date: string;
  title: string;
  detail: string | null;
  accountId: string;
  accountName: string;
  category: string;
  pending: boolean;
  direction: "in" | "out";
  amount: number;
  spending: number;
  installment: string | null;
};

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function dayLabel(isoDate: string): { day: string; weekday: string } {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return { day: isoDate.slice(8, 10), weekday: WEEKDAYS[d.getUTCDay()] ?? "" };
}

const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Previous/next arrows plus a month grid to jump straight to any month. */
export function MonthNav({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const current = todayIso().slice(0, 7);
  const isCurrent = month >= current;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setYear(Number(month.slice(0, 4)));
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, month]);

  const pick = (m: string) => {
    setOpen(false);
    onChange(m);
  };

  return (
    <div ref={root} className="relative">
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(addMonths(month, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-8 min-w-40 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-accent"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="first-letter:uppercase">{monthLongLabel(month)}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(addMonths(month, 1))}
          disabled={isCurrent}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Escolher mês"
          className="absolute right-0 z-40 mt-2 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">{year}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= Number(current.slice(0, 4))}
              aria-label="Próximo ano"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES.map((name, i) => {
              const value = `${year}-${String(i + 1).padStart(2, "0")}`;
              const future = value > current;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={future}
                  onClick={() => pick(value)}
                  className={cn(
                    "h-9 rounded-md text-sm capitalize transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
                    value === month &&
                      "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                    value === current && value !== month && "ring-1 ring-brand",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {month !== current ? (
            <button
              type="button"
              onClick={() => pick(current)}
              className="mt-3 w-full rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Ir para o mês atual
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Direction = "all" | "in" | "out";

export function TransactionList({
  items,
  accounts,
  emptyText = "Nenhum lançamento neste mês.",
}: {
  items: TransactionItem[];
  /** When given, shows an account filter. */
  accounts?: { id: string; name: string }[];
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<Direction>("all");
  const [accountId, setAccountId] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (t) =>
        (direction === "all" || t.direction === direction) &&
        (!accountId || t.accountId === accountId) &&
        (!q ||
          `${t.title} ${t.detail ?? ""} ${t.category} ${t.accountName}`.toLowerCase().includes(q)),
    );
  }, [items, query, direction, accountId]);

  const totals = useMemo(
    () => ({
      in: filtered.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0),
      out: filtered.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0),
    }),
    [filtered],
  );

  const days = useMemo(() => {
    const groups = new Map<string, TransactionItem[]>();
    for (const t of filtered) {
      const key = t.date.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <section className="rounded-2xl border bg-card shadow-xs">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lançamento…"
            aria-label="Buscar lançamento"
            className="pl-9"
          />
        </div>
        {accounts && accounts.length > 1 ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Filtrar por conta"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs lg:w-64"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <Segmented<Direction>
          label="Tipo de lançamento"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "all", label: "Todos" },
            { value: "in", label: "Entradas" },
            { value: "out", label: "Saídas" },
          ]}
        />
        <div className="flex gap-4 text-sm lg:ml-2">
          <span className="flex items-center gap-1 text-positive">
            <ArrowDownLeft className="h-4 w-4" aria-label="Entradas" />
            <Money value={totals.in} />
          </span>
          <span className="flex items-center gap-1 text-negative">
            <ArrowUpRight className="h-4 w-4" aria-label="Saídas" />
            <Money value={totals.out} />
          </span>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="max-h-[42rem] overflow-y-auto">
          {days.map(([date, list]) => {
            const { day, weekday } = dayLabel(date);
            return (
              <div key={date}>
                <p className="sticky top-0 z-10 border-b bg-subtle px-5 py-2 text-sm">
                  <span className="font-semibold">{day}</span>{" "}
                  <span className="text-muted-foreground first-letter:uppercase">{weekday}</span>
                </p>
                <ul className="divide-y">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          t.direction === "in"
                            ? "bg-brand-soft text-positive"
                            : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden="true"
                      >
                        {t.direction === "in" ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t.title}
                          {t.installment ? (
                            <Badge variant="secondary" className="ml-2 align-middle">
                              {t.installment}
                            </Badge>
                          ) : null}
                          {t.pending ? (
                            <Badge variant="outline" className="ml-2 align-middle">
                              pendente
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[t.detail, t.accountName, t.category].filter(Boolean).join(" · ")}
                          {t.spending === 0 && t.direction === "out"
                            ? " · não conta como gasto"
                            : ""}
                        </p>
                      </div>
                      <Money
                        value={t.direction === "in" ? t.amount : -t.amount}
                        tone={t.direction === "in" ? "positive" : undefined}
                        className="shrink-0 text-sm font-semibold"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

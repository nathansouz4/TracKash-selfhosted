import { productName, type B3Movement } from "./b3";
import { assetProfile, type EquityClass } from "./b3-assets";
import { addMonths, monthKey } from "./dates";
import { round2 } from "./spending";

// Variable income analytics. Sources:
// - B3 movement statement: purchase history (cost basis) and dividends.
// - Pluggy: current quantity and price of each position, plus recent
//   investment movements (used after the last imported B3 date).

export type ProventoType = "Dividendos" | "JCP" | "Rendimentos" | "Outros";

const PROVENTO_MOVEMENTS: Record<string, ProventoType> = {
  dividendo: "Dividendos",
  "juros sobre capital proprio": "JCP",
  rendimento: "Rendimentos",
};

const BUY_SELL = new Set(["transferencia - liquidacao", "compra / venda", "compra", "venda"]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Subscription rights and receipts (…1, …2, …9, …10, …12–…15) aren't positions. */
export function isRightsTicker(ticker: string): boolean {
  const suffix = Number(/\d+$/.exec(ticker)?.[0] ?? 0);
  return [1, 2, 9, 10, 12, 13, 14, 15].includes(suffix);
}

const root = (ticker: string) => ticker.slice(0, 4);

/**
 * Old ticker → current ticker, for movements of the same asset under another
 * code. Rows with the same product name are candidates; only two cases are the
 * same asset:
 * - a rename (different root: CVBI11 → PCIP11) — mapped to the most recent;
 * - subscription rights/receipts (KNCR12 → KNCR11) — mapped to their base.
 * Share classes of one company (ITUB3 vs ITUB4) share the name but are
 * different assets, so tickers with the same root are never merged.
 */
export function tickerAliases(movements: B3Movement[]): Map<string, string> {
  const byName = new Map<string, Map<string, string>>(); // name → ticker → last date
  for (const m of movements) {
    if (!m.ticker) continue;
    const key = productName(m.product);
    if (!key) continue;
    const tickers = byName.get(key) ?? new Map<string, string>();
    if ((tickers.get(m.ticker) ?? "") < m.date) tickers.set(m.ticker, m.date);
    byName.set(key, tickers);
  }

  const aliases = new Map<string, string>();
  for (const tickers of byName.values()) {
    const regular = [...tickers].filter(([t]) => !isRightsTicker(t));
    if (regular.length === 0) continue;
    // Renames: among regular tickers with different roots, the latest wins.
    const latestByRoot = new Map<string, [string, string]>();
    for (const [t, date] of regular) {
      const current = latestByRoot.get(root(t));
      if (!current || date > current[1]) latestByRoot.set(root(t), [t, date]);
    }
    const roots = [...latestByRoot.values()].sort((a, b) => b[1].localeCompare(a[1]));
    const newest = roots[0]![0];
    const renamedRoots = new Set(roots.slice(1).map(([t]) => root(t)));
    for (const [t] of regular) {
      if (renamedRoots.has(root(t))) {
        // Same class number under the new root when it exists (CVBI11 → PCIP11).
        const sameClass = regular.find(
          ([r]) => root(r) === root(newest) && r.slice(4) === t.slice(4),
        );
        aliases.set(t, sameClass?.[0] ?? newest);
      }
    }
    // Rights: to the regular ticker of the same root (or the newest one).
    for (const [t] of tickers) {
      if (!isRightsTicker(t)) continue;
      const base = regular.find(([r]) => root(r) === root(t))?.[0] ?? newest;
      aliases.set(t, aliases.get(base) ?? base);
    }
  }
  return aliases;
}

const canonical = (ticker: string, aliases: Map<string, string>) => aliases.get(ticker) ?? ticker;

export type Provento = { date: string; ticker: string; type: ProventoType; amount: number };

/** Dividends, JCP and FII income. "- Transferido" rows move income between brokers and are skipped. */
export function proventosFromB3(movements: B3Movement[], aliases: Map<string, string>): Provento[] {
  return movements.flatMap((m) => {
    const type = PROVENTO_MOVEMENTS[fold(m.movement)];
    if (!type || m.direction !== "CREDIT" || !m.ticker || m.amount == null || m.amount <= 0)
      return [];
    return [{ date: m.date, ticker: canonical(m.ticker, aliases), type, amount: m.amount }];
  });
}

export type CostBasis = {
  ticker: string;
  quantity: number;
  cost: number;
  realized: number;
  firstBuy: string | null;
  buys: number;
};

/**
 * Average-cost basis per ticker from purchases/sales, bonus shares and
 * fractions. Custody transfers between brokers come in matched pairs and don't
 * change the cost.
 */
export function costBasisFromB3(
  movements: B3Movement[],
  aliases: Map<string, string>,
): Map<string, CostBasis> {
  const basis = new Map<string, CostBasis>();
  const get = (ticker: string) => {
    const b = basis.get(ticker) ?? {
      ticker,
      quantity: 0,
      cost: 0,
      realized: 0,
      firstBuy: null,
      buys: 0,
    };
    basis.set(ticker, b);
    return b;
  };
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ordered) {
    if (!m.ticker || isRightsTicker(m.ticker)) continue;
    const kind = fold(m.movement);
    const qty = m.quantity ?? 0;
    const b = () => get(canonical(m.ticker!, aliases));

    if (BUY_SELL.has(kind) && qty > 0) {
      const position = b();
      const value = m.amount ?? (m.unitPrice ?? 0) * qty;
      if (m.direction === "CREDIT") {
        position.quantity += qty;
        position.cost += value;
        position.buys += 1;
        position.firstBuy ??= m.date;
      } else {
        const avg = position.quantity > 0 ? position.cost / position.quantity : 0;
        position.realized += value - avg * qty;
        position.cost -= avg * Math.min(qty, position.quantity);
        position.quantity = Math.max(position.quantity - qty, 0);
      }
    } else if (kind === "bonificacao em ativos" && m.direction === "CREDIT") {
      const position = b();
      position.quantity += qty;
      position.cost += m.amount ?? 0;
    } else if (kind === "desdobro" && m.direction === "CREDIT") {
      b().quantity += qty;
    } else if (kind === "fracao em ativos" && m.direction === "DEBIT") {
      // The fraction is sold at auction ("Leilão de Fração" credits the cash):
      // its share of the cost leaves the position and counts against the gain.
      const position = b();
      const avg = position.quantity > 0 ? position.cost / position.quantity : 0;
      const removed = avg * Math.min(qty, position.quantity);
      position.cost -= removed;
      position.realized -= removed;
      position.quantity = Math.max(position.quantity - qty, 0);
    } else if (kind === "leilao de fracao" && m.direction === "CREDIT") {
      b().realized += m.amount ?? 0;
    }
  }
  for (const p of basis.values()) {
    p.quantity = Math.round(p.quantity * 1e6) / 1e6;
    p.cost = round2(Math.max(p.cost, 0));
    p.realized = round2(p.realized);
  }
  return basis;
}

/** Monthly purchases (money put into variable income) from the statement. */
export function monthlyPurchases(
  movements: B3Movement[],
  months: string[],
): { month: string; total: number }[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const m of movements) {
    if (!m.ticker || isRightsTicker(m.ticker) || !BUY_SELL.has(fold(m.movement))) continue;
    const month = monthKey(m.date);
    if (!totals.has(month)) continue;
    const value = m.amount ?? 0;
    totals.set(month, totals.get(month)! + (m.direction === "CREDIT" ? value : -value));
  }
  return months.map((month) => ({ month, total: round2(totals.get(month) ?? 0) }));
}

export type MarketPosition = {
  ticker: string;
  name: string;
  pluggySubtype: string | null;
  quantity: number | null;
  price: number | null;
  value: number;
  institution: string | null;
};

export type Holding = {
  ticker: string;
  name: string;
  assetClass: EquityClass;
  sector: string;
  quantity: number;
  avgPrice: number | null;
  price: number | null;
  value: number | null;
  cost: number | null;
  profit: number | null;
  profitPct: number | null;
  proventos12m: number;
  proventosTotal: number;
  yieldOnCost12m: number | null;
  dividendYield12m: number | null;
  weight: number;
  /** Held according to the statement but not in any connected account. */
  outsideConnections: boolean;
};

/**
 * One row per asset: market data from Pluggy merged with cost and income from
 * the statement. Average price = cost / current quantity, so splits and
 * reverse splits (which keep the cost) don't distort it.
 */
export function buildHoldings(
  market: MarketPosition[],
  basis: Map<string, CostBasis>,
  proventos: Provento[],
  productNames: Map<string, string>,
  today: string,
): Holding[] {
  const since12m = `${addMonths(today.slice(0, 7), -11)}-01`;
  const income = new Map<string, { total: number; last12m: number }>();
  for (const p of proventos) {
    const entry = income.get(p.ticker) ?? { total: 0, last12m: 0 };
    entry.total += p.amount;
    if (p.date >= since12m) entry.last12m += p.amount;
    income.set(p.ticker, entry);
  }

  const rows: Omit<Holding, "weight">[] = [];
  const seen = new Set<string>();
  for (const pos of market) {
    seen.add(pos.ticker);
    const b = basis.get(pos.ticker);
    const qty = pos.quantity ?? b?.quantity ?? 0;
    const cost = b && b.cost > 0 ? b.cost : null;
    const inc = income.get(pos.ticker);
    const profile = assetProfile(
      pos.ticker,
      productNames.get(pos.ticker) ?? pos.name,
      pos.pluggySubtype,
    );
    rows.push({
      ticker: pos.ticker,
      name: pos.name,
      ...profile,
      quantity: qty,
      avgPrice: cost != null && qty > 0 ? cost / qty : null,
      price: pos.price ?? (qty > 0 ? pos.value / qty : null),
      value: pos.value,
      cost,
      profit: cost != null ? round2(pos.value - cost) : null,
      profitPct: cost != null && cost > 0 ? pos.value / cost - 1 : null,
      proventos12m: round2(inc?.last12m ?? 0),
      proventosTotal: round2(inc?.total ?? 0),
      yieldOnCost12m: cost ? (inc?.last12m ?? 0) / cost : null,
      dividendYield12m: pos.value > 0 ? (inc?.last12m ?? 0) / pos.value : null,
      outsideConnections: false,
    });
  }
  for (const b of basis.values()) {
    if (seen.has(b.ticker) || b.quantity < 1) continue;
    const inc = income.get(b.ticker);
    const profile = assetProfile(b.ticker, productNames.get(b.ticker));
    rows.push({
      ticker: b.ticker,
      name: productNames.get(b.ticker) ?? b.ticker,
      ...profile,
      quantity: b.quantity,
      avgPrice: b.quantity > 0 ? b.cost / b.quantity : null,
      price: null,
      value: null,
      cost: b.cost,
      profit: null,
      profitPct: null,
      proventos12m: round2(inc?.last12m ?? 0),
      proventosTotal: round2(inc?.total ?? 0),
      yieldOnCost12m: b.cost ? (inc?.last12m ?? 0) / b.cost : null,
      dividendYield12m: null,
      outsideConnections: true,
    });
  }
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  return rows
    .map((r) => ({ ...r, weight: total > 0 && r.value ? r.value / total : 0 }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/** Income per month split by type, for stacked charts. */
export function proventosByMonth(
  proventos: Provento[],
  months: string[],
): {
  month: string;
  Dividendos: number;
  JCP: number;
  Rendimentos: number;
  Outros: number;
  total: number;
}[] {
  const empty = () => ({ Dividendos: 0, JCP: 0, Rendimentos: 0, Outros: 0, total: 0 });
  const map = new Map(months.map((m) => [m, empty()]));
  for (const p of proventos) {
    const row = map.get(monthKey(p.date));
    if (!row) continue;
    row[p.type] += p.amount;
    row.total += p.amount;
  }
  return months.map((month) => {
    const r = map.get(month)!;
    return {
      month,
      Dividendos: round2(r.Dividendos),
      JCP: round2(r.JCP),
      Rendimentos: round2(r.Rendimentos),
      Outros: round2(r.Outros),
      total: round2(r.total),
    };
  });
}

export function groupTotals<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + value(item));
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .map(([label, v]) => ({ label, total: round2(v), share: total > 0 ? v / total : 0 }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);
}

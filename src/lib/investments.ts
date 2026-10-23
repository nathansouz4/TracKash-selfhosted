import { daysBetween, monthKey } from "./dates";
import { round2 } from "./spending";

// Portfolio analytics. Pluggy gives the current position of each asset; the
// daily snapshots we store on every sync build the history used for
// time-weighted return, volatility and drawdown.

export type Position = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  institution: string | null;
  balance: number;
  amountOriginal: number | null;
  amountProfit: number | null;
  quantity: number | null;
  lastMonthRate: number | null;
  lastTwelveMonthsRate: number | null;
  dueDate: string | null;
  status: string | null;
};

export type AssetClass =
  | "Ações"
  | "FIIs"
  | "BDRs"
  | "ETFs"
  | "Tesouro Direto"
  | "Renda fixa"
  | "Fundos"
  | "Previdência"
  | "COE"
  | "Derivativos"
  | "Outros";

export function assetClass(type: string, subtype: string | null): AssetClass {
  switch (subtype) {
    case "STOCK":
      return "Ações";
    case "REAL_ESTATE_FUND":
      return "FIIs";
    case "BDR":
      return "BDRs";
    case "ETF":
    case "ETF_FUND":
      return "ETFs";
    case "TREASURY":
      return "Tesouro Direto";
    case "DERIVATIVES":
    case "OPTION":
      return "Derivativos";
    case "RETIREMENT":
      return "Previdência";
  }
  switch (type) {
    case "EQUITY":
      return "Ações";
    case "ETF":
      return "ETFs";
    case "FIXED_INCOME":
      return "Renda fixa";
    case "MUTUAL_FUND":
      return "Fundos";
    case "SECURITY":
      return "Previdência";
    case "COE":
      return "COE";
    default:
      return "Outros";
  }
}

export type PositionMetrics = {
  invested: number | null;
  profit: number | null;
  returnPct: number | null;
};

export function positionMetrics(
  p: Pick<Position, "balance" | "amountOriginal" | "amountProfit">,
): PositionMetrics {
  let invested = p.amountOriginal != null && p.amountOriginal > 0 ? p.amountOriginal : null;
  let profit = p.amountProfit;
  if (invested == null && profit != null) invested = p.balance - profit;
  if (profit == null && invested != null) profit = p.balance - invested;
  const returnPct = invested && invested > 0 && profit != null ? profit / invested : null;
  return {
    invested: invested == null ? null : round2(invested),
    profit: profit == null ? null : round2(profit),
    returnPct,
  };
}

export type AllocationSlice = { label: AssetClass; total: number; share: number };

/** Top-level bucket used for the portfolio split. */
export type Bucket = "Renda fixa" | "Renda variável" | "Fundos" | "Previdência" | "Outros";

// Fixed color order per category (the palette has 8 slots), so a class keeps
// its color on every page and as values change.
export const BUCKET_COLOR_ORDER: readonly Bucket[] = [
  "Renda fixa",
  "Renda variável",
  "Fundos",
  "Previdência",
  "Outros",
];
export const CLASS_COLOR_ORDER: readonly AssetClass[] = [
  "Renda fixa",
  "Ações",
  "FIIs",
  "ETFs",
  "BDRs",
  "Tesouro Direto",
  "Fundos",
];

export function bucketOf(type: string): Bucket {
  if (type === "FIXED_INCOME") return "Renda fixa";
  if (type === "EQUITY" || type === "ETF") return "Renda variável";
  if (type === "MUTUAL_FUND") return "Fundos";
  if (type === "SECURITY") return "Previdência";
  return "Outros";
}

export function allocationByClass(
  positions: Position[],
  classify: (p: Position) => AssetClass = (p) => assetClass(p.type, p.subtype),
): AllocationSlice[] {
  const totals = new Map<AssetClass, number>();
  for (const p of positions) {
    if (p.balance <= 0) continue;
    const c = classify(p);
    totals.set(c, (totals.get(c) ?? 0) + p.balance);
  }
  const sum = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([label, total]) => ({ label, total: round2(total), share: sum > 0 ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total);
}

export type Concentration = {
  hhi: number;
  effectiveCount: number;
  topShare: number;
  topCount: number;
};

/** Herfindahl index over position weights; 1/HHI is the "effective number of assets". */
export function concentration(positions: Position[], topCount = 5): Concentration {
  const balances = positions
    .map((p) => p.balance)
    .filter((b) => b > 0)
    .sort((a, b) => b - a);
  const sum = balances.reduce((s, b) => s + b, 0);
  if (sum <= 0) return { hhi: 0, effectiveCount: 0, topShare: 0, topCount };
  const weights = balances.map((b) => b / sum);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const topShare = weights.slice(0, topCount).reduce((s, w) => s + w, 0);
  return { hhi, effectiveCount: 1 / hhi, topShare, topCount };
}

export type InvestmentFlow = {
  date: string;
  type: string | null;
  amount: number | null;
  quantity: number | null;
  value: number | null;
};

/** Net money put into the portfolio: buys positive, sells negative. */
export function flowAmount(f: InvestmentFlow): number {
  const gross = Math.abs(f.amount ?? (f.quantity ?? 0) * (f.value ?? 0));
  if (f.type === "BUY") return gross;
  if (f.type === "SELL") return -gross;
  return 0;
}

export function monthlyNetFlows(
  flows: InvestmentFlow[],
  months: string[],
): { month: string; total: number }[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const f of flows) {
    const m = monthKey(f.date);
    if (totals.has(m)) totals.set(m, totals.get(m)! + flowAmount(f));
  }
  return months.map((month) => ({ month, total: round2(totals.get(month) ?? 0) }));
}

export type PortfolioPoint = {
  date: string;
  value: number;
  flow: number;
  periodReturn: number | null;
  index: number;
};

/**
 * Time-weighted return between consecutive snapshots:
 *   r = (V_t − F_t) / V_{t−1} − 1, where F_t are the net flows after t−1 up to t.
 * Cash in/out doesn't count as performance.
 */
export function portfolioSeries(
  totals: { date: string; value: number }[],
  flows: InvestmentFlow[],
): PortfolioPoint[] {
  const sorted = [...totals].sort((a, b) => a.date.localeCompare(b.date));
  const points: PortfolioPoint[] = [];
  let index = 1;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    if (i === 0) {
      points.push({ date: cur.date, value: cur.value, flow: 0, periodReturn: null, index });
      continue;
    }
    const prev = sorted[i - 1]!;
    const flow = flows
      .filter((f) => f.date.slice(0, 10) > prev.date && f.date.slice(0, 10) <= cur.date)
      .reduce((s, f) => s + flowAmount(f), 0);
    const periodReturn = prev.value > 0 ? (cur.value - flow) / prev.value - 1 : null;
    if (periodReturn != null) index *= 1 + periodReturn;
    points.push({ date: cur.date, value: cur.value, flow: round2(flow), periodReturn, index });
  }
  return points;
}

export type RiskStats = {
  days: number;
  periods: number;
  cumulativeReturn: number | null;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  bestMonth: { month: string; value: number } | null;
  worstMonth: { month: string; value: number } | null;
};

const MIN_PERIODS_FOR_VOLATILITY = 10;
const MIN_DAYS_FOR_ANNUALIZING = 90;

export function riskStats(series: PortfolioPoint[]): RiskStats {
  const returns = series.map((p) => p.periodReturn).filter((r): r is number => r != null);
  const first = series[0];
  const last = series.at(-1);
  const days = first && last ? daysBetween(first.date, last.date) : 0;
  const empty: RiskStats = {
    days,
    periods: returns.length,
    cumulativeReturn: null,
    annualizedReturn: null,
    annualizedVolatility: null,
    maxDrawdown: null,
    bestMonth: null,
    worstMonth: null,
  };
  if (!last || returns.length === 0) return empty;

  const cumulativeReturn = last.index - 1;
  const annualizedReturn =
    days >= MIN_DAYS_FOR_ANNUALIZING ? Math.pow(last.index, 365 / days) - 1 : null;

  let annualizedVolatility: number | null = null;
  if (returns.length >= MIN_PERIODS_FOR_VOLATILITY && days > 0) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    // Snapshots are irregular (one per sync); scale by the average period length.
    const periodsPerYear = 365 / (days / returns.length);
    annualizedVolatility = Math.sqrt(variance * periodsPerYear);
  }

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const p of series) {
    peak = Math.max(peak, p.index);
    maxDrawdown = Math.min(maxDrawdown, p.index / peak - 1);
  }

  const monthly = new Map<string, number>();
  for (const p of series) {
    if (p.periodReturn == null) continue;
    const m = monthKey(p.date);
    monthly.set(m, (1 + (monthly.get(m) ?? 0)) * (1 + p.periodReturn) - 1);
  }
  const months = [...monthly.entries()].map(([month, value]) => ({ month, value }));
  const bestMonth = months.length ? months.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const worstMonth = months.length ? months.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  return {
    days,
    periods: returns.length,
    cumulativeReturn,
    annualizedReturn,
    annualizedVolatility,
    maxDrawdown,
    bestMonth,
    worstMonth,
  };
}

/** "102% CDI", "IPCA + 6,5% a.a.", "12,5% a.a." — or null when Pluggy sends no rate. */
export function rateLabel(p: {
  rate: number | null;
  rateType: string | null;
  fixedAnnualRate: number | null;
}): string | null {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const index = p.rateType?.toUpperCase() ?? null;
  if (index && index !== "PRE_FIXADO" && p.rate != null) {
    const base = `${fmt(p.rate)}% ${index}`;
    return p.fixedAnnualRate ? `${index} + ${fmt(p.fixedAnnualRate)}% a.a.` : base;
  }
  if (p.fixedAnnualRate != null) return `${fmt(p.fixedAnnualRate)}% a.a.`;
  if (p.rate != null) return `${fmt(p.rate)}% a.a.`;
  return null;
}

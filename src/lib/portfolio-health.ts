// Portfolio health: five scores (0–100) and an overall score (0–1000), shown as a
// radar on Investments. Simple, explainable rules on the data the app has — not
// a recommendation. Each dimension returns the facts that justify its score.

export type Liquidity = "daily" | "market" | "maturity";

/** One exposure: fixed income grouped by issuer, listed assets by ticker. */
export type Exposure = {
  label: string;
  assetClass: string; // Renda fixa, Tesouro Direto, Ações, FIIs, ETFs, BDRs, Fundos...
  value: number;
  liquidity: Liquidity;
  cost: number | null; // amount invested, when known
  cdiRate: number | null; // % of CDI for CDI-linked fixed income (e.g. 100, 120)
  fgc: boolean; // bank deposit covered by the FGC (CDB, RDB, LC, LCI, LCA...)
  sovereign: boolean; // Tesouro Direto
};

export type HealthInput = {
  exposures: Exposure[];
  equityIncome12m: number; // dividends/rendimentos received in 12 months
  equityValue: number; // market value of listed stocks, FIIs, ETFs and BDRs
  maxDrawdown: number | null; // portfolio history (negative)
  annualizedReturn: number | null; // TWR, when the history is long enough
  historyDays: number;
};

export type HealthDimension =
  "diversification" | "protection" | "efficiency" | "return" | "liquidity";

export type PortfolioHealth = {
  overall: number; // 0..1000
  scores: Record<HealthDimension, number>; // 0..100
  facts: {
    classes: { label: string; share: number }[];
    effectiveClasses: number;
    effectiveExposures: number;
    top: { label: string; share: number } | null;
    defensiveShare: number;
    fgcCoveredShare: number | null; // of the fixed income
    maxDrawdown: number | null;
    avgCdiRate: number | null;
    equityIncomeYield: number | null;
    returnBasis: "twr" | "cost" | null;
    returnValue: number | null;
    liquidShare: number;
  };
};

export const FGC_LIMIT = 250_000; // per issuer and CPF
const DEFENSIVE_CLASSES = new Set(["Renda fixa", "Tesouro Direto"]);
const YIELDING_EQUITIES = new Set(["Ações", "FIIs", "ETFs", "BDRs"]);

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const score = (ratio: number) => Math.round(clamp01(ratio) * 100);

/** Inverse Herfindahl: how many equal parts the weights are worth. */
function effectiveCount(weights: number[]): number {
  const total = sum(weights);
  if (total <= 0) return 0;
  return 1 / sum(weights.map((w) => (w / total) ** 2));
}

/**
 * Liquidity of a position. CDI-linked fixed income paying up to 100% of CDI is
 * usually daily-liquidity (bank "caixinhas"); higher rates come with liquidity
 * only at maturity. Pluggy doesn't report liquidity, hence this rule — and the
 * owner's own setting, when present, always wins.
 */
export function positionLiquidity(
  p: {
    type: string;
    subtype: string | null;
    rate: number | null;
    rateType: string | null;
    dueDate: string | null;
    liquidity?: "daily" | "maturity" | null;
  },
  today: string,
): Liquidity {
  if (p.liquidity) return p.liquidity; // set by the owner (Investments → Posições)
  if (p.type === "EQUITY" || p.type === "ETF" || p.type === "MUTUAL_FUND") return "market";
  if (p.subtype === "TREASURY") return "daily";
  if (p.type === "FIXED_INCOME") {
    if ((p.rateType ?? "").toUpperCase() === "CDI" && p.rate != null && p.rate <= 100)
      return "daily";
    if (p.dueDate) {
      const days = (Date.parse(p.dueDate) - Date.parse(today)) / 86_400_000;
      if (days <= 30) return "daily";
    }
  }
  return "maturity";
}

export function portfolioHealth(input: HealthInput): PortfolioHealth {
  const exposures = input.exposures.filter((e) => e.value > 0);
  const total = sum(exposures.map((e) => e.value));
  const share = (v: number) => (total > 0 ? v / total : 0);

  // Diversification: classes, exposures (issuer/ticker), the largest one.
  const byClass = new Map<string, number>();
  for (const e of exposures) byClass.set(e.assetClass, (byClass.get(e.assetClass) ?? 0) + e.value);
  const classes = [...byClass]
    .map(([label, v]) => ({ label, share: share(v) }))
    .sort((a, b) => b.share - a.share);
  const effectiveClasses = effectiveCount([...byClass.values()]);
  // One issuer/ticker may come in several entries (e.g. daily and locked CDBs of one bank).
  const byLabel = new Map<string, number>();
  for (const e of exposures) byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + e.value);
  const effectiveExposures = effectiveCount([...byLabel.values()]);
  const largest = [...byLabel].sort((a, b) => b[1] - a[1])[0];
  const top = largest ? { label: largest[0], share: share(largest[1]) } : null;
  const diversification = score(
    0.5 * (effectiveClasses / 4) +
      0.3 * (effectiveExposures / 12) +
      0.2 * (1 - clamp01(((top?.share ?? 0) - 0.15) / 0.35)),
  );

  // Protection: defensive share, FGC/sovereign cover of the fixed income, worst drop.
  const defensive = exposures.filter((e) => DEFENSIVE_CLASSES.has(e.assetClass));
  const defensiveValue = sum(defensive.map((e) => e.value));
  const fgcByIssuer = new Map<string, number>();
  for (const e of defensive)
    if (e.fgc && !e.sovereign) fgcByIssuer.set(e.label, (fgcByIssuer.get(e.label) ?? 0) + e.value);
  const covered =
    sum(defensive.filter((e) => e.sovereign).map((e) => e.value)) +
    sum([...fgcByIssuer.values()].map((v) => Math.min(v, FGC_LIMIT)));
  const fgcCoveredShare = defensiveValue > 0 ? covered / defensiveValue : null;
  const drawdownKnown = input.maxDrawdown != null && input.historyDays >= 60;
  const drawdownScore = drawdownKnown ? 1 - clamp01(Math.abs(input.maxDrawdown!) / 0.25) : 0.75;
  const protection = score(
    0.5 * (share(defensiveValue) / 0.4) + 0.3 * (fgcCoveredShare ?? 0) + 0.2 * drawdownScore,
  );

  // Efficiency: fixed income vs CDI, income generated by the listed assets.
  const cdi = exposures.filter((e) => e.cdiRate != null);
  const cdiValue = sum(cdi.map((e) => e.value));
  const avgCdiRate = cdiValue > 0 ? sum(cdi.map((e) => e.cdiRate! * e.value)) / cdiValue : null;
  const equityIncomeYield =
    input.equityValue > 0 ? input.equityIncome12m / input.equityValue : null;
  const equityValue = sum(
    exposures.filter((e) => YIELDING_EQUITIES.has(e.assetClass)).map((e) => e.value),
  );
  const parts: [number, number][] = [];
  if (avgCdiRate != null) parts.push([cdiValue, clamp01((avgCdiRate - 85) / 30)]);
  if (equityIncomeYield != null && equityValue > 0)
    parts.push([equityValue, clamp01(equityIncomeYield / 0.08)]);
  const weight = sum(parts.map(([w]) => w));
  const efficiency = weight > 0 ? score(sum(parts.map(([w, s]) => w * s)) / weight) : 0;

  // Return: annualized TWR when the history allows, else gain over the amount invested.
  const withCost = exposures.filter((e) => e.cost != null && e.cost > 0);
  const costTotal = sum(withCost.map((e) => e.cost!));
  const gainOnCost = costTotal > 0 ? sum(withCost.map((e) => e.value)) / costTotal - 1 : null;
  const returnBasis = input.annualizedReturn != null ? "twr" : gainOnCost != null ? "cost" : null;
  const returnValue = input.annualizedReturn ?? gainOnCost;
  const returnScore =
    returnBasis === "twr"
      ? score(returnValue! / 0.15) // 15% a year = full marks
      : returnBasis === "cost"
        ? score((returnValue! + 0.05) / 0.25) // -5% → 0, +20% → 100
        : 0;

  // Liquidity: redeemable within ~2 days; 60% of the portfolio is plenty.
  const liquidShare = share(
    sum(exposures.filter((e) => e.liquidity !== "maturity").map((e) => e.value)),
  );
  const liquidity = score(liquidShare / 0.6);

  const scores = { diversification, protection, efficiency, return: returnScore, liquidity };
  return {
    overall: Math.round((sum(Object.values(scores)) / 5) * 10),
    scores,
    facts: {
      classes,
      effectiveClasses,
      effectiveExposures,
      top,
      defensiveShare: share(defensiveValue),
      fgcCoveredShare,
      maxDrawdown: drawdownKnown ? input.maxDrawdown : null,
      avgCdiRate,
      equityIncomeYield,
      returnBasis,
      returnValue,
      liquidShare,
    },
  };
}

export function healthLabel(overall: number): string {
  if (overall >= 800) return "Excelente";
  if (overall >= 600) return "Boa";
  if (overall >= 400) return "Regular";
  return "Fraca";
}

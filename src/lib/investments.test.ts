import { describe, expect, it } from "vitest";
import {
  allocationByClass,
  assetClass,
  concentration,
  monthlyNetFlows,
  portfolioSeries,
  positionMetrics,
  rateLabel,
  riskStats,
  type Position,
} from "./investments";

function position(overrides: Partial<Position>): Position {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Ativo",
    code: null,
    type: "EQUITY",
    subtype: "STOCK",
    institution: null,
    balance: 100,
    amountOriginal: null,
    amountProfit: null,
    quantity: null,
    lastMonthRate: null,
    lastTwelveMonthsRate: null,
    dueDate: null,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("assetClass", () => {
  it("maps Pluggy types and subtypes to pt-BR classes", () => {
    expect(assetClass("EQUITY", "STOCK")).toBe("Ações");
    expect(assetClass("EQUITY", "REAL_ESTATE_FUND")).toBe("FIIs");
    expect(assetClass("EQUITY", "BDR")).toBe("BDRs");
    expect(assetClass("ETF", null)).toBe("ETFs");
    expect(assetClass("FIXED_INCOME", "TREASURY")).toBe("Tesouro Direto");
    expect(assetClass("FIXED_INCOME", "CDB")).toBe("Renda fixa");
    expect(assetClass("WHATEVER", null)).toBe("Outros");
  });
});

describe("positionMetrics", () => {
  it("derives invested amount from profit when the original amount is missing", () => {
    expect(positionMetrics({ balance: 120, amountOriginal: null, amountProfit: 20 })).toEqual({
      invested: 100,
      profit: 20,
      returnPct: 0.2,
    });
  });

  it("derives profit from the original amount", () => {
    const m = positionMetrics({ balance: 90, amountOriginal: 100, amountProfit: null });
    expect(m.profit).toBe(-10);
    expect(m.returnPct).toBeCloseTo(-0.1);
  });

  it("returns nulls when nothing is known", () => {
    expect(positionMetrics({ balance: 90, amountOriginal: null, amountProfit: null })).toEqual({
      invested: null,
      profit: null,
      returnPct: null,
    });
  });
});

describe("allocationByClass", () => {
  it("groups balances by class with shares", () => {
    const result = allocationByClass([
      position({ balance: 300 }),
      position({ balance: 100, subtype: "REAL_ESTATE_FUND" }),
      position({ balance: 0, subtype: "BDR" }),
    ]);
    expect(result).toEqual([
      { label: "Ações", total: 300, share: 0.75 },
      { label: "FIIs", total: 100, share: 0.25 },
    ]);
  });
});

describe("concentration", () => {
  it("computes HHI and the effective number of assets", () => {
    const c = concentration([position({ balance: 50 }), position({ balance: 50 })], 1);
    expect(c.hhi).toBeCloseTo(0.5);
    expect(c.effectiveCount).toBeCloseTo(2);
    expect(c.topShare).toBeCloseTo(0.5);
  });
});

describe("monthlyNetFlows", () => {
  it("counts buys as inflows and sells as outflows", () => {
    const flows = [
      { date: "2026-10-02T00:00:00.000Z", type: "BUY", amount: 2000, quantity: null, value: null },
      { date: "2026-10-20T00:00:00.000Z", type: "SELL", amount: 500, quantity: null, value: null },
      { date: "2026-10-21T00:00:00.000Z", type: "TAX", amount: 10, quantity: null, value: null },
    ];
    expect(monthlyNetFlows(flows, ["2026-10"])).toEqual([{ month: "2026-10", total: 1500 }]);
  });
});

describe("portfolioSeries / riskStats", () => {
  it("removes contributions from the return (time-weighted)", () => {
    const series = portfolioSeries(
      [
        { date: "2026-10-01", value: 1000 },
        { date: "2026-10-02", value: 3100 }, // +2000 contribution, +100 gain
      ],
      [
        {
          date: "2026-10-02T00:00:00.000Z",
          type: "BUY",
          amount: 2000,
          quantity: null,
          value: null,
        },
      ],
    );
    expect(series[1]!.periodReturn).toBeCloseTo(0.1);
    expect(series[1]!.index).toBeCloseTo(1.1);
  });

  it("computes drawdown and best/worst month", () => {
    const series = portfolioSeries(
      [
        { date: "2026-09-01", value: 100 },
        { date: "2026-09-30", value: 120 },
        { date: "2026-10-15", value: 90 },
        { date: "2026-10-31", value: 99 },
      ],
      [],
    );
    const stats = riskStats(series);
    expect(stats.cumulativeReturn).toBeCloseTo(-0.01);
    expect(stats.maxDrawdown).toBeCloseTo(-0.25);
    expect(stats.bestMonth?.month).toBe("2026-09");
    expect(stats.worstMonth?.month).toBe("2026-10");
    // Too short a history to annualize or estimate volatility honestly.
    expect(stats.annualizedReturn).toBeNull();
    expect(stats.annualizedVolatility).toBeNull();
  });

  it("handles an empty history", () => {
    expect(riskStats([]).cumulativeReturn).toBeNull();
  });
});

describe("rateLabel", () => {
  it("describes post-fixed, hybrid and pre-fixed rates", () => {
    expect(rateLabel({ rate: 102, rateType: "CDI", fixedAnnualRate: null })).toBe("102% CDI");
    expect(rateLabel({ rate: 100, rateType: "IPCA", fixedAnnualRate: 6.5 })).toBe(
      "IPCA + 6,5% a.a.",
    );
    expect(rateLabel({ rate: null, rateType: null, fixedAnnualRate: 12.5 })).toBe("12,5% a.a.");
    expect(rateLabel({ rate: null, rateType: null, fixedAnnualRate: null })).toBeNull();
  });
});

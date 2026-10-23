import { describe, expect, it } from "vitest";
import {
  healthLabel,
  portfolioHealth,
  positionLiquidity,
  type Exposure,
  type HealthInput,
} from "./portfolio-health";

const exposure = (overrides: Partial<Exposure>): Exposure => ({
  label: "X",
  assetClass: "Ações",
  value: 1000,
  liquidity: "market",
  cost: null,
  cdiRate: null,
  fgc: false,
  sovereign: false,
  ...overrides,
});

const input = (exposures: Exposure[], overrides: Partial<HealthInput> = {}): HealthInput => ({
  exposures,
  equityIncome12m: 0,
  equityValue: 0,
  maxDrawdown: null,
  annualizedReturn: null,
  historyDays: 10,
  ...overrides,
});

describe("positionLiquidity", () => {
  const today = "2026-10-15";
  const cdb = { type: "FIXED_INCOME", subtype: "CDB", rateType: "CDI", dueDate: "2028-05-15" };
  it("treats CDBs up to 100% of CDI as daily liquidity, higher rates as locked", () => {
    expect(positionLiquidity({ ...cdb, rate: 100 }, today)).toBe("daily");
    expect(positionLiquidity({ ...cdb, rate: 120 }, today)).toBe("maturity");
    expect(positionLiquidity({ ...cdb, rate: 120, dueDate: "2026-11-01" }, today)).toBe("daily");
  });
  it("lets the owner's setting win over the rule", () => {
    expect(positionLiquidity({ ...cdb, rate: 120, liquidity: "daily" }, today)).toBe("daily");
    expect(positionLiquidity({ ...cdb, rate: 104, liquidity: "maturity" }, today)).toBe("maturity");
    expect(positionLiquidity({ ...cdb, rate: 100, liquidity: "maturity" }, today)).toBe("maturity");
  });

  it("treats listed assets as market and Tesouro as daily", () => {
    expect(
      positionLiquidity(
        { type: "EQUITY", subtype: "STOCK", rate: null, rateType: null, dueDate: null },
        today,
      ),
    ).toBe("market");
    expect(
      positionLiquidity(
        {
          type: "FIXED_INCOME",
          subtype: "TREASURY",
          rate: null,
          rateType: null,
          dueDate: "2035-01-01",
        },
        today,
      ),
    ).toBe("daily");
  });
});

describe("portfolioHealth", () => {
  // Like the owner's: 80% in CDBs of one bank (part locked), 20% stocks/FIIs/funds.
  const concentrated = input(
    [
      exposure({
        label: "BANCO EXEMPLO",
        assetClass: "Renda fixa",
        value: 29_000,
        liquidity: "daily",
        cost: 28_000,
        cdiRate: 100,
        fgc: true,
      }),
      exposure({
        label: "BANCO EXEMPLO",
        assetClass: "Renda fixa",
        value: 16_000,
        liquidity: "maturity",
        cost: 15_200,
        cdiRate: 118,
        fgc: true,
      }),
      exposure({ label: "ITSA4", value: 4_000, cost: 3_700 }),
      exposure({ label: "HGLG11", assetClass: "FIIs", value: 4_000, cost: 4_000 }),
      exposure({ label: "FUNDO EXEMPLO", assetClass: "Fundos", value: 3_000 }),
    ],
    { equityIncome12m: 360, equityValue: 8_000 },
  );
  const health = portfolioHealth(concentrated);

  it("scores a concentrated, protected portfolio", () => {
    expect(health.scores.diversification).toBeLessThan(35);
    expect(health.facts.top).toEqual({ label: "BANCO EXEMPLO", share: 45 / 56 });
    expect(health.scores.protection).toBeGreaterThan(85);
    expect(health.facts.fgcCoveredShare).toBe(1);
    expect(health.facts.liquidShare).toBeCloseTo(40 / 56, 3);
    expect(health.scores.liquidity).toBe(100);
    expect(health.facts.avgCdiRate).toBeCloseTo((29 * 100 + 16 * 118) / 45, 3);
    expect(health.facts.returnBasis).toBe("cost");
    expect(health.facts.returnValue).toBeCloseTo(53_000 / 50_900 - 1, 4);
    expect(health.overall).toBe(
      Math.round((Object.values(health.scores).reduce((s, v) => s + v, 0) / 5) * 10),
    );
  });

  it("rewards a spread portfolio in diversification", () => {
    const spread = portfolioHealth(
      input(
        ["Renda fixa", "Ações", "FIIs", "ETFs", "BDRs"].flatMap((assetClass) =>
          [1, 2, 3].map((i) => exposure({ label: `${assetClass}-${i}`, assetClass, value: 1000 })),
        ),
      ),
    );
    expect(spread.scores.diversification).toBe(100);
    expect(spread.facts.effectiveClasses).toBeCloseTo(5);
  });

  it("caps the FGC cover at R$ 250k per issuer, summing the issuer's entries", () => {
    const big = portfolioHealth(
      input([
        exposure({ label: "BANCO", assetClass: "Renda fixa", value: 300_000, fgc: true }),
        exposure({ label: "BANCO", assetClass: "Renda fixa", value: 200_000, fgc: true }),
        exposure({
          label: "TESOURO",
          assetClass: "Tesouro Direto",
          value: 500_000,
          sovereign: true,
        }),
      ]),
    );
    expect(big.facts.fgcCoveredShare).toBe(0.75);
  });

  it("uses the annualized TWR when available", () => {
    const twr = portfolioHealth(input([exposure({})], { annualizedReturn: 0.12 }));
    expect(twr.facts.returnBasis).toBe("twr");
    expect(twr.scores.return).toBe(80);
  });
});

describe("healthLabel", () => {
  it("names the bands", () => {
    expect(healthLabel(560)).toBe("Regular");
    expect(healthLabel(820)).toBe("Excelente");
    expect(healthLabel(399)).toBe("Fraca");
  });
});

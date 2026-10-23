import { describe, expect, it } from "vitest";
import {
  movementKeys,
  parseB3Sheet,
  parseDate,
  parseNumber,
  parseTicker,
  type B3Movement,
} from "./b3";
import { assetProfile } from "./b3-assets";
import {
  buildHoldings,
  costBasisFromB3,
  isRightsTicker,
  monthlyPurchases,
  proventosByMonth,
  proventosFromB3,
  tickerAliases,
} from "./equities";

const HEADER = [
  "Entrada/Saída",
  "Data",
  "Movimentação",
  "Produto",
  "Instituição",
  "Quantidade",
  "Preço unitário",
  "Valor da Operação",
];

function mv(overrides: Partial<B3Movement>): B3Movement {
  const product = overrides.product ?? "PETR4 - PETROLEO BRASILEIRO S/A";
  return {
    direction: "CREDIT",
    date: "2026-01-10",
    movement: "Transferência - Liquidação",
    product,
    ticker: parseTicker(product),
    institution: "NU INVESTIMENTOS S.A. - CTVM",
    quantity: 1,
    unitPrice: 10,
    amount: 10,
    ...overrides,
  };
}

describe("parsing", () => {
  it("parses numbers, dates and tickers in B3 formats", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber(0.083)).toBe(0.083);
    expect(parseNumber("-")).toBeNull();
    expect(parseDate("08/10/2026")).toBe("2026-10-08");
    expect(parseDate("2026-10-08")).toBeNull();
    expect(parseTicker("XPML11 - XP MALLS FDO INV IMOB FII")).toBe("XPML11");
    expect(parseTicker("CDB - CDB3269QK5P - BANCO BRADESCO S/A")).toBeNull();
  });

  it("reads a statement sheet and rejects other files", () => {
    const rows = [
      HEADER,
      [
        "Credito",
        "07/10/2026",
        "Rendimento",
        "GARE11 - FII GUARDIAN",
        "NU INVESTIMENTOS",
        23,
        0.083,
        1.9,
      ],
      ["Credito", "05/10/2026", "Direito de Subscrição", "KNCR12 - KINEA FII", "NU", 0, "-", "-"],
    ];
    const parsed = parseB3Sheet(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      direction: "CREDIT",
      date: "2026-10-07",
      ticker: "GARE11",
      amount: 1.9,
    });
    expect(parsed[1]).toMatchObject({ unitPrice: null, amount: null });
    expect(() => parseB3Sheet([["Data", "Valor"]])).toThrow(/extrato de movimentação/);
  });

  it("gives identical rows distinct, stable keys", () => {
    const row = mv({});
    const keys = movementKeys([row, row, mv({ amount: 11 })]);
    expect(new Set(keys).size).toBe(3);
    expect(movementKeys([row, row])).toEqual(keys.slice(0, 2));
  });
});

describe("tickers", () => {
  it("recognizes subscription rights and receipts", () => {
    expect(isRightsTicker("KNCR12")).toBe(true);
    expect(isRightsTicker("KNCR11")).toBe(false);
    expect(isRightsTicker("PETR4")).toBe(false);
  });

  it("maps renamed tickers and rights to the current ticker", () => {
    const aliases = tickerAliases([
      mv({ product: "CVBI11 - FDO INV. IMOB. VBI CRI", date: "2025-06-01" }),
      mv({
        product: "PCIP11 - FDO INV. IMOB. VBI CRI",
        date: "2025-09-25",
        movement: "Atualização",
      }),
      mv({ product: "KNCR11 - KINEA RENDIMENTOS FII", date: "2025-06-01" }),
      mv({
        product: "KNCR12 - KINEA RENDIMENTOS FII",
        date: "2026-10-05",
        movement: "Direito de Subscrição",
      }),
    ]);
    expect(aliases.get("CVBI11")).toBe("PCIP11");
    expect(aliases.get("KNCR12")).toBe("KNCR11");
    expect(aliases.has("PCIP11")).toBe(false);
  });

  it("never merges share classes of the same company", () => {
    const aliases = tickerAliases([
      mv({ product: "ITUB3 - ITAU UNIBANCO HOLDING S.A", date: "2025-06-01" }),
      mv({ product: "ITUB4 - ITAU UNIBANCO HOLDING S.A", date: "2026-01-01" }),
      mv({ product: "BBDC4 - BANCO BRADESCO S/A", date: "2026-01-01" }),
      mv({
        product: "BBDC2 - BANCO BRADESCO S/A",
        date: "2026-02-01",
        movement: "Direito de Subscrição",
      }),
    ]);
    expect(aliases.has("ITUB3")).toBe(false);
    expect(aliases.has("ITUB4")).toBe(false);
    expect(aliases.get("BBDC2")).toBe("BBDC4");
  });

  it("classifies assets, overriding Pluggy where it is wrong", () => {
    expect(assetProfile("GARE11", null, "STOCK")).toEqual({
      assetClass: "FIIs",
      sector: "Híbrido / renda urbana",
    });
    expect(assetProfile("ZZZZ11", "ALGUM FDO INV IMOB - FII", "STOCK").assetClass).toBe("FIIs");
    expect(assetProfile("ABCD34", null, null).assetClass).toBe("BDRs");
    expect(assetProfile("ABCD3", null, "STOCK")).toEqual({ assetClass: "Ações", sector: "Outros" });
  });
});

describe("cost basis", () => {
  it("averages purchases and keeps cost through custody transfers", () => {
    const movements = [
      mv({ date: "2025-06-01", quantity: 2, amount: 20 }),
      mv({ date: "2025-07-01", quantity: 2, amount: 30 }),
      mv({
        date: "2026-05-15",
        movement: "Transferência",
        direction: "DEBIT",
        quantity: 4,
        amount: null,
      }),
      mv({
        date: "2026-05-15",
        movement: "Transferência",
        direction: "CREDIT",
        quantity: 4,
        amount: null,
      }),
    ];
    const b = costBasisFromB3(movements, new Map()).get("PETR4")!;
    expect(b).toMatchObject({ quantity: 4, cost: 50, buys: 2, firstBuy: "2025-06-01" });
  });

  it("realizes gains on sales at average cost", () => {
    const movements = [
      mv({ quantity: 4, amount: 40 }),
      mv({ date: "2026-02-01", direction: "DEBIT", quantity: 2, amount: 30 }),
    ];
    const b = costBasisFromB3(movements, new Map()).get("PETR4")!;
    expect(b).toMatchObject({ quantity: 2, cost: 20, realized: 10 });
  });

  it("adds bonus shares (lowering the average) and removes sold fractions at average cost", () => {
    const product = "ENGI11 - ENERGISA S.A.";
    const movements = [
      mv({ product, ticker: "ENGI11", quantity: 3, amount: 150 }),
      mv({
        product,
        ticker: "ENGI11",
        date: "2026-02-01",
        movement: "Bonificação em Ativos",
        quantity: 0.3,
        amount: null,
      }),
      mv({
        product,
        ticker: "ENGI11",
        date: "2026-03-01",
        movement: "Fração em Ativos",
        direction: "DEBIT",
        quantity: 0.3,
        amount: null,
      }),
    ];
    const b = costBasisFromB3(movements, new Map()).get("ENGI11")!;
    expect(b.quantity).toBe(3);
    // 150 spread over 3.3 shares; the 0.3 fraction leaves with its share of the cost.
    expect(b.cost).toBeCloseTo(136.36, 2);
    expect(b.realized).toBeCloseTo(-13.64, 2);
  });
});

describe("proventos", () => {
  const movements = [
    mv({
      movement: "Rendimento",
      product: "MXRF11 - MAXI RENDA FII",
      date: "2026-09-15",
      amount: 4.4,
    }),
    mv({ movement: "Juros Sobre Capital Próprio", date: "2026-08-20", amount: 1.5 }),
    mv({ movement: "Dividendo", date: "2026-08-21", amount: 2 }),
    mv({ movement: "Dividendo - Transferido", date: "2026-08-21", amount: 2 }),
    mv({ movement: "Dividendo - Transferido", direction: "DEBIT", date: "2026-08-21", amount: 2 }),
  ];

  it("keeps dividends, JCP and FII income, skipping broker transfers", () => {
    const list = proventosFromB3(movements, new Map());
    expect(list.map((p) => p.type)).toEqual(["Rendimentos", "JCP", "Dividendos"]);
    expect(proventosByMonth(list, ["2026-08", "2026-09"])).toEqual([
      { month: "2026-08", Dividendos: 2, JCP: 1.5, Rendimentos: 0, Outros: 0, total: 3.5 },
      { month: "2026-09", Dividendos: 0, JCP: 0, Rendimentos: 4.4, Outros: 0, total: 4.4 },
    ]);
  });

  it("builds holdings with average price, result and yields", () => {
    const basis = costBasisFromB3([mv({ quantity: 5, amount: 200 })], new Map());
    const holdings = buildHoldings(
      [
        {
          ticker: "PETR4",
          name: "PETR4",
          pluggySubtype: "STOCK",
          quantity: 5,
          price: 56,
          value: 280,
          institution: null,
        },
      ],
      basis,
      [
        { date: "2026-08-20", ticker: "PETR4", type: "JCP", amount: 10 },
        { date: "2024-01-01", ticker: "PETR4", type: "Dividendos", amount: 99 },
      ],
      new Map(),
      "2026-10-13",
    );
    expect(holdings[0]).toMatchObject({
      avgPrice: 40,
      cost: 200,
      profit: 80,
      proventos12m: 10,
      proventosTotal: 109,
      yieldOnCost12m: 0.05,
      weight: 1,
      sector: "Petróleo e gás",
    });
    expect(holdings[0]!.profitPct).toBeCloseTo(0.4);
  });

  it("lists statement-only holdings as outside the connections", () => {
    const product = "TIMS3 - TIM S.A.";
    const basis = costBasisFromB3(
      [mv({ product, ticker: "TIMS3", quantity: 5, amount: 75 })],
      new Map(),
    );
    const [h] = buildHoldings([], basis, [], new Map(), "2026-10-13");
    expect(h).toMatchObject({ ticker: "TIMS3", value: null, cost: 75, outsideConnections: true });
  });

  it("totals monthly purchases", () => {
    expect(monthlyPurchases([mv({ date: "2026-10-08", amount: 151.1 })], ["2026-10"])).toEqual([
      { month: "2026-10", total: 151.1 },
    ]);
  });
});

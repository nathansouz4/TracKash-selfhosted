import { describe, expect, it } from "vitest";
import {
  classifyTransaction,
  cleanDescription,
  foldOther,
  monthlyDividends,
  monthlyIncome,
  monthlySpending,
  pendingSpending,
  spendingByAccount,
  splitDescription,
  spendingByCategory,
  type SpendingTransaction,
} from "./spending";

function tx(overrides: Partial<SpendingTransaction>): SpendingTransaction {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: "acc",
    date: "2026-10-05T00:00:00.000Z",
    status: "POSTED",
    description: "COMPRA",
    amount: -100,
    type: "DEBIT",
    accountType: "BANK",
    accountName: "Conta",
    category: "Groceries",
    categoryId: null,
    categoryLabel: "Supermercado",
    groupLabel: "Alimentação",
    merchantName: null,
    counterpartyName: null,
    installmentNumber: null,
    totalInstallments: null,
    purchaseDate: null,
    billId: null,
    ...overrides,
  };
}

describe("classifyTransaction", () => {
  it("counts card purchases as spending", () => {
    expect(classifyTransaction(tx({ accountType: "CREDIT", amount: 50 }))).toBe("expense");
  });

  it("treats the card bill payment as internal on both sides", () => {
    expect(classifyTransaction(tx({ accountType: "BANK", category: "Credit card payment" }))).toBe(
      "internal",
    );
    expect(
      classifyTransaction(
        tx({
          accountType: "CREDIT",
          type: "CREDIT",
          category: null,
          description: "Pagamento recebido",
        }),
      ),
    ).toBe("internal");
  });

  it("treats card debt settlements as internal, keeping late interest as spending", () => {
    const card = { accountType: "CREDIT" as const };
    expect(
      classifyTransaction(tx({ ...card, type: "CREDIT", description: "Desconto (NuFinanceira)" })),
    ).toBe("internal");
    expect(
      classifyTransaction(tx({ ...card, type: "CREDIT", description: "Crédito de parcelamento" })),
    ).toBe("internal");
    expect(
      classifyTransaction(tx({ ...card, type: "CREDIT", description: "Encerramento de dívida" })),
    ).toBe("internal");
    expect(classifyTransaction(tx({ ...card, type: "DEBIT", description: "Acordo" }))).toBe(
      "internal",
    );
    expect(
      classifyTransaction(tx({ ...card, type: "DEBIT", description: "Juros de atraso" })),
    ).toBe("expense");
    expect(
      classifyTransaction(tx({ ...card, type: "CREDIT", description: "Estorno de compra" })),
    ).toBe("refund");
    expect(
      classifyTransaction(tx({ ...card, type: "DEBIT", description: "ACORDOS ALIMENTOS LTDA" })),
    ).toBe("expense");
  });

  it("recognizes bill payments however the bank abbreviates them", () => {
    for (const description of [
      "PAGTO ANTECIPADO PIX",
      "PAGTO. POR DEB EM C/C",
      "Pagamento recebido",
      "PGTO FATURA",
    ]) {
      expect(
        classifyTransaction(
          tx({ accountType: "CREDIT", type: "CREDIT", category: null, description }),
        ),
      ).toBe("internal");
    }
  });

  it("treats investment movements as internal even when Pluggy files them as shopping", () => {
    for (const description of ["Compra de Renda Variável", "Aplicação RDB", "APLICACAO CDB"]) {
      expect(
        classifyTransaction(tx({ category: "Shopping", categoryId: "08000000", description })),
      ).toBe("internal");
    }
    expect(classifyTransaction(tx({ category: "Shopping", description: "LOJA RESGATE PET" }))).toBe(
      "expense",
    );
    expect(
      classifyTransaction(
        tx({ type: "CREDIT", amount: 500, category: null, description: "Resgate RDB" }),
      ),
    ).toBe("internal");
  });

  it("treats card credits that aren't payments as refunds", () => {
    expect(
      classifyTransaction(
        tx({ accountType: "CREDIT", type: "CREDIT", description: "ESTORNO LOJA" }),
      ),
    ).toBe("refund");
  });

  it("ignores transfers between own accounts and investment movements", () => {
    expect(classifyTransaction(tx({ category: "Same person transfer - PIX" }))).toBe("internal");
    expect(classifyTransaction(tx({ category: "Fixed income" }))).toBe("internal");
  });

  it("recognizes dividends", () => {
    expect(
      classifyTransaction(
        tx({ type: "CREDIT", amount: 30, category: "Proceeds interests and dividends" }),
      ),
    ).toBe("dividend");
    expect(
      classifyTransaction(
        tx({
          type: "CREDIT",
          amount: 30,
          category: "Investments",
          description: "DIVIDENDOS ITSA4",
        }),
      ),
    ).toBe("dividend");
    expect(
      classifyTransaction(
        tx({ type: "CREDIT", amount: 30, category: null, description: "JCP BBAS3" }),
      ),
    ).toBe("dividend");
  });

  it("uses the hierarchical category id when present", () => {
    expect(classifyTransaction(tx({ category: "x", categoryId: "05100000" }))).toBe("internal");
    expect(classifyTransaction(tx({ category: "x", categoryId: "04020000" }))).toBe("internal");
    expect(classifyTransaction(tx({ category: "x", categoryId: "03010000" }))).toBe("internal");
    expect(
      classifyTransaction(tx({ type: "CREDIT", amount: 9, category: "x", categoryId: "03060000" })),
    ).toBe("dividend");
    expect(classifyTransaction(tx({ category: "x", categoryId: "10000000" }))).toBe("expense");
  });

  it("treats other bank credits as income", () => {
    expect(classifyTransaction(tx({ type: "CREDIT", amount: 5000, category: "Salary" }))).toBe(
      "income",
    );
  });
});

describe("monthlySpending", () => {
  it("sums spending per month, net of refunds, ignoring internal movements", () => {
    const txns = [
      tx({ accountType: "CREDIT", amount: 100, date: "2026-09-10T00:00:00.000Z" }),
      tx({
        accountType: "CREDIT",
        type: "CREDIT",
        amount: -20,
        description: "ESTORNO",
        date: "2026-09-12T00:00:00.000Z",
      }),
      tx({ category: "Credit card payment", amount: -500, date: "2026-09-15T00:00:00.000Z" }),
      tx({ amount: -40, date: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(monthlySpending(txns, ["2026-09", "2026-10"])).toEqual([
      { month: "2026-09", total: 80 },
      { month: "2026-10", total: 40 },
    ]);
  });

  it("buckets by the ISO date, not the local time zone", () => {
    // UTC midnight on the 1st would be the previous day in Brazil.
    const txns = [tx({ amount: -10, date: "2026-10-01T00:00:00.000Z" })];
    expect(monthlySpending(txns, ["2026-09", "2026-10"])[1]!.total).toBe(10);
  });
});

describe("monthlyDividends", () => {
  it("sums dividend credits per month", () => {
    const txns = [
      tx({ type: "CREDIT", amount: 12.5, category: "Proceeds interests and dividends" }),
      tx({ type: "CREDIT", amount: 7.5, description: "RENDIMENTO FII", category: null }),
      tx({ type: "CREDIT", amount: 3000, category: "Salary" }),
    ];
    expect(monthlyDividends(txns, ["2026-10"])).toEqual([{ month: "2026-10", total: 20 }]);
  });
});

describe("spendingByCategory", () => {
  it("groups the month's spending by top-level category, largest first", () => {
    const txns = [
      tx({ amount: -10, groupLabel: "Transporte" }),
      tx({ amount: -30, groupLabel: "Alimentação" }),
      tx({ amount: -5, groupLabel: "Transporte" }),
      tx({ amount: -99, groupLabel: "Lazer", date: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(spendingByCategory(txns, "2026-10")).toEqual([
      { label: "Alimentação", total: 30, count: 1 },
      { label: "Transporte", total: 15, count: 2 },
    ]);
  });
});

describe("foldOther", () => {
  it("keeps the head and folds the rest into Outros", () => {
    const items = [5, 4, 3, 2, 1].map((n) => ({ label: `c${n}`, total: n, count: 1 }));
    expect(foldOther(items, 2)).toEqual([
      { label: "c5", total: 5, count: 1 },
      { label: "c4", total: 4, count: 1 },
      { label: "Outros", total: 6, count: 3 },
    ]);
  });

  it("doesn't fold a single leftover item", () => {
    const items = [3, 2, 1].map((n) => ({ label: `c${n}`, total: n, count: 1 }));
    expect(foldOther(items, 2)).toHaveLength(3);
  });
});

describe("cleanDescription", () => {
  it("removes installment markers and noise", () => {
    expect(cleanDescription("Uber *Trip 3/10")).toBe("UBER TRIP");
    expect(cleanDescription(null)).toBe("SEM DESCRIÇÃO");
  });
});

describe("monthlyIncome", () => {
  it("sums income and dividends, not internal transfers or card refunds", () => {
    const txns = [
      tx({ type: "CREDIT", amount: 5000, category: "Salary" }),
      tx({ type: "CREDIT", amount: 20, categoryId: "03060000" }),
      tx({ type: "CREDIT", amount: 900, categoryId: "04020000" }),
      tx({ type: "CREDIT", amount: 15, accountType: "CREDIT", description: "ESTORNO" }),
    ];
    expect(monthlyIncome(txns, "2026-10")).toBe(5020);
  });
});

describe("pendingSpending", () => {
  it("groups only pending spending", () => {
    const txns = [
      tx({ status: "PENDING", accountType: "CREDIT", amount: 40, groupLabel: "Viagens" }),
      tx({ status: "PENDING", accountType: "CREDIT", amount: 10, groupLabel: "Viagens" }),
      tx({ status: "POSTED", accountType: "CREDIT", amount: 99, groupLabel: "Viagens" }),
    ];
    expect(pendingSpending(txns)).toEqual([{ label: "Viagens", total: 50, count: 2 }]);
  });
});

describe("splitDescription", () => {
  it("puts the counterparty first for 'action|name' descriptions", () => {
    expect(splitDescription("Pagamento efetuado|UNIMED NATAL")).toEqual({
      title: "UNIMED NATAL",
      detail: "Pagamento efetuado",
    });
    expect(splitDescription("IFOOD")).toEqual({ title: "IFOOD", detail: null });
    expect(splitDescription(null)).toEqual({ title: "Sem descrição", detail: null });
  });
});

describe("spendingByAccount", () => {
  it("splits the month's spending by where the money left from", () => {
    const txns = [
      tx({ accountType: "CREDIT", accountName: "Visa", amount: 100 }),
      tx({ accountName: "Conta", amount: -30, category: "Transfer - PIX" }),
      tx({ accountName: "Conta", category: "Credit card payment", amount: -100 }),
    ];
    expect(spendingByAccount(txns, "2026-10")).toEqual([
      { label: "Visa", total: 100, count: 1 },
      { label: "Conta", total: 30, count: 1 },
    ]);
  });
});

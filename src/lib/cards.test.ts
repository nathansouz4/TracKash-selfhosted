import { describe, expect, it } from "vitest";
import {
  activePlans,
  addMonthsToDate,
  installmentPlans,
  installmentSchedule,
  openBillAmount,
  openCycle,
} from "./cards";
import type { SpendingTransaction } from "./spending";

type CardTx = SpendingTransaction;

function tx(overrides: Partial<CardTx>): CardTx {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: "card",
    date: "2026-10-05T00:00:00.000Z",
    status: "PENDING",
    description: "LOJA",
    amount: 100,
    type: "DEBIT",
    accountType: "CREDIT",
    accountName: "Visa",
    category: null,
    categoryId: null,
    categoryLabel: "Compras",
    groupLabel: "Compras",
    merchantName: null,
    counterpartyName: null,
    installmentNumber: null,
    totalInstallments: null,
    purchaseDate: null,
    billId: null,
    ...overrides,
  };
}

describe("addMonthsToDate", () => {
  it("clamps the day to the target month", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2026-09-22", 1)).toBe("2026-10-22");
    expect(addMonthsToDate("2026-12-05", 1)).toBe("2027-01-05");
  });
});

describe("openCycle / openBillAmount", () => {
  const bills = [
    { closingDate: "2026-08-21", dueDate: "2026-09-05" },
    { closingDate: "2026-09-22", dueDate: "2026-10-05" },
  ];

  it("projects the open bill dates from the last closed bill", () => {
    expect(openCycle(bills)).toEqual({
      lastClose: "2026-09-22",
      nextClose: "2026-10-22",
      nextDue: "2026-11-05",
    });
  });

  it("sums unbilled spending inside the cycle, ignoring payments and future installments", () => {
    const txns = [
      tx({ date: "2026-09-25T00:00:00.000Z", amount: 200 }),
      tx({ date: "2026-10-10T00:00:00.000Z", amount: 50 }),
      tx({
        date: "2026-10-01T00:00:00.000Z",
        type: "CREDIT",
        amount: -1234.56,
        description: "PAGAMENTO RECEBIDO",
      }),
      tx({
        date: "2026-10-02T00:00:00.000Z",
        type: "CREDIT",
        amount: -30,
        description: "ESTORNO LOJA",
      }),
      tx({ date: "2026-09-20T00:00:00.000Z", amount: 999, billId: "closed" }),
      tx({
        date: "2026-11-22T00:00:00.000Z",
        amount: 100.25,
        installmentNumber: 4,
        totalInstallments: 5,
      }),
    ];
    expect(openBillAmount(txns, openCycle(bills), "2026-10-13")).toBe(220);
  });
});

describe("installmentPlans", () => {
  it("handles banks that only list billed installments (e.g. some big retail banks)", () => {
    const base = {
      description: "LOJA EXEMPLO 2/4",
      totalInstallments: 4,
      purchaseDate: "2026-08-04T00:00:00.000Z",
      amount: 800,
    };
    const plans = installmentPlans(
      [
        tx({ ...base, installmentNumber: 2, date: "2026-09-04T00:00:00.000Z", billId: "b1" }),
        tx({
          ...base,
          description: "LOJA EXEMPLO 3/4",
          installmentNumber: 3,
          date: "2026-10-05T00:00:00.000Z",
        }),
      ],
      "2026-10-13",
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      description: "LOJA EXEMPLO",
      current: 3,
      total: 4,
      remaining: 1,
      remainingAmount: 800,
      endMonth: "2026-11",
    });
  });

  it("uses future-dated installments when the bank lists them (e.g. some digital banks)", () => {
    const base = {
      description: "KaBuM!",
      totalInstallments: 5,
      purchaseDate: "2026-08-22T00:00:00.000Z",
    };
    const plans = installmentPlans(
      [
        tx({
          ...base,
          installmentNumber: 1,
          amount: 100.25,
          date: "2026-08-22T00:00:00.000Z",
          billId: "a",
        }),
        tx({
          ...base,
          installmentNumber: 2,
          amount: 100.25,
          date: "2026-08-29T00:00:00.000Z",
          billId: "b",
        }),
        tx({ ...base, installmentNumber: 3, amount: 100.25, date: "2026-09-28T00:00:00.000Z" }),
        tx({ ...base, installmentNumber: 4, amount: 100.25, date: "2026-11-22T00:00:00.000Z" }),
        tx({ ...base, installmentNumber: 5, amount: 100.24, date: "2026-12-22T00:00:00.000Z" }),
      ],
      "2026-10-13",
    );
    expect(plans[0]).toMatchObject({
      current: 3,
      remaining: 2,
      remainingAmount: 200.49,
      endMonth: "2026-12",
    });
    expect(installmentSchedule(plans, "2026-10", 3)).toEqual([
      { month: "2026-11", total: 100.25 },
      { month: "2026-12", total: 100.24 },
      { month: "2027-01", total: 0 },
    ]);
  });

  it("keeps a plan active while its last installment is in the current month", () => {
    const plans = installmentPlans(
      [
        tx({
          installmentNumber: 3,
          totalInstallments: 3,
          date: "2026-10-05T00:00:00.000Z",
          purchaseDate: "2026-08-03T00:00:00.000Z",
        }),
      ],
      "2026-10-13",
    );
    expect(activePlans(plans, "2026-10")).toHaveLength(1);
    expect(activePlans(plans, "2026-11")).toHaveLength(0);
  });
});

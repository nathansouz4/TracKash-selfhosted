import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, addMonths, todayIso } from "@/lib/dates";
import { closeDatabase, get, run, upsert } from "./db.server";
import type {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from "./pluggy.server";
import {
  cardsData,
  connectionsData,
  flowData,
  investmentsData,
  overviewData,
  removeItem,
  setAccountIgnored,
  setInvestmentLiquidity,
  setItemInstitution,
} from "./queries.server";
import {
  applyDuplicateRules,
  mapAccount,
  mapBill,
  mapInvestment,
  mapInvestmentTransaction,
  mapSnapshot,
  mapTransaction,
  syncStatus,
  upsertItem,
} from "./sync.server";

// The read models over a real (in-memory) SQLite database with made-up data:
// catches SQL that SQLite rejects and rows that don't reach the pages.

const ITEM = "00000000-0000-0000-0000-0000000000a1";
const today = todayIso();
const month = today.slice(0, 7);
const lastMonth = addMonths(month, -1);

function item(): PluggyItem {
  return {
    id: ITEM,
    status: "UPDATED",
    executionStatus: "SUCCESS",
    lastUpdatedAt: `${today}T03:00:00.000Z`,
    connector: { id: 1, name: "MeuPluggy", imageUrl: null },
  };
}

function account(overrides: Partial<PluggyAccount>): PluggyAccount {
  return {
    id: "acc-bank",
    itemId: ITEM,
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    number: "0001/12340000-0",
    name: "Conta corrente",
    marketingName: null,
    balance: 5_000,
    currencyCode: "BRL",
    bankData: { transferNumber: null },
    creditData: null,
    ...overrides,
  };
}

function txn(overrides: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: "t",
    accountId: "acc-bank",
    date: `${today}T12:00:00.000Z`,
    description: "LOJA EXEMPLO",
    amount: -100,
    amountInAccountCurrency: null,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    category: "Shopping",
    categoryId: "08000000",
    operationType: null,
    merchant: null,
    paymentData: null,
    creditCardMetadata: null,
    ...overrides,
  };
}

function investment(overrides: Partial<PluggyInvestment>): PluggyInvestment {
  return {
    id: "inv-cdb",
    itemId: ITEM,
    code: null,
    isin: null,
    name: "CDB BANCO EXEMPLO",
    type: "FIXED_INCOME",
    subtype: "CDB",
    status: "ACTIVE",
    currencyCode: "BRL",
    balance: 10_000,
    amount: 10_000,
    amountOriginal: 9_000,
    amountProfit: 1_000,
    amountWithdrawal: null,
    quantity: null,
    value: null,
    taxes: null,
    taxes2: null,
    rate: 100,
    rateType: "CDI",
    fixedAnnualRate: null,
    annualRate: null,
    lastMonthRate: null,
    lastTwelveMonthsRate: null,
    date: `${today}T00:00:00.000Z`,
    dueDate: "2030-01-01T00:00:00.000Z",
    issueDate: null,
    purchaseDate: null,
    issuer: "BANCO EXEMPLO",
    institution: { name: "BANCO EXEMPLO" },
    ...overrides,
  };
}

beforeAll(() => {
  process.env["TRACKASH_DB_PATH"] = ":memory:";
  closeDatabase();

  upsertItem(item(), { name: "BANCO EXEMPLO", imageUrl: null, color: null });
  upsert(
    "accounts",
    [
      account({}),
      account({
        id: "acc-card",
        type: "CREDIT",
        subtype: "CREDIT_CARD",
        number: "0000",
        name: "Cartão Exemplo",
        balance: 1_500,
        creditData: {
          level: "GOLD",
          brand: "VISA",
          balanceCloseDate: `${today}T00:00:00.000Z`,
          balanceDueDate: `${addDays(today, 10)}T00:00:00.000Z`,
          availableCreditLimit: 3_500,
          creditLimit: 5_000,
          minimumPayment: null,
        },
      }),
    ].map(mapAccount),
    ["id"],
  );
  upsert(
    "transactions",
    [
      txn({ id: "t-debit" }),
      txn({
        id: "t-salary",
        type: "CREDIT",
        amount: 8_000,
        description: "SALARIO",
        categoryId: "01000000",
      }),
      txn({
        id: "t-card",
        accountId: "acc-card",
        amount: 250,
        date: `${lastMonth}-15T12:00:00.000Z`,
        creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, billId: "bill-1" },
      }),
    ].map(mapTransaction),
    ["id"],
  );
  const bill: PluggyBill = {
    id: "bill-1",
    dueDate: `${month}-05T00:00:00.000Z`,
    billClosingDate: `${lastMonth}-27T00:00:00.000Z`,
    totalAmount: 250,
    totalAmountCurrencyCode: "BRL",
    minimumPaymentAmount: null,
    financeCharges: [],
    payments: [{ valueType: "TOTAL", paymentDate: `${month}-05T00:00:00.000Z`, amount: 250 }],
  };
  upsert("credit_card_bills", [mapBill("acc-card", bill)], ["id"]);

  const investments = [
    investment({}),
    investment({
      id: "inv-stock",
      code: "ABCD3",
      name: "EMPRESA EXEMPLO ON",
      type: "EQUITY",
      subtype: "STOCK",
      balance: 2_000,
      quantity: 100,
      value: 20,
      amountOriginal: null,
      amountProfit: null,
      rate: null,
      rateType: null,
      issuer: null,
    }),
  ];
  upsert("investments", investments.map(mapInvestment), ["id"]);
  for (const [days, factor] of [
    [-2, 0.98],
    [-1, 0.99],
    [0, 1],
  ] as const) {
    upsert(
      "investment_snapshots",
      investments.map((i) =>
        mapSnapshot({ ...i, balance: (i.balance ?? 0) * factor }, addDays(today, days)),
      ),
      ["investment_id", "snapshot_date"],
      { touchUpdatedAt: false },
    );
  }
  const buy: PluggyInvestmentTransaction = {
    id: "it-1",
    type: "BUY",
    movementType: "CREDIT",
    description: null,
    quantity: 10,
    value: 19,
    amount: 190,
    netAmount: 190,
    date: `${today}T00:00:00.000Z`,
    tradeDate: null,
  };
  upsert("investment_transactions", [mapInvestmentTransaction("inv-stock", buy)], ["id"]);

  // A B3 statement: purchase and a dividend before today.
  const statementDay = addDays(today, -30);
  const importId = run(
    "insert into b3_imports (file_name, rows_read, rows_inserted, period_start, period_end) values ('extrato.xlsx', 2, 2, ?, ?)",
    statementDay,
    statementDay,
  ).lastInsertRowid;
  for (const [id, movement, quantity, amount] of [
    ["b3-1", "Transferência - Liquidação", 90, 1_620],
    ["b3-2", "Dividendo", 90, 45],
  ] as const) {
    run(
      `insert into b3_movements (id, import_id, direction, date, movement, product, ticker, institution, quantity, unit_price, amount)
       values (?, ?, 'CREDIT', ?, ?, 'ABCD3 - EMPRESA EXEMPLO S.A.', 'ABCD3', 'CORRETORA EXEMPLO', ?, null, ?)`,
      id,
      importId,
      statementDay,
      movement,
      quantity,
      amount,
    );
  }
  run("insert into sync_runs (status, finished_at, stats) values ('success', ?, ?)", today, {
    items: 1,
  });
});

afterAll(() => closeDatabase());

describe("read models over SQLite", () => {
  it("builds the overview", () => {
    const data = overviewData();
    expect(data.connections).toBe(1);
    expect(data.cash).toBe(5_000);
    expect(data.invested).toBe(12_000);
    expect(data.netWorth).toBe(17_000);
    expect(data.cardLimit).toBe(5_000);
    expect(data.institutions[0]?.name).toBe("BANCO EXEMPLO");
    expect(data.lastSync?.status).toBe("success");
    expect(data.dividends12m).toBe(45);
  });

  it("builds the cash flow of a month", () => {
    const data = flowData(month);
    expect(data.transactions.map((t) => t.id).sort()).toEqual(["t-debit", "t-salary"]);
    expect(data.income).toBe(8_000);
    expect(data.bills).toHaveLength(1);
  });

  it("builds the cards page", () => {
    const data = cardsData(lastMonth, "acc-card");
    expect(data.cardId).toBe("acc-card");
    expect(data.transactions.map((t) => t.id)).toEqual(["t-card"]);
    expect(data.bills[0]).toMatchObject({ dueDate: `${month}-05`, total: 250 });
    expect(data.plans).toHaveLength(1);
  });

  it("builds investments, with the B3 statement and newer Pluggy buys", () => {
    const data = investmentsData();
    expect(data.total).toBe(12_000);
    expect(data.series.length).toBeGreaterThan(0);
    const holding = data.equities.holdings.find((h) => h.ticker === "ABCD3");
    // 90 shares from the statement + 10 bought after it, through Pluggy.
    expect(holding?.cost).toBe(1_810);
    expect(data.equities.incomeTotal).toBe(45);
    expect(data.equities.b3?.totalMovements).toBe(2);
  });

  it("applies the owner's choices", () => {
    expect(setInvestmentLiquidity("inv-cdb", "daily")).toBe(true);
    expect(investmentsData().positions.find((p) => p.id === "inv-cdb")?.liquidity).toBe("daily");

    expect(setItemInstitution(ITEM, { name: "OUTRO BANCO", imageUrl: null, color: null })).toBe(
      true,
    );
    upsertItem(item(), { name: "BANCO EXEMPLO", imageUrl: null, color: null });
    expect(connectionsData().items[0]).toMatchObject({
      name: "OUTRO BANCO",
      institutionLocked: true,
    });

    expect(setAccountIgnored("acc-card", true)).toBe(true);
    applyDuplicateRules();
    expect(overviewData().cards).toHaveLength(0);
    expect(connectionsData().items[0]?.accountList.find((a) => a.id === "acc-card")).toMatchObject({
      ignored: true,
      ignoredBy: "user",
    });
  });

  it("recognizes a sync left behind by a process that is gone", () => {
    run("insert into sync_runs (status, pid) values ('running', ?)", 2 ** 22 + 1);
    const status = syncStatus();
    expect(status.running).toBe(false);
    expect(status.lastRun?.status).toBe("error");
    expect(status.lastSuccessAt).not.toBeNull();
  });

  it("removes a connection with everything imported from it", () => {
    expect(removeItem(ITEM)).toBe(true);
    for (const table of ["accounts", "transactions", "credit_card_bills", "investments"]) {
      expect(get<{ n: number }>(`select count(*) as n from ${table}`)?.n).toBe(0);
    }
    expect(get<{ n: number }>("select count(*) as n from investment_snapshots")?.n).toBe(0);
    // The B3 statement is the owner's, not the connection's.
    expect(get<{ n: number }>("select count(*) as n from b3_movements")?.n).toBe(2);
  });
});

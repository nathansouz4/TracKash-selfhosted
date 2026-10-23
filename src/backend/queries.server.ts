import { monthEndBalances } from "@/lib/balances";
import {
  activePlans,
  installmentPlans,
  installmentSchedule,
  openBillAmount,
  openCycle,
} from "@/lib/cards";
import { assetProfile } from "@/lib/b3-assets";
import { categoryLabel } from "@/lib/categories";
import { internalMovementIds } from "@/lib/internal-movements";
import { portfolioHealth, positionLiquidity } from "@/lib/portfolio-health";
import {
  buildHoldings,
  costBasisFromB3,
  groupTotals,
  monthlyPurchases,
  proventosByMonth,
  proventosFromB3,
  tickerAliases,
  type Provento,
} from "@/lib/equities";
import { addMonths, monthRange, todayIso } from "@/lib/dates";
import {
  allocationByClass,
  assetClass,
  bucketOf,
  concentration,
  monthlyNetFlows,
  portfolioSeries,
  positionMetrics,
  riskStats,
  type InvestmentFlow,
} from "@/lib/investments";
import {
  average,
  foldOther,
  monthlyDividends,
  monthlyIncome,
  monthlySpending,
  pendingSpending,
  spendingAmount,
  spendingByCategory,
  spendingByAccount,
  spendingByMerchant,
  splitDescription,
  type SpendingTransaction,
} from "@/lib/spending";
import { lastB3Import, loadB3Movements } from "./b3.server";
import { all, get, run } from "./db.server";

// Read models for the dashboards, over the local database. Only aggregated /
// display-ready data leaves the server. Ignored accounts are left out everywhere.

const CATEGORY_SLOTS = 7; // + "Outros" = 8 = size of the categorical palette

function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** Banks sometimes send a generic marketing name ("OUTROS"); fall back to the account name. */
export function accountDisplayName(marketingName: string | null, name: string | null): string {
  const marketing = marketingName?.trim();
  const usable = marketing && marketing.toUpperCase() !== "OUTROS" ? marketing : name?.trim();
  return usable || "Conta";
}

// ---------------------------------------------------------------------------
// Shared loaders
// ---------------------------------------------------------------------------

type AccountRow = {
  id: string;
  item_id: string;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  name: string | null;
  marketing_name: string | null;
  number_last4: string | null;
  balance: number | null;
  credit_limit: number | null;
  available_credit_limit: number | null;
  balance_due_date: string | null;
  balance_close_date: string | null;
  card_brand: string | null;
  connector_name: string | null;
  connector_image_url: string | null;
};

function loadAccounts() {
  const rows = all<AccountRow>(`
    select a.id, a.item_id, a.type, a.subtype, a.name, a.marketing_name, a.number_last4, a.balance,
           a.credit_limit, a.available_credit_limit, a.balance_due_date, a.balance_close_date,
           a.card_brand,
           coalesce(i.institution_name, i.connector_name) as connector_name,
           coalesce(i.institution_image_url, i.connector_image_url) as connector_image_url
    from accounts a join pluggy_items i on i.id = a.item_id
    where not a.ignored
    order by a.type, a.balance desc nulls last
  `);
  return rows.map((a) => ({
    id: a.id,
    itemId: a.item_id,
    type: a.type,
    subtype: a.subtype,
    name: accountDisplayName(a.marketing_name, a.name),
    institution: a.connector_name ?? "Instituição",
    imageUrl: a.connector_image_url,
    last4: a.number_last4,
    balance: a.balance ?? 0,
    creditLimit: a.credit_limit,
    availableCredit: a.available_credit_limit,
    dueDate: a.balance_due_date,
    closeDate: a.balance_close_date,
    brand: a.card_brand,
  }));
}

export type AccountSummary = ReturnType<typeof loadAccounts>[number];

type TransactionRow = {
  id: string;
  account_id: string;
  date: string;
  status: string | null;
  description: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  account_type: "BANK" | "CREDIT";
  account_name: string | null;
  category: string | null;
  category_id: string | null;
  category_translated: string | null;
  group_translated: string | null;
  group_description: string | null;
  merchant_name: string | null;
  counterparty_name: string | null;
  installment_number: number | null;
  total_installments: number | null;
  purchase_date: string | null;
  bill_id: string | null;
};

function loadTransactions(fromMonth: string): SpendingTransaction[] {
  const rows = all<TransactionRow>(
    `
    select t.id, t.account_id, t.date, t.status, t.description, t.amount, t.type, a.type as account_type,
           trim(coalesce(case when upper(a.marketing_name) = 'OUTROS' then null else a.marketing_name end, a.name)) as account_name,
           t.category, t.category_id, c.description_translated as category_translated,
           g.description_translated as group_translated, g.description as group_description,
           t.merchant_name, t.counterparty_name, t.installment_number, t.total_installments,
           t.purchase_date, t.bill_id
    from transactions t
    -- Ignored accounts (e.g. a card duplicated by another connection) are left out.
    join accounts a on a.id = t.account_id and not a.ignored
    left join categories c on c.id = t.category_id
    -- top-level group: ids are hierarchical ("03060000" belongs to "03000000")
    left join categories g on g.id = substr(t.category_id, 1, 2) || '000000'
    where t.date >= ?
    order by t.date desc
  `,
    `${fromMonth}-01`,
  );
  const list: SpendingTransaction[] = rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    date: r.date,
    status: r.status,
    description: r.description,
    amount: r.amount,
    type: r.type,
    accountType: r.account_type,
    accountName: r.account_name?.trim() || "Conta",
    category: r.category,
    categoryId: r.category_id,
    categoryLabel: r.category_translated ?? categoryLabel(r.category),
    groupLabel:
      r.group_translated ??
      (r.group_description ? categoryLabel(r.group_description) : null) ??
      r.category_translated ??
      categoryLabel(r.category),
    merchantName: r.merchant_name,
    counterpartyName: r.counterparty_name,
    installmentNumber: r.installment_number,
    totalInstallments: r.total_installments,
    purchaseDate: r.purchase_date,
    billId: r.bill_id,
  }));
  return markInternalTransfers(list);
}

/** Flags transfers between the owner's own accounts (bill payments, Pix to oneself). */
function markInternalTransfers(list: SpendingTransaction[]): SpendingTransaction[] {
  const cardNames = [
    ...new Set(list.filter((t) => t.accountType === "CREDIT").map((t) => t.accountName)),
  ];
  const internal = internalMovementIds(list, cardNames);
  return list.map((t) => (internal.has(t.id) ? { ...t, internalTransfer: true } : t));
}

type InvestmentRow = {
  id: string;
  value: number | null;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  issuer: string | null;
  institution_name: string | null;
  connector_name: string | null;
  connector_image_url: string | null;
  balance: number | null;
  amount_original: number | null;
  amount_profit: number | null;
  quantity: number | null;
  rate: number | null;
  rate_type: string | null;
  fixed_annual_rate: number | null;
  last_month_rate: number | null;
  last_twelve_months_rate: number | null;
  due_date: string | null;
  status: string | null;
  liquidity: "daily" | "maturity" | null;
};

function loadPositions() {
  const rows = all<InvestmentRow>(`
    select v.id, v.name, v.code, v.type, v.subtype, v.issuer, v.institution_name, v.value,
           coalesce(i.institution_name, i.connector_name) as connector_name,
           coalesce(i.institution_image_url, i.connector_image_url) as connector_image_url, v.balance, v.amount_original, v.amount_profit, v.quantity, v.rate,
           v.rate_type, v.fixed_annual_rate, v.last_month_rate, v.last_twelve_months_rate,
           v.due_date, v.status, v.liquidity
    from investments v join pluggy_items i on i.id = v.item_id
    where coalesce(v.balance, 0) > 0
    order by v.balance desc
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    type: r.type,
    subtype: r.subtype,
    issuer: r.issuer,
    institution: r.connector_name ?? r.institution_name,
    imageUrl: r.connector_image_url,
    balance: r.balance ?? 0,
    price: r.value,
    amountOriginal: r.amount_original,
    amountProfit: r.amount_profit,
    quantity: r.quantity,
    rate: r.rate,
    rateType: r.rate_type,
    fixedAnnualRate: r.fixed_annual_rate,
    lastMonthRate: r.last_month_rate,
    lastTwelveMonthsRate: r.last_twelve_months_rate,
    dueDate: r.due_date,
    status: r.status,
    liquidity: r.liquidity,
  }));
}

function loadPortfolioHistory() {
  const totals = all<{ snapshot_date: string; value: number }>(`
    select snapshot_date, sum(balance) as value
    from investment_snapshots
    group by snapshot_date
    order by snapshot_date
  `);
  const flows = all<InvestmentFlow>(
    "select date, type, amount, quantity, value from investment_transactions order by date",
  );
  const series = portfolioSeries(
    totals.map((t) => ({ date: t.snapshot_date, value: t.value })),
    flows,
  );
  return { series, flows };
}

function loadLastSync() {
  const run = get<{
    started_at: string;
    finished_at: string | null;
    status: string;
    error: string | null;
  }>("select started_at, finished_at, status, error from sync_runs order by id desc limit 1");
  return run
    ? {
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        status: run.status,
        error: run.error,
      }
    : null;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((s, i) => s + value(i), 0);
}

function allocationByInstitution(positions: { institution: string | null; balance: number }[]) {
  const total = sumBy(positions, (p) => p.balance);
  return [...groupBy(positions, (p) => p.institution ?? "Outras")]
    .map(([label, items]) => {
      const value = sumBy(items, (p) => p.balance);
      return { label, total: value, share: total > 0 ? value / total : 0, count: items.length };
    })
    .sort((a, b) => b.total - a.total);
}

/** The selected month's rows as the browser needs them, already classified. */
function monthTransactionRows(txns: SpendingTransaction[], month: string) {
  return txns
    .filter((t) => t.date.startsWith(month))
    .map((t) => {
      const { title, detail } = splitDescription(t.description);
      return {
        id: t.id,
        date: t.date,
        title: t.merchantName ?? t.counterpartyName ?? title,
        detail: t.merchantName || t.counterpartyName ? title : detail,
        accountId: t.accountId,
        accountName: t.accountName,
        category: t.categoryLabel,
        pending: t.status === "PENDING",
        direction: t.type === "CREDIT" ? ("in" as const) : ("out" as const),
        amount: Math.abs(t.amount),
        spending: spendingAmount(t),
        installment:
          t.installmentNumber && t.totalInstallments
            ? `${t.installmentNumber}/${t.totalInstallments}`
            : null,
      };
    });
}

export type TransactionRowDto = ReturnType<typeof monthTransactionRows>[number];

function billMonthlyTotals(bills: { due_date: string; total_amount: number }[], lastMonth: string) {
  const months = monthRange(lastMonth, 12);
  const totals = new Map(months.map((m) => [m, 0]));
  for (const b of bills) {
    const m = b.due_date.slice(0, 7);
    if (totals.has(m)) totals.set(m, totals.get(m)! + b.total_amount);
  }
  return months.map((month) => ({
    month,
    total: Math.round((totals.get(month) ?? 0) * 100) / 100,
  }));
}

type BillRow = {
  id: string;
  account_id: string;
  due_date: string;
  closing_date: string | null;
  total_amount: number;
};

function loadBills(fromMonth: string) {
  return all<BillRow>(
    `
    select id, account_id, due_date, closing_date, total_amount
    from credit_card_bills
    where due_date >= ?
      and account_id in (select id from accounts where not ignored)
    order by due_date desc
  `,
    `${fromMonth}-01`,
  );
}

/**
 * Per card: the open bill (computed — Pluggy's balance is the used limit,
 * future installments included) and its projected closing/due dates.
 */
function cardSummaries(
  cards: AccountSummary[],
  txns: SpendingTransaction[],
  bills: BillRow[],
  today: string,
) {
  return cards.map((c) => {
    const cycle = openCycle(
      bills
        .filter((b) => b.account_id === c.id)
        .map((b) => ({ closingDate: b.closing_date, dueDate: b.due_date })),
    );
    const used =
      c.creditLimit != null && c.availableCredit != null
        ? c.creditLimit - c.availableCredit
        : Math.max(c.balance, 0);
    return {
      id: c.id,
      name: c.name,
      last4: c.last4,
      brand: c.brand,
      institution: c.institution,
      imageUrl: c.imageUrl,
      openBill: openBillAmount(
        txns.filter((t) => t.accountId === c.id),
        cycle,
        today,
      ),
      nextClose: cycle.nextClose,
      nextDue: cycle.nextDue,
      used,
      creditLimit: c.creditLimit,
      availableCredit: c.availableCredit,
      usage: c.creditLimit ? used / c.creditLimit : null,
    };
  });
}

/** Asset class of a position; listed assets use the B3-aware profile (fixes Pluggy's subtypes). */
function classifyPosition(p: {
  type: string;
  subtype: string | null;
  code: string | null;
  name: string;
}) {
  if ((p.type === "EQUITY" || p.type === "ETF") && p.code) {
    return assetProfile(p.code, p.name, p.subtype).assetClass;
  }
  return assetClass(p.type, p.subtype);
}

type EquityMovementRow = {
  code: string | null;
  inv_type: string;
  subtype: string | null;
  type: string | null;
  date: string;
  quantity: number | null;
  amount: number | null;
  value: number | null;
};

/** Pluggy movements of listed assets (buys and income), used after the last B3 statement. */
function loadEquityMovements() {
  return all<EquityMovementRow>(`
    select v.code, v.type as inv_type, v.subtype, t.type, t.date, t.quantity, t.amount, t.value
    from investment_transactions t join investments v on v.id = t.investment_id
    where v.type in ('EQUITY', 'ETF') and v.code is not null
  `);
}

/**
 * Variable income: B3 statement (cost basis, dividends) + Pluggy (positions,
 * and movements newer than the statement).
 */
function loadEquityData() {
  const movements = loadB3Movements();
  const pluggyMoves = loadEquityMovements();
  const b3 = lastB3Import();
  const statementEnd = b3?.periodEnd ?? "0000-00-00";
  const aliases = tickerAliases(movements);

  const proventos: Provento[] = proventosFromB3(movements, aliases);
  const extraBuys: typeof movements = [];
  for (const m of pluggyMoves) {
    const date = m.date.slice(0, 10);
    if (date <= statementEnd || !m.code) continue;
    const kind = (m.type ?? "").toUpperCase();
    if (kind === "BUY" && m.quantity && m.amount) {
      extraBuys.push({
        direction: "CREDIT",
        date,
        movement: "Transferência - Liquidação",
        product: m.code,
        ticker: m.code,
        institution: null,
        quantity: m.quantity,
        unitPrice: m.value,
        amount: Math.abs(m.amount),
      });
    } else if (!["BUY", "SELL", "TAX", "TRANSFER"].includes(kind) && m.amount) {
      const fii = assetProfile(m.code, null, m.subtype).assetClass === "FIIs";
      const type = /JCP|EQUITY_INTEREST|INTEREST_ON/.test(kind)
        ? "JCP"
        : /DIVIDEND/.test(kind)
          ? "Dividendos"
          : fii
            ? "Rendimentos"
            : "Outros";
      proventos.push({ date, ticker: m.code, type, amount: Math.abs(m.amount) });
    }
  }

  const productNames = new Map<string, string>();
  for (const m of movements) {
    if (m.ticker)
      productNames.set(
        aliases.get(m.ticker) ?? m.ticker,
        m.product.split(" - ").slice(1).join(" - ").trim(),
      );
  }
  return {
    movements: [...movements, ...extraBuys],
    proventos,
    basis: costBasisFromB3([...movements, ...extraBuys], aliases),
    productNames,
    b3,
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function overviewData() {
  const month = currentMonth();
  const months = monthRange(month, 12);
  const accounts = loadAccounts();
  const txns = loadTransactions(months[0]!);
  const positions = loadPositions();
  const lastSync = loadLastSync();
  const bills = loadBills(addMonths(month, -3));
  const equity = loadEquityData();

  const bankAccounts = accounts.filter((a) => a.type === "BANK");
  const cards = accounts.filter((a) => a.type === "CREDIT");
  const cash = sumBy(bankAccounts, (a) => a.balance);
  // Everything owed on cards (open bill + future installments) = used limit.
  const cardDebt = sumBy(cards, (a) => Math.max(a.balance, 0));
  const cardInfo = cardSummaries(cards, txns, bills, todayIso());
  const cardLimit = sumBy(cards, (a) => a.creditLimit ?? 0);
  const invested = sumBy(positions, (p) => p.balance);
  const spending = monthlySpending(txns, months);
  const bankIds = new Set(bankAccounts.map((a) => a.id));

  const institutions = [...groupBy(bankAccounts, (a) => a.itemId)]
    .map(([, list]) => ({
      name: list[0]!.institution,
      imageUrl: list[0]!.imageUrl,
      total: sumBy(list, (a) => a.balance),
      accounts: list.map((a) => ({
        id: a.id,
        name: a.name,
        last4: a.last4,
        subtype: a.subtype,
        balance: a.balance,
      })),
    }))
    .sort((a, b) => b.total - a.total)
    .map((i) => ({ ...i, share: cash > 0 ? i.total / cash : 0 }));

  return {
    month,
    connections: countItems(),
    lastSync,
    // Card bills are paid from recurring income, so they don't reduce net worth.
    netWorth: cash + invested,
    cash,
    invested,
    cardDebt,
    cardLimit,
    cardUsage: cardLimit > 0 ? cardDebt / cardLimit : null,
    institutions,
    cards: cardInfo,
    openBills: sumBy(cardInfo, (c) => c.openBill),
    investmentsCount: positions.length,
    allocation: allocationByClass(positions, classifyPosition),
    allocationByInstitution: allocationByInstitution(positions),
    balanceHistory: monthEndBalances(
      cash,
      txns.filter((t) => bankIds.has(t.accountId)),
      months,
    ),
    spending,
    spendingThisMonth: spending.at(-1)?.total ?? 0,
    spendingLastMonth: spending.at(-2)?.total ?? 0,
    spendingAverage: average(spending.slice(0, -1).map((s) => s.total)),
    // Income from the B3 statement when imported; otherwise credits in the bank accounts.
    dividends12m:
      equity.proventos.length > 0
        ? sumBy(
            equity.proventos.filter((p) => p.date >= `${months[0]}-01`),
            (p) => p.amount,
          )
        : sumBy(monthlyDividends(txns, months), (d) => d.total),
    pendingTotal: sumBy(pendingSpending(txns), (p) => p.total),
  };
}

/** Bank deposits covered by the FGC (up to R$ 250k per issuer and CPF). */
const FGC_SUBTYPES = new Set(["CDB", "RDB", "LC", "LCI", "LCA", "LH"]);

export function investmentsData() {
  const today = todayIso();
  const months = monthRange(today.slice(0, 7), 12);
  const months24 = monthRange(today.slice(0, 7), 24);
  const positions = loadPositions();
  const history = loadPortfolioHistory();
  const equity = loadEquityData();

  const rows = positions.map((p) => ({
    ...p,
    assetClass: classifyPosition(p),
    bucket: bucketOf(p.type),
    ...positionMetrics(p),
    // Owner's setting (p.liquidity) wins; otherwise the automatic rule.
    liquidityResolved: positionLiquidity(p, today),
    liquidityAuto: positionLiquidity({ ...p, liquidity: null }, today),
  }));
  const total = sumBy(rows, (r) => r.balance);
  const known = rows.filter((r) => r.invested != null && r.profit != null);
  const investedKnown = sumBy(known, (r) => r.invested!);
  const profitKnown = sumBy(known, (r) => r.profit!);

  // --- Variable income ---------------------------------------------------
  const listed = rows.filter((r) => r.bucket === "Renda variável" && r.code);
  const holdings = buildHoldings(
    listed.map((r) => ({
      ticker: r.code!,
      name: r.name,
      pluggySubtype: r.subtype,
      quantity: r.quantity,
      price: r.price,
      value: r.balance,
      institution: r.institution,
    })),
    equity.basis,
    equity.proventos,
    equity.productNames,
    today,
  );
  const held = holdings.filter((h) => h.value != null);
  const marketValue = sumBy(held, (h) => h.value ?? 0);
  const withCost = held.filter((h) => h.cost != null);
  const cost = sumBy(withCost, (h) => h.cost!);
  const costCoveredValue = sumBy(withCost, (h) => h.value ?? 0);
  const since12m = `${months[0]}-01`;
  const proventos12m = equity.proventos.filter((p) => p.date >= since12m);
  const income12m = sumBy(proventos12m, (p) => p.amount);
  const equityWeights = held.map((h) => h.value ?? 0).sort((a, b) => b - a);
  const hhi = marketValue > 0 ? equityWeights.reduce((s, v) => s + (v / marketValue) ** 2, 0) : 0;
  const firstProvento = equity.proventos.map((p) => p.date).sort()[0] ?? null;

  // --- Fixed income --------------------------------------------------------
  const fixed = rows.filter((r) => r.bucket === "Renda fixa");
  const fixedTotal = sumBy(fixed, (r) => r.balance);
  const cdi = fixed.filter((r) => (r.rateType ?? "").toUpperCase() === "CDI" && r.rate != null);
  const cdiBalance = sumBy(cdi, (r) => r.balance);

  const risk = riskStats(history.series);
  const health = portfolioHealth({
    exposures: [
      ...rows
        .filter((r) => r.bucket !== "Renda variável")
        .map((r) => ({
          label: r.type === "FIXED_INCOME" ? (r.issuer ?? r.name) : r.name,
          assetClass: r.assetClass,
          value: r.balance,
          liquidity: r.liquidityResolved,
          cost: r.invested,
          cdiRate: (r.rateType ?? "").toUpperCase() === "CDI" ? r.rate : null,
          fgc: FGC_SUBTYPES.has(r.subtype ?? ""),
          sovereign: r.subtype === "TREASURY",
        })),
      ...held.map((h) => ({
        label: h.ticker,
        assetClass: h.assetClass,
        value: h.value ?? 0,
        liquidity: "market" as const,
        cost: h.cost,
        cdiRate: null,
        fgc: false,
        sovereign: false,
      })),
    ],
    equityIncome12m: income12m,
    equityValue: marketValue,
    maxDrawdown: risk.maxDrawdown,
    annualizedReturn: risk.annualizedReturn,
    historyDays: risk.days,
  });

  return {
    total,
    health,
    invested: investedKnown,
    profit: profitKnown,
    returnPct: investedKnown > 0 ? profitKnown / investedKnown : null,
    coverage: total > 0 ? sumBy(known, (r) => r.balance) / total : 0,
    positions: rows.map((r) => ({ ...r, weight: total > 0 ? r.balance / total : 0 })),
    distribution: groupTotals(
      rows,
      (r) => r.bucket,
      (r) => r.balance,
    ),
    allocation: allocationByClass(positions, classifyPosition),
    allocationByInstitution: allocationByInstitution(positions),
    concentration: concentration(positions),
    series: history.series,
    risk,
    netFlows: monthlyNetFlows(history.flows, months),
    equities: {
      marketValue,
      cost,
      profit: costCoveredValue - cost,
      profitPct: cost > 0 ? costCoveredValue / cost - 1 : null,
      costCoverage: marketValue > 0 ? costCoveredValue / marketValue : 0,
      realized: sumBy([...equity.basis.values()], (b) => b.realized),
      income12m,
      incomeTotal: sumBy(equity.proventos, (p) => p.amount),
      incomeMonthlyAvg: income12m / 12,
      yieldOnCost12m: cost > 0 ? sumBy(withCost, (h) => h.proventos12m) / cost : null,
      dividendYield12m: marketValue > 0 ? income12m / marketValue : null,
      effectiveCount: hhi > 0 ? 1 / hhi : 0,
      top5Share:
        marketValue > 0 ? equityWeights.slice(0, 5).reduce((s, v) => s + v, 0) / marketValue : 0,
      holdings,
      byClass: groupTotals(
        held,
        (h) => h.assetClass,
        (h) => h.value ?? 0,
      ),
      bySector: groupTotals(
        held.filter((h) => h.assetClass === "Ações"),
        (h) => h.sector,
        (h) => h.value ?? 0,
      ),
      byFiiSegment: groupTotals(
        held.filter((h) => h.assetClass === "FIIs"),
        (h) => h.sector,
        (h) => h.value ?? 0,
      ),
      incomeByMonth: proventosByMonth(equity.proventos, months24),
      incomeByType12m: groupTotals(
        proventos12m,
        (p) => p.type,
        (p) => p.amount,
      ),
      incomeByClass12m: groupTotals(
        proventos12m,
        (p) =>
          holdings.find((h) => h.ticker === p.ticker)?.assetClass ??
          assetProfile(p.ticker).assetClass,
        (p) => p.amount,
      ),
      topPayers12m: groupTotals(
        proventos12m,
        (p) => p.ticker,
        (p) => p.amount,
      ).slice(0, 10),
      incomeByYear: groupTotals(
        equity.proventos,
        (p) => p.date.slice(0, 4),
        (p) => p.amount,
      ).sort((a, b) => a.label.localeCompare(b.label)),
      purchases: monthlyPurchases(equity.movements, months),
      recentIncome: [...equity.proventos].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40),
      firstProvento,
      b3: equity.b3,
    },
    fixedIncome: {
      total: fixedTotal,
      count: fixed.length,
      avgCdiRate: cdiBalance > 0 ? sumBy(cdi, (r) => r.rate! * r.balance) / cdiBalance : null,
      cdiShare: fixedTotal > 0 ? cdiBalance / fixedTotal : 0,
      maturityLadder: groupTotals(
        fixed,
        (r) => r.dueDate?.slice(0, 4) ?? "Sem vencimento",
        (r) => r.balance,
      ).sort((a, b) => a.label.localeCompare(b.label)),
      byRate: groupTotals(
        fixed,
        (r) =>
          r.rate != null && r.rateType
            ? `${Math.round(r.rate)}% ${r.rateType.toUpperCase()}`
            : "Outras taxas",
        (r) => r.balance,
      ),
      byIssuer: groupTotals(
        fixed,
        (r) => r.issuer ?? r.institution ?? "Outros",
        (r) => r.balance,
      ),
    },
  };
}

export function flowData(month: string) {
  const months = monthRange(month, 12);
  const accounts = loadAccounts();
  const txns = loadTransactions(months[0]!);
  const bills = loadBills(addMonths(month, -12));

  const monthTxns = monthTransactionRows(txns, month);

  const series = monthlySpending(txns, months);
  const total = series.at(-1)?.total ?? 0;
  const income = monthlyIncome(txns, month);
  const cards = accounts.filter((a) => a.type === "CREDIT");
  const cardNames = new Map(cards.map((c) => [c.id, c.name]));
  const pending = pendingSpending(txns);

  return {
    month,
    total,
    income,
    net: income - total,
    average6m: average(series.slice(-7, -1).map((s) => s.total)),
    series,
    byCategory: foldOther(spendingByCategory(txns, month), CATEGORY_SLOTS),
    byMerchant: spendingByMerchant(txns, month, 8),
    byAccount: spendingByAccount(txns, month),
    pending: foldOther(pending, CATEGORY_SLOTS),
    pendingTotal: sumBy(pending, (p) => p.total),
    installments: installmentSchedule(
      activePlans(installmentPlans(txns, todayIso()), todayIso().slice(0, 7)),
      todayIso().slice(0, 7),
      12,
    ),
    transactions: monthTxns,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: `${a.name}${a.last4 ? ` ·${a.last4}` : ""}`,
      institution: a.institution,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      name: c.name,
      last4: c.last4,
      institution: c.institution,
      imageUrl: c.imageUrl,
      balance: c.balance,
      creditLimit: c.creditLimit,
      availableCredit: c.availableCredit,
      dueDate: c.dueDate,
      closeDate: c.closeDate,
    })),
    bills: bills.map((b) => ({
      id: b.id,
      card: cardNames.get(b.account_id) ?? "Cartão",
      dueDate: b.due_date,
      total: b.total_amount,
    })),
  };
}

export function cardsData(month: string, cardId: string | null) {
  const today = todayIso();
  const current = today.slice(0, 7);
  const months = monthRange(month, 12);
  // Wide enough for the selected month's history and today's open bill.
  const from = [months[0]!, addMonths(current, -12)].sort()[0]!;
  const accounts = loadAccounts();
  const allTxns = loadTransactions(from);
  const bills = loadBills(addMonths(month < current ? month : current, -12));

  const cards = accounts.filter((a) => a.type === "CREDIT");
  // An unknown (or ignored) card id falls back to all cards.
  const selected = cardId && cards.some((c) => c.id === cardId) ? cardId : null;
  const inScope = (accountId: string) => (selected ? accountId === selected : true);
  const cardIds = new Set(cards.map((c) => c.id));
  const cardTxns = allTxns.filter((t) => cardIds.has(t.accountId));
  const txns = cardTxns.filter((t) => inScope(t.accountId));
  const summaries = cardSummaries(cards, cardTxns, bills, today);
  const scoped = summaries.filter((c) => inScope(c.id));
  const scopedBills = bills.filter((b) => inScope(b.account_id));
  const cardNames = new Map(cards.map((c) => [c.id, c.name]));

  const series = monthlySpending(txns, months);
  const total = series.at(-1)?.total ?? 0;
  const limit = sumBy(scoped, (c) => c.creditLimit ?? 0);
  const used = sumBy(scoped, (c) => c.used);
  const pending = pendingSpending(txns);
  const plans = activePlans(installmentPlans(txns, today), current);
  const lastBillMonth = [current, ...scopedBills.map((b) => b.due_date.slice(0, 7))].sort().at(-1)!;

  return {
    month,
    cardId: selected,
    cards: summaries,
    openBills: sumBy(scoped, (c) => c.openBill),
    nextDue: selected ? (scoped[0]?.nextDue ?? null) : null,
    nextClose: selected ? (scoped[0]?.nextClose ?? null) : null,
    used,
    limit,
    available: limit - used,
    usage: limit > 0 ? used / limit : null,
    total,
    average6m: average(series.slice(-7, -1).map((s) => s.total)),
    series,
    byCategory: foldOther(spendingByCategory(txns, month), CATEGORY_SLOTS),
    byMerchant: spendingByMerchant(txns, month, 8),
    pending: foldOther(pending, CATEGORY_SLOTS),
    pendingTotal: sumBy(pending, (p) => p.total),
    plans: plans.map((p) => ({
      key: p.key,
      description: p.description,
      card: p.accountName,
      purchaseDate: p.purchaseDate,
      current: p.current,
      total: p.total,
      amount: p.amount,
      remaining: p.remaining,
      remainingAmount: p.remainingAmount,
      endMonth: p.endMonth,
    })),
    installments: installmentSchedule(plans, current, 12),
    billSeries: billMonthlyTotals(scopedBills, lastBillMonth),
    bills: scopedBills.map((b) => ({
      id: b.id,
      card: cardNames.get(b.account_id) ?? "Cartão",
      dueDate: b.due_date,
      closingDate: b.closing_date,
      total: b.total_amount,
    })),
    transactions: monthTransactionRows(txns, month),
  };
}

export function connectionsData() {
  const items = all<{
    id: string;
    connector_name: string | null;
    connector_image_url: string | null;
    status: string | null;
    execution_status: string | null;
    last_updated_at: string | null;
    accounts: number;
    investments: number;
    institution_locked: number;
  }>(`
    select i.id, i.institution_locked, coalesce(i.institution_name, i.connector_name) as connector_name,
           coalesce(i.institution_image_url, i.connector_image_url) as connector_image_url, i.status, i.execution_status, i.last_updated_at,
           (select count(*) from accounts a where a.item_id = i.id and not a.ignored) as accounts,
           (select count(*) from investments v where v.item_id = i.id and coalesce(v.balance, 0) > 0) as investments
    from pluggy_items i
    order by i.created_at
  `);
  const accountRows = all<{
    id: string;
    item_id: string;
    type: "BANK" | "CREDIT";
    subtype: string | null;
    name: string | null;
    marketing_name: string | null;
    number_last4: string | null;
    ignored: number;
    ignored_by: "auto" | "user" | null;
  }>(`
    select id, item_id, type, subtype, name, marketing_name, number_last4, ignored, ignored_by
    from accounts order by type, name
  `);
  const runs = all<{
    id: number;
    started_at: string;
    finished_at: string | null;
    status: string;
    error: string | null;
    stats: string | null;
  }>(
    "select id, started_at, finished_at, status, error, stats from sync_runs order by id desc limit 10",
  );
  return {
    items: items.map((i) => ({
      id: i.id,
      name: i.connector_name ?? "Conexão",
      imageUrl: i.connector_image_url,
      status: i.status,
      executionStatus: i.execution_status,
      lastUpdatedAt: i.last_updated_at,
      accounts: i.accounts,
      investments: i.investments,
      institutionLocked: Boolean(i.institution_locked),
      accountList: accountRows
        .filter((a) => a.item_id === i.id)
        .map((a) => ({
          id: a.id,
          type: a.type,
          subtype: a.subtype,
          name: accountDisplayName(a.marketing_name, a.name),
          last4: a.number_last4,
          ignored: Boolean(a.ignored),
          ignoredBy: a.ignored_by,
        })),
    })),
    runs: runs.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      error: r.error,
      stats: r.stats ? (JSON.parse(r.stats) as Record<string, number>) : null,
    })),
  };
}

/** Removes a connection; the cascades take its accounts, transactions and history. */
export function removeItem(itemId: string): boolean {
  return run("delete from pluggy_items where id = ?", itemId).changes > 0;
}

export function countItems(): number {
  return get<{ count: number }>("select count(*) as count from pluggy_items")?.count ?? 0;
}

/** The owner ignores (or restores) an account; the sync won't override it. */
export function setAccountIgnored(accountId: string, ignored: boolean): boolean {
  return (
    run("update accounts set ignored = ?, ignored_by = 'user' where id = ?", ignored, accountId)
      .changes > 0
  );
}

/** The owner's liquidity for a position (null = automatic rule); the sync never touches it. */
export function setInvestmentLiquidity(
  investmentId: string,
  liquidity: "daily" | "maturity" | null,
): boolean {
  return (
    run("update investments set liquidity = ? where id = ?", liquidity, investmentId).changes > 0
  );
}

/** Pins a connection's institution (name, logo, color); the sync stops inferring it. */
export function setItemInstitution(
  itemId: string,
  institution: { name: string; imageUrl: string | null; color: string | null } | null,
): boolean {
  const result = institution
    ? run(
        `update pluggy_items
         set institution_name = ?, institution_image_url = ?, institution_color = ?, institution_locked = 1
         where id = ?`,
        institution.name,
        institution.imageUrl,
        institution.color,
        itemId,
      )
    : run("update pluggy_items set institution_locked = 0 where id = ?", itemId);
  return result.changes > 0;
}

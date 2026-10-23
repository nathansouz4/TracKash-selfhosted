import { addDays, isoDate, isoTimestamp, todayIso } from "@/lib/dates";
import { duplicateCardAccounts } from "@/lib/duplicates";
import { matchConnector, resolveInstitutionName } from "@/lib/institutions";
import { all, get, NOW_SQL, run, transaction, upsert } from "./db.server";
import {
  pluggy,
  PluggyError,
  type PluggyAccount,
  type PluggyBill,
  type PluggyCategory,
  type PluggyInvestment,
  type PluggyInvestmentTransaction,
  type PluggyItem,
  type PluggyTransaction,
} from "./pluggy.server";

// Pulls everything from Pluggy into the local database. Data minimization: no
// CPF/CNPJ, no full account numbers, no payer/receiver bank details — only what
// the dashboards use.
//
// A sync runs in the background of the server process (the app polls its
// progress) or in the foreground of `npm run sync`. Only one runs at a time,
// across both: the guard is the latest row of sync_runs.

const FIRST_SYNC_LOOKBACK_DAYS = 730;
const INCREMENTAL_OVERLAP_DAYS = 45; // pending → posted transitions change ids inside this window
const MIN_SYNC_INTERVAL_MS = 60_000;
const STALE_RUN_MS = 30 * 60_000;
const CATEGORY_REFRESH_MS = 30 * 24 * 60 * 60_000;

// ---------------------------------------------------------------------------
// Mappers (Pluggy → rows). Exported for tests.
// ---------------------------------------------------------------------------

export function mapAccount(a: PluggyAccount) {
  const digits = a.number?.replace(/\D/g, "") ?? "";
  return {
    id: a.id,
    item_id: a.itemId,
    type: a.type,
    subtype: a.subtype,
    name: a.name,
    marketing_name: a.marketingName,
    number_last4: digits ? digits.slice(-4) : null,
    balance: a.balance,
    currency_code: a.currencyCode,
    credit_limit: a.creditData?.creditLimit ?? null,
    available_credit_limit: a.creditData?.availableCreditLimit ?? null,
    minimum_payment: a.creditData?.minimumPayment ?? null,
    balance_close_date: isoDate(a.creditData?.balanceCloseDate),
    balance_due_date: isoDate(a.creditData?.balanceDueDate),
    card_brand: a.creditData?.brand ?? null,
    card_level: a.creditData?.level ?? null,
  };
}

export function mapTransaction(t: PluggyTransaction) {
  const cc = t.creditCardMetadata;
  return {
    id: t.id,
    account_id: t.accountId,
    date: isoTimestamp(t.date),
    description: t.description,
    amount: t.amount,
    amount_in_account_currency: t.amountInAccountCurrency,
    currency_code: t.currencyCode,
    type: t.type,
    status: t.status,
    category: t.category,
    category_id: t.categoryId,
    merchant_name: t.merchant?.businessName || t.merchant?.name || null,
    merchant_category: t.merchant?.category ?? null,
    // Only the counterparty's display name; documents and account numbers are dropped.
    counterparty_name:
      (t.type === "DEBIT" ? t.paymentData?.receiver?.name : t.paymentData?.payer?.name) ?? null,
    operation_type: t.operationType,
    bill_id: cc?.billId ?? null,
    installment_number: cc?.installmentNumber ?? null,
    total_installments: cc?.totalInstallments ?? null,
    purchase_date: isoTimestamp(cc?.purchaseDate),
  };
}

export function mapBill(accountId: string, b: PluggyBill) {
  return {
    id: b.id,
    account_id: accountId,
    due_date: isoDate(b.dueDate),
    closing_date: isoDate(b.billClosingDate),
    total_amount: b.totalAmount,
    currency_code: b.totalAmountCurrencyCode,
    minimum_payment: b.minimumPaymentAmount,
    finance_charges: (b.financeCharges ?? []).map((c) => ({ type: c.type, amount: c.amount })),
    payments: (b.payments ?? []).map((p) => ({
      type: p.valueType,
      date: isoDate(p.paymentDate),
      amount: p.amount,
    })),
  };
}

export function mapInvestment(i: PluggyInvestment) {
  return {
    id: i.id,
    item_id: i.itemId,
    code: i.code,
    isin: i.isin,
    name: i.name,
    type: i.type,
    subtype: i.subtype,
    status: i.status,
    currency_code: i.currencyCode,
    balance: i.balance,
    amount: i.amount,
    amount_original: i.amountOriginal,
    amount_profit: i.amountProfit,
    amount_withdrawal: i.amountWithdrawal,
    quantity: i.quantity,
    value: i.value,
    taxes: i.taxes,
    taxes2: i.taxes2,
    rate: i.rate,
    rate_type: i.rateType,
    fixed_annual_rate: i.fixedAnnualRate,
    annual_rate: i.annualRate,
    last_month_rate: i.lastMonthRate,
    last_twelve_months_rate: i.lastTwelveMonthsRate,
    position_date: isoTimestamp(i.date),
    due_date: isoDate(i.dueDate),
    issue_date: isoDate(i.issueDate),
    purchase_date: isoDate(i.purchaseDate),
    issuer: i.issuer,
    institution_name: i.institution?.name ?? null,
  };
}

export function mapInvestmentTransaction(investmentId: string, t: PluggyInvestmentTransaction) {
  return {
    id: t.id,
    investment_id: investmentId,
    type: t.type,
    movement_type: t.movementType,
    description: t.description,
    quantity: t.quantity,
    value: t.value,
    amount: t.amount,
    net_amount: t.netAmount,
    date: isoTimestamp(t.date),
    trade_date: isoTimestamp(t.tradeDate),
  };
}

export function mapSnapshot(i: PluggyInvestment, snapshotDate: string) {
  return {
    investment_id: i.id,
    snapshot_date: snapshotDate,
    balance: i.balance,
    amount_original: i.amountOriginal,
    amount_profit: i.amountProfit,
    quantity: i.quantity,
    value: i.value,
  };
}

export function itemRow(item: PluggyItem) {
  return {
    id: item.id,
    connector_id: item.connector?.id ?? null,
    connector_name: item.connector?.name ?? null,
    connector_image_url: item.connector?.imageUrl ?? null,
    status: item.status,
    execution_status: item.executionStatus,
    last_updated_at: isoTimestamp(item.lastUpdatedAt),
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type SyncStats = {
  items: number;
  accounts: number;
  transactions: number;
  bills: number;
  investments: number;
  investmentTransactions: number;
};

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

export type Institution = { name: string; imageUrl: string | null; color: string | null };

export function upsertItem(item: PluggyItem, institution: Institution | null): void {
  transaction(() => {
    upsert("pluggy_items", [itemRow(item)], ["id"]);
    // An institution the owner picked by hand (institution_locked) is kept.
    if (institution) {
      run(
        `update pluggy_items
         set institution_name = ?, institution_image_url = ?, institution_color = ?
         where id = ? and not institution_locked`,
        institution.name,
        institution.imageUrl,
        institution.color,
        item.id,
      );
    }
  });
}

/**
 * Re-evaluates duplicated cards across connections (see lib/duplicates.ts).
 * Only touches accounts the owner hasn't decided on (ignored_by null or 'auto').
 */
export function applyDuplicateRules(): number {
  const accounts = all<{
    id: string;
    item_id: string;
    type: "BANK" | "CREDIT";
    number_last4: string | null;
    card_brand: string | null;
    ignored_by: string | null;
  }>("select id, item_id, type, number_last4, card_brand, ignored_by from accounts");
  const duplicates = duplicateCardAccounts(
    accounts.map((a) => ({
      id: a.id,
      itemId: a.item_id,
      type: a.type,
      last4: a.number_last4,
      brand: a.card_brand,
    })),
  );
  const auto = accounts.filter((a) => a.ignored_by !== "user");
  const toIgnore = auto
    .filter((a) => duplicates.has(a.id) && a.ignored_by !== "auto")
    .map((a) => a.id);
  const toRestore = auto
    .filter((a) => !duplicates.has(a.id) && a.ignored_by === "auto")
    .map((a) => a.id);
  transaction(() => {
    if (toIgnore.length) {
      run(
        "update accounts set ignored = 1, ignored_by = 'auto' where id in (select value from json_each(?))",
        toIgnore,
      );
    }
    if (toRestore.length) {
      run(
        "update accounts set ignored = 0, ignored_by = null where id in (select value from json_each(?))",
        toRestore,
      );
    }
  });
  return duplicates.size;
}

/**
 * Meu Pluggy items all say "MeuPluggy": infer the real bank from the accounts and
 * take its official name/logo from Pluggy's connector catalog.
 */
export async function resolveInstitution(accounts: PluggyAccount[]): Promise<Institution | null> {
  const name = resolveInstitutionName(
    accounts.map((a) => ({
      type: a.type,
      name: a.name,
      transferNumber: a.bankData?.transferNumber ?? null,
    })),
  );
  if (!name) return null;
  try {
    const connector = matchConnector(name, await pluggy.listConnectors());
    return {
      name,
      imageUrl: connector?.imageUrl ?? null,
      color: connector?.primaryColor ?? null,
    };
  } catch {
    // The catalog is cosmetic: never fail a sync because of it.
    return { name, imageUrl: null, color: null };
  }
}

async function syncCategoriesIfStale(): Promise<void> {
  const latest = get<{ updated_at: string | null }>(
    "select max(updated_at) as updated_at from categories",
  );
  if (latest?.updated_at && Date.now() - Date.parse(latest.updated_at) < CATEGORY_REFRESH_MS)
    return;

  const categories: PluggyCategory[] = await pluggy.listCategories();
  upsert(
    "categories",
    categories.map((c) => ({
      id: c.id,
      description: c.description,
      description_translated: c.descriptionTranslated ?? null,
      parent_id: c.parentId ?? null,
      parent_description: c.parentDescription ?? null,
    })),
    ["id"],
  );
}

async function syncAccountTransactions(accountId: string): Promise<number> {
  const last = get<{ max: string | null }>(
    "select max(date) as max from transactions where account_id = ?",
    accountId,
  );
  const dateFrom = last?.max
    ? addDays(last.max.slice(0, 10), -INCREMENTAL_OVERLAP_DAYS)
    : addDays(todayIso(), -FIRST_SYNC_LOOKBACK_DAYS);

  const fetched = await pluggy.listTransactions(accountId, dateFrom);
  // Pluggy may return transactions from other accounts only by mistake; never trust it blindly.
  const rows = fetched.filter((t) => t.accountId === accountId).map(mapTransaction);

  transaction(() => {
    upsert("transactions", rows, ["id"]);
    if (rows.length > 0) {
      // Pending transactions get new ids once posted: drop rows in the window that vanished.
      run(
        `delete from transactions
         where account_id = ? and date >= ? and id not in (select value from json_each(?))`,
        accountId,
        dateFrom,
        rows.map((r) => r.id),
      );
    }
  });
  return rows.length;
}

export type SyncProgress = { step: number; total: number; label: string };
type Report = (progress: SyncProgress) => void;

async function syncItem(
  itemId: string,
  stats: SyncStats,
  today: string,
  progress: { advance: (label: string) => void; label: (label: string) => void },
): Promise<void> {
  const item = await pluggy.getItem(itemId);
  const accounts = (await pluggy.listAccounts(itemId)).filter((a) => a.itemId === itemId);
  const institution = await resolveInstitution(accounts);
  const name = institution?.name ?? item.connector?.name ?? "Conexão";
  upsertItem(item, institution);
  upsert("accounts", accounts.map(mapAccount), ["id"]);
  stats.accounts += accounts.length;
  progress.advance(`${name}: transações e faturas`);

  let accountsDone = 0;
  await mapWithConcurrency(accounts, 4, async (account) => {
    // Await first: `x += await y` reads x before awaiting and would lose
    // updates from the other accounts running concurrently.
    const synced = await syncAccountTransactions(account.id);
    stats.transactions += synced;
    if (account.type === "CREDIT") {
      const bills = await pluggy.listBills(account.id);
      upsert(
        "credit_card_bills",
        bills.map((b) => mapBill(account.id, b)),
        ["id"],
      );
      stats.bills += bills.length;
    }
    accountsDone += 1;
    progress.label(
      `${name}: transações e faturas (${accountsDone}/${accounts.length} ${accounts.length === 1 ? "conta" : "contas"})`,
    );
  });
  progress.advance(`${name}: investimentos`);

  const investments = (await pluggy.listInvestments(itemId)).filter((i) => i.itemId === itemId);
  transaction(() => {
    upsert("investments", investments.map(mapInvestment), ["id"]);
    upsert(
      "investment_snapshots",
      investments.map((i) => mapSnapshot(i, today)),
      ["investment_id", "snapshot_date"],
      { touchUpdatedAt: false },
    );
    if (investments.length > 0) {
      // Positions no longer returned were fully redeemed: zero them, keep their history.
      run(
        `update investments set balance = 0, status = 'TOTAL_WITHDRAWAL', updated_at = ${NOW_SQL}
         where item_id = ? and id not in (select value from json_each(?))`,
        itemId,
        investments.map((i) => i.id),
      );
    }
  });
  stats.investments += investments.length;

  // Pluggy has one endpoint per investment; fetch them a few at a time.
  let investmentsDone = 0;
  const counts = await mapWithConcurrency(investments, 6, async (investment) => {
    const movements = await pluggy.listInvestmentTransactions(investment.id);
    upsert(
      "investment_transactions",
      movements.map((m) => mapInvestmentTransaction(investment.id, m)),
      ["id"],
    );
    investmentsDone += 1;
    progress.label(`${name}: investimentos (${investmentsDone}/${investments.length})`);
    return movements.length;
  });
  stats.investmentTransactions += counts.reduce((s, n) => s + n, 0);
  progress.advance(`${name}: concluída`);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

type RunRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  error: string | null;
  stats: string | null;
  pid: number | null;
};

type Job = { runId: number; progress: SyncProgress };

declare global {
  // The sync running in this process, if any (survives module reloads in dev).
  var __trackashSyncJob: Job | undefined;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lastRun(): RunRow | undefined {
  return get<RunRow>(
    "select id, started_at, finished_at, status, error, stats, pid from sync_runs order by id desc limit 1",
  );
}

/** A 'running' row whose process is gone (closed app, crash) will never finish. */
function isLive(run: RunRow): boolean {
  if (run.status !== "running") return false;
  if (Date.now() - Date.parse(run.started_at) > STALE_RUN_MS) return false;
  if (run.pid === process.pid) return globalThis.__trackashSyncJob?.runId === run.id;
  return run.pid == null || processAlive(run.pid);
}

function closeInterruptedRun(): void {
  const latest = lastRun();
  if (latest?.status === "running" && !isLive(latest)) {
    run(
      `update sync_runs set status = 'error', finished_at = ${NOW_SQL}, error = ? where id = ?`,
      "Sincronização interrompida (o app foi encerrado no meio dela).",
      latest.id,
    );
  }
}

function countItems(): number {
  return get<{ count: number }>("select count(*) as count from pluggy_items")?.count ?? 0;
}

/** Checks the guards and records a new run. */
function beginRun(): number {
  if (countItems() === 0) {
    throw new SyncError("Nenhuma conexão cadastrada. Adicione o itemId de cada banco em Conexões.");
  }
  return transaction(() => {
    closeInterruptedRun();
    const recent = lastRun();
    if (recent?.status === "running") {
      throw new SyncError("Já existe uma sincronização em andamento.");
    }
    if (recent && Date.now() - Date.parse(recent.started_at) < MIN_SYNC_INTERVAL_MS) {
      throw new SyncError("Aguarde um minuto entre sincronizações.");
    }
    return Number(run("insert into sync_runs (pid) values (?)", process.pid).lastInsertRowid);
  });
}

async function executeRun(runId: number, report: Report): Promise<SyncStats> {
  const stats: SyncStats = {
    items: 0,
    accounts: 0,
    transactions: 0,
    bills: 0,
    investments: 0,
    investmentTransactions: 0,
  };
  const items = all<{ id: string }>("select id from pluggy_items order by created_at");
  // One step for the categories, three per connection, one to finish.
  let current: SyncProgress = {
    step: 0,
    total: items.length * 3 + 2,
    label: "Conectando à Pluggy",
  };
  const progress = {
    label(label: string) {
      current = { ...current, label };
      report(current);
    },
    advance(label: string) {
      current = { ...current, step: Math.min(current.step + 1, current.total), label };
      report(current);
    },
  };
  report(current);
  try {
    await syncCategoriesIfStale();
    progress.advance("Lendo as conexões");
    const today = todayIso();
    for (const item of items) {
      await syncItem(item.id, stats, today, progress);
      stats.items += 1;
    }
    applyDuplicateRules();
    progress.advance("Pronto");
    run(
      `update sync_runs set status = 'success', finished_at = ${NOW_SQL}, stats = ? where id = ?`,
      stats,
      runId,
    );
    return stats;
  } catch (error) {
    const message =
      error instanceof PluggyError || error instanceof SyncError
        ? error.message
        : "Falha inesperada durante a sincronização.";
    console.error(error);
    run(
      `update sync_runs set status = 'error', finished_at = ${NOW_SQL}, error = ?, stats = ? where id = ?`,
      message,
      stats,
      runId,
    );
    throw new SyncError(message);
  }
}

/** Last successful sync (ISO), if any. */
export function lastSuccessfulSync(): string | null {
  return (
    get<{ started_at: string }>(
      "select started_at from sync_runs where status = 'success' order by id desc limit 1",
    )?.started_at ?? null
  );
}

/**
 * Starts a sync in the background of this process. With `ifOlderThanMs`, only
 * when the last successful one is older than that (the app does this on open).
 */
export function startSync({ ifOlderThanMs }: { ifOlderThanMs?: number } = {}): {
  started: boolean;
} {
  if (globalThis.__trackashSyncJob) return { started: false };
  let runId: number;
  if (ifOlderThanMs == null) {
    runId = beginRun();
  } else {
    const last = lastSuccessfulSync();
    if (last && Date.now() - Date.parse(last) < ifOlderThanMs) return { started: false };
    try {
      runId = beginRun();
    } catch (error) {
      // An automatic sync stays quiet about its guards (no connection, too soon...).
      if (error instanceof SyncError) return { started: false };
      throw error;
    }
  }
  const job: Job = { runId, progress: { step: 0, total: 1, label: "Conectando à Pluggy" } };
  globalThis.__trackashSyncJob = job;
  void executeRun(runId, (progress) => (job.progress = progress))
    // Failures are recorded in sync_runs and read through syncStatus().
    .catch(() => {})
    .finally(() => {
      if (globalThis.__trackashSyncJob === job) globalThis.__trackashSyncJob = undefined;
    });
  return { started: true };
}

/** Terminal (`npm run sync`): runs a sync in the foreground, reporting progress. */
export async function runSync(report: Report = () => {}): Promise<SyncStats> {
  return executeRun(beginRun(), report);
}

export type SyncStatus = {
  running: boolean;
  /** Progress of a sync running in this process (null when it runs in a terminal). */
  progress: SyncProgress | null;
  lastRun: {
    id: number;
    status: "running" | "success" | "error";
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    stats: SyncStats | null;
  } | null;
  lastSuccessAt: string | null;
};

export function syncStatus(): SyncStatus {
  const job = globalThis.__trackashSyncJob;
  const latest = lastRun();
  return {
    running: Boolean(job) || (latest ? isLive(latest) : false),
    progress: job?.progress ?? null,
    lastRun: latest
      ? {
          id: latest.id,
          status: latest.status === "running" && !isLive(latest) ? "error" : latest.status,
          startedAt: latest.started_at,
          finishedAt: latest.finished_at,
          error:
            latest.status === "running" && !isLive(latest)
              ? "Sincronização interrompida."
              : latest.error,
          stats: latest.stats ? (JSON.parse(latest.stats) as SyncStats) : null,
        }
      : null,
    lastSuccessAt: lastSuccessfulSync(),
  };
}

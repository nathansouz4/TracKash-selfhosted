import { addMonths, monthKey } from "./dates";
import { cleanDescription, round2, spendingAmount, type SpendingTransaction } from "./spending";

// Credit card rules, derived from how Pluggy reports cards:
// - account.balance is the USED LIMIT (current bill + every future installment),
//   not the open bill; and the account's due date is the last CLOSED bill's.
// - Transactions already billed carry a billId. The open bill is everything
//   without one, from the last closing date up to the next.
// - Installments: some banks list one transaction per installment only when it
//   is billed; others also list the future ones with future dates. Plans below handle both.

/** "2026-01-31" + 1 month → "2026-02-28" (day clamped to the month's length). */
export function addMonthsToDate(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number) as [number, number, number];
  const target = addMonths(`${y}-${String(m).padStart(2, "0")}`, delta);
  const [ty, tm] = target.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${target}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export type BillDates = { closingDate: string | null; dueDate: string };

export type BillCycle = {
  /** Closing date of the last closed bill (start of the open cycle). */
  lastClose: string | null;
  /** Projected closing / due dates of the open bill. */
  nextClose: string | null;
  nextDue: string | null;
};

export function openCycle(bills: BillDates[]): BillCycle {
  const last = [...bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  if (!last) return { lastClose: null, nextClose: null, nextDue: null };
  return {
    lastClose: last.closingDate,
    nextClose: last.closingDate ? addMonthsToDate(last.closingDate, 1) : null,
    nextDue: addMonthsToDate(last.dueDate, 1),
  };
}

type CardTransaction = SpendingTransaction;

/**
 * Open bill of one card: unbilled purchases from the last closing date up to
 * (not including) the next one, net of refunds; bill payments don't count.
 * Without closed bills, falls back to the last 31 days up to `today`.
 */
export function openBillAmount(txns: CardTransaction[], cycle: BillCycle, today: string): number {
  const from = cycle.lastClose ?? addMonthsToDate(today, -1);
  const until = cycle.nextClose ?? today;
  const total = txns
    .filter((t) => t.billId == null)
    .filter((t) => {
      const day = t.date.slice(0, 10);
      return day >= from && (cycle.nextClose ? day < until : day <= until);
    })
    .reduce((sum, t) => sum + spendingAmount(t), 0);
  return round2(Math.max(total, 0));
}

export type InstallmentPlan = {
  key: string;
  description: string;
  accountId: string;
  accountName: string;
  purchaseDate: string | null;
  /** Installment charged most recently (date <= today), e.g. 3 in "3/5". */
  current: number;
  total: number;
  amount: number;
  remaining: number;
  remainingAmount: number;
  /** Month of the last installment. */
  endMonth: string;
  /** Month each future installment falls in (by transaction date). */
  schedule: { month: string; amount: number }[];
};

/** Groups installment transactions into one plan per purchase. */
export function installmentPlans(txns: CardTransaction[], today: string): InstallmentPlan[] {
  const groups = new Map<string, CardTransaction[]>();
  for (const t of txns) {
    if (t.accountType !== "CREDIT" || t.type !== "DEBIT") continue;
    if (!t.installmentNumber || !t.totalInstallments || t.totalInstallments < 2) continue;
    const anchor = t.purchaseDate?.slice(0, 10) ?? Math.abs(t.amount).toFixed(2);
    const key = [t.accountId, cleanDescription(t.description), t.totalInstallments, anchor].join(
      "|",
    );
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const plans: InstallmentPlan[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.installmentNumber! - b.installmentNumber!);
    const total = sorted[0]!.totalInstallments!;
    const known = new Map(sorted.map((t) => [t.installmentNumber!, t]));
    const charged = sorted.filter((t) => t.date.slice(0, 10) <= today);
    const current = charged.at(-1)?.installmentNumber ?? sorted[0]!.installmentNumber! - 1;
    const lastKnown = sorted.at(-1)!;
    const amount = Math.abs((charged.at(-1) ?? lastKnown).amount);

    const schedule: { month: string; amount: number }[] = [];
    for (let n = current + 1; n <= total; n++) {
      const knownTx = known.get(n);
      const month = knownTx
        ? monthKey(knownTx.date)
        : addMonths(monthKey(lastKnown.date), n - lastKnown.installmentNumber!);
      schedule.push({ month, amount: Math.abs(knownTx?.amount ?? amount) });
    }

    const endMonth =
      schedule.at(-1)?.month ?? monthKey((known.get(total) ?? charged.at(-1) ?? lastKnown).date);

    plans.push({
      key,
      description: cleanDescription(lastKnown.description),
      accountId: lastKnown.accountId,
      accountName: lastKnown.accountName,
      purchaseDate: lastKnown.purchaseDate?.slice(0, 10) ?? null,
      current: Math.max(current, 0),
      total,
      amount: round2(amount),
      remaining: schedule.length,
      remainingAmount: round2(schedule.reduce((s, i) => s + i.amount, 0)),
      endMonth,
      schedule,
    });
  }
  return plans.sort(
    (a, b) => b.remainingAmount - a.remainingAmount || a.description.localeCompare(b.description),
  );
}

/** Plans still being paid: something left, or the current installment is this month's. */
export function activePlans(plans: InstallmentPlan[], currentMonth: string): InstallmentPlan[] {
  return plans.filter((p) => p.remaining > 0 || p.endMonth >= currentMonth);
}

/** Future installments per month, for the `horizon` months after `fromMonth`. */
export function installmentSchedule(
  plans: InstallmentPlan[],
  fromMonth: string,
  horizon = 12,
): { month: string; total: number }[] {
  const months = Array.from({ length: horizon }, (_, i) => addMonths(fromMonth, i + 1));
  const totals = new Map(months.map((m) => [m, 0]));
  for (const plan of plans) {
    for (const item of plan.schedule) {
      if (totals.has(item.month)) totals.set(item.month, totals.get(item.month)! + item.amount);
    }
  }
  return months.map((month) => ({ month, total: round2(totals.get(month) ?? 0) }));
}

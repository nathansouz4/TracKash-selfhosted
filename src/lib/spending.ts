import { monthKey } from "./dates";

// Spending rules. A purchase on the card and the bill payment from the checking
// account are the same money, so only one side may count as spending: card
// purchases count; bill payments, transfers between own accounts and
// investment movements are "internal".

export type AccountType = "BANK" | "CREDIT";

export type SpendingTransaction = {
  id: string;
  accountId: string;
  date: string; // ISO
  status: string | null; // PENDING | POSTED
  description: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  accountType: AccountType;
  accountName: string;
  category: string | null; // Pluggy category (English)
  categoryId: string | null; // hierarchical: "03060000" sits under "03000000"
  categoryLabel: string; // pt-BR label for display
  groupLabel: string; // pt-BR top-level category
  merchantName: string | null;
  counterpartyName: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  purchaseDate: string | null;
  billId: string | null; // credit card bill it was charged to; null = not billed yet
  /** Transfer between the owner's own accounts (see internal-movements.ts). */
  internalTransfer?: boolean;
};

export type TransactionKind = "expense" | "refund" | "income" | "dividend" | "internal";

const INTERNAL_CATEGORY =
  /same person transfer|credit card payment|^investments?\b|automatic investment|fixed income|mutual funds|variable income|^pension|^margin|mesma titularidade|pagamento de (fatura|cart[aã]o)|^investimentos?\b/i;
/** Money moved into/out of investments, whatever category Pluggy assigned. */
const INVESTMENT_TEXT =
  /renda vari[aá]vel|renda fixa|\baplica[cç][aã]o\b|\bRDB\b|\bCDB\b|tesouro direto|compra de a[cç][oõ]es/i;
/** Redemptions only ever bring money in; a shop named "Resgate" is still spending. */
const REDEMPTION_TEXT = /\bresgate\b/i;
const CARD_PAYMENT_TEXT = /pagamento|pagto|pgto|pag\.? fatura|payment/i;
/**
 * Debt settlement on a card (renegotiation, bill financing): the agreement
 * debit, the matching credit, forgiven amounts. None of it is new spending nor
 * a refund of a purchase. Late interest and IOF stay as real costs.
 */
const CARD_DEBT_CREDIT =
  /\bdesconto\b|cr[eé]dito de parcelamento|encerramento de d[ií]vida|renegocia|\bacordo\b/i;
const CARD_DEBT_DEBIT = /^acordo\b|parcelamento de fatura|renegocia/i;
const DIVIDEND_CATEGORY = /dividend|proceeds|interests? and|proventos|rendimentos/i;
const DIVIDEND_TEXT = /dividend|\bjcp\b|juros s\/? ?(cap|capital)|rendimento|proventos|\brend\b/i;

// Pluggy category ids (8 digits; the first 2 are the top-level group).
const INVESTMENTS_GROUP = "03";
const DIVIDENDS_CATEGORY = "0306";
const SAME_PERSON_TRANSFER_GROUP = "04";
const CREDIT_CARD_PAYMENT = "05100000";

export function classifyTransaction(
  t: Pick<
    SpendingTransaction,
    "type" | "accountType" | "category" | "categoryId" | "description"
  > & {
    internalTransfer?: boolean;
  },
): TransactionKind {
  if (t.internalTransfer) return "internal";
  const category = t.category ?? "";
  const categoryId = t.categoryId ?? "";
  const description = t.description ?? "";

  if (t.accountType === "CREDIT") {
    const settlement = t.type === "CREDIT" ? CARD_DEBT_CREDIT : CARD_DEBT_DEBIT;
    if (settlement.test(description)) return "internal";
    if (t.type === "DEBIT") return "expense";
    // Other credits on a card are either the bill payment or a refund (estorno).
    if (
      categoryId === CREDIT_CARD_PAYMENT ||
      /credit card payment/i.test(category) ||
      CARD_PAYMENT_TEXT.test(description)
    ) {
      return "internal";
    }
    return "refund";
  }

  if (t.type === "CREDIT" && categoryId.startsWith(DIVIDENDS_CATEGORY)) return "dividend";
  if (INVESTMENT_TEXT.test(description)) return "internal";
  if (t.type === "CREDIT" && REDEMPTION_TEXT.test(description)) return "internal";
  if (
    categoryId.startsWith(INVESTMENTS_GROUP) ||
    categoryId.startsWith(SAME_PERSON_TRANSFER_GROUP) ||
    categoryId === CREDIT_CARD_PAYMENT
  ) {
    return "internal";
  }
  if (INTERNAL_CATEGORY.test(category)) {
    // Dividends are often filed under an "Investments" parent; check them first.
    if (
      t.type === "CREDIT" &&
      (DIVIDEND_CATEGORY.test(category) || DIVIDEND_TEXT.test(description))
    )
      return "dividend";
    return "internal";
  }
  if (t.type === "DEBIT") return "expense";
  if (DIVIDEND_CATEGORY.test(category) || DIVIDEND_TEXT.test(description)) return "dividend";
  return "income";
}

/** Positive for spending, negative for refunds, zero for everything else. */
export function spendingAmount(t: SpendingTransaction): number {
  const kind = classifyTransaction(t);
  if (kind === "expense") return Math.abs(t.amount);
  if (kind === "refund") return -Math.abs(t.amount);
  return 0;
}

export type MonthTotal = { month: string; total: number };

export function monthlySpending(txns: SpendingTransaction[], months: string[]): MonthTotal[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const t of txns) {
    const m = monthKey(t.date);
    if (totals.has(m)) totals.set(m, totals.get(m)! + spendingAmount(t));
  }
  return months.map((month) => ({ month, total: round2(totals.get(month) ?? 0) }));
}

export function monthlyDividends(txns: SpendingTransaction[], months: string[]): MonthTotal[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const t of txns) {
    const m = monthKey(t.date);
    if (totals.has(m) && classifyTransaction(t) === "dividend")
      totals.set(m, totals.get(m)! + Math.abs(t.amount));
  }
  return months.map((month) => ({ month, total: round2(totals.get(month) ?? 0) }));
}

export type LabeledTotal = { label: string; total: number; count: number };

function groupSpending(
  txns: SpendingTransaction[],
  month: string,
  key: (t: SpendingTransaction) => string | null,
): LabeledTotal[] {
  const groups = new Map<string, LabeledTotal>();
  for (const t of txns) {
    if (monthKey(t.date) !== month) continue;
    const value = spendingAmount(t);
    if (value === 0) continue;
    const label = key(t) ?? "Sem categoria";
    const g = groups.get(label) ?? { label, total: 0, count: 0 };
    g.total += value;
    g.count += 1;
    groups.set(label, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, total: round2(g.total) }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function spendingByCategory(txns: SpendingTransaction[], month: string): LabeledTotal[] {
  return groupSpending(txns, month, (t) => t.groupLabel);
}

export function spendingByMerchant(
  txns: SpendingTransaction[],
  month: string,
  limit = 10,
): LabeledTotal[] {
  return groupSpending(
    txns,
    month,
    (t) => t.merchantName ?? t.counterpartyName ?? cleanDescription(t.description),
  ).slice(0, limit);
}

/** Folds the tail of a ranking into "Outros" so a chart never needs a 9th color. */
export function foldOther(items: LabeledTotal[], keep: number): LabeledTotal[] {
  if (items.length <= keep + 1) return items;
  const head = items.slice(0, keep);
  const tail = items.slice(keep);
  return [
    ...head,
    {
      label: "Outros",
      total: round2(tail.reduce((s, i) => s + i.total, 0)),
      count: tail.reduce((s, i) => s + i.count, 0),
    },
  ];
}

/** "UBER *TRIP 3/10" → "UBER TRIP". */
export function cleanDescription(description: string | null): string {
  return (
    (description ?? "")
      .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, "")
      .replace(/\bparc(ela)?\s*\d+\b/gi, "")
      .replace(/[*]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase() || "SEM DESCRIÇÃO"
  );
}

export function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Money in for the month: income and dividends (internal transfers excluded). */
export function monthlyIncome(txns: SpendingTransaction[], month: string): number {
  return round2(
    txns
      .filter((t) => monthKey(t.date) === month)
      .filter((t) => {
        const kind = classifyTransaction(t);
        return kind === "income" || kind === "dividend";
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0),
  );
}

/** Spending not yet posted (Pluggy status PENDING), by category, any date. */
export function pendingSpending(txns: SpendingTransaction[]): LabeledTotal[] {
  const groups = new Map<string, LabeledTotal>();
  for (const t of txns) {
    if (t.status !== "PENDING") continue;
    const value = spendingAmount(t);
    if (value <= 0) continue;
    const g = groups.get(t.groupLabel) ?? { label: t.groupLabel, total: 0, count: 0 };
    g.total += value;
    g.count += 1;
    groups.set(t.groupLabel, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, total: round2(g.total) }))
    .sort((a, b) => b.total - a.total);
}

/** "Pagamento efetuado|UNIMED NATAL" → { title: "UNIMED NATAL", detail: "Pagamento efetuado" }. */
export function splitDescription(description: string | null): {
  title: string;
  detail: string | null;
} {
  const text = (description ?? "").trim();
  const [head, ...rest] = text.split("|").map((p) => p.trim());
  if (rest.length > 0 && rest.join(" ").length > 0)
    return { title: rest.join(" "), detail: head || null };
  return { title: text || "Sem descrição", detail: null };
}

/** Spending of the month by account or card (where the money left from). */
export function spendingByAccount(txns: SpendingTransaction[], month: string): LabeledTotal[] {
  return groupSpending(txns, month, (t) => t.accountName);
}

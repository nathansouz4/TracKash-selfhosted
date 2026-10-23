import { daysBetween } from "./dates";

// Money moving between the owner's own accounts is neither spending nor income.
// Pluggy's categories miss many of these (a card bill paid from checking shows
// up as "Credit card fees" or "Transfers", a Pix to oneself as "Transfer - Bank
// Slip"), so they are recognized here by evidence, not by category:
// 1. Pairing: a debit in one connected account and a credit of the exact same
//    amount in another connected account within a few days.
// 2. Bill-payment wording ("GASTOS CARTAO DE CREDITO", "Pagamento de fatura").
// 3. The description names a connected card ("Pagamento efetuado|BANCO EXEMPLO VISA").
// Payments of cards that are NOT connected stay as spending: their purchases
// aren't tracked anywhere else.

export type MovementLike = {
  id: string;
  accountId: string;
  accountType: "BANK" | "CREDIT";
  type: "DEBIT" | "CREDIT";
  amount: number;
  date: string; // ISO
  description: string | null;
};

const PAIR_WINDOW_DAYS = 3;
const MIN_PAIR_AMOUNT = 1;
const BILL_PAYMENT_TEXT =
  /gastos cart[aã]o de cr[eé]dito|pagamento (de |da )?fatura|pagto\.? (de )?fatura|pgto\.? (de )?fatura|d[eé]b(ito)?\.? fatura/i;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** Ids of transactions that are transfers between the owner's own accounts. */
export function internalMovementIds(txns: MovementLike[], cardNames: string[]): Set<string> {
  const internal = new Set<string>();
  const cards = cardNames.map(fold).filter((n) => n.length >= 6);

  // 2 + 3: wording on bank debits.
  for (const t of txns) {
    if (t.accountType !== "BANK" || t.type !== "DEBIT") continue;
    const text = fold(t.description ?? "");
    if (BILL_PAYMENT_TEXT.test(t.description ?? "") || cards.some((c) => text.includes(c))) {
      internal.add(t.id);
    }
  }

  // 1: pairing. Candidates on the receiving side: bank credits and card payments.
  const cents = (n: number) => Math.round(Math.abs(n) * 100);
  const receivers = txns.filter(
    (t) => t.type === "CREDIT" && cents(t.amount) >= MIN_PAIR_AMOUNT * 100,
  );
  const used = new Set<string>();
  const debits = txns
    .filter(
      (t) =>
        t.accountType === "BANK" && t.type === "DEBIT" && cents(t.amount) >= MIN_PAIR_AMOUNT * 100,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const d of debits) {
    const day = d.date.slice(0, 10);
    let best: MovementLike | undefined;
    let bestGap = Infinity;
    for (const r of receivers) {
      if (used.has(r.id) || r.accountId === d.accountId || cents(r.amount) !== cents(d.amount))
        continue;
      const gap = Math.abs(daysBetween(day, r.date.slice(0, 10)));
      if (gap <= PAIR_WINDOW_DAYS && gap < bestGap) {
        best = r;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      internal.add(d.id);
      internal.add(best.id);
    }
  }
  return internal;
}

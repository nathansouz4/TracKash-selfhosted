// The same credit card can come from two connections: the bank's (checking
// accounts and the card) and the card issuer's (cards only). Counting both doubles every purchase. Decision for this app: keep the
// copy from the issuer's connection — it's the one that also lists the other
// cards of that issuer — and ignore the bank's copy.

export type AccountForDedup = {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  last4: string | null;
  brand: string | null;
};

const cardKey = (a: AccountForDedup) =>
  a.type === "CREDIT" && a.last4 ? `${a.last4}|${(a.brand ?? "").toUpperCase()}` : null;

/** Ids of card accounts that duplicate a card kept from another connection. */
export function duplicateCardAccounts(accounts: AccountForDedup[]): Set<string> {
  const itemHasBankAccount = new Set(
    accounts.filter((a) => a.type === "BANK").map((a) => a.itemId),
  );
  const groups = new Map<string, AccountForDedup[]>();
  for (const a of accounts) {
    const key = cardKey(a);
    if (key) groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const duplicates = new Set<string>();
  for (const copies of groups.values()) {
    if (new Set(copies.map((c) => c.itemId)).size < 2) continue;
    // Issuer connection first (no bank accounts), then a stable order.
    const [keep] = [...copies].sort(
      (a, b) =>
        Number(itemHasBankAccount.has(a.itemId)) - Number(itemHasBankAccount.has(b.itemId)) ||
        a.itemId.localeCompare(b.itemId),
    );
    for (const c of copies)
      if (c.id !== keep!.id && c.itemId !== keep!.itemId) duplicates.add(c.id);
  }
  return duplicates;
}

import { describe, expect, it } from "vitest";
import { internalMovementIds, type MovementLike } from "./internal-movements";

let seq = 0;
function mv(overrides: Partial<MovementLike>): MovementLike {
  seq += 1;
  return {
    id: `t${seq}`,
    accountId: "bank-a",
    accountType: "BANK",
    type: "DEBIT",
    amount: -100,
    date: "2026-10-07T00:00:00.000Z",
    description: "COMPRA",
    ...overrides,
  };
}

describe("internalMovementIds", () => {
  it("pairs a Pix between own accounts and marks both sides", () => {
    const out = mv({ amount: -2000, description: "PIX ENVIADO - DES Fulano" });
    const inn = mv({
      accountId: "bank-b",
      type: "CREDIT",
      amount: 2000,
      date: "2026-10-08T00:00:00.000Z",
      description: "Transferência recebida",
    });
    const ids = internalMovementIds([out, inn], []);
    expect([...ids].sort()).toEqual([out.id, inn.id].sort());
  });

  it("pairs a bill paid from checking with the payment received on the card", () => {
    const debit = mv({
      amount: -987.65,
      description: "Transferência enviada pelo Pix|BANCO EXEMPLO",
    });
    const card = mv({
      accountId: "visa",
      accountType: "CREDIT",
      type: "CREDIT",
      amount: -987.65,
      description: "PAGTO ANTECIPADO PIX",
    });
    expect(internalMovementIds([debit, card], []).has(debit.id)).toBe(true);
  });

  it("recognizes bill-payment wording and connected card names", () => {
    const bankA = mv({
      amount: -1234.56,
      description: "GASTOS CARTAO DE CREDITO - DOCTO: 3990278",
    });
    const bankB = mv({ accountId: "bank-b", amount: -2.4, description: "Pagamento de fatura" });
    const otherCard = mv({
      accountId: "bank-b",
      amount: -321,
      description: "Pagamento efetuado|BANCO EXEMPLO VISA",
    });
    const ids = internalMovementIds(
      [bankA, bankB, otherCard],
      ["BANCO EXEMPLO VISA          ", "platinum"],
    );
    expect(ids).toEqual(new Set([bankA.id, bankB.id, otherCard.id]));
  });

  it("keeps real spending and payments of cards that aren't connected", () => {
    const ibi = mv({
      accountId: "bank-b",
      amount: -111.11,
      description: "Pagamento efetuado|BANCO IBI S A",
    });
    const friend = mv({ amount: -800, description: "PIX ENVIADO - DES FULANA DE TAL" });
    const salary = mv({
      accountId: "bank-b",
      type: "CREDIT",
      amount: 5000,
      description: "Salário",
    });
    expect(internalMovementIds([ibi, friend, salary], ["VISA INFINITE"]).size).toBe(0);
  });

  it("doesn't pair within the same account, beyond the window, or twice", () => {
    const d1 = mv({ amount: -500 });
    const d2 = mv({ amount: -500, date: "2026-10-07T12:00:00.000Z" });
    const sameAccount = mv({ type: "CREDIT", amount: 500 });
    const late = mv({
      accountId: "bank-b",
      type: "CREDIT",
      amount: 500,
      date: "2026-10-20T00:00:00.000Z",
    });
    const ok = mv({
      accountId: "bank-b",
      type: "CREDIT",
      amount: 500,
      date: "2026-10-08T00:00:00.000Z",
    });
    const ids = internalMovementIds([d1, d2, sameAccount, late, ok], []);
    expect(ids.has(ok.id)).toBe(true);
    expect(ids.has(late.id)).toBe(false);
    expect(ids.has(sameAccount.id)).toBe(false);
    // Only one of the two identical debits finds a partner.
    expect([d1.id, d2.id].filter((id) => ids.has(id))).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { duplicateCardAccounts, type AccountForDedup } from "./duplicates";

const acc = (
  id: string,
  itemId: string,
  type: "BANK" | "CREDIT",
  last4: string | null,
  brand: string | null = null,
) => ({ id, itemId, type, last4, brand }) satisfies AccountForDedup;

describe("duplicateCardAccounts", () => {
  it("keeps the card issuer's copy and ignores the bank's", () => {
    const accounts = [
      acc("checking", "bank-conn", "BANK", "0000"),
      acc("visa-bank", "bank-conn", "CREDIT", "1111", "VISA"),
      acc("visa-issuer", "issuer-conn", "CREDIT", "1111", "VISA"),
      acc("other-card", "issuer-conn", "CREDIT", "2222", "MASTERCARD"),
    ];
    expect(duplicateCardAccounts(accounts)).toEqual(new Set(["visa-bank"]));
  });

  it("ignores nothing when cards differ or live in one connection", () => {
    expect(
      duplicateCardAccounts([
        acc("a", "x", "CREDIT", "1111", "VISA"),
        acc("b", "y", "CREDIT", "1111", "MASTERCARD"),
        acc("c", "y", "CREDIT", "2222", "VISA"),
        acc("d", "y", "CREDIT", "2222", "VISA"),
        acc("e", "z", "CREDIT", null, "VISA"),
      ]).size,
    ).toBe(0);
  });

  it("picks a stable survivor when both connections look alike", () => {
    const ids = duplicateCardAccounts([
      acc("from-b", "item-b", "CREDIT", "9999", "VISA"),
      acc("from-a", "item-a", "CREDIT", "9999", "VISA"),
    ]);
    expect(ids).toEqual(new Set(["from-b"]));
  });
});

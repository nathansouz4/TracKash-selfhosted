import { describe, expect, it } from "vitest";
import { monthEndBalances } from "./balances";

describe("monthEndBalances", () => {
  it("rebuilds month-end balances backwards from the current balance", () => {
    const movements = [
      { date: "2026-09-10T00:00:00.000Z", amount: 1000, type: "CREDIT" as const },
      { date: "2026-10-05T00:00:00.000Z", amount: -300, type: "DEBIT" as const },
      { date: "2026-10-20T00:00:00.000Z", amount: 50, type: "CREDIT" as const },
    ];
    // Current balance 750 = Sep-end 1000 − 300 + 50.
    expect(monthEndBalances(750, movements, ["2026-08", "2026-09", "2026-10"])).toEqual([
      { month: "2026-08", value: 0 },
      { month: "2026-09", value: 1000 },
      { month: "2026-10", value: 750 },
    ]);
  });

  it("uses the transaction type, not the sign Pluggy happens to send", () => {
    const movements = [{ date: "2026-10-05T00:00:00.000Z", amount: 300, type: "DEBIT" as const }];
    expect(monthEndBalances(700, movements, ["2026-09"])).toEqual([
      { month: "2026-09", value: 1000 },
    ]);
  });
});

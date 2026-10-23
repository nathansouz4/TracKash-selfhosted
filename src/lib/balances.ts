import { monthKey } from "./dates";
import { round2 } from "./spending";

// Pluggy only gives the current balance of each account. The month-end
// history is rebuilt backwards: balance at the end of month M = current balance
// minus every movement dated after M.

export type BalanceMovement = { date: string; amount: number; type: "DEBIT" | "CREDIT" };

export function signedAmount(t: BalanceMovement): number {
  return t.type === "CREDIT" ? Math.abs(t.amount) : -Math.abs(t.amount);
}

export function monthEndBalances(
  currentBalance: number,
  movements: BalanceMovement[],
  months: string[],
): { month: string; value: number }[] {
  return months.map((month) => {
    const after = movements
      .filter((t) => monthKey(t.date) > month)
      .reduce((sum, t) => sum + signedAmount(t), 0);
    return { month, value: round2(currentBalance - after) };
  });
}

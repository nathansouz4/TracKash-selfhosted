export type Tone = "positive" | "negative" | "neutral";

/** Delta color = direction × whether up is good (spending up is bad, returns up are good). */
export function deltaTone(value: number, upIsGood: boolean): Tone {
  if (Math.abs(value) < 1e-9) return "neutral";
  return value > 0 === upIsGood ? "positive" : "negative";
}

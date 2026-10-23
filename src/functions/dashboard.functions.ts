import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  cardsData,
  flowData,
  investmentsData,
  overviewData,
  setInvestmentLiquidity,
} from "@/backend/queries.server";

// Personal financial data must never be stored by any shared cache.
function noStore() {
  setResponseHeaders(new Headers({ "Cache-Control": "no-store, private" }));
}

export const getOverview = createServerFn({ method: "GET" }).handler(() => {
  noStore();
  return overviewData();
});

export const getInvestments = createServerFn({ method: "GET" }).handler(() => {
  noStore();
  return investmentsData();
});

export const getFlow = createServerFn({ method: "GET" })
  .validator(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
  .handler(({ data }) => {
    noStore();
    return flowData(data.month);
  });

export const getCards = createServerFn({ method: "GET" })
  .validator(
    z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      cardId: z
        .string()
        .regex(/^[\w-]{1,64}$/)
        .nullable(),
    }),
  )
  .handler(({ data }) => {
    noStore();
    return cardsData(data.month, data.cardId);
  });

/** Liquidity of a position as the owner knows it (Pluggy doesn't report it). */
export const setPositionLiquidity = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().trim().min(1).max(200),
      liquidity: z.enum(["daily", "maturity"]).nullable(),
    }),
  )
  .handler(({ data }) => {
    const updated = setInvestmentLiquidity(data.id, data.liquidity);
    if (!updated) throw new Error("Posição não encontrada.");
    return { ok: true };
  });

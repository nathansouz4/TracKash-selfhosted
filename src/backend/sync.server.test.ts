import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, todayIso } from "@/lib/dates";
import { all, closeDatabase, get, run } from "./db.server";
import { writeSettings, SETTING } from "./settings.server";
import { runSync, SyncError, upsertItem } from "./sync.server";

// A full sync against a fake Pluggy API (made-up data) into an in-memory database.

const ITEM = "00000000-0000-0000-0000-0000000000b2";
const today = todayIso();

let transactions = [
  { id: "tx-1", amount: -50, date: `${today}T12:00:00.000Z` },
  { id: "tx-pending", amount: -20, date: `${today}T13:00:00.000Z`, status: "PENDING" },
];

function respond(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function page<T>(results: T[]) {
  return { results, page: 1, totalPages: 1 };
}

const fakeFetch = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  switch (url.pathname) {
    case "/auth":
      return respond({ apiKey: "fake-key" });
    case "/categories":
      return respond(page([{ id: "08000000", description: "Shopping" }]));
    case "/connectors":
      return respond({ results: [] });
    case `/items/${ITEM}`:
      return respond({
        id: ITEM,
        status: "UPDATED",
        executionStatus: "SUCCESS",
        lastUpdatedAt: `${today}T03:00:00Z`,
        connector: { id: 1, name: "MeuPluggy", imageUrl: null },
      });
    case "/accounts":
      return respond(
        page([
          {
            id: "acc-1",
            itemId: ITEM,
            type: "BANK",
            subtype: "CHECKING_ACCOUNT",
            number: "12340000",
            name: "Conta",
            marketingName: null,
            balance: 1_000,
            currencyCode: "BRL",
            bankData: null,
            creditData: null,
          },
        ]),
      );
    case "/v2/transactions":
      return respond({
        results: transactions.map((t) => ({
          accountId: "acc-1",
          description: "LOJA EXEMPLO",
          amountInAccountCurrency: null,
          currencyCode: "BRL",
          type: "DEBIT",
          status: "POSTED",
          category: "Shopping",
          categoryId: "08000000",
          operationType: null,
          creditCardMetadata: null,
          ...t,
        })),
        next: null,
      });
    case "/investments":
      return respond(
        page([
          {
            id: "inv-1",
            itemId: ITEM,
            name: "CDB BANCO EXEMPLO",
            type: "FIXED_INCOME",
            subtype: "CDB",
            balance: 5_000,
            date: `${today}T00:00:00Z`,
          },
        ]),
      );
    case "/investments/inv-1/transactions":
      return respond(
        page([
          { id: "itx-1", type: "BUY", amount: 5_000, date: `${addDays(today, -10)}T00:00:00Z` },
        ]),
      );
    default:
      return new Response("not found", { status: 404 });
  }
});

beforeAll(() => {
  process.env["TRACKASH_DB_PATH"] = ":memory:";
  closeDatabase();
  vi.stubGlobal("fetch", fakeFetch);
  writeSettings({ [SETTING.pluggyClientId]: "id", [SETTING.pluggyClientSecret]: "secret" });
});

afterAll(() => {
  vi.unstubAllGlobals();
  closeDatabase();
});

describe("sync", () => {
  it("refuses to run without connections", async () => {
    await expect(runSync()).rejects.toThrow(SyncError);
  });

  it("loads a connection into the database", async () => {
    upsertItem(
      {
        id: ITEM,
        status: null,
        executionStatus: null,
        lastUpdatedAt: null,
        connector: null,
      },
      null,
    );
    const labels: string[] = [];
    const stats = await runSync((p) => labels.push(p.label));
    expect(stats).toMatchObject({ items: 1, accounts: 1, transactions: 2, investments: 1 });
    expect(labels.at(-1)).toBe("Pronto");
    expect(all<{ id: string }>("select id from transactions order by id").map((r) => r.id)).toEqual(
      ["tx-1", "tx-pending"],
    );
    expect(get<{ n: number }>("select count(*) as n from investment_snapshots")?.n).toBe(1);
    expect(get<{ status: string }>("select status from sync_runs order by id desc")?.status).toBe(
      "success",
    );
  });

  it("waits a minute between syncs, then drops pending transactions that vanished", async () => {
    await expect(runSync()).rejects.toThrow("Aguarde um minuto");
    run("update sync_runs set started_at = '2000-01-01T00:00:00.000Z'");

    transactions = [{ id: "tx-1", amount: -50, date: `${today}T12:00:00.000Z` }];
    fakeFetch.mockClear();
    await runSync();
    expect(all<{ id: string }>("select id from transactions").map((r) => r.id)).toEqual(["tx-1"]);
    // The API key issued by the first sync is reused from memory.
    const calls = fakeFetch.mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.endsWith("/auth"))).toBe(false);
  });
});

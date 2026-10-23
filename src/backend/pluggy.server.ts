import { pluggyCredentials } from "./settings.server";

// Read-only Pluggy client (Meu Pluggy / personal use).
// The API key issued by POST /auth lasts ~2h. It is kept in memory only and
// reused until it is close to expiring, so the client secret isn't re-sent on
// every request; a restart simply issues a new one.

const BASE_URL = "https://api.pluggy.ai";
const REFRESH_MARGIN_MS = 10 * 60_000;
const FALLBACK_TTL_MS = 2 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class PluggyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PluggyError";
  }
}

function jwtExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

type CachedKey = { apiKey: string; clientId: string; expiresAt: number };

declare global {
  var __trackashPluggyKey: CachedKey | undefined;
}

function cachedApiKey(clientId: string): CachedKey | null {
  const cached = globalThis.__trackashPluggyKey;
  if (!cached || cached.clientId !== clientId) return null;
  return cached.expiresAt - REFRESH_MARGIN_MS > Date.now() ? cached : null;
}

/** After the credentials change: the next request issues a key with the new ones. */
export function forgetApiKey(): void {
  globalThis.__trackashPluggyKey = undefined;
}

async function requestApiKey(clientId: string, clientSecret: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new PluggyError("Não foi possível falar com a API da Pluggy. Confira sua internet.");
  }
  if (!response.ok) {
    throw new PluggyError(
      response.status === 401 || response.status === 403 || response.status === 400
        ? "A Pluggy recusou as credenciais. Confira o Client ID e o Client Secret."
        : `Falha ao autenticar na Pluggy (HTTP ${response.status}).`,
      response.status,
    );
  }
  const { apiKey } = (await response.json()) as { apiKey?: unknown };
  if (typeof apiKey !== "string" || !apiKey)
    throw new PluggyError("Resposta de autenticação da Pluggy inválida.");
  return apiKey;
}

/** Setup: checks a client id/secret pair without keeping the key it gets. */
export async function verifyPluggyCredentials(clientId: string, clientSecret: string) {
  await requestApiKey(clientId, clientSecret);
}

async function getApiKey(forceNew = false): Promise<string> {
  const credentials = pluggyCredentials();
  if (!credentials) {
    throw new PluggyError("Configure o Client ID e o Client Secret da Pluggy em Configurações.");
  }
  if (!forceNew) {
    const cached = cachedApiKey(credentials.clientId);
    if (cached) return cached.apiKey;
  }
  const apiKey = await requestApiKey(credentials.clientId, credentials.clientSecret);
  globalThis.__trackashPluggyKey = {
    apiKey,
    clientId: credentials.clientId,
    expiresAt: jwtExpiry(apiKey) ?? Date.now() + FALLBACK_TTL_MS,
  };
  return apiKey;
}

type Query = Record<string, string | number | undefined>;

async function get<T>(path: string, query: Query = {}, retried = false): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(query))
    if (v !== undefined) url.searchParams.set(k, String(v));

  const apiKey = await getApiKey(retried);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-API-KEY": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new PluggyError(
      `Sem resposta da API da Pluggy em ${url.pathname}. Confira sua internet.`,
    );
  }

  if ((response.status === 401 || response.status === 403) && !retried) {
    // Cached key revoked/expired early: issue a fresh one once.
    return get<T>(path, query, true);
  }
  if (!response.ok) {
    // Never include the response body or the URL query in the error: keep logs clean.
    throw new PluggyError(
      `Erro na API da Pluggy em ${url.pathname} (HTTP ${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

type PageResponse<T> = { results: T[]; page: number; totalPages: number };
type CursorResponse<T> = { results: T[]; next: string | null };

async function getAllPages<T>(path: string, query: Query): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const res = await get<PageResponse<T>>(path, { ...query, page, pageSize: 500 });
    all.push(...res.results);
    if (page >= (res.totalPages ?? 1) || res.results.length === 0) return all;
  }
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we use)
// ---------------------------------------------------------------------------

export type PluggyItem = {
  id: string;
  status: string | null;
  executionStatus: string | null;
  lastUpdatedAt: string | null;
  connector: { id: number; name: string; imageUrl: string | null } | null;
};

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  number: string | null;
  name: string | null;
  marketingName: string | null;
  balance: number | null;
  currencyCode: string | null;
  bankData: { transferNumber: string | null } | null;
  creditData: {
    level: string | null;
    brand: string | null;
    balanceCloseDate: string | null;
    balanceDueDate: string | null;
    availableCreditLimit: number | null;
    creditLimit: number | null;
    minimumPayment: number | null;
  } | null;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  date: string;
  description: string | null;
  amount: number;
  amountInAccountCurrency: number | null;
  currencyCode: string | null;
  type: "DEBIT" | "CREDIT";
  status: string | null;
  category: string | null;
  categoryId: string | null;
  operationType: string | null;
  merchant?: { name?: string; businessName?: string; category?: string } | null;
  paymentData?: { receiver?: { name?: string } | null; payer?: { name?: string } | null } | null;
  creditCardMetadata: {
    installmentNumber?: number;
    totalInstallments?: number;
    purchaseDate?: string;
    billId?: string;
  } | null;
};

export type PluggyBill = {
  id: string;
  dueDate: string;
  billClosingDate: string | null;
  totalAmount: number;
  totalAmountCurrencyCode: string | null;
  minimumPaymentAmount: number | null;
  financeCharges: { type: string; amount: number }[] | null;
  payments: { valueType: string; paymentDate: string; amount: number }[] | null;
};

export type PluggyInvestment = {
  id: string;
  itemId: string;
  code: string | null;
  isin: string | null;
  name: string;
  type: string;
  subtype: string | null;
  status: string | null;
  currencyCode: string | null;
  balance: number | null;
  amount: number | null;
  amountOriginal: number | null;
  amountProfit: number | null;
  amountWithdrawal: number | null;
  quantity: number | null;
  value: number | null;
  taxes: number | null;
  taxes2: number | null;
  rate: number | null;
  rateType: string | null;
  fixedAnnualRate: number | null;
  annualRate: number | null;
  lastMonthRate: number | null;
  lastTwelveMonthsRate: number | null;
  date: string | null;
  dueDate: string | null;
  issueDate: string | null;
  purchaseDate: string | null;
  issuer: string | null;
  institution: { name: string | null } | null;
};

export type PluggyInvestmentTransaction = {
  id: string;
  type: string | null;
  movementType: string | null;
  description: string | null;
  quantity: number | null;
  value: number | null;
  amount: number | null;
  netAmount: number | null;
  date: string;
  tradeDate: string | null;
};

export type PluggyCategory = {
  id: string;
  description: string;
  descriptionTranslated?: string | null;
  parentId?: string | null;
  parentDescription?: string | null;
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const pluggy = {
  getItem: (itemId: string) => get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`),

  listAccounts: (itemId: string) => getAllPages<PluggyAccount>("/accounts", { itemId }),

  /** Cursor-paginated GET /v2/transactions (the page-based endpoint is deprecated). */
  async listTransactions(accountId: string, dateFrom?: string): Promise<PluggyTransaction[]> {
    const all: PluggyTransaction[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 1000; guard++) {
      const res = await get<CursorResponse<PluggyTransaction>>("/v2/transactions", {
        accountId,
        dateFrom,
        after,
      });
      all.push(...res.results);
      if (!res.next) return all;
      const next = new URL(res.next, BASE_URL).searchParams.get("after");
      if (!next || next === after) return all;
      after = next;
    }
    return all;
  },

  listBills: (accountId: string) => getAllPages<PluggyBill>("/bills", { accountId }),

  listInvestments: (itemId: string) => getAllPages<PluggyInvestment>("/investments", { itemId }),

  listInvestmentTransactions: (investmentId: string) =>
    getAllPages<PluggyInvestmentTransaction>(
      `/investments/${encodeURIComponent(investmentId)}/transactions`,
      {},
    ),

  listCategories: () => getAllPages<PluggyCategory>("/categories", {}),

  /** Pluggy's connector catalog (names, logos, colors). Cached for a day per server instance. */
  async listConnectors(): Promise<PluggyConnector[]> {
    if (connectorCache && Date.now() - connectorCache.at < 24 * 60 * 60_000)
      return connectorCache.list;
    const res = await get<{ results: PluggyConnector[] }>("/connectors", { countries: "BR" });
    connectorCache = { at: Date.now(), list: res.results };
    return res.results;
  },
};

export type PluggyConnector = {
  id: number;
  name: string;
  type: string;
  isOpenFinance: boolean;
  isSandbox?: boolean;
  imageUrl: string | null;
  primaryColor: string | null;
};

let connectorCache: { at: number; list: PluggyConnector[] } | null = null;

/** Diagnostics: one real API call, reporting whether the in-memory key was reused. */
export async function checkPluggyConnection() {
  const clientId = pluggyCredentials()?.clientId;
  const reusedCachedKey = clientId ? cachedApiKey(clientId) !== null : false;
  const categories = await pluggy.listCategories();
  const expiresAt = globalThis.__trackashPluggyKey?.expiresAt;
  return {
    reusedCachedKey,
    keyExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    categories: categories.length,
  };
}

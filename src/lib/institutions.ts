// Meu Pluggy items all report the connector "MeuPluggy". The real institution is
// inferred from the accounts: the bank code (COMPE) in the transfer number
// ("260/0001/123-4" → Nubank), or keywords in the account names, then matched
// against Pluggy's connector catalog for the official name, logo and color.

const BANK_CODES: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "348": "XP",
  "380": "PicPay",
  "422": "Safra",
  "748": "Sicredi",
  "756": "Sicoob",
};

const NAME_HINTS: [RegExp, string][] = [
  [/nubank|nu pagamentos|nu financeira/i, "Nubank"],
  [/santander/i, "Santander"],
  [/bradesco/i, "Bradesco"],
  [/ita[uú]/i, "Itaú"],
  [/banco do brasil|\bbb\b/i, "Banco do Brasil"],
  [/caixa econ/i, "Caixa"],
  [/\binter\b/i, "Inter"],
  [/\bc6\b/i, "C6 Bank"],
  [/btg/i, "BTG Pactual"],
  [/\bxp\b/i, "XP"],
  [/mercado pago/i, "Mercado Pago"],
  [/picpay/i, "PicPay"],
];

export type AccountHint = { type: string; name: string | null; transferNumber: string | null };

export function bankCode(transferNumber: string | null): string | null {
  const head = transferNumber?.split("/")[0]?.replace(/\D/g, "");
  return head ? head.padStart(3, "0").slice(-3) : null;
}

export function resolveInstitutionName(accounts: AccountHint[]): string | null {
  for (const a of accounts) {
    const code = a.type === "BANK" ? bankCode(a.transferNumber) : null;
    if (code && BANK_CODES[code]) return BANK_CODES[code];
  }
  for (const a of accounts) {
    const hit = NAME_HINTS.find(([re]) => re.test(a.name ?? ""));
    if (hit) return hit[1];
  }
  return null;
}

export type ConnectorInfo = {
  name: string;
  type: string;
  isOpenFinance: boolean;
  isSandbox?: boolean;
  imageUrl: string | null;
  primaryColor: string | null;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Best catalog entry for an institution: personal Open Finance connectors first. */
export function matchConnector(name: string, connectors: ConnectorInfo[]): ConnectorInfo | null {
  const target = normalize(name);
  const score = (c: ConnectorInfo) =>
    (c.isOpenFinance ? 4 : 0) +
    (c.type === "PERSONAL_BANK" ? 2 : 0) +
    (c.type === "INVESTMENT" ? 1 : 0);
  const candidates = connectors
    .filter((c) => !c.isSandbox)
    .filter((c) => {
      const n = normalize(c.name);
      return n === target || n.startsWith(target) || target.startsWith(n);
    })
    .filter((c) => !/empresas|business/i.test(c.name) && c.type !== "BUSINESS_BANK");
  return candidates.sort((a, b) => score(b) - score(a) || a.name.length - b.name.length)[0] ?? null;
}

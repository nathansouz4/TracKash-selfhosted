// B3 "Área do Investidor" movement statement (Extrato > Movimentação, xlsx).
// Columns: Entrada/Saída | Data | Movimentação | Produto | Instituição |
//          Quantidade | Preço unitário | Valor da Operação
// Movement names are B3 domain values (pt-BR) and are kept verbatim.

export type B3Direction = "CREDIT" | "DEBIT";

export type B3Movement = {
  direction: B3Direction;
  date: string; // YYYY-MM-DD
  movement: string;
  product: string;
  ticker: string | null;
  institution: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
};

const EXPECTED_HEADER = [
  "entrada/saida",
  "data",
  "movimentacao",
  "produto",
  "instituicao",
  "quantidade",
  "preco unitario",
  "valor da operacao",
];

export class B3FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B3FormatError";
  }
}

const fold = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const text = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** 1.5 | "1,5" | "1.234,56" | "-" | "" → number or null. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/^R\$\s*/, "");
  if (!raw || raw === "-") return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "08/10/2026" | Date | Excel serial → "2026-10-08". */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial date (1900 system).
    return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(value));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** "PETR4 - PETROLEO BRASILEIRO S/A" → "PETR4"; fixed income products → null. */
export function parseTicker(product: string): string | null {
  const head = product.split(" - ")[0]?.trim().toUpperCase() ?? "";
  return /^[A-Z]{4}\d{1,2}[A-Z]?$/.test(head) ? head : null;
}

/** Product name without the ticker prefix, folded, to recognize renamed tickers. */
export function productName(product: string): string {
  const parts = product.split(" - ");
  const rest = parseTicker(product) ? parts.slice(1).join(" - ") : product;
  return fold(rest)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseB3Sheet(rows: unknown[][]): B3Movement[] {
  const header = (rows[0] ?? []).map(fold);
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new B3FormatError(
      "O arquivo não parece um extrato de movimentação da B3 (Área do Investidor → Extratos → Movimentação).",
    );
  }

  const movements: B3Movement[] = [];
  rows.slice(1).forEach((row, index) => {
    if (!row || row.every((c) => c == null || text(c) === "")) return;
    const direction = fold(row[0]);
    const date = parseDate(row[1]);
    const movement = text(row[2]);
    const product = text(row[3]);
    if ((direction !== "credito" && direction !== "debito") || !date || !movement || !product) {
      throw new B3FormatError(
        `Linha ${index + 2} do extrato está incompleta ou em formato inesperado.`,
      );
    }
    movements.push({
      direction: direction === "credito" ? "CREDIT" : "DEBIT",
      date,
      movement,
      product,
      ticker: parseTicker(product),
      institution: text(row[4]) || null,
      quantity: parseNumber(row[5]),
      unitPrice: parseNumber(row[6]),
      amount: parseNumber(row[7]),
    });
  });
  return movements;
}

/**
 * Stable identity per row: identical rows inside one file get an occurrence
 * index, so re-importing overlapping statements never duplicates a movement.
 */
export function movementKeys(movements: B3Movement[]): string[] {
  const seen = new Map<string, number>();
  return movements.map((m) => {
    const base = [
      m.direction,
      m.date,
      fold(m.movement),
      fold(m.product),
      fold(m.institution),
      m.quantity ?? "",
      m.unitPrice ?? "",
      m.amount ?? "",
    ].join("|");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}|#${occurrence}`;
  });
}

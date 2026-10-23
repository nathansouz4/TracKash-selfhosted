const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

const MONTHS_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function formatBRL(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : brl.format(value);
}

/** Axis ticks and tight spaces: "R$ 12,5 mil". */
export function formatBRLCompact(value: number): string {
  return Math.abs(value) < 1000
    ? brl.format(Math.round(value)).replace(/,00$/, "")
    : brlCompact.format(value);
}

/** 0.1234 → "12,3%". */
export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null || !Number.isFinite(ratio) ? "—" : percent.format(ratio);
}

/** 0.1234 → "+12,3%". */
export function formatSignedPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${ratio > 0 ? "+" : ratio < 0 ? "−" : ""}${percent.format(Math.abs(ratio))}`;
}

export function formatSignedBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${brl.format(Math.abs(value))}`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : decimal.format(value);
}

/** "2026-10-05" or ISO timestamp → "05/10/2026". */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** "2026-10" → "out/26". */
export function monthShortLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] ?? "?"}/${y?.slice(2)}`;
}

/** "2026-10" → "outubro de 2026". */
export function monthLongLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS_LONG[Number(m) - 1] ?? "?"} de ${y}`;
}

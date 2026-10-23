import { createHash } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { B3FormatError, movementKeys, parseB3Sheet, type B3Movement } from "@/lib/b3";
import { all, get, run, transaction } from "./db.server";

// Imports the B3 movement statement (xlsx) into b3_movements.
// Idempotent: a row's id is a hash of its content and occurrence, so
// re-importing an overlapping statement only adds what's new.

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // zip container

export type ImportResult = {
  rowsRead: number;
  rowsInserted: number;
  periodStart: string | null;
  periodEnd: string | null;
};

export async function importB3Statement(fileName: string, file: Buffer): Promise<ImportResult> {
  if (file.length === 0 || file.length > MAX_STATEMENT_BYTES) {
    throw new B3FormatError("Arquivo vazio ou maior que 5 MB.");
  }
  if (!file.subarray(0, 4).equals(XLSX_MAGIC)) {
    throw new B3FormatError("Envie o arquivo .xlsx exportado pela B3.");
  }

  let rows: unknown[][];
  try {
    const sheets = (await readXlsxFile(file)) as unknown as { data: unknown[][] }[];
    rows = sheets[0]?.data ?? [];
  } catch {
    throw new B3FormatError("Não foi possível ler a planilha. Confira se é o .xlsx da B3.");
  }

  const movements = parseB3Sheet(rows);
  const keys = movementKeys(movements);
  const dates = movements.map((m) => m.date).sort();
  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "extrato.xlsx";

  return transaction(() => {
    const importId = Number(
      run(
        `insert into b3_imports (file_name, rows_read, rows_inserted, period_start, period_end)
         values (?, ?, 0, ?, ?)`,
        safeName,
        movements.length,
        dates[0] ?? null,
        dates.at(-1) ?? null,
      ).lastInsertRowid,
    );
    let inserted = 0;
    movements.forEach((m, i) => {
      inserted += run(
        `insert into b3_movements
           (id, import_id, direction, date, movement, product, ticker, institution, quantity, unit_price, amount)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do nothing`,
        createHash("sha256").update(keys[i]!).digest("hex"),
        importId,
        m.direction,
        m.date,
        m.movement,
        m.product,
        m.ticker,
        m.institution,
        m.quantity,
        m.unitPrice,
        m.amount,
      ).changes;
    });
    run("update b3_imports set rows_inserted = ? where id = ?", inserted, importId);
    return {
      rowsRead: movements.length,
      rowsInserted: inserted,
      periodStart: dates[0] ?? null,
      periodEnd: dates.at(-1) ?? null,
    };
  });
}

export function loadB3Movements(): B3Movement[] {
  const rows = all<{
    direction: "CREDIT" | "DEBIT";
    date: string;
    movement: string;
    product: string;
    ticker: string | null;
    institution: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
  }>(
    `select direction, date, movement, product, ticker, institution, quantity, unit_price, amount
     from b3_movements
     order by date`,
  );
  return rows.map((r) => ({
    direction: r.direction,
    date: r.date,
    movement: r.movement,
    product: r.product,
    ticker: r.ticker,
    institution: r.institution,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    amount: r.amount,
  }));
}

export function lastB3Import() {
  const row = get<{
    imported_at: string;
    file_name: string;
    period_start: string | null;
    period_end: string | null;
    total: number;
  }>(
    `select i.imported_at, i.file_name, i.period_start, i.period_end,
            (select count(*) from b3_movements) as total
     from b3_imports i
     order by i.id desc
     limit 1`,
  );
  return row
    ? {
        importedAt: row.imported_at,
        fileName: row.file_name,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        totalMovements: row.total,
      }
    : null;
}

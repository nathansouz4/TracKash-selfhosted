// Imports a B3 movement statement (Área do Investidor → Extratos → Movimentação,
// exported as .xlsx) into the local database, using the app's own server code.
// The Investments page does the same through an upload.
//
//   npm run import-b3 -- data/B3/movimentacao-YYYY-MM-DD-HH-MM-SS.xlsx [more.xlsx ...]
//
// Re-importing overlapping statements is safe: existing rows are skipped.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { withServerModules } from "./lib/server-modules.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: npm run import-b3 -- <statement.xlsx> [more.xlsx ...]");
  process.exit(1);
}

await withServerModules(async (load) => {
  const { importB3Statement } = await load("/src/backend/b3.server.ts");
  for (const file of files) {
    const result = await importB3Statement(basename(file), readFileSync(file));
    console.log(
      `${basename(file)}: read ${result.rowsRead} rows, inserted ${result.rowsInserted} new | ` +
        `period ${result.periodStart} .. ${result.periodEnd}`,
    );
  }
});

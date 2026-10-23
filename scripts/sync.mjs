// Syncs every connection from Pluggy into the local database, from the terminal:
// the same load the app runs from its sync button. Handy to schedule (cron,
// launchd, Task Scheduler) so the portfolio history gets one snapshot a day.
//
//   npm run sync
//
// Safe to run with the app open: only one sync runs at a time.
import { withServerModules } from "./lib/server-modules.mjs";

await withServerModules(async (load) => {
  const { runSync } = await load("/src/backend/sync.server.ts");
  let lastLabel = "";
  const stats = await runSync((progress) => {
    if (progress.label === lastLabel) return;
    lastLabel = progress.label;
    console.log(`[${progress.step}/${progress.total}] ${progress.label}`);
  });
  console.log(
    `done: ${stats.items} connections, ${stats.accounts} accounts, ${stats.transactions} transactions, ` +
      `${stats.bills} bills, ${stats.investments} investments, ${stats.investmentTransactions} investment movements`,
  );
});

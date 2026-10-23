// Checks the Pluggy integration end to end using the app's own server code:
// saved credentials → API key → a real read-only API call. Runs twice: the
// second run must reuse the key kept in memory.
//
//   npm run check-pluggy [-- itemId]
//
// Prints no secrets.
import { withServerModules } from "./lib/server-modules.mjs";

await withServerModules(async (load) => {
  const { checkPluggyConnection, pluggy } = await load("/src/backend/pluggy.server.ts");

  for (const attempt of [1, 2]) {
    const result = await checkPluggyConnection();
    console.log(
      `#${attempt}: ${result.reusedCachedKey ? "reused the API key" : "issued a new API key"}` +
        ` | expires at ${result.keyExpiresAt} | categories read: ${result.categories}`,
    );
  }

  const itemId = process.argv[2];
  if (itemId) {
    const item = await pluggy.getItem(itemId);
    const accounts = await pluggy.listAccounts(itemId);
    console.log(
      `item: ${item.connector?.name ?? "?"} | status ${item.status} | ` +
        `accounts: ${accounts.map((a) => `${a.type}/${a.subtype}`).join(", ") || "none"}`,
    );
  }
});

// Runs the app's own server code (TypeScript, "@/..." imports) from a terminal
// script, through Vite's module loader, against the same local database.
import { createServer, loadEnv } from "vite";

/**
 * Calls `fn(load)` where `load("/src/backend/x.server.ts")` imports a server module.
 * Exits with 1 (printing only the error message) if it throws.
 */
export async function withServerModules(fn) {
  Object.assign(process.env, loadEnv("development", process.cwd(), ""));
  const vite = await createServer({
    configFile: false,
    logLevel: "error",
    resolve: { tsconfigPaths: true },
    ssr: { external: ["better-sqlite3"] },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  const load = (path) => vite.ssrLoadModule(path);
  let exitCode = 0;
  try {
    await fn(load);
  } catch (error) {
    exitCode = 1;
    console.error("FAILED:", error instanceof Error ? error.message : error);
  } finally {
    try {
      (await load("/src/backend/db.server.ts")).closeDatabase();
    } catch {
      // Nothing was opened.
    }
    await vite.close();
    process.exit(exitCode);
  }
}

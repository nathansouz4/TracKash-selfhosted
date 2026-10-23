import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Standalone config: the tests cover pure functions in src/lib and the server
// read models over an in-memory database, so they don't need the app's Vite
// plugins (TanStack Start, Tailwind).
export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Business rules are date-sensitive and the users are in Brazil (UTC-3).
    env: { TZ: "America/Sao_Paulo" },
  },
});

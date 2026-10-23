import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Loopback only: the app has no sign-in (see src/start.ts).
  server: { port: 3000, host: "localhost" },
  preview: { port: 4173, host: "localhost" },
  // Native module: loaded from node_modules at runtime, never bundled.
  ssr: { external: ["better-sqlite3"] },
  // Resolves the "@/..." alias from tsconfig.json.
  resolve: { tsconfigPaths: true },
  build: {
    // Never ship source maps: they would expose server-adjacent code paths.
    sourcemap: false,
  },
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  // Keep the Start runtime (createServerFn, request context) out of the
                  // server-entry chunk. Otherwise route modules that import server
                  // functions form a cycle with it and createServerFn is undefined at
                  // load time in production.
                  name: "start-runtime",
                  test: /[\\/]node_modules[\\/]@tanstack[\\/](react-start|start-[^\\/]+)[\\/]/,
                },
              ],
            },
          },
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Uses src/server.ts as the server entry (returns the friendly error page).
      server: { entry: "server" },
      // Fails the build if the browser bundle imports server code (database,
      // Pluggy credentials).
      importProtection: {
        behavior: "error",
        client: { files: ["**/src/backend/**", "**/*.server.*"] },
      },
    }),
    // Must come after tanstackStart().
    viteReact(),
  ],
});
